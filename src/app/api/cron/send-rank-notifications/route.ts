import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret } from '@/lib/crawler';
import {
  getNotificationRecipients,
  processNotifications,
  getKSTDateString,
} from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const snapshotDate = getKSTDateString();

  console.log(`[send-rank-notifications] 시작 (KST ${snapshotDate})`);

  try {
    // crawl-rankings 완료 여부 확인
    const { data: crawlJob, error: crawlJobError } = await supabase
      .from('crawl_jobs')
      .select('status, completed_at')
      .eq('job_type', 'crawl-rankings')
      .gte('started_at', `${snapshotDate}T00:00:00Z`)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (crawlJobError || !crawlJob || crawlJob.status !== 'success') {
      if (crawlJobError) console.error('[send-rank-notifications] crawl job lookup failed:', crawlJobError.message);
      console.log('[send-rank-notifications] crawl-rankings 미완료, 건너뜀');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'crawl-rankings not completed yet',
      });
    }

    // 알림 대상 조회
    const recipients = await getNotificationRecipients(supabase);

    if (recipients.length === 0) {
      console.log('[send-rank-notifications] 알림 대상 없음');
      return NextResponse.json({ success: true, recipients: 0 });
    }

    console.log(`[send-rank-notifications] 대상 ${recipients.length}명`);

    // 알림 처리
    const stats = await processNotifications(supabase, recipients, snapshotDate);

    console.log(
      `[send-rank-notifications] 완료: 알림 ${stats.notificationsCreated}건, ` +
      `이메일 ${stats.emailsSent}건 (실패 ${stats.emailErrors}건), ` +
      `푸시 ${stats.pushSent}건, 카카오 ${stats.kakaoSent}건`
    );

    return NextResponse.json({
      success: true,
      snapshotDate,
      recipients: recipients.length,
      ...stats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[send-rank-notifications] 에러:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
