import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchWithRetry, sleep, verifyCronSecret, createCrawlJob, updateCrawlJob } from '@/lib/crawler';

/**
 * 가입자 인플루언서 팔로워/구독자수 갱신 Cron
 *
 * users 테이블에 linked_influencer_id가 있는 (가입한) 인플루언서만 대상.
 * 네이버 프로필 __PRELOADED_STATE__에서 subscriberCount, totalFollowerCount 추출.
 *
 * 매일 KST 06:00 실행.
 */

export const maxDuration = 300;

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
    // 가입자(users.linked_influencer_id)에 연결된 인플루언서만 조회
    const { data: users } = await supabase
      .from('users')
      .select('linked_influencer_id')
      .not('linked_influencer_id', 'is', null);

    const linkedIds = [...new Set((users || []).map(u => u.linked_influencer_id).filter(Boolean))];

    if (linkedIds.length === 0) {
      console.log('[update-followers] No linked influencers found');
      await updateCrawlJob(jobId, { status: 'success', total_items: 0, processed_items: 0 });
      return NextResponse.json({ success: true, processed: 0, message: 'No linked influencers' });
    }

    // 해당 인플루언서 정보 조회
    const { data: influencers } = await supabase
      .from('influencers')
      .select('id, naver_id')
      .in('id', linkedIds);

    const targets = influencers || [];

    console.log(`[update-followers] Processing ${targets.length} linked influencers`);

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
