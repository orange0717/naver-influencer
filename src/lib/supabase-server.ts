import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
