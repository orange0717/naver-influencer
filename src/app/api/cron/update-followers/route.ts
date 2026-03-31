import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

/**
 * 인플루언서 팔로워/구독자수 주기적 갱신 Cron
 *
 * 네이버 프로필 페이지의 __PRELOADED_STATE__에서
 * totalFollowerCount, subscriberCount, createdAt 추출 후 DB 업데이트.
 *
 * 처리 순서:
 *  1) subscriber_count = 0인 인플루언서 우선
 *  2) 나머지: updated_at 오래된 순
 *
 * 배치: 250건/실행 (Vercel Pro 300초 제한 내)
 */

export const maxDuration = 300;

const BATCH_SIZE = 250;

/** 네이버 프로필에서 팔로워 데이터 추출 */
async function fetchProfileData(naverId: string) {
  try {
    const res = await fetchWithRetry(`https://in.naver.com/${naverId}`);
    const html = await res.text();

    const idx = html.indexOf('__PRELOADED_STATE__');
    if (idx === -1) return null;

    const eqIdx = html.indexOf('=', idx);
    const jsonStr = html.substring(eqIdx + 1);
    const braceIdx = jsonStr.indexOf('{');
    if (braceIdx === -1) return null;

    const sub = jsonStr.substring(braceIdx);
    let depth = 0, end = -1;
    for (let i = 0; i < sub.length; i++) {
      if (sub[i] === '{') depth++;
      if (sub[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end === -1) return null;

    const state = JSON.parse(sub.substring(0, end));
    const data = state?.space?.data;
    if (!data) return null;

    return {
      totalFollowerCount: data.totalFollowerCount || 0,
      subscriberCount: data.subscriberCount || 0,
      ownerId: data.ownerId ? String(data.ownerId) : null,
      createdAt: data.createdAt && typeof data.createdAt === 'string' ? data.createdAt : null,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobId = await createCrawlJob('update-followers');
  const supabase = createServiceClient();

  console.log('[Cron] update-followers started at', new Date().toISOString());

  try {
    // 1) subscriber_count = 0인 인플루언서 우선 (아직 팔로워 데이터 없음)
    const { data: zeroSubs } = await supabase
      .from('influencers')
      .select('id, naver_id')
      .eq('subscriber_count', 0)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    const targets: { id: string; naver_id: string }[] = [...(zeroSubs || [])];

    // 2) 배치 미달이면 updated_at 오래된 순으로 채우기
    if (targets.length < BATCH_SIZE) {
      const remaining = BATCH_SIZE - targets.length;
      const existingIds = targets.map(t => t.id);

      const { data: oldUpdated } = await supabase
        .from('influencers')
        .select('id, naver_id')
        .gt('subscriber_count', 0)
        .order('updated_at', { ascending: true, nullsFirst: true })
        .limit(remaining + existingIds.length);

      if (oldUpdated) {
        const existingSet = new Set(existingIds);
        for (const inf of oldUpdated) {
          if (targets.length >= BATCH_SIZE) break;
          if (!existingSet.has(inf.id)) {
            targets.push(inf);
          }
        }
      }
    }

    if (targets.length === 0) {
      console.log('[update-followers] No influencers to process');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0 });
    }

    console.log(`[update-followers] Processing ${targets.length} influencers`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const inf of targets) {
      try {
        const profile = await fetchProfileData(inf.naver_id);

        if (!profile || (profile.totalFollowerCount === 0 && profile.subscriberCount === 0)) {
          skipped++;
          await sleep(500);
          continue;
        }

        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (profile.totalFollowerCount > 0) {
          updateData.total_follower_count = profile.totalFollowerCount;
        }
        if (profile.subscriberCount > 0) {
          updateData.subscriber_count = profile.subscriberCount;
        }
        if (profile.ownerId) {
          updateData.naver_owner_id = profile.ownerId;
        }
        if (profile.createdAt) {
          updateData.naver_created_at = profile.createdAt;
        }

        const { error } = await supabase
          .from('influencers')
          .update(updateData)
          .eq('id', inf.id);

        if (error) {
          console.error(`[update-followers] DB error for ${inf.naver_id}:`, error.message);
          failed++;
        } else {
          updated++;
        }

        await sleep(600);
      } catch (err) {
        console.error(`[update-followers] Error for ${inf.naver_id}:`, err instanceof Error ? err.message : err);
        failed++;
        await sleep(500);
      }
    }

    await updateCrawlJob(jobId, {
      status: 'success',
      total_items: targets.length,
      processed_items: updated,
      failed_items: failed,
    });

    console.log(`[Cron] update-followers done: ${updated} updated, ${skipped} skipped, ${failed} failed`);

    return NextResponse.json({
      success: true,
      total: targets.length,
      updated,
      skipped,
      failed,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[update-followers] Fatal error:', msg);
    await updateCrawlJob(jobId, { status: 'failed', error_message: msg });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
