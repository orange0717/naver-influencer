'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MENU_ITEMS = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/members', label: '회원 관리' },
  { href: '/admin/community', label: '커뮤니티 관리' },
  { href: '/admin/payments', label: '결제 관리' },
  { href: '/admin/analytics', label: '유입 분석' },
  { href: '/admin/promo', label: '프로모션' },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 bg-surface border-r border-border shrink-0">
      <div className="p-5 border-b border-border">
        <Link href="/admin" className="text-lg font-extrabold text-accent">
          관리자
        </Link>
      </div>
      <nav className="p-3 space-y-0.5">
        {MENU_ITEMS.map(item => {
          const active = item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-dim hover:text-text hover:bg-surface-hover'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 mt-4 border-t border-border">
        <Link href="/" className="block px-3 py-2 text-xs text-dim hover:text-accent transition">
          ← 사이트로 돌아가기
        </Link>
      </div>
    </aside>
  );
}
