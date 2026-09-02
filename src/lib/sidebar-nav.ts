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

/**
 * 2026-09-02 v2.3 트리 전면 적용 (docs/category-proposal.md §6).
 * 대분류를 «무엇을 하려는가»로 재편했다 — 분석(본다) / 작성(만든다) / 관리(유지한다).
 * 이전 체계(대시보드·네이버 데이터·콘텐츠 도구·구글)는 «데이터가 개인화냐 아니냐»로 갈랐는데,
 * 같은 목적의 기능이 그룹을 넘나들어(예: 내 키워드순위 ↔ 키워드 검색순위) 찾기 어려웠다.
 *
 * heading = 클릭 불가 소분류 제목, subgroup = 소분류 첫 항목(상단 간격 강조),
 * indent = 소분류 소속 항목 들여쓰기, bullet = 소분류 없이 대분류에 직속인 항목.
 * 소분류에 항목이 하나뿐이면 만들지 않고 대분류 직속으로 올린다(v2.2 §1 흡수 규칙).
 *
 * 🆕 표시 항목은 «이미 있는데 메뉴가 없어 도달 불가»였던 유료 기능이다(신규 개발 아님).
 * requiredPlan 은 lib/plans.ts 의 minPlan 을 그대로 옮긴 값이다.
 */
export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    // ── 분석: 이미 있는 데이터를 «본다» ────────────────────────
    label: '분석',
    icon: '분',
    items: [
      { label: '내 블로그', href: '#my-blog', heading: true, subgroup: true },
      { label: 'MY 블로그', href: '/dashboard', authOnly: true, indent: true },
      // 🆕 이용권이 「MY 포스팅 분석 (AI)」로 파는데 메뉴가 없었다. 화면 자체는 로그인만 필요하고
      // 유료 경계는 AI 분석·데이터 내려받기(downloads.post-analysis)에 있다.
      { label: 'MY 포스팅 분석', href: '/my/post-analysis', authOnly: true, indent: true },
      // MY 를 떼면 아래 「키워드 검색순위」와 이름이 충돌한다 — 접두어 유지(v2.2 확정).
      { label: 'MY 키워드순위', href: '/my/keyword-ranking', requiredPlan: 'blogger', authOnly: true, indent: true },
      { label: 'AI 브리핑', href: '/my/naver-mate', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '내 활동', href: '#my-activity', heading: true, subgroup: true },
      { label: 'MY 인플루언서', href: '/my', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '토픽', href: '/topics', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '인플루언서', href: '#influencer', heading: true, subgroup: true },
      { label: '인플루언서 순위', href: '/influencers', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '인플루언서 명단', href: '/influencers/free-plan', authOnly: true, indent: true },
      { label: '선정 현황', href: '/stats', indent: true },
      { label: '네이버 메이트', href: '/naver-mate-ranking', authOnly: true, indent: true },
      { label: '키워드', href: '#keyword', heading: true, subgroup: true },
      { label: '키워드 검색', href: '/keywords/blogger', indent: true },
      // 🆕 이용권이 「키워드 검색순위」로 파는데 메뉴가 없었다.
      { label: '키워드 검색순위', href: '/keywords/blog-ranking', requiredPlan: 'blogger', authOnly: true, indent: true },
      { label: '키워드 챌린지', href: '/keywords', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '대량 조회', href: '/keywords/bulk', requiredPlan: 'influencer', authOnly: true, indent: true },
      // 🆕 이용권이 「경쟁자 분석 (무제한)」으로 파는데 메뉴가 없었다.
      // 소분류 「경쟁·시장」에 이것 하나만 남아 해체하고 대분류 직속으로 올렸다(v2.3).
      { label: '경쟁자 분석', href: '/competitor', requiredPlan: 'blogger', authOnly: true, bullet: true },
    ],
  },
  {
    // ── 작성: 새 콘텐츠를 «만든다» ─────────────────────────────
    // 경계선(v2.3): 경쟁자 분석은 «분석», 롱폼·릴스 분석은 «작성».
    // 전자는 내 성과를 남과 견주는 일이고, 후자는 만들 콘텐츠의 참고자료를 찾는 일이다.
    label: '작성',
    icon: '작',
    items: [
      { label: '글', href: '#writing', heading: true, subgroup: true },
      { label: '글감 찾기', href: '/dashboard/writing/content-angles', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '키워드 추천', href: '/keywords/recommend', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '제목 생성', href: '/dashboard/writing/titles', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '검토', href: '#review', heading: true, subgroup: true },
      // 등급 정본은 plans.ts 의 writing.spellcheck (allowAnonymous — 비로그인도 쓴다).
      { label: '맞춤법 검사', href: '/dashboard/writing/spellcheck', requiredPlan: 'free', indent: true },
      // 글 심층피드백 = 블로그 심층피드백 + AI글 적합도 + 인플루언서 글 적합도를 한 번의
      // 분석으로 합친 기능. 구조적 정밀 진단 엔진(quality-evaluate)이 본체다.
      { label: '글 심층피드백', href: '/my/naver-mate/quality-evaluate', requiredPlan: 'influencer', authOnly: true, indent: true },
      // 🆕 이용권이 「블로그 글 피드백 (Claude AI)」로 파는데 메뉴가 없었다.
      // 「Claude」는 내부 벤더명이라 메뉴 라벨에서 뺀다(v2.3).
      { label: '글 피드백 (AI)', href: '/dashboard/claude', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '이미지·영상', href: '#media', heading: true, subgroup: true },
      { label: '컬러 팔레트', href: '/dashboard/writing/color-palette', indent: true },
      { label: '이미지 편집', href: '/image-editor', authOnly: true, indent: true },
      { label: '음원 추출', href: '/dashboard/youtube-stt', requiredPlan: 'blogger', authOnly: true, indent: true },
      { label: '롱폼 분석', href: '/dashboard/content/youtube', requiredPlan: 'influencer', authOnly: true, indent: true },
      { label: '릴스·쇼츠 분석', href: '/dashboard/content/shortform', requiredPlan: 'influencer', authOnly: true, indent: true },
    ],
  },
  {
    // ── 관리: 이미 올린 글·관계를 «유지한다» ───────────────────
    // 네이버 노출(노출 현황)과 구글 색인을 한 소분류로 묶었다 — 둘 다 "내 글이 검색에 잡히나"다.
    // 구 「구글」 대분류는 여기로 흡수됐다(v2.3).
    label: '관리',
    icon: '관',
    items: [
      { label: '검색 노출', href: '#exposure', heading: true, subgroup: true },
      { label: '노출 현황', href: '/my/missing-posts', authOnly: true, indent: true },
      { label: '색인 관리', href: '/dashboard/google-indexing', requiredPlan: 'blogger', authOnly: true, indent: true },
      { label: '맞팬 관리', href: '/my/fans', requiredPlan: 'influencer', authOnly: true, bullet: true },
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
