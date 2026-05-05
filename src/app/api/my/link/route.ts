import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { validateBody, linkInfluencerSchema } from '@/lib/validations';
import { isRestricted } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 쿠키 기반 인증
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (authUser.email && await isRestricted(authUser.email)) {
    return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }
  const v = validateBody(linkInfluencerSchema, body);
  if (!v.success) return v.response;

  const { naverId } = v.data;

  const supabase = createServiceClient();

  // 연결 횟수 제한: 하루 5회까지
  const today = new Date().toISOString().slice(0, 10);
  const { count: linkCount } = await supabase
    .from('link_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('auth_id', authUser.id)
    .gte('created_at', `${today}T00:00:00Z`);

  if ((linkCount ?? 0) >= 5) {
    return NextResponse.json({ error: '일일 연결 시도 횟수를 초과했습니다.' }, { status: 429 });
  }

  // 연결 시도 기록 (테이블이 없으면 무시)
  await supabase
    .from('link_attempts')
    .insert({ auth_id: authUser.id })
    .then(() => {}, () => {});

  // 본인 인증 검증 — 임의 naverId 점유를 차단한다.
  //   demo_sessions 에 (email = auth user 이메일, naver_id = 요청 naverId,
  //   page_verified_at IS NOT NULL) 인 행이 있어야 한다.
  //   page_verified_at 은 /api/auth/demo/verify-page 가 in.naver.com/{naverId}
  //   소개글에서 발급된 page_code 를 직접 크롤로 확인한 뒤에만 채워진다 →
  //   진정한 페이지 소유권 증명. 이메일 OTP(verified_at) 만으로는 통과 불가.
  const authEmail = authUser.email?.toLowerCase();
  if (!authEmail) {
    return NextResponse.json({ error: '이메일이 등록되지 않은 계정입니다.' }, { status: 403 });
  }
  const { data: verifiedSession } = await supabase
    .from('demo_sessions')
    .select('id')
    .eq('email', authEmail)
    .eq('naver_id', naverId)
    .not('page_verified_at', 'is', null)
    .order('page_verified_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!verifiedSession) {
    return NextResponse.json(
      {
        error: '본인 인증이 필요합니다. /auth/demo/request-page-code 로 발급된 코드를 네이버 인플루언서 소개글에 붙여 넣은 뒤 /auth/demo/verify-page 로 검증을 완료해 주세요.',
        code: 'PAGE_VERIFICATION_REQUIRED',
      },
      { status: 403 },
    );
  }

  // 인플루언서 조회
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .single();

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  // users 테이블 업데이트 (service role로 RLS 우회)
  const { error: updateError } = await supabase
    .from('users')
    .update({ linked_influencer_id: influencer.id })
    .eq('auth_id', authUser.id);

  if (updateError) {
    console.error('[my/link] Update error:', updateError.message);
    return NextResponse.json({ error: '연결에 실패했습니다.' }, { status: 500 });
  }

  // 연결 직후 해당 인플루언서 챌린지 순위 즉시 크롤링 (백그라운드)
  const baseUrl = request.nextUrl.origin;
  const cronSecret = process.env.CRON_SECRET;
  const headers: HeadersInit = {};
  if (cronSecret) headers['Authorization'] = `Bearer ${cronSecret}`;

  fetch(`${baseUrl}/api/cron/crawl-challenge-ranks?naver_id=${naverId}`, {
    method: 'GET',
    headers,
  }).catch(err => console.error('[link] background crawl error:', err));

  return NextResponse.json({ success: true });
}
