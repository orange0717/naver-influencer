import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { validateBody, validateSearchParams } from '@/lib/validations';
import { createMessageSchema, chatListQuerySchema } from '@/lib/validations/chat';
import { chatMessageLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { checkChatAccess } from '@/lib/chat-access';
import { detectProfanity } from '@/lib/profanity';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/messages?before=<iso>&limit=50
 * 커서 페이지네이션: before 이전 메시지 최대 limit 개 (최신순)
 */
export async function GET(req: NextRequest) {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const access = await checkChatAccess(cookieUser);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const v = validateSearchParams(chatListQuerySchema, new URL(req.url).searchParams);
  if (!v.success) return v.response;

  const { before, limit } = v.data;
  const supabase = createServiceClient();

  try {
    let query = supabase
      .from('chat_messages')
      .select('id, author_id, author_type, author_name, author_avatar_url, content, image_urls, mentioned_ids, reply_to_id, is_edited, is_deleted, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messages, error } = await query;
    if (error) throw error;

    const ids = (messages || []).map((m) => m.id);
    let reactions: Array<{ message_id: string; user_id: string; emoji: string }> = [];
    if (ids.length > 0) {
      const { data: r } = await supabase
        .from('chat_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', ids);
      reactions = r || [];
    }

    // 역순으로 저장된 데이터를 시간 오름차순으로 뒤집어 반환 (UI 친화적)
    const ordered = (messages || []).slice().reverse();
    return NextResponse.json({
      messages: ordered,
      reactions,
      hasMore: (messages?.length || 0) === limit,
    });
  } catch (err) {
    console.error('[chat] GET error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '메시지를 불러올 수 없습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/chat/messages
 * 메시지 작성 (비속어 필터 + 제재 확인 + rate limit)
 */
export async function POST(req: NextRequest) {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const access = await checkChatAccess(cookieUser);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const ip = getClientIp(req);
  if (await chatMessageLimiter.check(`chat:${cookieUser.id}:${ip}`)) {
    return rateLimitResponse();
  }

  const body = await req.json();
  const v = validateBody(createMessageSchema, body);
  if (!v.success) return v.response;

  const { content, image_urls, mentioned_ids, reply_to_id } = v.data;

  // 비속어 필터링
  const scan = detectProfanity(content);
  if (scan.severity === 'severe') {
    // 경고 기록 (24시간 유지)
    const supabase = createServiceClient();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('chat_user_sanctions').insert({
      user_id: cookieUser.id,
      type: 'warning',
      reason: `심각 비속어 차단: ${scan.matched.slice(0, 3).join(', ')}`,
      expires_at: expires,
      created_by: 'system',
    });

    // 24시간 내 경고 3회 누적 시 24시간 뮤트
    const { count } = await supabase
      .from('chat_user_sanctions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', cookieUser.id)
      .eq('type', 'warning')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((count || 0) >= 3) {
      await supabase.from('chat_user_sanctions').insert({
        user_id: cookieUser.id,
        type: 'mute',
        reason: '24시간 내 심각 비속어 3회 — 자동 뮤트',
        expires_at: expires,
        created_by: 'system',
      });
    }

    return NextResponse.json(
      { error: '부적절한 표현이 감지되어 전송할 수 없습니다.', severity: 'severe' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // 작성자 정보 조회 (닉네임 + 아바타)
  const orClause = cookieUser.type === 'blogger'
    ? `blog_id.eq.${cookieUser.id}`
    : `naver_id.eq.${cookieUser.id}`;
  const { data: userRow } = await supabase
    .from('users')
    .select('nickname, avatar_url')
    .or(orClause)
    .limit(1)
    .maybeSingle();

  const authorName = (userRow?.nickname || cookieUser.id).slice(0, 50);

  const { data: inserted, error } = await supabase
    .from('chat_messages')
    .insert({
      author_id: cookieUser.id,
      author_type: cookieUser.type,
      author_name: authorName,
      author_avatar_url: userRow?.avatar_url || null,
      content: scan.cleaned,
      image_urls,
      mentioned_ids,
      reply_to_id: reply_to_id || null,
      has_profanity: scan.severity === 'mild',
    })
    .select('id, author_id, author_type, author_name, author_avatar_url, content, image_urls, mentioned_ids, reply_to_id, is_edited, is_deleted, created_at')
    .single();

  if (error) {
    console.error('[chat] POST insert error:', error.message);
    return NextResponse.json({ error: '메시지 전송에 실패했습니다.' }, { status: 500 });
  }

  // 멘션 알림 (실패해도 메시지 전송은 성공으로 처리)
  if (mentioned_ids.length > 0) {
    try {
      const { createChatMentionNotification } = await import('@/lib/notifications');
      await createChatMentionNotification(supabase, {
        messageId: inserted.id,
        messagePreview: scan.cleaned.slice(0, 100),
        mentionedIds: mentioned_ids,
        mentionerName: authorName,
      });
    } catch (err) {
      console.error('[chat] mention notification error:', err);
    }
  }

  return NextResponse.json({
    message: inserted,
    profanityMasked: scan.severity === 'mild',
  }, { status: 201 });
}
