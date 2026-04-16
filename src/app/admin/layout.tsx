import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/admin';
import AdminSidebar from './AdminSidebar';
import AdminLogoutButton from './AdminLogoutButton';

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

      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

      if (authUser) {
        const supabase = createServiceClient();
        const { data: profile } = await supabase
          .from('users')
          .select('id')
          .eq('auth_id', authUser.id)
          .single();

        if (profile && isAdmin(profile.id)) {
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
