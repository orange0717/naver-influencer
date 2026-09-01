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

export type PlanKey = 'FREE' | 'BLOGGER' | 'INFLUENCER';

export type FeatureKey = string;

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
   * (minPlan: 'FREE' 는 "무료 회원"이지 "누구나"가 아니다.)
   */
  allowAnonymous?: boolean;
  /**
   * 이 기능이 차감하는 카운터. 없으면 횟수 제한이 없다는 뜻이다.
   * 🚨 값은 감사로 확인한 현행 동작을 옮겨 적은 것이다(docs/gating-audit.md §8-2).
   * 새 기능을 차감 대상으로 만들려면 라우트의 차감 코드를 먼저 넣고 여기를 맞춘다 —
   * 이 선언만 바꿔도 실제 차감은 일어나지 않는다.
   */
  consumesQuota?: QuotaCounter;
}

export const PLAN_ORDER: PlanKey[] = ['FREE', 'BLOGGER', 'INFLUENCER'];

/** 결제·안내 문구에 쓰는 등급 이름. subscribe 페이지 표기와 일치한다. */
export const PLAN_LABEL: Record<PlanKey, string> = {
  FREE: '무료',
  BLOGGER: '예비 인플루언서',
  INFLUENCER: '인플루언서',
};

/** 이용권 페이지 경로. 새로 만들지 않고 기존 경로를 재사용한다. */
export const SUBSCRIBE_PATH = '/subscribe';

/**
 * 등급이 어느 카운터에 걸리는가. 무료만 공용 일일 풀을 쓰고, 이용권 보유자는 걸리지 않는다
 * (유료 AI 생성의 남용 상한은 등급이 아니라 기능에 붙으므로 여기가 아니라 consumesQuota 쪽이다).
 * 값이 아니라 적용 여부만 담는다 — 한도 숫자는 관리자 설정이 정본이다.
 */
export const PLAN_QUOTA: Record<PlanKey, QuotaCounter | null> = {
  FREE: 'free-daily',
  BLOGGER: null,
  INFLUENCER: null,
};

export const FEATURES: Record<FeatureKey, FeatureDefinition> = {
  /* ── 대시보드 — 블로그 ───────────────────────────────────── */
  'dashboard.blog': { key: 'dashboard.blog', label: '대시보드', minPlan: 'FREE' },
  'my.missing-posts': {
    key: 'my.missing-posts',
    label: '노출 현황',
    minPlan: 'FREE',
    consumesQuota: 'free-daily',
  },
  'my.keyword-ranking': {
    key: 'my.keyword-ranking',
    label: '키워드 순위',
    minPlan: 'BLOGGER',
    consumesQuota: 'free-daily',
  },
  'my.naver-mate': { key: 'my.naver-mate', label: 'AI 브리핑', minPlan: 'INFLUENCER' },

  /* ── 대시보드 — 인플루언서 ───────────────────────────────── */
  'my.dashboard': { key: 'my.dashboard', label: '인플루언서 대시보드', minPlan: 'INFLUENCER' },
  'topics.browse': { key: 'topics.browse', label: '토픽', minPlan: 'INFLUENCER' },
  'topics.mine': { key: 'topics.mine', label: '내 토픽', minPlan: 'INFLUENCER' },
  'my.fans': { key: 'my.fans', label: '맞팬 관리', minPlan: 'INFLUENCER' },

  /* ── 대시보드 — 포스팅 ───────────────────────────────────── */
  'writing.spellcheck': { key: 'writing.spellcheck', label: '맞춤법 검사', minPlan: 'BLOGGER' },
  'blog.quality-evaluate': { key: 'blog.quality-evaluate', label: '글 심층피드백', minPlan: 'INFLUENCER' },

  /* ── 네이버 데이터 — 랭킹 ───────────────────────────────── */
  'rankings.naver-mate': {
    key: 'rankings.naver-mate',
    label: '네이버 메이트',
    minPlan: 'FREE',
    consumesQuota: 'free-daily',
  },

  /* ── 네이버 데이터 — 키워드 ─────────────────────────────── */
  // 목록·상세 7종이 같은 기능이다. 상세만 열려 있어 목록 게이트를 우회하던 문제가 있었다.
  'keywords.challenge': { key: 'keywords.challenge', label: '키워드 챌린지', minPlan: 'INFLUENCER' },
  'keywords.recommend': { key: 'keywords.recommend', label: '키워드 추천', minPlan: 'INFLUENCER' },
  'keywords.bulk': { key: 'keywords.bulk', label: '대량 키워드 조회', minPlan: 'INFLUENCER' },
  // 화면·데이터 API 가 로그인만 확인해 무료 회원이 그대로 받아 가던 자리다(외부 유료 API 비용도 샜다).
  'keywords.blog-ranking': { key: 'keywords.blog-ranking', label: '키워드 검색순위', minPlan: 'BLOGGER' },
  // 유입 목적의 공개 검색. 부모 레이아웃이 비로그인을 튕기던 것을 되돌린다.
  'keywords.blogger-search': {
    key: 'keywords.blogger-search',
    label: '키워드 검색',
    minPlan: 'FREE',
    allowAnonymous: true,
  },

  /* ── 인플루언서 리스트 ──────────────────────────────────── */
  'influencers.free-plan': { key: 'influencers.free-plan', label: '기본 명단', minPlan: 'FREE' },
  'influencers.list': { key: 'influencers.list', label: '전체 인플루언서', minPlan: 'INFLUENCER' },
  'influencers.detail': { key: 'influencers.detail', label: '인플루언서 상세', minPlan: 'INFLUENCER' },
  // 경쟁자 분석은 인플루언서 상세 API 를 함께 쓴다. 그래서 /api/influencers/[id] 의
  // 서버 가드는 둘 중 낮은 쪽인 BLOGGER 이고, 상세 "화면"만 INFLUENCER 로 막는다.
  'competitor.analysis': {
    key: 'competitor.analysis',
    label: '경쟁자 분석',
    minPlan: 'BLOGGER',
    consumesQuota: 'free-daily',
  },

  /* ── 콘텐츠 도구 ────────────────────────────────────────── */
  'writing.content-angles': {
    key: 'writing.content-angles',
    label: '글감 찾기',
    minPlan: 'INFLUENCER',
    consumesQuota: 'paid-daily-cap',
  },
  'writing.titles': {
    key: 'writing.titles',
    label: '제목 생성',
    minPlan: 'INFLUENCER',
    consumesQuota: 'paid-daily-cap',
  },
  'content.youtube': { key: 'content.youtube', label: '롱폼 분석', minPlan: 'INFLUENCER' },
  'content.shortform': {
    key: 'content.shortform',
    label: '릴스·쇼츠 분석',
    minPlan: 'INFLUENCER',
    consumesQuota: 'paid-daily-cap',
  },
  'content.youtube-stt': { key: 'content.youtube-stt', label: '유튜브 음원 추출', minPlan: 'BLOGGER' },
  'tools.image-editor': { key: 'tools.image-editor', label: '이미지 편집', minPlan: 'FREE' },

  /* ── 구글 / AI ──────────────────────────────────────────── */
  'google.indexing': { key: 'google.indexing', label: 'Google 색인 관리', minPlan: 'BLOGGER' },
  'ai.consultant': {
    key: 'ai.consultant',
    label: 'N인플 AI 대화',
    minPlan: 'FREE',
    allowAnonymous: true,
    consumesQuota: 'free-daily',
  },
  'ai.deep-chat': { key: 'ai.deep-chat', label: '심층 대화', minPlan: 'INFLUENCER' },

  /* ── 하단 링크 ──────────────────────────────────────────── */
  'notice.read': { key: 'notice.read', label: '공지사항', minPlan: 'FREE' },
  // 유료 전용이었으나 메뉴에 자물쇠가 없어 "무료로 보이는데 막히는" 상태였다. 회원에게 연다.
  'community.read': { key: 'community.read', label: '커뮤니티', minPlan: 'FREE' },
  'my.link': { key: 'my.link', label: '블로그 연결', minPlan: 'FREE' },
};

/** current 등급이 required 등급 이상인가. */
export function planAtLeast(current: PlanKey, required: PlanKey): boolean {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required);
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

/** DB의 users.subscription_plan 값을 등급 축으로 정규화한다. */
export function toPlanKey(subscriptionPlan: string | null | undefined): PlanKey {
  if (subscriptionPlan === 'INFLUENCER') return 'INFLUENCER';
  if (subscriptionPlan === 'BLOGGER') return 'BLOGGER';
  return 'FREE';
}

/** 권한이 부족할 때 사용자에게 보여줄 문구. 등급 용어를 그대로 노출하지 않는다. */
export function lockedMessage(required: PlanKey): string {
  return `이 기능은 ${PLAN_LABEL[required]} 이용권에서 이용하실 수 있습니다.`;
}

/** 한도를 모두 쓴 경우의 문구. */
export const QUOTA_EXHAUSTED_MESSAGE = '오늘 사용 가능한 횟수를 모두 사용하셨습니다.';
