import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL 및 NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다.');
  }
  return createBrowserClient(url, key);
}
