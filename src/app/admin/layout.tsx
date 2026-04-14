import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase-server';
import { isAdmin } from '@/lib/admin';
import AdminSidebar from './AdminSidebar';

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
    <div className="flex min-h-[calc(100vh-64px)]">
      <AdminSidebar />
      <main className="flex-1 p-6 max-w-7xl">
        {children}
      </main>
    </div>
  );
}
