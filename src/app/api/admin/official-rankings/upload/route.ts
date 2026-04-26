import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';

interface UploadRow {
  rank: number;
  category: string;
  naver_id?: string | null;
  display_name: string;
  profile_url?: string | null;
  image_url?: string | null;
  subscriber_count?: number | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body: { snapshotDate?: string; rows?: UploadRow[]; overwrite?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON 파싱 실패' }, { status: 400 });
  }

  const { snapshotDate, rows, overwrite } = body;
  if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    return NextResponse.json({ error: 'snapshotDate(YYYY-MM-DD) 가 필요합니다.' }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '업로드할 행이 없습니다.' }, { status: 400 });
  }
  if (rows.length > 5000) {
    return NextResponse.json({ error: '한 번에 최대 5000행까지 업로드 가능합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 검증
  const errors: string[] = [];
  const cleaned: UploadRow[] = [];
  rows.forEach((r, idx) => {
    const lineNo = idx + 1;
    const rank = Number(r.rank);
    const category = (r.category || '').trim();
    const display_name = (r.display_name || '').trim();
    if (!Number.isFinite(rank) || rank <= 0) {
      errors.push(`행 ${lineNo}: rank 값이 올바르지 않음`);
      return;
    }
    if (!category) {
      errors.push(`행 ${lineNo}: category 누락`);
      return;
    }
    if (!display_name) {
      errors.push(`행 ${lineNo}: display_name 누락`);
      return;
    }
    cleaned.push({
      rank,
      category,
      display_name,
      naver_id: r.naver_id ? String(r.naver_id).trim() || null : null,
      profile_url: r.profile_url ? String(r.profile_url).trim() || null : null,
      image_url: r.image_url ? String(r.image_url).trim() || null : null,
      subscriber_count: r.subscriber_count != null && r.subscriber_count !== ('' as unknown) ? Number(r.subscriber_count) : null,
    });
  });

  if (cleaned.length === 0) {
    return NextResponse.json({ error: '유효한 행이 없습니다.', errors }, { status: 400 });
  }

  // 중복 (snapshot+category+rank) 체크
  const seen = new Set<string>();
  for (const c of cleaned) {
    const key = `${c.category}::${c.rank}`;
    if (seen.has(key)) {
      errors.push(`중복: ${c.category} 카테고리 ${c.rank}위가 두 번 이상 입력됨`);
      return NextResponse.json({ error: '중복된 (카테고리,순위) 가 있습니다.', errors }, { status: 400 });
    }
    seen.add(key);
  }

  // overwrite=true 면 같은 snapshot_date 행 삭제
  if (overwrite) {
    const { error: delErr } = await supabase
      .from('naver_official_rankings')
      .delete()
      .eq('snapshot_date', snapshotDate);
    if (delErr) {
      return NextResponse.json({ error: '기존 데이터 삭제 실패: ' + delErr.message }, { status: 500 });
    }
  }

  // naver_id 자동 매칭 (한 번에)
  const naverIds = cleaned.map((c) => c.naver_id).filter((v): v is string => !!v);
  const linkMap = new Map<string, string>();
  if (naverIds.length > 0) {
    const { data: matched } = await supabase
      .from('influencers')
      .select('id, naver_id')
      .in('naver_id', naverIds);
    (matched || []).forEach((m) => {
      if (m.naver_id) linkMap.set(m.naver_id, m.id);
    });
  }

  // INSERT
  const inserts = cleaned.map((c) => ({
    snapshot_date: snapshotDate,
    category: c.category,
    rank_position: c.rank,
    naver_id: c.naver_id,
    display_name: c.display_name,
    profile_url: c.profile_url,
    image_url: c.image_url,
    subscriber_count: c.subscriber_count,
    linked_influencer_id: c.naver_id ? linkMap.get(c.naver_id) || null : null,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from('naver_official_rankings')
    .insert(inserts)
    .select('id');

  if (insErr) {
    return NextResponse.json({ error: '저장 실패: ' + insErr.message, errors }, { status: 500 });
  }

  return NextResponse.json({
    snapshotDate,
    inserted: inserted?.length ?? 0,
    matched: linkMap.size,
    errors,
  });
}
