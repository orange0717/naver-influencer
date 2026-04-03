import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface DatalabRecord {
  naver_id: string;
  display_name: string;
  category: string;
  naver_created_at: string | null;
  history: string | null;
  content_rank: number | null;
  content_count: number | null;
}

/**
 * 데이터랩툴즈 데이터 import (전체 인플루언서)
 * GET /api/admin/import-datalab?mode=preview  (변경 예정 건수만 확인)
 * GET /api/admin/import-datalab?mode=execute  (기존 업데이트 + 신규 insert)
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get('mode') || 'preview';

  try {
    // JSON 파일 로드
    const jsonPath = join(process.cwd(), 'scripts', 'datalab-influencers.json');
    const raw = await readFile(jsonPath, 'utf-8');
    const records: DatalabRecord[] = JSON.parse(raw);

    const supabase = createServiceClient();

    // DB의 모든 인플루언서 조회 (페이지네이션)
    const allDbInfluencers: { id: string; naver_id: string; naver_created_at: string | null }[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('influencers')
        .select('id, naver_id, naver_created_at')
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: 'DB 조회 실패', detail: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      allDbInfluencers.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    // naver_id -> DB row 매핑
    const dbMap = new Map(allDbInfluencers.map(r => [r.naver_id, r]));

    // 매칭 분석
    const toUpdate: { id: string; naver_id: string; updates: Record<string, unknown> }[] = [];
    const toInsert: DatalabRecord[] = [];
    const noChange: string[] = [];

    for (const rec of records) {
      const dbRow = dbMap.get(rec.naver_id);
      if (!dbRow) {
        toInsert.push(rec);
        continue;
      }

      const updates: Record<string, unknown> = {};

      // 선정일 업데이트
      if (rec.naver_created_at) {
        const datalabDate = rec.naver_created_at;
        const dbDate = dbRow.naver_created_at
          ? new Date(dbRow.naver_created_at).toISOString().slice(0, 10)
          : null;
        if (!dbDate || dbDate !== datalabDate) {
          updates.naver_created_at = `${datalabDate}T00:00:00+09:00`;
        }
      }

      if (Object.keys(updates).length > 0) {
        toUpdate.push({ id: dbRow.id, naver_id: rec.naver_id, updates });
      } else {
        noChange.push(rec.naver_id);
      }
    }

    // 비활동 인플루언서 분석
    const datalabNaverIds = new Set(records.map(r => r.naver_id));
    const inactive = allDbInfluencers.filter(db => !datalabNaverIds.has(db.naver_id));

    // preview 모드
    if (mode === 'preview') {
      return NextResponse.json({
        mode: 'preview',
        datalab_total: records.length,
        db_total: allDbInfluencers.length,
        will_update: toUpdate.length,
        will_insert: toInsert.length,
        will_delete_inactive: inactive.length,
        no_change: noChange.length,
        insert_sample: toInsert.slice(0, 5).map(r => ({
          naver_id: r.naver_id,
          display_name: r.display_name,
          category: r.category,
          naver_created_at: r.naver_created_at,
        })),
        update_sample: toUpdate.slice(0, 5).map(m => ({
          naver_id: m.naver_id,
          updates: m.updates,
        })),
        inactive_sample: inactive.slice(0, 10).map(r => r.naver_id),
      });
    }

    // execute 모드
    let updated = 0;
    let inserted = 0;
    let errors = 0;
    const BATCH_SIZE = 50;

    // 1) 기존 인플루언서 업데이트
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (item) => {
        const { error } = await supabase
          .from('influencers')
          .update(item.updates)
          .eq('id', item.id);
        if (error) {
          errors++;
          console.error(`[import-datalab] update ${item.naver_id}:`, error.message);
        } else {
          updated++;
        }
      });
      await Promise.all(promises);
    }

    // 2) 신규 인플루언서 insert (upsert로 안전하게)
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const rows = batch.map(rec => ({
        naver_id: rec.naver_id,
        display_name: rec.display_name || '',
        category: rec.category || '',
        my_keyword_category: rec.category || '',
        profile_url: `https://in.naver.com/${rec.naver_id}`,
        naver_created_at: rec.naver_created_at
          ? `${rec.naver_created_at}T00:00:00+09:00`
          : null,
      }));

      const { error } = await supabase
        .from('influencers')
        .upsert(rows, { onConflict: 'naver_id', ignoreDuplicates: true });

      if (error) {
        errors += batch.length;
        console.error(`[import-datalab] insert batch ${i}:`, error.message);
      } else {
        inserted += batch.length;
      }
    }

    // 3) 비활동 인플루언서: is_active = false로 표기 (삭제하지 않음)
    const inactiveIds = inactive.map(db => db.id);
    let deactivated = 0;

    for (let i = 0; i < inactiveIds.length; i += BATCH_SIZE) {
      const batch = inactiveIds.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('influencers')
        .update({ is_active: false })
        .in('id', batch);
      if (error) {
        console.error(`[import-datalab] deactivate batch ${i}:`, error.message);
      } else {
        deactivated += batch.length;
      }
    }

    // 4) CSV에 있는 인플루언서는 is_active = true로 보장
    const activeNaverIds = records.map(r => r.naver_id);
    for (let i = 0; i < activeNaverIds.length; i += 500) {
      const batch = activeNaverIds.slice(i, i + 500);
      await supabase
        .from('influencers')
        .update({ is_active: true })
        .in('naver_id', batch)
        .eq('is_active', false);
    }

    console.log(`[import-datalab] done: updated=${updated}, inserted=${inserted}, deactivated=${deactivated}, errors=${errors}`);

    return NextResponse.json({
      mode: 'execute',
      datalab_total: records.length,
      db_total: allDbInfluencers.length,
      updated,
      inserted,
      deactivated,
      errors,
      no_change: noChange.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Import 실패', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
