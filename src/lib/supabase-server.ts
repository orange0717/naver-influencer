import { createClient, type User } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 서버 컴포넌트/라우트에서 안전하게 현재 유저를 조회한다.
 *
 * Supabase Auth 가 죽었을 때(점검·장애), 만료 토큰을 가진 로그인 세션의
 * getUser 는 죽은 Auth 서버에 토큰 refresh 를 재시도하며 오래 hang 되어
 * SSR 응답이 끝나지 않는다(→ 브라우저 무한 로딩). ms 내 응답이 없으면
 * 비로그인(null)으로 폴백해 페이지가 게스트 화면으로라도 즉시 뜨게 한다.
 */
export async function getUserWithTimeout(
  supabase: { auth: { getUser: () => Promise<{ data: { user: User | null } }> } },
  ms = 6000,
): Promise<User | null> {
  try {
    return await Promise.race([
      supabase.auth.getUser().then((r) => r.data.user),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
  } catch {
    return null;
  }
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  }
  return createClient(url, key);
}

export function createAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 및 NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다.');
  }
  return createClient(url, key);
}

/**
 * Route Handler에서 쿠키 기반 인증용 Supabase 클라이언트
 */
export async function createRouteHandlerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll은 Server Component에서 호출될 수 있으므로 무시
          }
        },
      },
    },
  );
}
