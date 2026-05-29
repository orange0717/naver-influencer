/**
 * N인플 대시보드 기능 카탈로그
 * - 대시보드(/dashboard)에서 카드 그리드로 노출
 * - 카테고리별 섹션으로 그룹핑
 * - 유료 기능은 requiredPlan 로 잠금 표시
 */

export type PlanTier = 'free' | 'blogger' | 'influencer';

export type AppCategoryKey =
  | 'my'
  | 'research'
  | 'keyword'
  | 'writing'
  | 'partner';

export interface AppCategoryMeta {
  key: AppCategoryKey;
  label: string;
  description: string;
  /** 카드 우상단 뱃지·풀폭 버튼 색상 (Tailwind 클래스) */
  badgeClass: string;
  buttonClass: string;
  /** 카드 카테고리 태그 (좌상단) 에 표시할 짧은 라벨 */
  tag: string;
}

// 전 카테고리 다크핑크(accent) 단색 통일 — 데이터랩툴즈 스타일 지양
const BADGE = 'bg-accent/10 text-accent border border-accent/20';
const BUTTON = 'bg-accent hover:bg-accent-hover text-white';

export const APP_CATEGORIES: AppCategoryMeta[] = [
  {
    key: 'my',
    label: 'MY',
    description: '내 블로그 · 키워드 · 정산 등 개인 데이터',
    tag: 'MY',
    badgeClass: BADGE,
    buttonClass: BUTTON,
  },
  {
    key: 'research',
    label: '정보 · 분석',
    description: '인플루언서 · 경쟁자 정보 검색',
    tag: '정보 · 분석',
    badgeClass: BADGE,
    buttonClass: BUTTON,
  },
  {
    key: 'keyword',
    label: '키워드',
    description: '키워드 검색·검색량·트렌드·챌린지',
    tag: '키워드',
    badgeClass: BADGE,
    buttonClass: BUTTON,
  },
  {
    key: 'writing',
    label: '글쓰기',
    description: 'AI 맞춤법 검사와 블로그 글 피드백으로 글 품질 점검',
    tag: '글쓰기',
    badgeClass: BADGE,
    buttonClass: BUTTON,
  },
  {
    key: 'partner',
    label: '추천 서비스',
    description: '함께 쓰면 좋은 외부 도구',
    tag: '파트너',
    badgeClass: BADGE,
    buttonClass: BUTTON,
  },
];

export interface DashboardApp {
  id: string;
  category: AppCategoryKey;
  title: string;
  description: string;
  href: string;
  /** 필요 플랜 (없으면 무료) */
  requiredPlan?: PlanTier;
  /** 개발 중 표시 */
  devPreview?: boolean;
  /** 로그인 필요 */
  authOnly?: boolean;
  /** 외부 링크 — 새 탭으로 열기 */
  external?: boolean;
  /** CTA 버튼 라벨 커스텀 (기본 '무료플랜') */
  ctaLabel?: string;
  /** 모달 내 무료 사용 제한 안내 (예: '무료 회원은 1회만 이용할 수 있습니다.') */
  freeNote?: string;
  /** 모달 내 유료 구독자 혜택 안내 (예: '유료 구독자는 무제한으로 이용할 수 있습니다.') */
  paidNote?: string;
}

export const DASHBOARD_APPS: DashboardApp[] = [
  // ── 내 정보 ──
  {
    id: 'my-blogger',
    category: 'my',
    title: '블로그 분석',
    description: '내 블로그 방문자수, 포스팅 누락여부 확인',
    href: '/my/blogger',
    authOnly: true,
  },
  {
    id: 'my-keyword-ranking',
    category: 'my',
    title: '키워드 순위',
    description: '현 내 포스팅 통합검색/블로그탭 키워드 순위',
    href: '/my/keyword-ranking',
    requiredPlan: 'blogger',
    authOnly: true,
  },
  {
    id: 'my-saved-keywords',
    category: 'my',
    title: '저장 키워드',
    description: '키워드챌린지·키워드 검색·내 키워드에서 저장한 키워드 모아 보기',
    href: '/my/saved-keywords',
    authOnly: true,
  },
  {
    id: 'my-post-analysis',
    category: 'my',
    title: '포스팅 분석',
    description: 'AI글 여부, 형태소 문장 분석',
    href: '/my/post-analysis',
    requiredPlan: 'blogger',
    authOnly: true,
  },
  {
    id: 'my-challenge',
    category: 'my',
    title: '인플루언서 키워드챌린지',
    description: '인플루언서 키워드 챌린지 참여·TOP3 현황',
    href: '/my',
    requiredPlan: 'influencer',
    authOnly: true,
  },
  {
    id: 'my-fans',
    category: 'my',
    title: '내 팬 관리',
    description: '서로 맞팬·일방팬 분석 — 나를 팬한 사람과 내가 팬한 사람의 교집합을 한눈에',
    href: '/my/fans',
    requiredPlan: 'influencer',
    authOnly: true,
  },
  // ── 랭킹 ──

  // ── 정보 ──
  {
    id: 'stats',
    category: 'research',
    title: '연도별 인플루언서 선정 현황',
    description: '연도별 인플루언서 선정 통계',
    href: '/stats',
  },
  {
    id: 'influencers',
    category: 'research',
    title: '인플루언서 리스트',
    description: '네이버 인플루언서 전체 목록·검색·필터',
    href: '/influencers',
  },
  {
    id: 'competitor',
    category: 'research',
    title: '경쟁자 분석',
    description: '경쟁 블로그 지표 비교·변화 추이',
    href: '/competitor',
    ctaLabel: '무료플랜',
    freeNote: '무료 회원은 1일 1회 이용할 수 있습니다.',
    paidNote: '블로거 플랜은 1일 5회, 인플루언서 플랜은 무제한 이용 가능합니다.',
  },
  {
    id: 'decoder',
    category: 'research',
    title: 'URL 분석',
    description: '블로그 통계의 referer URL을 한 줄로 해석 — 검색기록·자동완성·직접입력 구분, 일괄 분포 리포트',
    href: '/decoder',
    ctaLabel: '무료플랜',
  },

  // ── 키워드 ──
  {
    id: 'keywords-blogger',
    category: 'keyword',
    title: '키워드 검색',
    description: '블로그·검색량·경쟁도 기반 키워드 조사 (정렬·저장 키워드 지원)',
    href: '/keywords/blogger',
  },
  {
    id: 'keywords-blog-ranking',
    category: 'keyword',
    title: '키워드 검색순위',
    description: '특정 키워드의 상위 블로그·인플루언서 노출',
    href: '/keywords/blog-ranking',
    requiredPlan: 'blogger',
  },
  {
    id: 'keywords-list',
    category: 'keyword',
    title: '인플루언서 키워드 챌린지 리스트',
    description: '인플루언서 키워드 챌린지 전체 목록',
    href: '/keywords',
    requiredPlan: 'influencer',
  },

  // ── 글쓰기 ──
  {
    id: 'writing-spellcheck',
    category: 'writing',
    title: '맞춤법 검사',
    description: '국립국어원 기준 1,600+개 규칙 + Claude AI 하이브리드 교정 · 데모 체험 제외, 가입 후 이용',
    href: '/dashboard/writing/spellcheck',
    requiredPlan: 'blogger',
    authOnly: true,
  },
  {
    id: 'claude-feature',
    category: 'writing',
    title: '블로그 글 피드백(클로드 AI)',
    description: 'Claude와 채팅하며 블로그 글의 방향과 흐름에 대한 가벼운 피드백 받기 · 데모 체험 제외, 가입 후 이용',
    href: '/dashboard/claude',
    requiredPlan: 'influencer',
    authOnly: true,
  },
  {
    id: 'image-converter',
    category: 'writing',
    title: 'JPG ↔ PNG 변환기',
    description: '이미지 포맷을 한 번에 최대 20장까지 변환 — 가입 없이 바로 사용',
    href: '/image-converter',
    ctaLabel: '바로가기',
  },
  // ── 추천 서비스 ──
  {
    id: 'orangelibrary',
    category: 'partner',
    title: '오렌지도서관',
    description: '글쓰기 실력을 키우고 싶다면 오렌지도서관 — AI 교정·교열·윤문, 글쓰기 학습',
    href: 'https://orangelibrary.co.kr',
    external: true,
    ctaLabel: '바로가기',
  },
  {
    id: 'claude',
    category: 'partner',
    title: '클로드',
    description: '글쓰기·아이디어·코딩까지 — Anthropic의 AI 어시스턴트 Claude',
    href: 'https://claude.ai',
    external: true,
    ctaLabel: '바로가기',
  },
  {
    id: 'pixkit',
    category: 'partner',
    title: 'Pixkit',
    description: '이미지 리사이즈·누끼·PDF/HEIC 변환까지 — 설치·로그인 없이 브라우저에서 바로 쓰는 무료 이미지 편집 도구',
    href: 'https://pixkit.app',
    external: true,
    ctaLabel: '바로가기',
  },
];
