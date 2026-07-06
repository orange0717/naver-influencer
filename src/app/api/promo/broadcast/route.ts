import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isAdminFromProfile } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/promo/broadcast — 회원 목록 조회 (관리자용)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  if (!isAdminFromProfile(auth.user)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const supabase = createServiceClient();

  // 전체 회원 + 인플루언서 정보
  const { data: users } = await supabase
    .from('users')
    .select('id, email, nickname, blog_id, linked_influencer_id, subscription_plan, subscription_expires_at, created_at')
    .order('created_at', { ascending: false });

  // 인플루언서 naver_id 매핑
  const infIds = (users || []).map(u => u.linked_influencer_id).filter(Boolean);
  let infMap = new Map<string, string>();
  if (infIds.length > 0) {
    const { data: infs } = await supabase.from('influencers').select('id, naver_id, display_name').in('id', infIds);
    for (const inf of (infs || [])) {
      infMap.set(inf.id, inf.display_name || inf.naver_id);
    }
  }

  const result = (users || []).map(u => ({
    ...u,
    influencer_name: u.linked_influencer_id ? infMap.get(u.linked_influencer_id) || null : null,
  }));

  return NextResponse.json({ users: result });
}

/**
 * POST /api/promo/broadcast — 선별 회원에게 프로모션 코드 쪽지 발송
 * body: { userIds: string[], code: string, message?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser(request);
    if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

    if (!isAdminFromProfile(auth.user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const supabase = createServiceClient();
    const body = await request.json();
    const userIds: string[] = body.userIds || [];
    const code = (body.code || '').trim().toUpperCase();
    const customMessage = (body.message || '').trim();

    if (userIds.length === 0) {
      return NextResponse.json({ error: '발송 대상을 선택해주세요.' }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: '코드를 입력해주세요.' }, { status: 400 });
    }

    // 선택된 사용자의 인플루언서 naver_id 조회
    const { data: users } = await supabase
      .from('users')
      .select('id, linked_influencer_id, blog_id')
      .in('id', userIds);

    const infIds = (users || []).map(u => u.linked_influencer_id).filter(Boolean);
    let infMap = new Map<string, string>();
    if (infIds.length > 0) {
      const { data: infs } = await supabase.from('influencers').select('id, naver_id').in('id', infIds);
      for (const inf of (infs || [])) infMap.set(inf.id, inf.naver_id);
    }

    const messageContent = customMessage
      || `프로모션 코드가 도착했습니다!\n\n코드: ${code}\n\n마이페이지 > 프로모션 코드에서 입력하면 유료 기능을 무료로 이용할 수 있습니다.`;

    const messages = [];
    for (const u of (users || [])) {
      const naverId = u.linked_influencer_id ? infMap.get(u.linked_influencer_id) : u.blog_id;
      if (!naverId) continue;

      messages.push({
        sender_id: auth.userId,
        sender_name: 'N인플 운영팀',
        receiver_naver_id: naverId,
        receiver_name: naverId,
        content: messageContent,
      });
    }

    if (messages.length > 0) {
      for (let i = 0; i < messages.length; i += 100) {
        await supabase.from('messages').insert(messages.slice(i, i + 100));
      }
    }

    return NextResponse.json({ success: true, sent: messages.length });
  } catch {
    return NextResponse.json({ error: '발송 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
