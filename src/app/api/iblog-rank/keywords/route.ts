import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const VALID_SOURCES = ['title_extract', 'user_registered', 'service_collected', 'category'];

/**
 * 블로그 순위 분석 키워드 풀 관리 (관리자 전용)
 * GET    /api/iblog-rank/keywords              — 키워드 목록
 * POST   /api/iblog-rank/keywords              — { keywords: string[], source?, category? } 등록
 * PATCH  /api/iblog-rank/keywords              — { id, is_active } 활성 토글
 * DELETE /api/iblog-rank/keywords?id=xxx        — 삭제
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('iblog_rank_keywords')
    .select('id, keyword, source, category, is_active, last_crawled_date, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keywords: data || [], total: (data || []).length });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  let body: { keywords?: unknown; keyword?: unknown; source?: unknown; category?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const rawList: unknown[] = Array.isArray(body.keywords)
    ? body.keywords
    : body.keyword != null
      ? [body.keyword]
      : [];

  const source =
    typeof body.source === 'string' && VALID_SOURCES.includes(body.source)
      ? body.source
      : 'service_collected';
  const category = typeof body.category === 'string' ? body.category.trim() || null : null;

  // 정규화 + 중복 제거
  const seen = new Set<string>();
  const rows = rawList
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.trim())
    .filter((k) => k.length > 0 && k.length <= 100)
    .filter((k) => {
      const key = k.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((keyword) => ({ keyword, source, category, is_active: true }));

  if (rows.length === 0) {
    return NextResponse.json({ error: '등록할 키워드가 없습니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('iblog_rank_keywords')
    .upsert(rows, { onConflict: 'keyword', ignoreDuplicates: true })
    .select('id, keyword');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: (data || []).length, submitted: rows.length });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  let body: { id?: unknown; is_active?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  if (typeof body.id !== 'string' || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'id 와 is_active(boolean) 가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('iblog_rank_keywords')
    .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 파라미터가 필요합니다.' }, { status: 400 });

  const supabase = createServiceClient();
  const { error } = await supabase.from('iblog_rank_keywords').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
