'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

/* ── 인플루언서 메뉴 ── */
const INFLUENCER_GROUP = [
  { href: '/influencers', label: '인플루언서 리스트', desc: '전체 인플루언서 검색' },
  { href: '/keywords', label: '키워드챌린지', desc: '키워드별 순위·경쟁도' },
];

/* ── 랭킹 메뉴 ── */
const RANKING_GROUP = [
  { href: '/rankings', label: '인플루언서 랭킹', desc: '카테고리별 TOP 순위' },
  { href: '/rankings/bloggers', label: '블로거 랭킹', desc: '블로그 검색 순위' },
];

/* ── 공통 도구 메뉴 ── */
const TOOLS_GROUP = [
  { href: '/search-volume', label: '키워드 검색량', desc: '네이버 월간 검색량 조회' },
  { href: '/community', label: '커뮤니티', desc: '정보 공유·질문·토론' },
];

/* ── 광고주/대행사 메뉴 ── */
const AD_GROUP = [
  { href: '/ad', label: '광고센터', desc: '인플루언서·블로거 찾기' },
  { href: '/ad/campaign', label: '캠페인 등록', desc: '체험단·리뷰 모집' },
];

/* ── N인플 소개 메뉴 ── */
const INFO_GROUP = [
  { href: '/notice', label: '공지사항' },
  { href: '/tools', label: '추천 도구' },
  { href: '/subscribe', label: '이용권' },
];

type UserInfo = {
  type: 'influencer' | 'blogger' | null;
  id: string | null;
  name: string | null;
};

/* ── 드롭다운 컴포넌트 ── */
function NavDropdown({
  label,
  items,
  isOpen,
  onToggle,
  isActive,
  dropdownRef,
  showDesc = false,
}: {
  label: string;
  items: { href: string; label: string; desc?: string }[];
  isOpen: boolean;
  onToggle: () => void;
  isActive: boolean;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  showDesc?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={onToggle}
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
          isActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
        }`}>
        {label}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path d="M3 5l3 3 3-3" />
        </svg>
      </button>
      {isOpen && (
        <div className={`absolute top-full left-0 mt-1 bg-surface rounded-xl shadow-lg border border-border py-1.5 z-50 ${showDesc ? 'min-w-[220px]' : 'min-w-[140px]'}`}>
          {items.map(s => (
            <Link key={s.href} href={s.href}
              onClick={onToggle}
              className={`block px-4 py-2.5 transition-colors ${
                pathname.startsWith(s.href) ? 'text-accent font-semibold bg-accent/5' : 'text-text hover:bg-surface-hover hover:text-accent'
              }`}>
              <span className="text-sm block">{s.label}</span>
              {showDesc && s.desc && <span className="text-[11px] text-dim block mt-0.5">{s.desc}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo>({ type: null, id: null, name: null });
  const inflRef = useRef<HTMLDivElement>(null);
  const rankRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const adRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(setUser)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const refs = [inflRef, rankRef, toolsRef, adRef, infoRef];
      const clickedInside = refs.some(ref => ref.current?.contains(e.target as Node));
      if (!clickedInside) setOpenDropdown(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser({ type: null, id: null, name: null });
    router.push('/');
    router.refresh();
  };

  const toggleDropdown = (name: string) => {
    setOpenDropdown(prev => prev === name ? null : name);
  };

  // 대시보드 링크
  const dashboardLink = user.type === 'blogger'
    ? { href: '/my/blogger', label: '대시보드' }
    : user.type === 'influencer'
      ? { href: '/my', label: '대시보드' }
      : null;

  // 활성 상태 체크
  const inflActive = INFLUENCER_GROUP.some(n => pathname.startsWith(n.href));
  const rankActive = RANKING_GROUP.some(n => pathname.startsWith(n.href));
  const toolsActive = TOOLS_GROUP.some(n => pathname.startsWith(n.href));
  const adActive = pathname.startsWith('/ad');
  const infoActive = INFO_GROUP.some(n => pathname === n.href);

  const displayChar = user.type === 'blogger'
    ? (user.name || user.id || 'B').charAt(0).toUpperCase()
    : (user.id || 'N').charAt(0).toUpperCase();
  const tooltipText = user.type === 'blogger'
    ? `블로거 @${user.id} · 로그아웃`
    : `@${user.id} · 로그아웃`;
  const badgeColor = user.type === 'blogger' ? 'bg-[#2DB400]/30' : 'bg-white/20';

  return (
    <>
      <header className="sticky top-0 z-50 bg-header shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* ── 로고 ── */}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-title font-bold text-base text-white hidden sm:block">N인플</span>
            </Link>

            {/* ── 데스크탑 네비게이션 ── */}
            <nav className="hidden lg:flex items-center gap-0.5">

              {/* 대시보드 (로그인 유저만) */}
              {dashboardLink && (
                <Link href={dashboardLink.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    pathname.startsWith(dashboardLink.href) ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}>
                  대시보드
                </Link>
              )}

              {/* 구분선 */}
              {dashboardLink && <div className="w-px h-5 bg-white/20 mx-1" />}

              {/* 인플루언서 (드롭다운) */}
              <NavDropdown
                label="인플루언서"
                items={INFLUENCER_GROUP}
                isOpen={openDropdown === 'infl'}
                onToggle={() => toggleDropdown('infl')}
                isActive={inflActive}
                dropdownRef={inflRef}
                showDesc
              />

              {/* 랭킹 (드롭다운) */}
              <NavDropdown
                label="랭킹"
                items={RANKING_GROUP}
                isOpen={openDropdown === 'rank'}
                onToggle={() => toggleDropdown('rank')}
                isActive={rankActive}
                dropdownRef={rankRef}
                showDesc
              />

              {/* 도구 (드롭다운) */}
              <NavDropdown
                label="도구"
                items={TOOLS_GROUP}
                isOpen={openDropdown === 'tools'}
                onToggle={() => toggleDropdown('tools')}
                isActive={toolsActive}
                dropdownRef={toolsRef}
                showDesc
              />

              {/* 구분선 */}
              <div className="w-px h-5 bg-white/20 mx-1" />

              {/* 광고센터 (드롭다운) */}
              <NavDropdown
                label="광고센터"
                items={AD_GROUP}
                isOpen={openDropdown === 'ad'}
                onToggle={() => toggleDropdown('ad')}
                isActive={adActive}
                dropdownRef={adRef}
                showDesc
              />

              {/* 구분선 */}
              <div className="w-px h-5 bg-white/20 mx-1" />

              {/* N인플 (드롭다운) */}
              <NavDropdown
                label="N인플"
                items={INFO_GROUP}
                isOpen={openDropdown === 'info'}
                onToggle={() => toggleDropdown('info')}
                isActive={infoActive}
                dropdownRef={infoRef}
              />
            </nav>
          </div>

          {/* ── 우측: 로그인/프로필 ── */}
          <div className="flex items-center gap-3">
            {user.id ? (
              <div className="flex items-center gap-2">
                {user.type === 'blogger' && (
                  <span className="text-[10px] text-white/60 bg-[#2DB400]/30 px-2 py-0.5 rounded-full hidden sm:block">블로거</span>
                )}
                {user.type === 'influencer' && (
                  <span className="text-[10px] text-white/60 bg-white/15 px-2 py-0.5 rounded-full hidden sm:block">인플루언서</span>
                )}
                <button onClick={handleLogout}
                  className={`w-8 h-8 rounded-full ${badgeColor} flex items-center justify-center text-white font-bold text-xs hover:bg-white/30 transition cursor-pointer`}
                  title={tooltipText}>
                  {displayChar}
                </button>
              </div>
            ) : (
              <Link href="/auth/login"
                className="px-3 py-1.5 bg-white text-header text-sm font-semibold rounded-lg hover:bg-white/90 transition-colors">
                로그인
              </Link>
            )}
            <button className="lg:hidden p-1 text-white/70" onClick={() => setMobileOpen(!mobileOpen)}>
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── 모바일 메뉴 ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-14 z-40 bg-bg border-t border-border overflow-y-auto">
          <nav className="flex flex-col p-4 gap-0.5">

            {/* 대시보드 (로그인 유저) */}
            {dashboardLink && (
              <>
                <div className="px-3 py-2.5 text-[11px] font-extrabold text-accent tracking-widest uppercase">
                  {user.type === 'blogger' ? '블로거' : '내 대시보드'}
                </div>
                <Link href={dashboardLink.href} onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                    pathname.startsWith(dashboardLink.href) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                  }`}>
                  대시보드
                </Link>
                <div className="border-t border-border/50 my-3 mx-2" />
              </>
            )}

            {/* 인플루언서 그룹 */}
            <div className="px-3 py-2.5 text-[11px] font-extrabold text-accent tracking-widest uppercase">인플루언서</div>
            {INFLUENCER_GROUP.map(n => (
              <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                className={`flex flex-col px-5 py-3 rounded-xl transition-colors ${
                  pathname.startsWith(n.href) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                <span className="text-sm font-semibold">{n.label}</span>
                {n.desc && <span className="text-[11px] text-dim mt-0.5">{n.desc}</span>}
              </Link>
            ))}

            {/* 랭킹 */}
            <div className="border-t border-border/50 my-3 mx-2" />
            <div className="px-3 py-2.5 text-[11px] font-extrabold text-accent tracking-widest uppercase">랭킹</div>
            {RANKING_GROUP.map(n => (
              <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                className={`flex flex-col px-5 py-3 rounded-xl transition-colors ${
                  pathname.startsWith(n.href) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                <span className="text-sm font-semibold">{n.label}</span>
                {n.desc && <span className="text-[11px] text-dim mt-0.5">{n.desc}</span>}
              </Link>
            ))}

            {/* 도구 */}
            <div className="border-t border-border/50 my-3 mx-2" />
            <div className="px-3 py-2.5 text-[11px] font-extrabold text-accent tracking-widest uppercase">도구</div>
            {TOOLS_GROUP.map(n => (
              <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                className={`flex flex-col px-5 py-3 rounded-xl transition-colors ${
                  pathname.startsWith(n.href) ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                <span className="text-sm font-semibold">{n.label}</span>
                {n.desc && <span className="text-[11px] text-dim mt-0.5">{n.desc}</span>}
              </Link>
            ))}

            {/* 광고센터 */}
            <div className="border-t border-border/50 my-3 mx-2" />
            <div className="px-3 py-2.5 text-[11px] font-extrabold tracking-widest uppercase flex items-center gap-2">
              <span className="text-blue-400">광고센터</span>
              <span className="text-[9px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full font-bold">AD</span>
            </div>
            {AD_GROUP.map(n => (
              <Link key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                className={`flex flex-col px-5 py-3 rounded-xl transition-colors ${
                  pathname.startsWith(n.href) ? 'bg-blue-400/15 text-blue-400' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                <span className="text-sm font-semibold">{n.label}</span>
                {n.desc && <span className="text-[11px] text-dim mt-0.5">{n.desc}</span>}
              </Link>
            ))}

            {/* N인플 정보 */}
            <div className="border-t border-border/50 my-3 mx-2" />
            <div className="px-3 py-2.5 text-[11px] font-extrabold text-dim tracking-widest uppercase">N인플</div>
            {INFO_GROUP.map(s => (
              <Link key={s.href} href={s.href} onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  pathname === s.href ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text hover:bg-surface'
                }`}>
                {s.label}
              </Link>
            ))}

            {/* 로그인/로그아웃 */}
            <div className="border-t border-border/50 my-3 mx-2" />
            {user.id ? (
              <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold text-down hover:text-down/80 hover:bg-down/5 transition-colors cursor-pointer">
                로그아웃
              </button>
            ) : (
              <Link href="/auth/login" onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-semibold text-accent hover:bg-accent/5 transition-colors">
                로그인 / 회원가입
              </Link>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
