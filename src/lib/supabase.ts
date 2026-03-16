import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 레거시: 기본 클라이언트 (하위 호환용)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * 브라우저 전용 Supabase 클라이언트 (쿠키 기반 세션 관리)
 * 클라이언트 컴포넌트에서 auth.signUp / signInWithPassword 등에 사용
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
