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
  /** 클릭 불가능한 소제목 — 그룹 내부를 시각적으로 구간 분리할 때 사용 (href는 '#'로 시작) */
  heading?: boolean;
  /**
   * heading 중에서도 하위그룹(예: 대시보드 그룹의 '블로그'/'인플루언서')의 제목임을 표시.
   * 상단 여백을 더 주고 라벨을 강조해 두 하위그룹 경계를 시각적으로 분명히 한다(스펙 24항).
   */
  subgroup?: boolean;
  /** 직전 heading 하위 항목임을 표시해 들여쓰기를 한 단계 추가 적용 */
  indent?: boolean;
}

export interface SidebarGroup {
  label: string;
  /** 접힌 상태 레일에 표시하는 1~2자 아이콘 대체 라벨 */
  icon: string;
  items: SidebarItem[];
}

/** 홈(/) = N인플 AI (2026-08-08부터). KPI/블로그 분석은 /dashboard로 이동. */
export const SIDEBAR_HOME: SidebarItem = { href: '/', label: 'N인플 AI' };

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    // 개인 데이터 기능을 하나의 대시보드 트리로 통합 (블로그 4 + 인플루언서 2, 2026-08-12 개편).
    // 기존 페이지/URL은 그대로 두고 사이드바 정보구조·활성 강조만 재구성한다.
    // heading = 클릭 불가 하위그룹 제목, subgroup = 하위그룹 첫 항목(상단 간격),
    // indent = 하위그룹 소속 항목 들여쓰기. 각 항목의 requiredPlan/authOnly는 이관 전 값을 그대로 유지.
    label: '대시보드',
    icon: '대',
    items: [
      { label: '블로그', href: '#blog', heading: true, subgroup: true },
      { label: '대시보드', href: '/dashboard', authOnly: true, indent: true },
      { label: '미노출', href: '/my/missing-posts', authOnly: true, indent: true },
      { label: '키워드 순위', href: '/my/keyword-ranking', requiredPlan: 'blogger', authOnly: true, indent: true },
      { label: 'AI 브리핑 · AI 탭 인용', href: '/my/naver-mate', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '인플루언서', href: '#influencer', heading: true, subgroup: true },
      { label: '대시보드', href: '/my', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '토픽', href: '/topics', requiredPlan: 'influencer', authOnly: true, indent: true },
    ],
  },
  {
    label: '네이버 메이트',
    icon: '메',
    items: [
      { label: '랭킹', href: '/naver-mate-ranking', authOnly: true },
      { label: 'AI글 적합도', href: '/my/naver-mate/quality-evaluate', requiredPlan: 'influencer', authOnly: true },
    ],
  },
  {
    label: '네이버 인플루언서',
    icon: 'I',
    items: [
      { label: '키워드 챌린지', href: '/keywords', requiredPlan: 'influencer', authOnly: true },
      { label: '연도별 선정 현황', href: '/stats' },
      { label: '리스트', href: '#', heading: true },
      { label: '리스트(무료)', href: '/influencers/free-plan', authOnly: true, indent: true },
      { label: '리스트(유료)', href: '/influencers', requiredPlan: 'influencer', authOnly: true, indent: true },
    ],
  },
  {
    label: '키워드',
    icon: 'K',
    items: [
      { label: '키워드 추천', href: '/keywords/recommend', requiredPlan: 'influencer', authOnly: true },
      { label: '저장 키워드', href: '/my/saved-keywords', authOnly: true },
      { label: '키워드 검색', href: '/keywords/blogger' },
      { label: '대량 키워드 조회', href: '/keywords/bulk', requiredPlan: 'influencer', authOnly: true },
    ],
  },
  {
    label: '구글',
    icon: 'G',
    items: [
      { label: '구글 색인등록', href: '/dashboard/google-indexing', requiredPlan: 'blogger', authOnly: true },
    ],
  },
  {
    label: '글쓰기',
    icon: 'W',
    items: [
      { label: '글감 찾기', href: '/dashboard/writing/content-angles', requiredPlan: 'influencer', authOnly: true },
      { label: '제목 생성', href: '/dashboard/writing/titles', requiredPlan: 'influencer', authOnly: true },
      { label: '맞춤법 검사', href: '/dashboard/writing/spellcheck', requiredPlan: 'blogger', authOnly: true },
      { label: '유튜브 음원 추출', href: '/dashboard/youtube-stt', requiredPlan: 'blogger', authOnly: true },
      { label: '교정·교열·윤문', href: '/dashboard/writing/rewrite', requiredPlan: 'influencer', authOnly: true },
      { label: '블로그 글 심층피드백', href: '/dashboard/claude', requiredPlan: 'influencer', authOnly: true },
      { label: '컬러 팔레트', href: '/dashboard/writing/color-palette' },
      { label: '이미지 편집', href: '/image-editor', authOnly: true },
    ],
  },
  {
    label: '콘텐츠 분석',
    icon: 'C',
    items: [
      { label: '유튜브 분석', href: '/dashboard/content/youtube', requiredPlan: 'influencer', authOnly: true },
      { label: '릴스·쇼츠 분석', href: '/dashboard/content/shortform', requiredPlan: 'influencer', authOnly: true },
    ],
  },
  {
    label: '기타',
    icon: '•',
    items: [
      { label: '설정', href: '/profile', authOnly: true },
      { label: 'CSV 다운로드', href: '/keywords/bulk', requiredPlan: 'influencer', authOnly: true },
    ],
  },
];

/** 사이드바 하단 — 기존 헤더 상단 네비에서 옮겨온 항목 */
export const SIDEBAR_FOOTER_LINKS: SidebarItem[] = [
  { label: '공지사항', href: '/notice' },
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
 * authOnly로 선언된 모든 href를 모은다 (해시 앵커·비활성 메뉴 제외).
 * middleware.ts가 이 목록과 실제 서버측 차단 목록을 대조해, 사이드바에는
 * "회원 전용"으로 선언해놓고 정작 어디서도 막지 않는 누락을 개발 중 자동으로 잡아낸다.
 * (2026-07-21 /naver-mate-ranking, /my/blogger, /my/saved-keywords, /profile 누락 발견 계기로 추가)
 *
 * '/dashboard#blog-analysis' 처럼 경로+해시 조합인 href는 해시를 떼고 경로(`/dashboard`)만
 * 감사 대상으로 삼는다 — 브라우저가 해시를 서버로 보내지 않아 middleware가 애초에 볼 수 없는
 * 부분이기 때문. 해시를 뗀 결과가 '/'(홈)면 홈은 항상 게스트/회원 분기를 자체 처리하므로 제외한다.
 */
export function getAllAuthOnlyHrefs(): string[] {
  const items = [...SIDEBAR_GROUPS.flatMap(g => g.items), ...SIDEBAR_FOOTER_LINKS];
  const paths = items
    .filter(item => item.authOnly && item.href !== '#')
    .map(item => item.href.split('#')[0])
    .filter(path => path !== '' && path !== '/');
  return Array.from(new Set(paths));
}

/**
 * 현재 경로와 가장 구체적으로(가장 긴 href로) 일치하는 단 하나의 href를 찾는다.
 * 여러 메뉴가 서로의 접두사인 경우(예: /my ⊂ /my/naver-mate) 단순 startsWith 매칭만 쓰면
 * 두 메뉴가 동시에 active가 되므로, 매칭된 href 중 가장 긴 것 하나만 선택한다.
 */
export function getActiveHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (href.startsWith('#')) continue;
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
