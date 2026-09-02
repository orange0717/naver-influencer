import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { validateBody, linkInfluencerSchema } from '@/lib/validations';
import { isRestricted } from '@/lib/admin';
import { ensureInfluencerBlogId } from '@/lib/influencer-blog';
import { parseInfluencerId, influencerHomeUrl } from '@/lib/influencer-url';
import { isAllowedUrl } from '@/lib/crawler';
import { CONTACT_EMAIL } from '@/lib/site-contact';

export const dynamic = 'force-dynamic';

const FETCH_TIMEOUT_MS = 10_000;
const CRAWL_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://in.naver.com/',
};

type AccountLookup =
  | { status: 'found'; displayName: string; introduction: string; imageUrl: string }
  | { status: 'notFound' }
  | { status: 'unreachable' };

/**
 * in.naver.com 홈을 한 번만 불러 계정이 실재하는지 확인하고, 겸사겸사 표시 정보를 챙긴다.
 *
 * fetchWithRetry 를 쓰지 않는 이유: 그쪽은 404 도 재시도한 뒤 Error 로 뭉뚱그려 던져서
 * "그런 계정이 없다"와 "네이버에 닿지 못했다"를 구분할 수 없다. 둘은 사용자가 해야 할
 * 행동이 다르므로(주소 고치기 / 잠시 후 재시도) 여기서는 상태 코드를 직접 본다.
 */
async function lookupInfluencerAccount(naverId: string): Promise<AccountLookup> {
  const url = influencerHomeUrl(naverId);
  if (!isAllowedUrl(url)) return { status: 'unreachable' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: CRAWL_HEADERS, signal: controller.signal });
    if (res.status === 404) return { status: 'notFound' };
    if (!res.ok) return { status: 'unreachable' };

    const $ = cheerio.load(await res.text());
    const ogTitle = ($('meta[property="og:title"]').attr('content') || '').trim();

    return {
      status: 'found',
      // og:title 은 "[네이버 인플루언서] 오렌지도서관" 형태로 온다.
      displayName: ogTitle.replace(/^\[[^\]]*\]\s*/, '').trim(),
      introduction: ($('meta[property="og:description"]').attr('content') || '').trim(),
      imageUrl: ($('meta[property="og:image"]').attr('content') || '').trim(),
    };
  } catch (err) {
    console.error('[my/link] 계정 확인 실패:', err instanceof Error ? err.message : err);
    return { status: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

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

  const naverId = parseInfluencerId(v.data.url);
  if (!naverId) {
    return NextResponse.json(
      { error: '인플루언서 홈 주소를 확인해 주세요. (예: https://in.naver.com/orangelibrary)' },
      { status: 400 },
    );
  }
  const nickname = v.data.nickname.trim();

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

  // 실재하는 계정인지 먼저 확인한다. 확인되지 않으면 저장하지 않는다.
  const account = await lookupInfluencerAccount(naverId);
  if (account.status === 'notFound') {
    return NextResponse.json(
      { error: '입력하신 주소에서 인플루언서 홈을 찾지 못했습니다. 주소를 다시 확인해 주세요.' },
      { status: 400 },
    );
  }
  if (account.status === 'unreachable') {
    return NextResponse.json(
      { error: '지금은 네이버에서 계정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 502 },
    );
  }

  // 우리가 아직 수집하지 못한 계정이면 이 자리에서 만들어 준다.
  // 방금 불러온 홈 정보로 이름·소개·이미지를 채우고, 팬수처럼 여기서 알 수 없는 값은
  // 0 을 지어내지 않고 비워 둔다(0 과 "아직 못 잼"이 합쳐지면 되돌릴 수 없다).
  let { data: influencer } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .maybeSingle();

  if (!influencer) {
    const { data: created, error: createError } = await supabase
      .from('influencers')
      .upsert(
        {
          naver_id: naverId,
          display_name: account.displayName || nickname,
          profile_url: influencerHomeUrl(naverId),
          introduction: account.introduction,
          image_url: account.imageUrl,
        },
        { onConflict: 'naver_id' },
      )
      .select('id')
      .single();

    if (createError || !created) {
      console.error('[my/link] 인플루언서 생성 실패:', createError?.message);
      return NextResponse.json({ error: '연결에 실패했습니다.' }, { status: 500 });
    }
    influencer = created;
  }

  // 선점 확인 — 먼저 등록한 사용자가 소유한다.
  // DB 의 유니크 인덱스가 최종 방어선이지만, 그것만 믿으면 사용자에게는 그냥 500 이 보인다.
  const { data: owner } = await supabase
    .from('users')
    .select('auth_id')
    .eq('linked_influencer_id', influencer.id)
    .neq('auth_id', authUser.id)
    .limit(1)
    .maybeSingle();

  if (owner) {
    return NextResponse.json(
      {
        error: `이미 다른 회원이 연결한 계정입니다. 본인 계정이 맞다면 ${CONTACT_EMAIL} 으로 인플루언서 홈 주소를 보내주세요.`,
        code: 'ALREADY_LINKED',
      },
      { status: 409 },
    );
  }

  // users 테이블 업데이트 (service role로 RLS 우회)
  const { error: updateError } = await supabase
    .from('users')
    .update({ linked_influencer_id: influencer.id })
    .eq('auth_id', authUser.id);

  if (updateError) {
    // 위 조회와 이 갱신 사이에 다른 사용자가 먼저 가져간 경우 유니크 인덱스가 막는다.
    if (updateError.code === '23505') {
      return NextResponse.json(
        {
          error: `이미 다른 회원이 연결한 계정입니다. 본인 계정이 맞다면 ${CONTACT_EMAIL} 으로 인플루언서 홈 주소를 보내주세요.`,
          code: 'ALREADY_LINKED',
        },
        { status: 409 },
      );
    }
    console.error('[my/link] Update error:', updateError.message);
    return NextResponse.json({ error: '연결에 실패했습니다.' }, { status: 500 });
  }

  // 연결 직후 인플루언서의 "실제 블로그"를 in.naver.com에서 해석해 blog_id로 저장한다.
  // naver_id와 실제 blog_id가 다른 경우(예: orangelibrary → orangelibrary_) 대시보드가 엉뚱한
  // 블로그를 매칭하는 것을 방지한다. blog_id가 비었거나 naver_id로 잘못 저장된 경우만 교정한다.
  try {
    const { data: cur } = await supabase
      .from('users')
      .select('blog_id')
      .eq('auth_id', authUser.id)
      .maybeSingle();
    await ensureInfluencerBlogId(supabase, authUser.id, cur?.blog_id ?? null, naverId);
  } catch (e) {
    console.error('[my/link] blog_id 자동 해석 실패:', e);
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('signup_keyword_category')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  const topicFromSignup = userRow?.signup_keyword_category?.trim();
  if (topicFromSignup) {
    const { error: catErr } = await supabase
      .from('influencers')
      .update({ my_keyword_category: topicFromSignup })
      .eq('id', influencer.id);
    if (catErr) {
      console.error('[my/link] my_keyword_category update:', catErr.message);
    }
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

  return NextResponse.json({
    success: true,
    naverId,
    displayName: account.displayName || nickname,
  });
}
