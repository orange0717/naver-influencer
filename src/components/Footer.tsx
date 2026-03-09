import Link from 'next/link';

const SERVICE_LINKS = [
  { href: '/keywords', label: '키워드' },
  { href: '/influencers', label: '인플루언서' },
  { href: '/rankings', label: '랭킹' },
  { href: '/subscribe', label: '구독' },
];

const ACCOUNT_LINKS = [
  { href: '/auth/login', label: '로그인' },
  { href: '/auth/signup', label: '회원가입' },
  { href: '/my', label: '내 대시보드' },
  { href: '/profile', label: '프로필' },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface mt-12">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* 상단: 서비스 링크 + 계정 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 mb-8">
          {/* 브랜드 */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-title font-extrabold text-text">N인플</span>
            </div>
            <p className="text-xs text-dim leading-relaxed">
              네이버 인플루언서들을 위한 플랫폼.<br />
              블루오션 키워드를 발굴하고 순위를 추적하세요.
            </p>
          </div>

          {/* 서비스 */}
          <div>
            <h3 className="text-xs font-bold text-text mb-3">서비스</h3>
            <ul className="space-y-2">
              {SERVICE_LINKS.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-xs text-dim hover:text-accent transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 계정 */}
          <div>
            <h3 className="text-xs font-bold text-text mb-3">계정</h3>
            <ul className="space-y-2">
              {ACCOUNT_LINKS.map(link => (
                <li key={link.href}>
                  <Link href={link.href} className="text-xs text-dim hover:text-accent transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-border pt-6">
          {/* 사업자정보 */}
          <div className="text-[11px] text-dim leading-relaxed space-y-1">
            <p>
              <span className="font-semibold text-text/70">오렌지도서관</span>
              <span className="mx-1.5">|</span>대표: 한미선
              <span className="mx-1.5">|</span>사업자등록번호: 702-62-00986
            </p>
            <p>
              통신판매번호: 2025-충남천안-1491
              <span className="mx-1.5">|</span>전화: 0507-1394-5091
            </p>
            <p>
              주소: 충남 천안시 서북구 검은들 3길 46 803-2(886호)
            </p>
            <p>
              이메일:{' '}
              <a href="mailto:orange@orangelibrary.co.kr" className="hover:text-accent transition-colors">
                orange@orangelibrary.co.kr
              </a>
            </p>
          </div>

          {/* 저작권 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-4">
            <p className="text-[11px] text-dim/60">
              &copy; 2026 오렌지도서관. All rights reserved.
            </p>
            <p className="text-[11px] text-dim/60">
              Built with{' '}
              <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="hover:text-accent transition-colors">
                Claude AI
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
