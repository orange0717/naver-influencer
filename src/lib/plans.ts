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
 * 한도(limits)에 대하여: 현재 서비스의 무료 한도는 "기능별"이 아니라 subject 단위
 * 하루 총량 합산이며(free-quota.ts), 운영 설정으로 런타임 변경까지 된다.
 * 여기에 숫자를 복제하면 정본이 둘이 되므로 비워 두었다. 기능 하나에만 걸리는
 * 한도가 생기면 그때 limits 를 채운다.
 */

export type PlanKey = 'FREE' | 'BLOGGER' | 'INFLUENCER';

export type FeatureKey = string;

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
  /** 등급별 사용 한도. 기능 전용 한도가 있는 경우에만 채운다. */
  limits?: Partial<Record<PlanKey, number>>;
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

export const FEATURES: Record<FeatureKey, FeatureDefinition> = {
  /* ── 대시보드 — 블로그 ───────────────────────────────────── */
  'dashboard.blog': { key: 'dashboard.blog', label: '대시보드', minPlan: 'FREE' },
  'my.missing-posts': { key: 'my.missing-posts', label: '노출 현황', minPlan: 'FREE' },
  'my.keyword-ranking': { key: 'my.keyword-ranking', label: '키워드 순위', minPlan: 'BLOGGER' },
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
  'rankings.naver-mate': { key: 'rankings.naver-mate', label: '네이버 메이트', minPlan: 'FREE' },

  /* ── 네이버 데이터 — 키워드 ─────────────────────────────── */
  // 목록·상세 7종이 같은 기능이다. 상세만 열려 있어 목록 게이트를 우회하던 문제가 있었다.
  'keywords.challenge': { key: 'keywords.challenge', label: '키워드 챌린지', minPlan: 'INFLUENCER' },
  'keywords.recommend': { key: 'keywords.recommend', label: '키워드 추천', minPlan: 'INFLUENCER' },
  'keywords.bulk': { key: 'keywords.bulk', label: '대량 키워드 조회', minPlan: 'INFLUENCER' },
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
  'competitor.analysis': { key: 'competitor.analysis', label: '경쟁자 분석', minPlan: 'BLOGGER' },

  /* ── 콘텐츠 도구 ────────────────────────────────────────── */
  'writing.content-angles': { key: 'writing.content-angles', label: '글감 찾기', minPlan: 'INFLUENCER' },
  'writing.titles': { key: 'writing.titles', label: '제목 생성', minPlan: 'INFLUENCER' },
  'content.youtube': { key: 'content.youtube', label: '롱폼 분석', minPlan: 'INFLUENCER' },
  'content.shortform': { key: 'content.shortform', label: '릴스·쇼츠 분석', minPlan: 'INFLUENCER' },
  'content.youtube-stt': { key: 'content.youtube-stt', label: '유튜브 음원 추출', minPlan: 'BLOGGER' },
  'tools.image-editor': { key: 'tools.image-editor', label: '이미지 편집', minPlan: 'FREE' },

  /* ── 구글 / AI ──────────────────────────────────────────── */
  'google.indexing': { key: 'google.indexing', label: 'Google 색인 관리', minPlan: 'BLOGGER' },
  'ai.consultant': {
    key: 'ai.consultant',
    label: 'N인플 AI 대화',
    minPlan: 'FREE',
    allowAnonymous: true,
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

/** 해당 등급의 기능 전용 한도. 한도가 정의되지 않았으면 null(=이 기능만의 상한 없음). */
export function limitFor(current: PlanKey, feature: FeatureKey): number | null {
  const def = FEATURES[feature];
  if (!def?.limits) return null;
  return def.limits[current] ?? null;
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
