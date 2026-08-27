'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const MENU_ITEMS = [
  { href: '/admin', label: '대시보드', icon: '+' },
  { href: '/admin/promo', label: '프로모션', icon: '*' },
  { href: '/admin/payments', label: '결제 관리', icon: '#' },
  { href: '/admin/analytics', label: '유입 분석', icon: 'R' },
  { href: '/admin/desktop-app', label: '데스크탑 앱', icon: 'D' },
  { href: '/admin/restricted', label: '접근 제한', icon: '!' },
  { href: '/admin/members', label: '회원 관리', icon: 'U' },
  { href: '/admin/trials', label: '데모 체험', icon: 'T' },
  { href: '/admin/coupons', label: '쿠폰 관리', icon: '%' },
  { href: '/admin/enterprise', label: '기업용 문의', icon: 'B' },
  { href: '/admin/community', label: '커뮤니티 관리', icon: '?' },
  { href: '/admin/stories', label: '성장후기 관리', icon: 'S' },
  { href: '/admin/bulk-grant', label: '플랜 일괄 부여', icon: '+' },
  { href: '/admin/judges', label: '심사위원 계정', icon: 'J' },
  { href: '/admin/influencers', label: '인플루언서 관리', icon: 'I' },
  { href: '/admin/crawler', label: '크롤러 상태', icon: 'C' },
  { href: '/admin/google-indexing', label: '구글 색인등록', icon: 'G' },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-48 bg-surface border-r border-border shrink-0 flex flex-col">
      <div className="p-5 border-b border-border">
        <Link href="/admin" className="text-base font-extrabold text-accent">
          N인플
        </Link>
      </div>
      <nav className="p-3 space-y-0.5 flex-1">
        {MENU_ITEMS.map(item => {
          const active = item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                active
                  ? 'bg-accent/15 text-accent'
                  : 'text-dim hover:text-text hover:bg-surface-hover'
              }`}
            >
              <span className="w-4 text-center text-xs font-bold">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border">
        <Link href="/" className="block px-3 py-2 text-xs text-dim hover:text-accent transition">
          ← 사이트로 돌아가기
        </Link>
      </div>
    </aside>
  );
}
