import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import { JUDGE_REVIEW_ROUTES, judgeError, isExpired } from '@/lib/judge-accounts';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type RouteResult = {
  group: string;
  path: string;
  status: number | null;
  result: 'allow' | 'deny' | 'error';
  redirectedTo: string | null;
  note: string | null;
};

/** 동시 요청 수 — 자기 자신을 호출하므로 서버를 몰아치지 않게 낮게 잡는다 */
const CONCURRENCY = 4;

/**
 * 미들웨어·페이지 게이트가 "막았다"는 뜻으로 보내는 리다이렉트 목적지.
 * 3xx 를 전부 차단으로 세면 안 된다 — 예를 들어 인플루언서 미연결 계정의
 * /my 는 /my/blogger 로 넘어가는데 이건 막힌 게 아니라 정상 라우팅이다.
 */
function isGateRedirect(location: string | null): boolean {
  if (!location) return false;
  let path: string;
  let query: string;
  try {
    const url = new URL(location, 'https://ninfle.kr');
    path = url.pathname;
    query = url.search;
  } catch {
    return false;
  }
  // 로그인 필요 · 회원 전용 · 제한 사용자 → 홈으로
  if (path === '/') {
    return query.includes('authModal=login') || query.includes('memberOnly=1') || query === '';
  }
  // 유료 이용권 필요
  if (path === '/subscribe') return true;
  return false;
}

/**
 * POST /api/admin/judges/:id/verify
 *
 * 해당 계정의 세션을 서버에서 실제로 만들어, §2 전 경로를 그 세션으로 HTTP
 * 요청해 본다. 응답은 경로별 원자료(상태코드·리다이렉트 대상)를 그대로 싣는다.
 *
 * 세션 확보 방식: 비밀번호를 저장하지 않으므로(그리고 저장해서도 안 되므로)
 * Admin API 로 일회용 magiclink 토큰을 만들어 그것으로 세션을 교환한다.
 * generateLink 는 링크/토큰을 반환할 뿐 메일을 발송하지 않는다 — 심사위원에게
 * 아무 메일도 가지 않는다.
 *
 * 따라서 loginOk 가 뜻하는 것은 "이 계정으로 유효한 세션을 만들 수 있다"
 * (계정 존재·미밴·미만료)이지 "관리자가 전달한 비밀번호가 맞다"가 아니다.
 * 비밀번호 자체는 발급 시점 이후 서버 어디에도 없어 재확인할 수 없다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) {
    return auth.error.status === 401
      ? judgeError('UNAUTHORIZED', '로그인이 필요합니다.', 401)
      : judgeError('FORBIDDEN', '권한이 없습니다.', 403);
  }

  const { id } = await ctx.params;
  const supabase = createServiceClient();

  const { data: judge } = await supabase
    .from('judge_accounts')
    .select('id, email, active, expires_at')
    .eq('id', id)
    .maybeSingle();

  if (!judge) return judgeError('NOT_FOUND', '대상을 찾을 수 없습니다.', 404);

  const checkedAt = new Date().toISOString();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return judgeError('CONFIG_MISSING', '서버 설정이 올바르지 않습니다.', 500);
  }

  // ── 1) 세션 확보 ─────────────────────────────────────────────
  let cookieHeader = '';
  let loginOk = false;
  let loginNote: string | null = null;

  if (!judge.active) {
    loginNote = '비활성화된 계정입니다.';
  } else if (isExpired(judge.expires_at)) {
    loginNote = '만료된 계정입니다.';
  } else {
    try {
      const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: judge.email,
      });
      if (linkError || !link?.properties?.hashed_token) {
        loginNote = '세션 발급에 실패했습니다.';
      } else {
        const anon = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: verified, error: otpError } = await anon.auth.verifyOtp({
          type: 'magiclink',
          token_hash: link.properties.hashed_token,
        });
        if (otpError || !verified?.session) {
          loginNote = '세션 발급에 실패했습니다.';
        } else {
          // @supabase/ssr 가 실제로 쓰는 쿠키 형식(청크 분할 포함)을 그대로 얻기 위해
          // 라이브러리에 직렬화를 맡긴다. 수기로 쿠키 이름을 조립하지 않는다.
          const jar: { name: string; value: string }[] = [];
          const ssr = createServerClient(supabaseUrl, anonKey, {
            cookies: {
              getAll: () => jar.map(c => ({ name: c.name, value: c.value })),
              setAll: cookies => {
                for (const c of cookies) {
                  const idx = jar.findIndex(j => j.name === c.name);
                  if (idx >= 0) jar[idx] = { name: c.name, value: c.value };
                  else jar.push({ name: c.name, value: c.value });
                }
              },
            },
          });
          await ssr.auth.setSession({
            access_token: verified.session.access_token,
            refresh_token: verified.session.refresh_token,
          });
          cookieHeader = jar
            .filter(c => c.value)
            .map(c => `${c.name}=${encodeURIComponent(c.value)}`)
            .join('; ');
          loginOk = cookieHeader.length > 0;
          if (!loginOk) loginNote = '세션 쿠키를 만들지 못했습니다.';
        }
      }
    } catch (err) {
      console.error('[admin/judges/verify] session error:', err);
      loginNote = '세션 발급 중 오류가 발생했습니다.';
    }
  }

  // ── 2) 경로별 점검 ───────────────────────────────────────────
  const origin = req.nextUrl.origin;

  async function checkRoute(entry: { group: string; path: string }): Promise<RouteResult> {
    if (!loginOk) {
      return {
        group: entry.group,
        path: entry.path,
        status: null,
        result: 'error',
        redirectedTo: null,
        note: '세션 없음 — 점검하지 못함',
      };
    }
    try {
      const res = await fetch(`${origin}${entry.path}`, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        headers: {
          cookie: cookieHeader,
          accept: 'text/html,application/xhtml+xml',
          'user-agent': 'ninfle-judge-verify/1.0',
        },
        signal: AbortSignal.timeout(20_000),
      });

      const location = res.headers.get('location');

      if (res.status >= 300 && res.status < 400) {
        // 게이트 리다이렉트는 전부 목적지로 드러난다:
        //   /?authModal=login  로그인 필요 · /?memberOnly=1 회원 전용
        //   /subscribe?needsPro=1 유료 이용권 필요 · / 제한 사용자
        // 그 외 목적지(/my/blogger, /profile 등)는 화면이 열린 것이므로 차단이 아니다.
        const gated = isGateRedirect(location);
        return {
          group: entry.group,
          path: entry.path,
          status: res.status,
          result: gated ? 'deny' : 'allow',
          redirectedTo: location,
          note: gated ? null : '리다이렉트(게이트 아님)',
        };
      }

      if (res.status >= 200 && res.status < 300) {
        return { group: entry.group, path: entry.path, status: res.status, result: 'allow', redirectedTo: null, note: null };
      }

      return {
        group: entry.group,
        path: entry.path,
        status: res.status,
        result: 'error',
        redirectedTo: location,
        note: res.status === 404 ? '경로 없음' : null,
      };
    } catch (err) {
      return {
        group: entry.group,
        path: entry.path,
        status: null,
        result: 'error',
        redirectedTo: null,
        note: err instanceof Error ? err.name : '요청 실패',
      };
    }
  }

  const routes: RouteResult[] = [];
  for (let i = 0; i < JUDGE_REVIEW_ROUTES.length; i += CONCURRENCY) {
    const batch = JUDGE_REVIEW_ROUTES.slice(i, i + CONCURRENCY);
    routes.push(...(await Promise.all(batch.map(checkRoute))));
  }

  await supabase
    .from('judge_accounts')
    .update({ last_verified_at: checkedAt, updated_at: checkedAt })
    .eq('id', id);

  return NextResponse.json({ loginOk, loginNote, checkedAt, routes });
}
