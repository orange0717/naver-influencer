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
 * 데이터랩툴즈 데이터 import
 * GET /api/admin/import-datalab?mode=preview  (변경 예정 건수만 확인)
 * GET /api/admin/import-datalab?mode=execute  (실제 업데이트)
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

    // DB의 모든 인플루언서 조회
    const { data: dbInfluencers, error: dbError } = await supabase
      .from('influencers')
      .select('id, naver_id, naver_created_at, display_name, category');

    if (dbError || !dbInfluencers) {
      return NextResponse.json({ error: 'DB 조회 실패', detail: dbError?.message }, { status: 500 });
    }

    // naver_id -> DB row 매핑
    const dbMap = new Map(dbInfluencers.map(r => [r.naver_id, r]));

    // 매칭 분석
    const matched: { id: string; naver_id: string; updates: Record<string, unknown> }[] = [];
    const notInDb: string[] = [];
    const noChange: string[] = [];

    for (const rec of records) {
      const dbRow = dbMap.get(rec.naver_id);
      if (!dbRow) {
        notInDb.push(rec.naver_id);
        continue;
      }

      const updates: Record<string, unknown> = {};

      // 선정일 업데이트: 데이터랩 데이터가 있고, DB에 없거나 다른 경우
      if (rec.naver_created_at) {
        const datalabDate = rec.naver_created_at; // YYYY-MM-DD
        const dbDate = dbRow.naver_created_at
          ? new Date(dbRow.naver_created_at).toISOString().slice(0, 10)
          : null;

        if (!dbDate || dbDate !== datalabDate) {
          updates.naver_created_at = `${datalabDate}T00:00:00+09:00`;
        }
      }

      if (Object.keys(updates).length > 0) {
        matched.push({ id: dbRow.id, naver_id: rec.naver_id, updates });
      } else {
        noChange.push(rec.naver_id);
      }
    }

    // preview 모드: 통계만 반환
    if (mode === 'preview') {
      return NextResponse.json({
        mode: 'preview',
        datalab_total: records.length,
        db_total: dbInfluencers.length,
        will_update: matched.length,
        no_change: noChange.length,
        not_in_db: notInDb.length,
        not_in_db_sample: notInDb.slice(0, 20),
        update_sample: matched.slice(0, 10).map(m => ({
          naver_id: m.naver_id,
          updates: m.updates,
        })),
      });
    }

    // execute 모드: 실제 업데이트
    let updated = 0;
    let errors = 0;
    const BATCH_SIZE = 50;

    for (let i = 0; i < matched.length; i += BATCH_SIZE) {
      const batch = matched.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (item) => {
        const { error } = await supabase
          .from('influencers')
          .update(item.updates)
          .eq('id', item.id);
        if (error) {
          errors++;
          console.error(`[import-datalab] ${item.naver_id} error:`, error.message);
        } else {
          updated++;
        }
      });
      await Promise.all(promises);
    }

    return NextResponse.json({
      mode: 'execute',
      datalab_total: records.length,
      db_total: dbInfluencers.length,
      updated,
      errors,
      no_change: noChange.length,
      not_in_db: notInDb.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Import 실패', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
