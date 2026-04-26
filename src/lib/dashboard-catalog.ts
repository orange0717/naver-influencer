/**
 * N인플 대시보드 기능 카탈로그
 * - 대시보드(/dashboard)에서 카드 그리드로 노출
 * - 카테고리별 섹션으로 그룹핑
 * - 유료 기능은 requiredPlan 로 잠금 표시
 */

export type PlanTier = 'free' | 'blogger' | 'influencer';

export type AppCategoryKey =
  | 'my'
  | 'ranking'
  | 'research'
  | 'keyword'
  | 'writing'
  | 'info'
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
    key: 'ranking',
    label: '랭킹',
    description: '인플루언서 · 블로거 · 품질지수 순위',
    tag: '랭킹',
    badgeClass: BADGE,
    buttonClass: BUTTON,
  },
  {
    key: 'research',
    label: '정보',
    description: '인플루언서 · 경쟁자 정보 검색',
    tag: '정보',
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
    description: 'AI 맞춤법 검사와 심층 피드백으로 글 품질 점검',
    tag: '글쓰기',
    badgeClass: BADGE,
    buttonClass: BUTTON,
  },
  {
    key: 'info',
    label: '서비스 가이드',
    description: 'N인플 사용 방법·FAQ',
    tag: '가이드',
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
}

export const DASHBOARD_APPS: DashboardApp[] = [
  // ── 내 정보 ──
  {
    id: 'my-blogger',
    category: 'my',
    title: '블로그',
    description: '내 블로그 방문자·상위 키워드·품질 지수 요약',
    href: '/my/blogger',
    authOnly: true,
  },
  {
    id: 'my-keyword-ranking',
    category: 'my',
    title: '키워드 순위',
    description: '내 블로그가 상위 노출 중인 키워드와 순위 변화',
    href: '/my/keyword-ranking',
    requiredPlan: 'blogger',
    authOnly: true,
  },
  {
    id: 'my-post-analysis',
    category: 'my',
    title: '포스팅 분석',
    description: '내 포스트의 상세 지표·개선 포인트 분석',
    href: '/my/post-analysis',
    requiredPlan: 'blogger',
    authOnly: true,
  },
  {
    id: 'my-challenge',
    category: 'my',
    title: '키워드 챌린지',
    description: '인플루언서 키워드 챌린지 참여·TOP3 현황',
    href: '/my',
    requiredPlan: 'influencer',
    authOnly: true,
  },
  {
    id: 'my-campaigns',
    category: 'my',
    title: '캠페인',
    description: '내 캠페인 제안·진행 현황 (개발 중)',
    href: '/my/campaigns',
    requiredPlan: 'blogger',
    authOnly: true,
    devPreview: true,
  },
  {
    id: 'my-settlements',
    category: 'my',
    title: '정산내역',
    description: '캠페인 정산·세금계산서 (개발 중)',
    href: '/my/settlements',
    requiredPlan: 'influencer',
    authOnly: true,
    devPreview: true,
  },
  // ── 랭킹 ──
  {
    id: 'rankings-official',
    category: 'ranking',
    title: '인플루언서 공식순위',
    description: '네이버가 발표하는 공식 카테고리별 인플루언서 순위 (주 1회 업데이트)',
    href: '/rankings/official',
    requiredPlan: 'influencer',
  },
  {
    id: 'rankings-blogger',
    category: 'ranking',
    title: '블로그 순위',
    description: '네이버 블로그 실시간 랭킹 (개발 중)',
    href: '/rankings/blogger',
    requiredPlan: 'blogger',
    devPreview: true,
  },
  {
    id: 'rankings-influencer',
    category: 'ranking',
    title: '인플루언서 순위',
    description: '카테고리별 인플루언서 실력 순위 (개발 중)',
    href: '/rankings/influencer',
    requiredPlan: 'influencer',
    devPreview: true,
  },
  {
    id: 'blog-quality',
    category: 'ranking',
    title: '블로그 품질지수',
    description: '내 블로그와 경쟁 블로그의 품질 점수 (개발 중)',
    href: '/blog-quality',
    requiredPlan: 'blogger',
    devPreview: true,
  },
  {
    id: 'stats',
    category: 'ranking',
    title: '연도별 선정 현황',
    description: '연도별 인플루언서 선정 통계',
    href: '/stats',
  },

  // ── 정보 ──
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
    ctaLabel: '일일 1회 무료',
  },

  // ── 키워드 ──
  {
    id: 'keywords-blogger',
    category: 'keyword',
    title: '키워드 검색',
    description: '블로그·검색량·경쟁도 기반 키워드 조사',
    href: '/keywords/blogger',
  },
  {
    id: 'search-volume',
    category: 'keyword',
    title: '검색량 조회',
    description: '네이버 월간 검색량 조회',
    href: '/search-volume',
  },
  {
    id: 'keywords-google-trends',
    category: 'keyword',
    title: '구글 트렌드',
    description: '구글 트렌드 기반 키워드 인사이트',
    href: '/keywords/google-trends',
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
    id: 'keywords-hot',
    category: 'keyword',
    title: '실시간 상승 키워드',
    description: '급상승 중인 키워드 모니터링',
    href: '/keywords/hot',
    requiredPlan: 'blogger',
  },
  {
    id: 'keywords-list',
    category: 'keyword',
    title: '키워드 챌린지 리스트',
    description: '인플루언서 키워드 챌린지 전체 목록',
    href: '/keywords',
    requiredPlan: 'influencer',
  },

  // ── 글쓰기 ──
  {
    id: 'writing-spellcheck',
    category: 'writing',
    title: '맞춤법 검사',
    description: '국립국어원 기준 1,600+개 규칙 + Claude AI 하이브리드 교정',
    href: '/dashboard/writing/spellcheck',
    requiredPlan: 'blogger',
    authOnly: true,
  },
  {
    id: 'writing-feedback',
    category: 'writing',
    title: 'AI 심층 피드백',
    description: '4영역(기능·구조·언어·가독성) 품질 평가 + 강점·개선점 (Claude Opus)',
    href: '/dashboard/writing/feedback',
    requiredPlan: 'influencer',
    authOnly: true,
  },
  {
    id: 'chatbook',
    category: 'writing',
    title: '캐릭터챗북',
    description: '셜록 홈즈·홍길동 같은 고전 캐릭터와 대화하며 블로그 콘텐츠 아이디어 발굴 (개발 중)',
    href: '/chatbook',
    requiredPlan: 'blogger',
    authOnly: true,
    ctaLabel: '대화하기',
    devPreview: true,
  },
  {
    id: 'claude-feature',
    category: 'writing',
    title: '블로그 글 피드백(클로드 AI)',
    description: 'Claude와 채팅하며 블로그 글의 방향과 흐름에 대한 가벼운 피드백 받기',
    href: '/dashboard/claude',
    requiredPlan: 'influencer',
    authOnly: true,
  },

  // ── 서비스 가이드 ──
  {
    id: 'guide',
    category: 'info',
    title: '서비스 가이드',
    description: 'N인플 사용 방법·FAQ',
    href: '/guide',
  },

  // ── 추천 서비스 ──
  {
    id: 'orangerefine',
    category: 'partner',
    title: 'OrangeRefine',
    description: '글쓰기 실력을 키우고 싶다면 오렌지리파인 — AI 교정·교열·윤문, 글쓰기 학습',
    href: 'https://orangerefine.kr',
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
];
