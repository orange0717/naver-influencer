'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const NAV = [
  { href: '/keywords', label: '키워드' },
  { href: '/influencers', label: '인플루언서' },
  { href: '/rankings', label: '랭킹' },
  { href: '/my', label: '내 대시보드' },
  { href: '/subscribe', label: '구독' },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; nickname?: string } | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser({ email: authUser.email });
        const { data: profile } = await supabase
          .from('users')
          .select('nickname, subscription_status, subscription_expires_at')
          .eq('auth_id', authUser.id)
          .single();
        if (profile) {
          setUser({ email: authUser.email, nickname: profile.nickname });
          const isActive =
            profile.subscription_status === 'active' &&
            !!profile.subscription_expires_at &&
            new Date(profile.subscription_expires_at) > new Date();
          setSubscribed(isActive);
        }
      } else {
        setUser(null);
        setSubscribed(false);
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setSubscribed(false);
    router.push('/');
    router.refresh();
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-header shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-title font-bold text-base text-white hidden sm:block">N인플</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV.map(n => {
                const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      active ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}>
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {subscribed ? (
                  <Link href="/subscribe"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-lg text-sm font-bold text-white">
                    구독 중
                  </Link>
                ) : (
                  <Link href="/subscribe"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 rounded-lg text-sm font-bold text-white hover:bg-white/30 transition-colors">
                    구독하기
                  </Link>
                )}
                <button onClick={handleLogout}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs hover:bg-white/30 transition cursor-pointer"
                  title={user.nickname || user.email || '로그아웃'}>
                  {(user.nickname || user.email || 'U').charAt(0).toUpperCase()}
                </button>
              </>
            ) : (
              <Link href="/auth/login"
                className="px-3 py-1.5 bg-white text-header text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors">
                로그인
              </Link>
            )}
            <button className="md:hidden p-1 text-white/70" onClick={() => setMobileOpen(!mobileOpen)}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
      </header>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 z-40 bg-bg border-t border-border">
          <nav className="flex flex-col p-4 gap-1">
            {NAV.map(n => {
              const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold ${
                    active ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text'
                  }`}>
                  {n.label}
                </Link>
              );
            })}
            {user ? (
              <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-down hover:text-down/80 cursor-pointer">
                로그아웃
              </button>
            ) : (
              <Link href="/auth/login" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold text-accent">
                로그인
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
