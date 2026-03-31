import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

const SEARCHAD_API_URL = 'https://api.searchad.naver.com/keywordstool';
const DATALAB_API_URL = 'https://openapi.naver.com/v1/datalab/search';
const BATCH_SIZE = 5; // 검색광고 API: 한 번에 5개 키워드

/** 네이버 검색광고 API에서 키워드 검색량 조회 */
async function getSearchVolumes(keywords: string[]): Promise<Map<string, { pc: number; mobile: number; comp: string }>> {
  const apiKey = process.env.NAVER_API_KEY;
  const secretKey = process.env.NAVER_SECRET_KEY;
  const customerId = process.env.NAVER_CUSTOMER_ID;

  if (!apiKey || !secretKey || !customerId) {
    return new Map();
  }

  const timestamp = Date.now().toString();
  // HMAC-SHA256 서명 생성
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const msgData = encoder.encode(`${timestamp}.GET./keywordstool`);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const params = new URLSearchParams();
  params.set('hintKeywords', keywords.join(','));
  params.set('showDetail', '1');

  const res = await fetch(`${SEARCHAD_API_URL}?${params}`, {
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': apiKey,
      'X-Customer': customerId,
      'X-Signature': sig,
    },
  });

  if (!res.ok) {
    console.error(`[update-volumes] SearchAd API error: ${res.status}`);
    return new Map();
  }

  const data = await res.json();
  const result = new Map<string, { pc: number; mobile: number; comp: string }>();

  for (const item of data.keywordList || []) {
    result.set(item.relKeyword, {
      pc: item.monthlyPcQcCnt || 0,
      mobile: item.monthlyMobileQcCnt || 0,
      comp: item.compIdx || '',
    });
  }

  return result;
}

/** 네이버 DataLab API에서 트렌드 데이터 조회 */
async function getTrendData(keywords: string[]): Promise<Map<string, { direction: string; percentage: number }>> {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new Map();
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const keywordGroups = keywords.slice(0, 5).map(kw => ({
    groupName: kw,
    keywords: [kw],
  }));

  const res = await fetch(DATALAB_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
    body: JSON.stringify({
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      timeUnit: 'week',
      keywordGroups,
    }),
  });

  if (!res.ok) {
    console.error(`[update-volumes] DataLab API error: ${res.status}`);
    return new Map();
  }

  const data = await res.json();
  const result = new Map<string, { direction: string; percentage: number }>();

  for (const group of data.results || []) {
    const dataPoints = group.data || [];
    if (dataPoints.length < 2) continue;

    const recent = dataPoints[dataPoints.length - 1].ratio;
    const prev = dataPoints[dataPoints.length - 2].ratio;
    const pct = prev > 0 ? ((recent - prev) / prev) * 100 : 0;

    let direction: string;
    if (pct > 5) direction = 'up';
    else if (pct < -5) direction = 'down';
    else direction = 'stable';

    result.set(group.title, { direction, percentage: Math.round(pct * 10) / 10 });
  }

  return result;
}

/** competition_level 매핑 */
function mapCompetition(comp: string): string {
  if (comp === '높음') return 'high';
  if (comp === '중간') return 'medium';
  return 'low';
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasSearchAdKey = !!(process.env.NAVER_API_KEY && process.env.NAVER_SECRET_KEY && process.env.NAVER_CUSTOMER_ID);
  const hasDatalabKey = !!(process.env.NAVER_DATALAB_CLIENT_ID && process.env.NAVER_DATALAB_CLIENT_SECRET);

  if (!hasSearchAdKey && !hasDatalabKey) {
    console.warn('[Cron] Step 3: SKIPPED - No Naver API keys configured. Set NAVER_API_KEY/SECRET_KEY/CUSTOMER_ID or NAVER_DATALAB_CLIENT_ID/SECRET.');
    return NextResponse.json({
      success: false,
      step: 3,
      skipped: true,
      message: 'API 키가 설정되지 않아 검색량 업데이트를 건너뛰었습니다.',
    }, { status: 200 });
  }

  const jobId = await createCrawlJob('update-volumes');
  const supabase = createServiceClient();
  let totalProcessed = 0;
  let totalFailed = 0;

  console.log('[Cron] Step 3: update-volumes started at', new Date().toISOString());

  try {
    // 검색량 미업데이트 또는 7일 이상 된 키워드 조회
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: keywords } = await supabase
      .from('keyword_challenges')
      .select('id, keyword')
      .eq('is_active', true)
      .or(`search_volume_updated_at.is.null,search_volume_updated_at.lt.${sevenDaysAgo.toISOString()}`)
      .order('participant_count', { ascending: false })
      .limit(100);

    if (!keywords || keywords.length === 0) {
      console.log('[update-volumes] No keywords need volume update');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0 });
    }

    // 배치 처리 — SearchAd API는 관련 키워드도 반환하므로 DB 일괄 매칭
    // 1단계: 전체 키워드 ID 맵 구성 (keyword → id)
    const allKeywordIds = new Map<string, string>();
    for (const kw of keywords) {
      allKeywordIds.set(kw.keyword, kw.id);
    }

    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
      const batch = keywords.slice(i, i + BATCH_SIZE);
      const kwNames = batch.map(k => k.keyword);

      try {
        // 검색광고 API (검색량) — 관련 키워드 포함 전체 반환
        const volumes = hasSearchAdKey ? await getSearchVolumes(kwNames) : new Map();

        // DataLab API (트렌드) — hint 키워드만
        const trends = hasDatalabKey ? await getTrendData(kwNames) : new Map();

        // 2단계: API 반환 키워드 중 DB에 있는 것 모두 업데이트
        const matchedKeywordIds = new Set<string>();

        if (volumes.size > 0) {
          // 반환된 전체 키워드 중 DB에 있는 것 찾기 (배치 100개 범위 내)
          const returnedKeywords = [...volumes.keys()];
          const dbMatchIds: string[] = [];

          // 현재 배치의 hint 키워드 + API 반환 키워드 모두 매칭
          for (const [keyword, vol] of volumes) {
            const kwId = allKeywordIds.get(keyword);
            if (kwId) {
              dbMatchIds.push(kwId);
              matchedKeywordIds.add(kwId);
              const updates: Record<string, unknown> = {
                search_volume_updated_at: new Date().toISOString(),
                search_volume_pc: vol.pc,
                search_volume_mobile: vol.mobile,
                search_volume_monthly: vol.pc + vol.mobile,
                competition_level: mapCompetition(vol.comp),
              };

              await supabase.from('keyword_challenges').update(updates).eq('id', kwId);

              // search_volume_history 기록
              const today = new Date().toISOString().slice(0, 10);
              await supabase.from('search_volume_history').upsert(
                {
                  keyword_id: kwId,
                  period_start: today,
                  period_end: today,
                  period_type: 'daily',
                  search_volume_total: vol.pc + vol.mobile,
                  search_volume_pc: vol.pc,
                  search_volume_mobile: vol.mobile,
                },
                { onConflict: 'keyword_id,period_start,period_type' },
              );
              totalProcessed++;
            }
          }

          // DB에 없는 반환 키워드도 keyword_clean으로 추가 매칭
          if (returnedKeywords.length > dbMatchIds.length) {
            const unmatchedKws = returnedKeywords.filter(kw => !allKeywordIds.has(kw));
            if (unmatchedKws.length > 0) {
              const cleanNames = unmatchedKws.map(kw => kw.replace(/\s+/g, '').toLowerCase());
              for (let j = 0; j < cleanNames.length; j += 50) {
                const cleanBatch = cleanNames.slice(j, j + 50);
                const origBatch = unmatchedKws.slice(j, j + 50);
                const { data: dbMatches } = await supabase
                  .from('keyword_challenges')
                  .select('id, keyword_clean')
                  .in('keyword_clean', cleanBatch);

                if (dbMatches) {
                  const cleanToOrig = new Map<string, string>();
                  origBatch.forEach((kw, idx) => cleanToOrig.set(cleanBatch[idx], kw));

                  for (const match of dbMatches) {
                    const origKw = cleanToOrig.get(match.keyword_clean);
                    const vol = origKw ? volumes.get(origKw) : null;
                    if (vol && !matchedKeywordIds.has(match.id)) {
                      matchedKeywordIds.add(match.id);
                      await supabase.from('keyword_challenges').update({
                        search_volume_updated_at: new Date().toISOString(),
                        search_volume_pc: vol.pc,
                        search_volume_mobile: vol.mobile,
                        search_volume_monthly: vol.pc + vol.mobile,
                        competition_level: mapCompetition(vol.comp),
                      }).eq('id', match.id);
                      totalProcessed++;
                    }
                  }
                }
              }
            }
          }
        }

        // hint 키워드에 트렌드 데이터 적용
        for (const kw of batch) {
          const trend = trends.get(kw.keyword);
          if (trend) {
            await supabase.from('keyword_challenges').update({
              trend_direction: trend.direction,
              trend_percentage: trend.percentage,
            }).eq('id', kw.id);
          }

          // 볼륨 매칭 안 된 hint 키워드: updated_at 갱신하지 않음 (다음에 재시도)
          if (!matchedKeywordIds.has(kw.id) && !volumes.has(kw.keyword)) {
            // search_volume_updated_at을 갱신하지 않아서 다음 크론에서 재시도
            totalFailed++;
          }
        }

        await sleep(1000); // API 간격
      } catch (err) {
        console.error(`[update-volumes] Batch error:`, err);
        totalFailed += batch.length;
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: keywords.length,
      processed_items: totalProcessed,
      failed_items: totalFailed,
    });

    console.log(`[Cron] Step 3 done: ${totalProcessed} updated, ${totalFailed} failed`);

    return NextResponse.json({
      success: true,
      step: 3,
      processed: totalProcessed,
      failed: totalFailed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[update-volumes] Fatal error:', msg);

    await updateCrawlJob(jobId, {
      status: 'failed',
      processed_items: totalProcessed,
      failed_items: totalFailed,
      error_message: msg,
    });

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
