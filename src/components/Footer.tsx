import Link from 'next/link';

const FOOTER_LINKS = [
  { href: '/influencers', label: '리스트' },
  { href: '/keywords/blogger', label: '키워드검색' },
  { href: '/keywords', label: '키워드챌린지' },
  { href: '/community', label: '커뮤니티' },
  { href: '/notice', label: '공지사항' },
  { href: '/my', label: '대시보드' },
  { href: '/download', label: '데스크탑 앱' },
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
];

export default function Footer() {
  return (
    <footer className="bg-footer-bg text-footer-text"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 브랜드 + 링크 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center text-white font-bold text-xs">N</div>
            <span className="font-title font-extrabold text-white text-sm">N인플</span>
          </div>
          <nav className="flex flex-wrap gap-4">
            {FOOTER_LINKS.map(link => (
              <Link key={link.href} href={link.href} className="text-xs text-footer-dim hover:text-white transition-colors">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* 사업자정보 + 저작권 */}
        <div className="border-t border-white/10 pt-4 text-[11px] text-footer-dim/70 leading-relaxed">
          <p>오렌지도서관 · 대표 한미선 · 사업자등록번호 702-62-00986 · 통신판매 2026-충남아산-0325 · 전화 0507-1394-5091 · 이메일 orange@orangelibrary.co.kr</p>
          <p>충청남도 아산시 탕정면 탕정면로 22번길 15-12 301호 · 개인정보보호책임자 한미선</p>
          <p className="mt-2 text-footer-dim/50">&copy; 2026 오렌지도서관 · Built with Claude by Anthropic</p>
        </div>
      </div>
    </footer>
  );
}
