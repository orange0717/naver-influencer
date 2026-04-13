import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 관리자 이메일 (하드코딩)
const ADMIN_EMAILS = ['orange@orangelibrary.co.kr'];

/**
 * POST /api/promo/broadcast — 전체 회원에게 프로모션 코드 쪽지 발송
 * body: { code: string, message?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser(request);
    if (!auth) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 관리자 확인
    const supabase = createServiceClient();
    const { data: adminUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', auth.userId)
      .single();

    if (!adminUser || !ADMIN_EMAILS.includes(adminUser.email)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const code = (body.code || '').trim().toUpperCase();
    const customMessage = (body.message || '').trim();

    if (!code) {
      return NextResponse.json({ error: '코드를 입력해주세요.' }, { status: 400 });
    }

    // 인플루언서 연결된 모든 사용자 조회
    const { data: users } = await supabase
      .from('users')
      .select('id, nickname, linked_influencer_id')
      .not('linked_influencer_id', 'is', null);

    if (!users || users.length === 0) {
      return NextResponse.json({ error: '발송 대상이 없습니다.' }, { status: 400 });
    }

    // 각 사용자의 naver_id 조회
    const influencerIds = users.map(u => u.linked_influencer_id).filter(Boolean);
    const { data: influencers } = await supabase
      .from('influencers')
      .select('id, naver_id')
      .in('id', influencerIds);

    const infMap = new Map<string, string>();
    for (const inf of (influencers || [])) {
      infMap.set(inf.id, inf.naver_id);
    }

    // 쪽지 발송
    const messageContent = customMessage
      || `프로모션 코드가 도착했습니다!\n\n코드: ${code}\n\n마이페이지 > 프로모션 코드에서 입력하면 유료 기능을 무료로 이용할 수 있습니다.`;

    const messages = [];
    for (const u of users) {
      const naverId = infMap.get(u.linked_influencer_id!);
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
      // 배치 삽입 (100개씩)
      for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100);
        await supabase.from('messages').insert(batch);
      }
    }

    return NextResponse.json({
      success: true,
      sent: messages.length,
      total: users.length,
    });
  } catch {
    return NextResponse.json({ error: '발송 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
