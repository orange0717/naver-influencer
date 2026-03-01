'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { href: '/', label: '대시보드', icon: '📊' },
  { href: '/keywords', label: '키워드', icon: '🔍' },
  { href: '/my', label: '내 순위', icon: '🏆' },
  { href: '/charge', label: '충전', icon: '💎' },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const points = 1200;

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
            <Link href="/charge"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/12 rounded-lg text-sm font-bold text-accent hover:bg-accent/20 transition-colors">
              <span>P</span>
              <span className="font-rank">{points.toLocaleString()}</span>
            </Link>
            <Link href="/profile"
              className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs hover:bg-accent/30 transition">
              U
            </Link>
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
                  <span>{n.icon}</span>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
