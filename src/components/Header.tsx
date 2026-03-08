'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const NAV = [
  { href: '/', label: '대시보드' },
  { href: '/keywords', label: '키워드' },
  { href: '/influencers', label: '인플루언서' },
  { href: '/my', label: '내 순위' },
  { href: '/charge', label: '충전' },
];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; nickname?: string } | null>(null);
  const [points, setPoints] = useState(0);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setUser({ email: authUser.email });
        // 유저 프로필 + 포인트 조회
        const { data: profile } = await supabase
          .from('users')
          .select('nickname, point_balance')
          .eq('auth_id', authUser.id)
          .single();
        if (profile) {
          setUser({ email: authUser.email, nickname: profile.nickname });
          setPoints(profile.point_balance || 0);
        }
      } else {
        setUser(null);
        setPoints(0);
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
    setPoints(0);
    router.push('/');
    router.refresh();
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-surface border-b border-border backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-bold text-base text-text hidden sm:block">키워드챌린지</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV.map(n => {
                const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
                return (
                  <Link key={n.href} href={n.href}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                      active ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface-hover'
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
                <Link href="/charge"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/12 rounded-lg text-sm font-bold text-accent hover:bg-accent/20 transition-colors">
                  <span>P</span>
                  <span className="font-rank">{points.toLocaleString()}</span>
                </Link>
                <button onClick={handleLogout}
                  className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs hover:bg-accent/30 transition cursor-pointer"
                  title={user.nickname || user.email || '로그아웃'}>
                  {(user.nickname || user.email || 'U').charAt(0).toUpperCase()}
                </button>
              </>
            ) : (
              <Link href="/auth/login"
                className="px-3 py-1.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors">
                로그인
              </Link>
            )}
            <button className="md:hidden p-1 text-dim" onClick={() => setMobileOpen(!mobileOpen)}>
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
