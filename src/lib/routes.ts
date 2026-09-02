/**
 * robots.txt · sitemap.xml 의 단일 소스.
 *
 * 이 파일이 생기기 전에는 app/robots.ts · app/sitemap.ts · app/sitemap-index.xml/route.ts
 * 세 곳이 각자 경로 목록을 들고 있었고, 그래서 미들웨어가 /keywords/blog-ranking 을
 * 유료로 바꾼 뒤에도 robots 와 sitemap 은 "완전 공개 페이지"로 계속 광고했다
 * (네이버 서치어드바이저 "리다이렉션된 페이지" 2건의 원인, 2026-09-02 조사).
 *
 * ── path 표기 규칙 ──
 *  - 모든 path 는 **접두사**다. '/my' 는 '/my' 자체와 '/my/...' 하위 전체를 뜻한다.
 *    robots.txt 의 Disallow 가 접두사 매칭이므로 같은 의미 체계를 쓴다.
 *  - 동적 세그먼트('[id]')는 따로 적지 않는다. 부모 접두사가 이미 덮는다.
 *  - private 접두사 아래의 예외 공개 경로는 public 으로 따로 선언한다.
 *    robots.txt 최장 일치 규칙상 더 긴 Allow 가 짧은 Disallow 를 이긴다.
 *  - sitemap 필드가 있는 항목만 sitemap.xml 에 그 경로 그대로 등재된다.
 */

export const SITE_URL = 'https://ninfle.kr';

export type RouteVisibility = 'public' | 'private';

export type RouteDef = {
  path: string;
  visibility: RouteVisibility;
  /** private 이면 반드시 채운다 — 왜 검색에서 빼는지 근거를 코드 한 곳에서 확인할 수 있게. */
  reason?: string;
  sitemap?: {
    changeFrequency: 'daily' | 'weekly' | 'monthly';
    priority: number;
  };
};

export const ROUTES: readonly RouteDef[] = [
  /* ── 공개 + sitemap 등재 ─────────────────────────────────── */
  { path: '/', visibility: 'public', sitemap: { changeFrequency: 'daily', priority: 1.0 } },
  { path: '/intro', visibility: 'public', sitemap: { changeFrequency: 'weekly', priority: 0.9 } },
  { path: '/enterprise', visibility: 'public', sitemap: { changeFrequency: 'monthly', priority: 0.8 } },
  // 익명에게 서버렌더 가격표 전문이 나가는 판매 페이지인데 Disallow: /subscribe 로 통째로
  // 막혀 검색에서 빠져 있었다 (2026-09-02 오렌지 승인으로 해제).
  { path: '/subscribe', visibility: 'public', sitemap: { changeFrequency: 'monthly', priority: 0.8 } },
  // lib/plans.ts 의 keywords.blogger-search — minPlan FREE + allowAnonymous
  { path: '/keywords/blogger', visibility: 'public', sitemap: { changeFrequency: 'weekly', priority: 0.6 } },
  // lib/plans.ts 의 writing.spellcheck — minPlan FREE + allowAnonymous 인데도 부모 '/dashboard'
  // Disallow 에 걸려 차단돼 있었다 (2026-09-02 오렌지 승인으로 해제).
  { path: '/dashboard/writing/spellcheck', visibility: 'public', sitemap: { changeFrequency: 'monthly', priority: 0.7 } },
  { path: '/bot-info', visibility: 'public', sitemap: { changeFrequency: 'monthly', priority: 0.3 } },
  { path: '/privacy', visibility: 'public', sitemap: { changeFrequency: 'monthly', priority: 0.3 } },
  { path: '/terms', visibility: 'public', sitemap: { changeFrequency: 'monthly', priority: 0.3 } },

  /* ── 공개(크롤 허용) · sitemap 미등재 ────────────────────── */
  // 기업 계정 흐름 4종은 페이지마다 meta robots=noindex 를 이미 달고 있다. 여기에 Disallow 를
  // 걸면 크롤러가 문서를 못 읽어 그 noindex 를 볼 수 없게 되고, 오히려 URL 만 색인될 수 있다.
  // 색인 차단은 meta 에 맡기고 robots.txt 는 열어 둔다.
  { path: '/enterprise/checkout', visibility: 'public' },
  { path: '/enterprise/invite', visibility: 'public' },
  { path: '/enterprise/manage', visibility: 'public' },
  { path: '/enterprise/signup', visibility: 'public' },
  // 광고주 플랫폼 유입 경로 (2026-09-02 오렌지 결정: 로그인·가입만 공개)
  { path: '/orangeconnect', visibility: 'public' },
  { path: '/orangeconnect/login', visibility: 'public' },
  { path: '/orangeconnect/signup', visibility: 'public' },
  // 성장 후기: 목록은 익명 200, 상세는 /sitemaps/stories.xml 이 승인 글만 따로 등재한다.
  { path: '/stories', visibility: 'public' },
  { path: '/blog-quality', visibility: 'public' },
  { path: '/stats', visibility: 'public' },
  { path: '/guide', visibility: 'public' },
  { path: '/download', visibility: 'public' },

  /* ── 공개 선언이지만 익명에게 307 ────────────────────────── */
  // robots 는 열려 있는데 미들웨어·레이아웃이 비로그인을 튕긴다. 크롤 예산만 쓰고
  // "리다이렉션된 페이지"로 잡힐 자리다. 다만 비공개 전환은 2026-09-02 승인 범위 밖이라
  // 현행 동작을 그대로 유지한다 (§11-1 재승인 대상).
  { path: '/campaigns', visibility: 'public' },
  { path: '/competitor', visibility: 'public' },
  { path: '/decoder', visibility: 'public' },
  { path: '/discover', visibility: 'public' },
  { path: '/image-converter', visibility: 'public' },
  { path: '/image-editor', visibility: 'public' },
  { path: '/messages', visibility: 'public' },
  { path: '/naver-mate-ranking', visibility: 'public' },
  { path: '/search-volume', visibility: 'public' },
  { path: '/topics', visibility: 'public' },
  { path: '/trial', visibility: 'public' },

  /* ── 비공개 ──────────────────────────────────────────────── */
  { path: '/api', visibility: 'private', reason: '데이터 API — 문서가 아니다' },
  { path: '/admin', visibility: 'private', reason: '관리자 전용' },
  { path: '/auth', visibility: 'private', reason: '로그인·가입·비밀번호 재설정 흐름' },
  { path: '/my', visibility: 'private', reason: '개인 대시보드 — 비로그인에겐 게스트 빈 상태 또는 307' },
  { path: '/profile', visibility: 'private', reason: '개인 계정 페이지' },
  { path: '/dashboard', visibility: 'private', reason: '회원 전용 작업 화면 (맞춤법 검사만 위에서 예외 공개)' },
  { path: '/keywords', visibility: 'private', reason: '회원·유료 전용 (키워드 검색만 위에서 예외 공개)' },
  { path: '/influencers', visibility: 'private', reason: '회원·유료 전용, 상세도 자체 가드로 307' },
  { path: '/community', visibility: 'private', reason: '회원 전용 (middleware AUTH_REQUIRED_PAGE_PREFIXES)' },
  { path: '/notice', visibility: 'private', reason: 'lib/plans.ts notice.read — 회원(FREE) 전용' },
  // 레이아웃이 비로그인을 튕기는 데다 page.tsx 본문이 "현재 제공 중인 랭킹 기능이 없습니다"
  // 안내문뿐인 빈 허브인데 sitemap 에 올라가 있었다 (2026-09-02 오렌지 승인으로 제거).
  { path: '/rankings', visibility: 'private', reason: '로그인 게이트 + 제공 중단된 빈 허브' },
  { path: '/orangeconnect/dashboard', visibility: 'private', reason: '광고주 작업 화면' },
  { path: '/orangeconnect/search', visibility: 'private', reason: '광고주 작업 화면' },
  { path: '/orangeconnect/campaign', visibility: 'private', reason: '광고주 캠페인 관리' },
];

export const publicRoutes = (): RouteDef[] => ROUTES.filter(r => r.visibility === 'public');
export const privateRoutes = (): RouteDef[] => ROUTES.filter(r => r.visibility === 'private');

/** robots.txt 의 Disallow — 접두사 매칭이라 bare 와 trailing-slash 두 형태를 모두 전개한다. */
export const robotsDisallowPaths = (): string[] =>
  privateRoutes().flatMap(r => [r.path, `${r.path}/`]);

/**
 * robots.txt 의 Allow — 루트와, private 접두사 아래에 있는 예외 공개 경로만 낸다.
 * private 아래가 아닌 공개 경로는 'Allow: /' 가 이미 덮으므로 적지 않는다.
 */
export const robotsAllowPaths = (): string[] => {
  const disallow = privateRoutes().map(r => r.path);
  const exceptions = publicRoutes()
    .map(r => r.path)
    .filter(p => p !== '/' && disallow.some(d => p.startsWith(`${d}/`)));
  return ['/', ...exceptions];
};

/** robots.txt 최장 일치 규칙으로 이 경로가 차단되는지 판정한다. */
export function isBlockedByRobots(path: string): boolean {
  const longest = (patterns: string[]) =>
    patterns.filter(p => path.startsWith(p)).reduce((max, p) => Math.max(max, p.length), -1);
  return longest(robotsDisallowPaths()) > longest(robotsAllowPaths());
}

export const sitemapRoutes = (): RouteDef[] =>
  ROUTES.filter(r => r.visibility === 'public' && r.sitemap);

/**
 * sitemap 에 올린 경로가 robots 로 차단되면 크롤러는 "제출했는데 못 읽는 URL"을 받는다.
 * 조용히 어긋나지 않도록 모듈 로드(=빌드) 시점에 터뜨린다.
 */
const conflicts = sitemapRoutes().filter(r => isBlockedByRobots(r.path));
if (conflicts.length > 0) {
  throw new Error(
    `[routes] sitemap 등재 경로가 robots.txt 로 차단됨: ${conflicts.map(r => r.path).join(', ')}`,
  );
}

const missingReason = privateRoutes().filter(r => !r.reason);
if (missingReason.length > 0) {
  throw new Error(
    `[routes] private 경로에 reason 이 없음: ${missingReason.map(r => r.path).join(', ')}`,
  );
}
