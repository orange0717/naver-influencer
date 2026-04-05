import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { messageLimiter, notificationLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * 쪽지 목록 조회
 * GET /api/messages?box=inbox|sent&page=1&limit=20
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await notificationLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const box = searchParams.get('box') || 'inbox';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  try {
    if (box === 'sent') {
      // 보낸 쪽지
      const { data: messages, count } = await supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('sender_id', auth.userId)
        .eq('deleted_by_sender', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return NextResponse.json({
        messages: messages || [],
        total: count || 0,
        page,
        totalPages: Math.ceil((count || 0) / limit),
      });
    }

    // 받은 쪽지: linked_influencer_id로 naver_id 조회
    let receiverNaverId: string | null = null;

    if (auth.user.linked_influencer_id) {
      const { data: inf } = await supabase
        .from('influencers')
        .select('naver_id')
        .eq('id', auth.user.linked_influencer_id)
        .single();
      receiverNaverId = inf?.naver_id || null;
    }

    if (!receiverNaverId) {
      return NextResponse.json({
        messages: [],
        total: 0,
        unreadCount: 0,
        page,
        totalPages: 0,
      });
    }

    const { data: messages, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('receiver_naver_id', receiverNaverId)
      .eq('deleted_by_receiver', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 안읽은 수
    const { count: unreadCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_naver_id', receiverNaverId)
      .eq('is_read', false)
      .eq('deleted_by_receiver', false);

    return NextResponse.json({
      messages: messages || [],
      total: count || 0,
      unreadCount: unreadCount || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error('[messages GET]', err);
    return NextResponse.json({ error: '쪽지를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * 쪽지 보내기
 * POST /api/messages { receiverNaverId, content }
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await messageLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { receiverNaverId, content } = body;

    if (!receiverNaverId || typeof receiverNaverId !== 'string') {
      return NextResponse.json({ error: '수신자를 지정해주세요.' }, { status: 400 });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 });
    }

    if (content.trim().length > 2000) {
      return NextResponse.json({ error: '내용은 2,000자 이내로 입력해주세요.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 수신자 확인
    const { data: receiver } = await supabase
      .from('influencers')
      .select('naver_id, display_name')
      .eq('naver_id', receiverNaverId)
      .single();

    if (!receiver) {
      return NextResponse.json({ error: '존재하지 않는 인플루언서입니다.' }, { status: 404 });
    }

    // 발신자 이름 조회
    let senderName = auth.user.nickname || '';
    if (auth.user.linked_influencer_id) {
      const { data: senderInf } = await supabase
        .from('influencers')
        .select('display_name, naver_id')
        .eq('id', auth.user.linked_influencer_id)
        .single();
      if (senderInf) {
        senderName = senderInf.display_name || senderInf.naver_id || senderName;
      }

      // 자기 자신에게 보내기 방지
      if (senderInf?.naver_id === receiverNaverId) {
        return NextResponse.json({ error: '자신에게는 쪽지를 보낼 수 없습니다.' }, { status: 400 });
      }
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        sender_id: auth.userId,
        sender_name: senderName,
        receiver_naver_id: receiverNaverId,
        receiver_name: receiver.display_name || receiverNaverId,
        content: content.trim(),
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, messageId: message.id }, { status: 201 });
  } catch (err) {
    console.error('[messages POST]', err);
    return NextResponse.json({ error: '쪽지 발송 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
