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
  /** 하위그룹 소제목이 없는 단독 항목에도 소제목과 같은 점(•)을 붙여 시각적 계층을 맞춘다 */
  bullet?: boolean;
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
    // ── 개인화 영역 ─────────────────────────────────────────────
    // 로그인한 user_id의 실제 데이터에 기반해 동작하는 기능만 이 그룹에 둔다(스펙 1·2·21).
    // 블로그(4) + 인플루언서(3) + 대분류 직속(1). 기존 페이지/URL은 유지하고 IA만 재구성한다.
    // heading = 클릭 불가 하위그룹 제목, subgroup = 하위그룹 첫 항목(상단 간격 강조, 스펙 24),
    // indent = 하위그룹 소속 항목 들여쓰기. requiredPlan/authOnly는 이관 전 값을 그대로 유지.
    label: '대시보드',
    icon: '대',
    items: [
      { label: '블로그', href: '#blog', heading: true, subgroup: true },
      { label: '대시보드', href: '/dashboard', authOnly: true, indent: true },
      { label: '노출 현황', href: '/my/missing-posts', authOnly: true, indent: true },
      { label: '키워드 순위', href: '/my/keyword-ranking', requiredPlan: 'blogger', authOnly: true, indent: true },
      { label: 'AI 브리핑 · AI 탭 인용', href: '/my/naver-mate', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '인플루언서', href: '#influencer', heading: true, subgroup: true },
      { label: '대시보드', href: '/my', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '토픽', href: '/topics', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '맞팬 관리', href: '/my/fans', requiredPlan: 'influencer', authOnly: true, indent: true },
      // 글 심층피드백 = 기존 블로그 심층피드백 + AI글 적합도 + 인플루언서 글 적합도를 한 번의
      // 분석으로 합친 개인화 기능(스펙 4·5). 구조적 정밀 진단 엔진(quality-evaluate)이 본체다.
      { label: '글 심층피드백', href: '/my/naver-mate/quality-evaluate', requiredPlan: 'influencer', authOnly: true, bullet: true },
    ],
  },
  {
    // ── 공통(비개인화) 데이터 도구 ─────────────────────────────
    // 특정 사용자의 블로그 데이터와 무관하게 누구나 조회하는 네이버 데이터(스펙 2·21).
    label: '네이버 데이터',
    icon: '데',
    items: [
      { label: '랭킹', href: '#ranking', heading: true, subgroup: true },
      { label: '네이버 메이트', href: '/naver-mate-ranking', authOnly: true, indent: true },
      { label: '연도별 선정 현황', href: '/stats', indent: true },
      { label: '키워드', href: '#keyword', heading: true, subgroup: true },
      // '키워드 챌린지'(/keywords)는 순위가 아니라 키워드 전체 목록 성격 → 키워드 그룹으로 이동(사용자 요청 2026-08-12)
      { label: '키워드 챌린지', href: '/keywords', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '키워드 추천', href: '/keywords/recommend', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '키워드 검색', href: '/keywords/blogger', indent: true },
      { label: '대량 키워드 조회', href: '/keywords/bulk', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '인플루언서 리스트', href: '#list', heading: true, subgroup: true },
      // 라벨은 요금제가 아니라 "무엇이 들어있는 목록인지"로 적는다 — 유료 항목엔 이미 자물쇠가 붙는다.
      { label: '기본 명단', href: '/influencers/free-plan', authOnly: true, indent: true },
      { label: '전체 리스트', href: '/influencers', requiredPlan: 'influencer', authOnly: true, indent: true },
    ],
  },
  {
    // ── 공통 콘텐츠 제작 도구 ──────────────────────────────────
    // 글쓰기(2) / 이미지(2) / 유튜브(3). 이미지·유튜브를 글쓰기에서 분리(스펙 9·11·12).
    label: '콘텐츠 도구',
    icon: '도',
    items: [
      { label: '글쓰기', href: '#writing', heading: true, subgroup: true },
      // 2026-09-01 무료·비로그인 공개 전환. 등급 정본은 plans.ts 의 writing.spellcheck 다.
      // 비로그인 공개(allowAnonymous) 기능이라 개인화 전용인 '대시보드' 그룹 조건을 만족하지 못해
      // 나머지 /dashboard/writing/* 형제들과 같은 '글쓰기'로 이관(2026-09-02 내비 감사 §5-A).
      { label: '맞춤법 검사', href: '/dashboard/writing/spellcheck', requiredPlan: 'free', indent: true },
      { label: '글감 찾기', href: '/dashboard/writing/content-angles', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '제목 생성', href: '/dashboard/writing/titles', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '이미지', href: '#image', heading: true, subgroup: true },
      { label: '컬러 팔레트', href: '/dashboard/writing/color-palette', indent: true },
      { label: '이미지 편집', href: '/image-editor', authOnly: true, indent: true },
      { label: '유튜브·인스타그램', href: '#youtube', heading: true, subgroup: true },
      { label: '롱폼 분석', href: '/dashboard/content/youtube', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '릴스·쇼츠 분석', href: '/dashboard/content/shortform', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '유튜브 음원 추출', href: '/dashboard/youtube-stt', requiredPlan: 'blogger', authOnly: true, indent: true },
    ],
  },
  {
    label: '구글',
    icon: 'G',
    items: [
      { label: 'Google 색인 관리', href: '/dashboard/google-indexing', requiredPlan: 'blogger', authOnly: true, bullet: true },
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
  { label: '기업용 문의', href: '/enterprise' },
];

/** 이 프리픽스로 시작하는 라우트에서는 사이드바를 숨김(마케팅/인증 전용 풀폭 페이지) */
export const SIDEBAR_HIDDEN_PREFIXES = [
  '/intro',
  '/enterprise',
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
