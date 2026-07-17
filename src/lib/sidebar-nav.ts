/**
 * N인플 좌측 사이드바 정보구조
 * - dashboard-catalog.ts(DASHBOARD_APPS)의 href/requiredPlan/authOnly를 그대로 반영
 * - 홈(/)은 별도 그룹 없이 최상단 단일 링크로 고정 노출
 */

import type { PlanTier } from './dashboard-catalog';

export interface SidebarItem {
  label: string;
  href: string;
  requiredPlan?: PlanTier;
  authOnly?: boolean;
  /** 아직 구현되지 않은 기능 — 클릭 불가, "준비중" 뱃지만 표시 */
  disabled?: boolean;
}

export interface SidebarGroup {
  label: string;
  /** 접힌 상태 레일에 표시하는 1~2자 아이콘 대체 라벨 */
  icon: string;
  items: SidebarItem[];
}

export const SIDEBAR_HOME: SidebarItem = { href: '/', label: '홈' };

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    label: '대시보드',
    icon: '블',
    items: [
      { label: '블로그', href: '/#blog-analysis', authOnly: true },
      { label: '인플루언서', href: '/my', requiredPlan: 'influencer', authOnly: true },
    ],
  },
  {
    label: '네이버 메이트',
    icon: '메',
    items: [
      { label: 'AI 브리핑·AI탭', href: '/my/naver-mate', requiredPlan: 'influencer', authOnly: true },
      { label: '네이버 메이트 랭킹', href: '/naver-mate-ranking' },
    ],
  },
  {
    label: '네이버 인플루언서',
    icon: 'I',
    items: [
      { label: '맞팬관리', href: '/my/fans', requiredPlan: 'influencer', authOnly: true },
      { label: '리스트', href: '/influencers/free-plan', authOnly: true },
      { label: '공식순위', href: '/rankings/official', requiredPlan: 'influencer' },
      { label: '리스트(키챌반영)', href: '/influencers', requiredPlan: 'influencer' },
    ],
  },
  {
    label: '키워드',
    icon: 'K',
    items: [
      { label: '저장 키워드', href: '/my/saved-keywords', authOnly: true },
      { label: '키워드 검색', href: '/keywords/blogger' },
      { label: '키워드 순위', href: '/my/keyword-ranking', requiredPlan: 'blogger', authOnly: true },
      { label: '대량 키워드 조회', href: '/keywords/bulk', requiredPlan: 'influencer' },
      { label: '키워드챌린지 리스트', href: '/keywords', requiredPlan: 'influencer' },
    ],
  },
  {
    label: '정보·분석',
    icon: 'R',
    items: [
      { label: 'URL 분석', href: '/decoder' },
      { label: '경쟁자 분석', href: '/competitor' },
      { label: '연도별 선정 현황', href: '/stats' },
      { label: 'JPG↔PNG 변환기', href: '/image-converter' },
    ],
  },
  {
    label: '글쓰기',
    icon: 'W',
    items: [
      { label: '맞춤법 검사', href: '/dashboard/writing/spellcheck', requiredPlan: 'blogger', authOnly: true },
      { label: '교정·교열·윤문', href: '/dashboard/writing/rewrite', requiredPlan: 'influencer', authOnly: true },
      { label: '유튜브 음원 추출', href: '/dashboard/youtube-stt', requiredPlan: 'blogger', authOnly: true },
      { label: 'AI 피드백(클로드)', href: '/dashboard/claude', requiredPlan: 'influencer', authOnly: true },
    ],
  },
  {
    label: '성장도구',
    icon: 'G',
    items: [
      { label: '글감 찾기', href: '#', disabled: true },
      { label: '제목 생성', href: '#', disabled: true },
      { label: '키워드 추천', href: '#', disabled: true },
    ],
  },
  {
    label: '기타',
    icon: '•',
    items: [
      { label: '설정', href: '/profile', authOnly: true },
      { label: 'CSV 다운로드', href: '/keywords/bulk', requiredPlan: 'influencer' },
    ],
  },
];

/** 사이드바 하단 — 기존 헤더 상단 네비에서 옮겨온 항목 */
export const SIDEBAR_FOOTER_LINKS: SidebarItem[] = [
  { label: '공지사항', href: '/notice', authOnly: true },
  { label: '커뮤니티', href: '/community' },
  { label: '성장후기', href: '/stories' },
  { label: '이용권', href: '/subscribe' },
  { label: '서비스소개', href: '/intro' },
];

/** 이 프리픽스로 시작하는 라우트에서는 사이드바를 숨김(마케팅/인증 전용 풀폭 페이지) */
export const SIDEBAR_HIDDEN_PREFIXES = [
  '/intro',
  '/auth',
  '/subscribe',
  '/community',
  '/stories',
  '/notice',
  '/admin',
];

/**
 * 현재 경로와 가장 구체적으로(가장 긴 href로) 일치하는 단 하나의 href를 찾는다.
 * 여러 메뉴가 서로의 접두사인 경우(예: /my ⊂ /my/naver-mate) 단순 startsWith 매칭만 쓰면
 * 두 메뉴가 동시에 active가 되므로, 매칭된 href 중 가장 긴 것 하나만 선택한다.
 */
export function getActiveHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (href === '#') continue;
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
