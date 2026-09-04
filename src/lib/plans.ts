/**
 * 등급별 기능 게이팅 단일 소스 (2026-09-01).
 *
 * 이 파일이 "어떤 기능을 어떤 등급이 쓸 수 있는가"의 유일한 정본이다.
 * 미들웨어 / 페이지 가드 / API 가드 / 사이드바가 각자 다른 답을 갖고 있던 문제
 * (docs/gating-audit.md 참고)를 해소하기 위해 만들었으므로, 새 게이팅을 추가할 때는
 * 이 파일에 FeatureDefinition 을 먼저 넣고 각 층은 그 값을 읽기만 한다.
 *
 * 등급 축은 세 단계뿐이다. 크레딧·기업 좌석은 축이 아니다 —
 * 기업 좌석은 syncOrgSeatEntitlements 가 users.subscription_plan 에 써넣어
 * 이 축에 합류하고, 크레딧은 등급과 독립된 별도 계량이다.
 *
 * 축이 둘이라는 점에 주의한다. "쓸 수 있는가"(등급)와 "몇 번 쓸 수 있는가"(쿼터)는
 * 별개이고, 차단 사유도 갈라져 있다 — 권한 부족 403, 쿼터 소진 402. 이 계약을 바꾸면
 * 클라이언트를 전수로 고쳐야 하므로 유지한다.
 *
 * 🚨 이 파일에는 한도 "숫자"를 두지 않는다. 무료 한도는 기능별이 아니라 subject 단위
 * 하루 총량 합산이고(free-quota.ts), 관리자 설정으로 런타임에 바뀐다
 * (app_settings.free_daily_limit_*). 숫자를 여기에 복제하면 정본이 둘이 되고,
 * 실제로 그렇게 갈라진 주석이 공개 FAQ 로까지 새어나간 적이 있다.
 * 여기서는 "어느 카운터에 걸리는가"만 선언하고 값은 런타임 조회에 맡긴다.
 */

export type PlanKey = 'free' | 'pro' | 'max';

export type FeatureKey = string;

export interface PlanDefinition {
  code: PlanKey;
  /** 화면에 보이는 이름. 등급 이름을 화면에서 짓지 말고 항상 여기를 읽는다. */
  label: string;
  /** 등급 서열. 등급 비교는 문자열이 아니라 이 숫자로만 한다. */
  rank: number;
  /** 배지 색상(Tailwind 클래스). 색도 등급 속성이라 컴포넌트가 아니라 여기서 관리한다. */
  tone: string;
  /**
   * DB `users.subscription_plan` 에 실제로 저장되는 값. 코드 이름과 다르다.
   * 🚨 2026-09-03 등급 명칭을 Free/Pro/Max 로 바꿀 때 **저장값은 일부러 바꾸지 않았다** —
   * 결제 웹훅(billing.ts)이 이 값을 쓰고, payment_intents.plan_key 에는 과거 결제 이력이
   * 남아 있어 저장값을 갈아엎으면 진행 중인 결제와 이력 해석이 함께 깨진다.
   * DB 와 주고받을 때는 반드시 toPlanKey() / toDbPlan() 을 거친다.
   */
  dbValue: string | null;
}

/**
 * 등급 정의의 유일한 정본. 코드·표시명·색상·정렬 순서를 전부 여기서 관리하고
 * 나머지 파일은 읽기만 한다.
 */
export const PLANS: Record<PlanKey, PlanDefinition> = {
  free: { code: 'free', label: 'Free', rank: 0, tone: 'text-dim bg-sunken',      dbValue: null },
  pro:  { code: 'pro',  label: 'Pro',  rank: 1, tone: 'text-accent bg-accent/10', dbValue: 'BLOGGER' },
  max:  { code: 'max',  label: 'Max',  rank: 2, tone: 'text-white bg-accent',     dbValue: 'INFLUENCER' },
};

/**
 * 이 서비스에 존재하는 이용 횟수 카운터. (감사 결과는 docs/gating-audit.md §8-1)
 * 이름은 카운터를 가리킬 뿐 한도값을 뜻하지 않는다.
 */
export type QuotaCounter =
  /** 무료 공용 일일 풀. 기능별이 아니라 계정 전체 합산이고, 유료 이용권 보유자는 걸리지 않는다. */
  | 'free-daily'
  /** 유료 AI 생성 남용 상한. 무료가 아니라 유료 이용자에게 걸리는 별개 예산이다. */
  | 'paid-daily-cap';

export interface FeatureDefinition {
  key: FeatureKey;
  /** 사용자에게 보이는 기능 이름. 사이드바 명칭과 일치시킨다. */
  label: string;
  /** 이 기능을 쓸 수 있는 최소 등급. */
  minPlan: PlanKey;
  /**
   * true 면 비로그인 사용자도 접근한다. 지정하지 않으면 로그인이 필요하다.
   * (minPlan: 'free' 는 "무료 회원"이지 "누구나"가 아니다.)
   */
  allowAnonymous?: boolean;
  /**
   * 이 기능이 차감하는 카운터. 없으면 횟수 제한이 없다는 뜻이다.
   * 🚨 값은 감사로 확인한 현행 동작을 옮겨 적은 것이다(docs/gating-audit.md §8-2).
   * 새 기능을 차감 대상으로 만들려면 라우트의 차감 코드를 먼저 넣고 여기를 맞춘다 —
   * 이 선언만 바꿔도 실제 차감은 일어나지 않는다.
   */
  consumesQuota?: QuotaCounter;
  /**
   * 등급이 모자라도 화면 자체는 열고 일부만 보여주는 기능(티저).
   * 🚨 이 표시가 없으면 사이드바가 링크를 잠그고 /subscribe 로 돌려보내므로
   * 티저 화면에 애초에 도달할 수 없다 — 배지 등급과 잠금 여부는 다른 질문이다.
   */
  teaser?: boolean;
}

/** 낮은 등급부터. PLANS 의 rank 순서를 그대로 따른다. */
export const PLAN_ORDER: PlanKey[] = (Object.keys(PLANS) as PlanKey[]).sort(
  (a, b) => PLANS[a].rank - PLANS[b].rank
);

/** 등급 이름. 문구를 지을 때 쓴다. */
export function planLabel(plan: PlanKey): string {
  return PLANS[plan].label;
}

/** 바깥에서 들어온 문자열(쿼리 파라미터 등)이 등급 코드인지. */
export function isPlanKey(value: string | null | undefined): value is PlanKey {
  return value != null && value in PLANS;
}

/** 이용권 페이지 경로. 새로 만들지 않고 기존 경로를 재사용한다. */
export const SUBSCRIBE_PATH = '/subscribe';

/**
 * 등급이 어느 카운터에 걸리는가. 무료만 공용 일일 풀을 쓰고, 이용권 보유자는 걸리지 않는다
 * (유료 AI 생성의 남용 상한은 등급이 아니라 기능에 붙으므로 여기가 아니라 consumesQuota 쪽이다).
 * 값이 아니라 적용 여부만 담는다 — 한도 숫자는 관리자 설정이 정본이다.
 */
export const PLAN_QUOTA: Record<PlanKey, QuotaCounter | null> = {
  free: 'free-daily',
  pro: null,
  max: null,
};

/**
 * 노출 현황 티저 — 등급이 모자란 회원에게 열어 보여주는 범위.
 * 전면 차단 대신 최근 N일·상위 M건까지 실제 판정을 보여주고 나머지를 잠근다.
 *
 * 파일 헤더의 "한도 숫자 금지"는 관리자 설정으로 런타임에 바뀌는 쿼터를 뜻한다.
 * 이쪽은 런타임 설정이 없는 고정 노출 정책이고, 화면과 서버가 같은 값을 봐야
 * 티저 경계가 어긋나지 않으므로 게이팅 정본인 여기에 둔다.
 */
export const MISSING_POSTS_TEASER = { days: 7, rows: 5 } as const;

/**
 * 노출 현황이 한 번에 보는 최근 글 수(2026-09-04 오렌지 지시).
 * 서버가 이 개수만큼만 조회해 내려보낸다 — 전체를 받아 화면에서 자르지 않는다.
 *
 * 티저 상수와 같은 이유로 여기 둔다. 서버(exposure-recent)와 화면(위젯·단독 페이지)이
 * 같은 값을 봐야 "최근 10개 글 기준"이라는 안내가 실제 응답과 어긋나지 않는다.
 */
export const MISSING_POSTS_RECENT_LIMIT = 10;

export const FEATURES: Record<FeatureKey, FeatureDefinition> = {
  /* ── 대시보드 — 블로그 ───────────────────────────────────── */
  'dashboard.blog': { key: 'dashboard.blog', label: '대시보드', minPlan: 'free' },
  // 2026-09-03 Free → Max, 2026-09-04 Max → Pro(오렌지 지시). 잠그는 축은 "미노출 숫자를
  // 보느냐"가 아니라 노출 현황 화면 고유 기능(3탭 교차검증 확정 판정 · 전환 이력 ·
  // 30일 이전 확장 조회 · 내려받기)이다.
  // 무료 대시보드(BlogAnalysisSection)의 2탭 미노출 검사와 저장된 판정 조회
  // (/api/my/post-missing-state GET)는 그대로 무료다 — 같은 엔드포인트를 네 화면이
  // 공유하므로 라우트를 통째로 잠그면 무료 대시보드와 Pro 키워드순위·경쟁사가 함께 죽는다.
  'my.missing-posts': {
    key: 'my.missing-posts',
    label: '노출 현황',
    minPlan: 'pro',
    consumesQuota: 'free-daily',
    teaser: true,
  },
  'my.keyword-ranking': {
    key: 'my.keyword-ranking',
    label: '키워드 순위',
    minPlan: 'pro',
    consumesQuota: 'free-daily',
  },
  // 2026-09-04 Max → Pro(오렌지 지시, 노출 검사 4종 Pro 전환).
  // 판정 비용이 큰 기능이다 — 헤드리스 브라우저를 띄워 통합검색 AI 브리핑과 AI 탭을
  // 순차 확인한다. 그래서 화면(checkFeaturePage)만이 아니라 실제로 그 일을 하는
  // 라우트 3종(check-ai-briefing · ai-briefing-state · ai-citation-estimate)이
  // 모두 이 선언을 서버에서 강제해야 한다. 화면만 잠그면 API 직접 호출로 그대로 샌다.
  'my.naver-mate': { key: 'my.naver-mate', label: 'AI 브리핑', minPlan: 'pro' },
  // 「포스팅 데이터 내려받기」 — 2026-09-01 이전에는 화면의 boolean 하나로만 막혀 있었고
  // 서버 라우트가 아예 없어 브라우저에서 CSV 를 직접 만들었다(개발자도구로 우회 가능).
  // /api/downloads/post-analysis 가 이 선언을 서버에서 강제한다.
  'downloads.post-analysis': { key: 'downloads.post-analysis', label: '포스팅 데이터 내려받기', minPlan: 'max' },

  /* ── 대시보드 — 인플루언서 ───────────────────────────────── */
  'my.dashboard': { key: 'my.dashboard', label: '인플루언서 대시보드', minPlan: 'max' },
  'topics.browse': { key: 'topics.browse', label: '토픽', minPlan: 'max' },
  'topics.mine': { key: 'topics.mine', label: '내 토픽', minPlan: 'max' },
  'my.fans': { key: 'my.fans', label: '맞팬 관리', minPlan: 'max' },

  /* ── 대시보드 — 포스팅 ───────────────────────────────────── */
  // 2026-09-01 무료 전환(오렌지 결정). 로그인도 요구하지 않는다 — 유입 목적의 공개 기능이다.
  // Claude 를 호출하므로 남용 방어는 등급이 아니라 라우트의 IP 레이트리밋이 맡는다.
  'writing.spellcheck': {
    key: 'writing.spellcheck',
    label: '맞춤법 검사',
    minPlan: 'free',
    allowAnonymous: true,
  },
  'blog.quality-evaluate': { key: 'blog.quality-evaluate', label: '글 심층피드백', minPlan: 'max' },

  /* ── 네이버 데이터 — 랭킹 ───────────────────────────────── */
  'rankings.naver-mate': {
    key: 'rankings.naver-mate',
    label: '네이버 메이트',
    minPlan: 'free',
    consumesQuota: 'free-daily',
  },

  /* ── 네이버 데이터 — 키워드 ─────────────────────────────── */
  // 목록·상세 7종이 같은 기능이다. 상세만 열려 있어 목록 게이트를 우회하던 문제가 있었다.
  'keywords.challenge': { key: 'keywords.challenge', label: '키워드 챌린지', minPlan: 'max' },
  'keywords.recommend': { key: 'keywords.recommend', label: '키워드 추천', minPlan: 'max' },
  'keywords.bulk': { key: 'keywords.bulk', label: '대량 키워드 조회', minPlan: 'max' },
  // 화면·데이터 API 가 로그인만 확인해 무료 회원이 그대로 받아 가던 자리다(외부 유료 API 비용도 샜다).
  'keywords.blog-ranking': { key: 'keywords.blog-ranking', label: '키워드 검색순위', minPlan: 'pro' },
  // 유입 목적의 공개 검색. 부모 레이아웃이 비로그인을 튕기던 것을 되돌린다.
  'keywords.blogger-search': {
    key: 'keywords.blogger-search',
    label: '키워드 검색',
    minPlan: 'free',
    allowAnonymous: true,
  },

  /* ── 인플루언서 리스트 ──────────────────────────────────── */
  'influencers.free-plan': { key: 'influencers.free-plan', label: '기본 명단', minPlan: 'free' },
  'influencers.list': { key: 'influencers.list', label: '전체 인플루언서', minPlan: 'max' },
  'influencers.detail': { key: 'influencers.detail', label: '인플루언서 상세', minPlan: 'max' },
  // 경쟁자 분석은 인플루언서 상세 API 를 함께 쓴다. 그래서 /api/influencers/[id] 의
  // 서버 가드는 둘 중 낮은 쪽인 Pro 이고, 상세 "화면"만 Max 로 막는다.
  // 다만 전체 명단 API(/api/influencers)는 더 이상 공유하지 않는다 — 경쟁자 분석의 검색은
  // 검색 전용 /api/influencers/search 로 옮겼고, 전체 명단은 influencers.list(Max)다.
  'competitor.analysis': {
    key: 'competitor.analysis',
    label: '경쟁자 분석',
    minPlan: 'pro',
    consumesQuota: 'free-daily',
  },

  /* ── 콘텐츠 도구 ────────────────────────────────────────── */
  'writing.content-angles': {
    key: 'writing.content-angles',
    label: '글감 찾기',
    minPlan: 'max',
    consumesQuota: 'paid-daily-cap',
  },
  'writing.titles': {
    key: 'writing.titles',
    label: '제목 생성',
    minPlan: 'max',
    consumesQuota: 'paid-daily-cap',
  },
  'content.youtube': { key: 'content.youtube', label: '롱폼 분석', minPlan: 'max' },
  'content.shortform': {
    key: 'content.shortform',
    label: '릴스·쇼츠 분석',
    minPlan: 'max',
    consumesQuota: 'paid-daily-cap',
  },
  'content.youtube-stt': { key: 'content.youtube-stt', label: '유튜브 음원 추출', minPlan: 'pro' },
  'tools.image-editor': { key: 'tools.image-editor', label: '이미지 편집', minPlan: 'free' },

  /* ── 구글 / AI ──────────────────────────────────────────── */
  'google.indexing': { key: 'google.indexing', label: 'Google 색인 관리', minPlan: 'pro' },
  'ai.consultant': {
    key: 'ai.consultant',
    label: 'N인플 AI 대화',
    minPlan: 'free',
    allowAnonymous: true,
    consumesQuota: 'free-daily',
  },
  'ai.deep-chat': { key: 'ai.deep-chat', label: '심층 대화', minPlan: 'max' },

  /* ── 하단 링크 ──────────────────────────────────────────── */
  'notice.read': { key: 'notice.read', label: '공지사항', minPlan: 'free' },
  // 유료 전용이었으나 메뉴에 자물쇠가 없어 "무료로 보이는데 막히는" 상태였다. 회원에게 연다.
  'community.read': { key: 'community.read', label: '커뮤니티', minPlan: 'free' },
  'my.link': { key: 'my.link', label: '블로그 연결', minPlan: 'free' },
};

/**
 * current 등급이 required 등급 이상인가.
 * 🚨 문자열이 아니라 rank 숫자로 비교한다. 예전엔 PLAN_ORDER.indexOf 를 썼는데,
 * 등급 이름에 오타가 있으면 indexOf 가 -1 을 돌려줘 "아무 등급보다도 낮음"으로
 * 조용히 통과/차단되었다. 지금은 정의에 없는 등급이면 즉시 터진다.
 */
export function planAtLeast(current: PlanKey, required: PlanKey): boolean {
  return PLANS[current].rank >= PLANS[required].rank;
}

/**
 * current 등급이 해당 기능을 쓸 수 있는가.
 * 등록되지 않은 기능은 게이팅 대상이 아니므로 통과시킨다 — 다만 게이팅이 필요하면
 * 여기에 등록하는 것이 전제이고, 임의로 잠그지 않는다.
 */
export function canUse(current: PlanKey, feature: FeatureKey): boolean {
  const def = FEATURES[feature];
  if (!def) return true;
  return planAtLeast(current, def.minPlan);
}

/**
 * 이 등급이 이 기능을 쓸 때 실제로 걸리는 카운터. 걸리지 않으면 null.
 *
 * 무료 공용 풀은 이용권 보유자를 비껴가므로 기능 선언만으로는 답이 안 나온다 —
 * 등급과 기능을 함께 봐야 한다. "무료 횟수가 차감됩니다" 같은 안내를 이용권
 * 보유자에게 보여주지 않으려면 이 함수를 쓴다.
 */
export function quotaFor(current: PlanKey, feature: FeatureKey): QuotaCounter | null {
  const counter = FEATURES[feature]?.consumesQuota;
  if (!counter) return null;
  if (counter === 'free-daily') return PLAN_QUOTA[current] === 'free-daily' ? counter : null;
  return counter;
}

/** 기능이 요구하는 최소 등급. 미등록이면 null. */
export function requiredPlanFor(feature: FeatureKey): PlanKey | null {
  return FEATURES[feature]?.minPlan ?? null;
}

/**
 * DB의 users.subscription_plan 값을 등급 축으로 정규화한다.
 * 저장값은 옛 이름(BLOGGER/INFLUENCER) 그대로이므로 읽을 때 여기서 흡수한다.
 * 아는 값이 아니면 무료로 떨어뜨린다 — 레거시 licenses.plan_name='PRO' 도 여기로 온다.
 */
export function toPlanKey(subscriptionPlan: string | null | undefined): PlanKey {
  if (subscriptionPlan === 'INFLUENCER') return 'max';
  if (subscriptionPlan === 'BLOGGER') return 'pro';
  return 'free';
}

/**
 * 등급을 DB `users.subscription_plan` 에 쓸 값으로 되돌린다.
 * 🚨 등급 코드를 대문자로 바꿔 쓰지 말 것. 'pro'.toUpperCase() = 'PRO' 는
 * 어떤 판정에도 걸리지 않아 유료 사용자가 통째로 무료로 떨어진다.
 */
export function toDbPlan(plan: PlanKey): string | null {
  return PLANS[plan].dbValue;
}

/** 권한이 부족할 때 사용자에게 보여줄 문구. */
export function lockedMessage(required: PlanKey): string {
  return `이 기능은 ${planLabel(required)} 플랜부터 이용하실 수 있습니다.`;
}

/** 한도를 모두 쓴 경우의 문구. */
export const QUOTA_EXHAUSTED_MESSAGE = '오늘 사용 가능한 횟수를 모두 사용하셨습니다.';
