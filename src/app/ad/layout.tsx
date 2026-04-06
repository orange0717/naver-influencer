'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const AD_NAV = [
  { href: '/ad', label: '광고주 홈', exact: true },
  { href: '/ad/search', label: 'AI 인플루언서 검색' },
  { href: '/ad/campaign', label: '캠페인 관리' },
];

function AdHeader() {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <header className="bg-accent shadow-md">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/ad" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">AD</div>
            <span className="font-bold text-base text-white hidden sm:block">N인플 광고주</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {AD_NAV.map(item => (
              <Link key={item.href} href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  isActive(item.href, item.exact) ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/"
            className="px-3 py-1.5 text-white/70 text-sm font-semibold hover:text-white transition-colors">
            인플루언서 사이트 →
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function AdLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen -mx-4 -mt-6 -mb-10">
      <AdHeader />
      <main className="max-w-7xl mx-auto px-4 pt-6 pb-10 flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
