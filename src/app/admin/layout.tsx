import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServiceClient, getUserWithTimeout } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/admin';
import AdminSidebar from './AdminSidebar';
import AdminLogoutButton from './AdminLogoutButton';
import AdminVisitFlag from './AdminVisitFlag';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let authorized = false;

  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const { createServerClient } = await import('@supabase/ssr');
      const supabaseAuth = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { /* read-only */ },
        },
      });

      const authUser = await getUserWithTimeout(supabaseAuth);

      if (authUser) {
        const supabase = createServiceClient();
        const { data: profile } = await supabase
          .from('users')
          .select('id, is_admin')
          .eq('auth_id', authUser.id)
          .single();

        // users.is_admin 우선, ADMIN_USER_IDS 환경변수는 부트스트랩 폴백
        if (profile && (profile.is_admin === true || isAdmin(profile.id))) {
          authorized = true;
        }
      }
    }
  } catch {
    // 인증 실패
  }

  if (!authorized) {
    redirect('/');
  }

  return (
    <div className="fixed inset-0 z-[9999] flex bg-bg">
      <AdminVisitFlag />
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-end px-6 py-3 border-b border-border bg-surface shrink-0">
          <AdminLogoutButton />
        </div>
        <main className="flex-1 overflow-y-auto p-6 max-w-7xl">
          {children}
        </main>
      </div>
    </div>
  );
}
