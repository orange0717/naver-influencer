/**
 * 알림 시스템 핵심 로직
 * - KST 기준 날짜 처리
 * - 가입자 + 데모 체험자 대상
 * - 이메일 + 카카오 + 인앱 알림
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendRankChangeEmail, type RankChangeItem } from './email';
import { sendKakaoRankAlert } from './kakao';

// ─── KST 헬퍼 ───

/** KST 기준 현재 Date 객체 (UTC+9 오프셋 적용) */
export function getKSTDate(): Date {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

/** KST 기준 오늘 날짜 문자열 (YYYY-MM-DD) */
export function getKSTDateString(): string {
  return getKSTDate().toISOString().slice(0, 10);
}

/** KST 기준 날짜를 한국어 형식으로 포맷 */
export function formatKSTDate(date?: Date): string {
  const d = date || new Date();
  return d.toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── 타입 ───

export interface NotificationRecipient {
  type: 'user' | 'demo';
  id: string;               // users.id 또는 demo_sessions.id
  email: string;
  displayName: string;
  influencerId: string;
  settings: NotificationSettings | null; // null = 기본값 사용
}

export interface NotificationSettings {
  email_enabled: boolean;
  kakao_enabled: boolean;
  in_app_enabled: boolean;
  notify_top3_entry: boolean;
  notify_top3_exit: boolean;
  notify_significant_change: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  email_enabled: true,
  kakao_enabled: false,
  in_app_enabled: true,
  notify_top3_entry: true,
  notify_top3_exit: true,
  notify_significant_change: true,
};

interface RankChangeRow {
  keyword_id: string;
  keyword: string;
  category: string;
  rank_position: number;
  previous_rank: number | null;
  rank_change: number;
}

interface NotificationInsert {
  user_id?: string;
  demo_session_id?: string;
  notification_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

// ─── 수신자 조회 ───

export async function getNotificationRecipients(
  supabase: SupabaseClient,
): Promise<NotificationRecipient[]> {
  const recipients: NotificationRecipient[] = [];

  // 1. 가입자 (linked_influencer_id가 있는 사용자)
  const { data: users } = await supabase
    .from('users')
    .select(`
      id, email, nickname, linked_influencer_id,
      notification_settings(email_enabled, kakao_enabled, in_app_enabled, notify_top3_entry, notify_top3_exit, notify_significant_change)
    `)
    .not('linked_influencer_id', 'is', null);

  for (const u of users || []) {
    if (!u.email || !u.linked_influencer_id) continue;
    const settingsRaw = u.notification_settings;
    const settings = Array.isArray(settingsRaw) ? settingsRaw[0] ?? null : settingsRaw ?? null;

    recipients.push({
      type: 'user',
      id: u.id,
      email: u.email,
      displayName: u.nickname || u.email.split('@')[0],
      influencerId: u.linked_influencer_id,
      settings: settings as NotificationSettings | null,
    });
  }

  // 2. 데모 체험자 (인증 완료 + 미만료)
  const now = new Date().toISOString();
  const { data: demos } = await supabase
    .from('demo_sessions')
    .select(`
      id, email, naver_id, display_name,
      notification_settings(email_enabled, kakao_enabled, in_app_enabled, notify_top3_entry, notify_top3_exit, notify_significant_change)
    `)
    .not('verified_at', 'is', null)
    .gt('expires_at', now);

  // naver_id 배치 조회 (N+1 방지)
  const demoNaverIds = (demos || []).map(d => d.naver_id).filter(Boolean) as string[];
  const naverIdToInfluencerId = new Map<string, string>();
  if (demoNaverIds.length > 0) {
    const { data: infData } = await supabase
      .from('influencers')
      .select('id, naver_id')
      .in('naver_id', demoNaverIds);
    for (const inf of infData || []) {
      naverIdToInfluencerId.set(inf.naver_id, inf.id);
    }
  }

  for (const d of demos || []) {
    if (!d.email || !d.naver_id) continue;

    const influencerId = naverIdToInfluencerId.get(d.naver_id);
    if (!influencerId) continue;

    const settingsRaw = d.notification_settings;
    const settings = Array.isArray(settingsRaw) ? settingsRaw[0] ?? null : settingsRaw ?? null;

    recipients.push({
      type: 'demo',
      id: d.id,
      email: d.email,
      displayName: d.display_name || d.naver_id,
      influencerId,
      settings: settings as NotificationSettings | null,
    });
  }

  return recipients;
}

// ─── 알림 생성 ───

export function buildNotifications(
  recipient: NotificationRecipient,
  rankChanges: RankChangeRow[],
): NotificationInsert[] {
  const settings = recipient.settings || DEFAULT_SETTINGS;
  const notifications: NotificationInsert[] = [];

  const recipientField = recipient.type === 'user'
    ? { user_id: recipient.id }
    : { demo_session_id: recipient.id };

  for (const r of rankChanges) {
    if (r.previous_rank === null || r.rank_change === 0) continue;

    const fromRank = r.previous_rank;
    const toRank = r.rank_position;
    const absChange = Math.abs(r.rank_change);
    const metadata = {
      keyword_id: r.keyword_id,
      keyword: r.keyword,
      category: r.category,
      from_rank: fromRank,
      to_rank: toRank,
      change: r.rank_change,
    };

    // TOP3 진입: 이전 4위 이상 → 현재 1~3위
    if (toRank <= 3 && fromRank > 3 && settings.notify_top3_entry) {
      notifications.push({
        ...recipientField,
        notification_type: 'new_top3',
        title: `"${r.keyword}" TOP 3 진입`,
        body: `${fromRank}위에서 ${toRank}위로 ${absChange}단계 상승했습니다.`,
        metadata,
      });
      continue;
    }

    // TOP3 이탈: 이전 1~3위 → 현재 4위 이상
    if (toRank > 3 && fromRank <= 3 && settings.notify_top3_exit) {
      notifications.push({
        ...recipientField,
        notification_type: 'lost_top3',
        title: `"${r.keyword}" TOP 3 이탈`,
        body: `${fromRank}위에서 ${toRank}위로 ${absChange}단계 하락했습니다.`,
        metadata,
      });
      continue;
    }

    // 3단계 이상 상승
    if (r.rank_change >= 3 && settings.notify_significant_change) {
      notifications.push({
        ...recipientField,
        notification_type: 'rank_up_significant',
        title: `"${r.keyword}" ${absChange}단계 상승`,
        body: `${fromRank}위에서 ${toRank}위로 상승했습니다.`,
        metadata,
      });
      continue;
    }

    // 3단계 이상 하락
    if (r.rank_change <= -3 && settings.notify_significant_change) {
      notifications.push({
        ...recipientField,
        notification_type: 'rank_down_significant',
        title: `"${r.keyword}" ${absChange}단계 하락`,
        body: `${fromRank}위에서 ${toRank}위로 하락했습니다.`,
        metadata,
      });
    }
  }

  return notifications;
}

// ─── 배치 처리 ───

export async function processNotifications(
  supabase: SupabaseClient,
  recipients: NotificationRecipient[],
  snapshotDate: string,
): Promise<{ notificationsCreated: number; emailsSent: number; emailErrors: number; kakaoSent: number; pushSent: number }> {
  let notificationsCreated = 0;
  let emailsSent = 0;
  let emailErrors = 0;
  let kakaoSent = 0;
  let pushSent = 0;

  for (const recipient of recipients) {
    // 오늘 순위 변동 데이터 조회
    const { data: rankings } = await supabase
      .from('keyword_rankings')
      .select(`
        keyword_id, rank_position, previous_rank, rank_change,
        keyword_challenges!inner(keyword, category)
      `)
      .eq('influencer_id', recipient.influencerId)
      .eq('snapshot_date', snapshotDate)
      .neq('rank_change', 0);

    if (!rankings || rankings.length === 0) continue;

    // 순위 변동 데이터 정규화
    const rankChanges: RankChangeRow[] = rankings.map(r => {
      const kw = r.keyword_challenges as unknown as { keyword: string; category: string };
      return {
        keyword_id: r.keyword_id,
        keyword: kw?.keyword || '',
        category: kw?.category || '',
        rank_position: r.rank_position,
        previous_rank: r.previous_rank,
        rank_change: r.rank_change,
      };
    });

    // 알림 생성
    const notifications = buildNotifications(recipient, rankChanges);
    if (notifications.length === 0) continue;

    const settings = recipient.settings || DEFAULT_SETTINGS;

    // 인앱 알림 저장
    if (settings.in_app_enabled) {
      const { data: inserted } = await supabase
        .from('notifications')
        .insert(notifications.map(n => ({
          ...n,
          is_read: false,
          email_sent: false,
          kakao_sent: false,
        })))
        .select('id');

      notificationsCreated += inserted?.length || 0;
    }

    // 이메일 발송
    if (settings.email_enabled && recipient.email) {
      const emailChanges: RankChangeItem[] = notifications.map(n => {
        const m = n.metadata;
        const fromRank = m.from_rank as number;
        const toRank = m.to_rank as number;
        let type: RankChangeItem['type'] = 'rank_up';
        if (n.notification_type === 'new_top3') type = 'new_top3';
        else if (n.notification_type === 'lost_top3') type = 'lost_top3';
        else if (n.notification_type === 'rank_down_significant') type = 'rank_down';
        return {
          keyword: m.keyword as string,
          keyword_id: m.keyword_id as string,
          from_rank: fromRank,
          to_rank: toRank,
          change: Math.abs(m.change as number),
          type,
        };
      });

      try {
        await sendRankChangeEmail(
          recipient.email,
          recipient.displayName,
          emailChanges,
          formatKSTDate(),
        );
        emailsSent++;

        // 이메일 발송 상태 업데이트
        if (settings.in_app_enabled) {
          const recipientCol = recipient.type === 'user' ? 'user_id' : 'demo_session_id';
          await supabase
            .from('notifications')
            .update({ email_sent: true, email_sent_at: new Date().toISOString() })
            .eq(recipientCol, recipient.id)
            .eq('email_sent', false)
            .gte('created_at', new Date(Date.now() - 60000).toISOString()); // 최근 1분 내 생성된 것만
        }
      } catch (err) {
        emailErrors++;
        console.error(`[notifications] 이메일 발송 실패 (${recipient.email}):`, err);
      }

      // Resend 속도 제한 대응 (350ms 딜레이)
      await new Promise(r => setTimeout(r, 350));
    }

    // 푸시 알림 발송
    if (settings.in_app_enabled) {
      const recipientCol = recipient.type === 'user' ? 'user_id' : 'demo_session_id';
      const { data: pushTokens } = await supabase
        .from('push_tokens')
        .select('token')
        .eq(recipientCol, recipient.id)
        .eq('is_active', true);

      if (pushTokens && pushTokens.length > 0) {
        try {
          const { sendPushToMultipleDevices } = await import('./push-sender');
          const tokens = pushTokens.map(t => t.token);

          const summaryTitle = `순위 변동 ${notifications.length}건`;
          const summaryBody = notifications.slice(0, 2).map(n => n.title).join(', ');

          const { failedTokens } = await sendPushToMultipleDevices(tokens, {
            title: summaryTitle,
            body: summaryBody,
            data: { url: '/my', type: 'rank_change', count: String(notifications.length) },
          });

          pushSent += tokens.length - failedTokens.length;

          // 실패한 토큰 비활성화
          if (failedTokens.length > 0) {
            await supabase
              .from('push_tokens')
              .update({ is_active: false })
              .in('token', failedTokens);
          }
        } catch (err) {
          console.error(`[notifications] 푸시 발송 실패 (${recipient.displayName}):`, err);
        }
      }
    }

    // 카카오 알림톡 발송
    if (settings.kakao_enabled) {
      const kakaoChanges = notifications.map(n => ({
        keyword: n.metadata.keyword as string,
        from_rank: n.metadata.from_rank as number,
        to_rank: n.metadata.to_rank as number,
        type: n.notification_type,
      }));

      // 카카오는 전화번호 필요 - 현재 DB에 없으므로 향후 추가 시 활성화
      // const sent = await sendKakaoRankAlert(phone, recipient.displayName, kakaoChanges);
      // if (sent) kakaoSent++;
      console.log(`[notifications] 카카오 알림톡 대기 중 (${recipient.displayName}, ${kakaoChanges.length}건)`);
    }
  }

  // ─── 경쟁자 변동 알림 ───
  for (const recipient of recipients) {
    if (recipient.type !== 'user') continue; // 가입자만

    // 이 사용자의 경쟁자 목록 조회
    const { data: watches } = await supabase
      .from('competitor_watches')
      .select('competitor_id, influencers!competitor_id(naver_id, display_name)')
      .eq('user_id', recipient.id);

    if (!watches || watches.length === 0) continue;

    // 나의 현재 순위 조회
    const { data: myRankings } = await supabase
      .from('keyword_rankings')
      .select('keyword_id, rank_position')
      .eq('influencer_id', recipient.influencerId)
      .eq('snapshot_date', snapshotDate);

    if (!myRankings || myRankings.length === 0) continue;
    const myRankMap = new Map(myRankings.map(r => [r.keyword_id, r.rank_position]));

    const recipientField = { user_id: recipient.id };
    const settings = recipient.settings || DEFAULT_SETTINGS;

    for (const watch of watches) {
      const comp = watch.influencers as unknown as { naver_id: string; display_name: string } | null;
      if (!comp) continue;

      // 경쟁자의 오늘 변동 조회 (겹치는 키워드에서 나를 추월한 경우만)
      const { data: compRankings } = await supabase
        .from('keyword_rankings')
        .select('keyword_id, rank_position, previous_rank, rank_change, keyword_challenges!inner(keyword)')
        .eq('influencer_id', watch.competitor_id)
        .eq('snapshot_date', snapshotDate)
        .neq('rank_change', 0);

      if (!compRankings) continue;

      for (const cr of compRankings) {
        const myRank = myRankMap.get(cr.keyword_id);
        if (myRank === undefined) continue; // 겹치지 않는 키워드 무시

        // 경쟁자가 나를 추월한 경우만 알림
        if (cr.rank_position < myRank && cr.previous_rank !== null && cr.previous_rank >= myRank) {
          const kw = cr.keyword_challenges as unknown as { keyword: string };
          const notification = {
            ...recipientField,
            notification_type: 'competitor_overtook',
            title: `${comp.display_name}이(가) "${kw?.keyword}" 추월`,
            body: `${cr.previous_rank}위에서 ${cr.rank_position}위로 올라 내 ${myRank}위를 앞섰습니다.`,
            metadata: {
              competitor_naver_id: comp.naver_id,
              competitor_name: comp.display_name,
              keyword_id: cr.keyword_id,
              keyword: kw?.keyword || '',
              competitor_rank: cr.rank_position,
              my_rank: myRank,
            },
          };

          if (settings.in_app_enabled) {
            await supabase.from('notifications').insert({
              ...notification,
              is_read: false,
              email_sent: false,
              kakao_sent: false,
            });
            notificationsCreated++;
          }
        }
      }
    }
  }

  return { notificationsCreated, emailsSent, emailErrors, kakaoSent, pushSent };
}

// ─── 공지사항 알림 (전체 사용자 대상) ───

export async function createNoticeNotification(
  supabase: SupabaseClient,
  noticeId: string,
  title: string,
) {
  // 모든 가입자에게 인앱 알림 생성
  const { data: users } = await supabase
    .from('users')
    .select('id');

  if (!users || users.length === 0) return 0;

  const notifications = users.map(u => ({
    user_id: u.id,
    notification_type: 'new_notice',
    title: '새 공지사항',
    body: title,
    metadata: { notice_id: noticeId },
    is_read: false,
    email_sent: false,
    kakao_sent: false,
  }));

  // 배치 삽입 (100개씩)
  let created = 0;
  for (let i = 0; i < notifications.length; i += 100) {
    const batch = notifications.slice(i, i + 100);
    const { data } = await supabase
      .from('notifications')
      .insert(batch)
      .select('id');
    created += data?.length || 0;
  }

  console.log(`[notifications] 공지사항 알림 ${created}건 생성`);
  return created;
}

// ─── 커뮤니티 반응 알림 (글 작성자에게) ───

export async function createCommunityReactionNotification(
  supabase: SupabaseClient,
  opts: {
    postId: string;
    postTitle: string;
    authorId: string;          // 글 작성자 ID (naver_id 또는 user_id)
    authorType: string;        // 'influencer' | 'blogger'
    reactorName: string;       // 반응한 사람 이름
    reactionType: 'comment' | 'like';
    commentPreview?: string;   // 댓글인 경우 내용 미리보기
  },
) {
  const { postId, postTitle, authorId, authorType, reactorName, reactionType, commentPreview } = opts;

  // 글 작성자의 user_id 또는 demo_session_id 조회
  let recipientField: Record<string, string> | null = null;

  // 가입자인 경우: influencers.naver_id -> users.linked_influencer_id
  if (authorType === 'influencer') {
    const { data: inf, error: infError } = await supabase
      .from('influencers')
      .select('id')
      .eq('naver_id', authorId)
      .single();

    if (infError || !inf) {
      if (infError) console.error('[notifications] influencer lookup failed:', infError.message);
    } else {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('linked_influencer_id', inf.id)
        .single();

      if (userError && userError.code !== 'PGRST116') {
        console.error('[notifications] user lookup failed:', userError.message);
      }

      if (user) {
        recipientField = { user_id: user.id };
      } else {
        // 데모 세션 확인
        const { data: demo, error: demoError } = await supabase
          .from('demo_sessions')
          .select('id')
          .eq('naver_id', authorId)
          .not('verified_at', 'is', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (demoError && demoError.code !== 'PGRST116') {
          console.error('[notifications] demo session lookup failed:', demoError.message);
        }

        if (demo) {
          recipientField = { demo_session_id: demo.id };
        }
      }
    }
  }

  if (!recipientField) return;

  const notificationType = reactionType === 'comment' ? 'community_comment' : 'community_like';
  const title = reactionType === 'comment'
    ? `${reactorName}님이 댓글을 남겼습니다`
    : `${reactorName}님이 좋아요를 눌렀습니다`;
  const body = reactionType === 'comment' && commentPreview
    ? commentPreview.slice(0, 100)
    : `"${postTitle.slice(0, 50)}" 게시글`;

  await supabase
    .from('notifications')
    .insert({
      ...recipientField,
      notification_type: notificationType,
      title,
      body,
      metadata: { post_id: postId, post_title: postTitle, reactor_name: reactorName, reaction_type: reactionType },
      is_read: false,
      email_sent: false,
      kakao_sent: false,
    });
}

// ─── 채팅 멘션 알림 ───

/**
 * 채팅방에서 @멘션된 사용자들에게 알림을 생성한다.
 * mentionedIds 는 naver_id 또는 blog_id 의 배열.
 */
export async function createChatMentionNotification(
  supabase: SupabaseClient,
  opts: {
    messageId: string;
    messagePreview: string;
    mentionedIds: string[];
    mentionerName: string;
  },
) {
  const { messageId, messagePreview, mentionedIds, mentionerName } = opts;
  if (!mentionedIds || mentionedIds.length === 0) return;

  // 각 멘션 ID → users.id (linked_influencer_id 경유 또는 blog_id) 매핑
  // 1) 인플루언서 경로: influencers.naver_id → users.linked_influencer_id
  const { data: inf } = await supabase
    .from('influencers')
    .select('id, naver_id')
    .in('naver_id', mentionedIds);
  const naverToInfId = new Map<string, string>((inf || []).map(i => [i.naver_id, i.id]));

  const infIds = Array.from(naverToInfId.values());
  let userIds: string[] = [];
  if (infIds.length > 0) {
    const { data: u } = await supabase
      .from('users')
      .select('id, linked_influencer_id')
      .in('linked_influencer_id', infIds);
    userIds = userIds.concat((u || []).map(r => r.id));
  }

  // 2) 블로거 경로: users.blog_id
  const { data: bu } = await supabase
    .from('users')
    .select('id')
    .in('blog_id', mentionedIds);
  userIds = userIds.concat((bu || []).map(r => r.id));

  userIds = Array.from(new Set(userIds));
  if (userIds.length === 0) return;

  const rows = userIds.map(uid => ({
    user_id: uid,
    notification_type: 'chat_mention',
    title: `${mentionerName}님이 채팅에서 회원님을 언급했습니다`,
    body: messagePreview,
    metadata: { message_id: messageId, mentioner_name: mentionerName },
    is_read: false,
    email_sent: false,
    kakao_sent: false,
  }));

  await supabase.from('notifications').insert(rows);
}
