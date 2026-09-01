# N인플 요금/한도/등급 정의 전수 감사 (읽기 전용)

작성일 2026-09-01. 목적: 플랜·티어·한도 규칙을 한 파일로 통합하기 **전에**, 지금 코드에 실제로 존재하는
숫자와 그 정의 위치를 있는 그대로 기록한다. 값은 정규화하지 않았고, 코드에 근거가 없는 항목은
`코드에 근거 없음` 으로 명시했다.

---

## 0. 선행: `getPaywallContext` 의 정확한 의미 (거의 모든 게이트가 여기 의존)

`src/lib/admin.ts:280-323`

```ts
export async function getPaywallContext(authUserId, email?): Promise<{
  isAdminUser: boolean;
  hasActivePaidPlan: boolean;
  plan: string | null;
  expiresAt: string | null;
  userId: string | null;
}>
```

- 조회 대상은 `public.users` 한 행. 1차 `auth_id = authUserId`, 실패 시 2차 `email` 매칭
  (`admin.ts:292-305`). **인자는 `auth.users.id`(=authId)이지 `users.id`가 아니다.**
- 행이 없으면 전부 falsy/null (`admin.ts:307-309`). 예외 발생 시에도 동일하게 falsy로 폴백
  (`admin.ts:319-322`) — 즉 **fail-open이 아니라 fail-closed**(권한 없음으로 떨어진다).
- `plan` 은 `users.subscription_plan` **원문 문자열 그대로**다 (`admin.ts:315`). 코드가 실제로
  비교하는 값은 `'INFLUENCER'` 와 `'BLOGGER'` 두 개뿐(`admin.ts:235-236`,
  `plan-server-guards.ts:44`). 그 외 문자열이 들어와도 `getPaywallContext` 는 그대로 반환하고,
  `hasActivePaidPlan` 만 true 가 될 수 있다(아래 주의).
- `hasActivePaidPlan` = `hasActiveSubscription(plan, expiresAt)` (`admin.ts:49-58`)
  = **plan 값이 비어있지 않고 + expires_at 이 미래**. 즉 **plan 문자열의 내용은 검사하지 않는다.**
  `subscription_plan='아무거나'` + 미래 만료일이면 `hasActivePaidPlan === true` 가 된다.
  (`hasActivePaidPlanByUserId` 는 반대로 `'INFLUENCER'|'BLOGGER'` 화이트리스트를 검사한다 —
  두 함수의 판정 기준이 서로 다르다. `admin.ts:234-236` vs `admin.ts:314`.)
- 관리자 판정: `isAdminUser = users.is_admin === true || ADMIN_USER_IDS 환경변수에 users.id 포함`
  (`admin.ts:313`, `admin.ts:5`, `admin.ts:15-17`). 즉 DB 컬럼이 정본, env 는 부트스트랩 폴백.
- 호출처 31곳(미들웨어 3, 서버 컴포넌트 다수, `blog-access.ts:55`).

| 함수 | 통과 조건 | 파일:라인 |
|---|---|---|
| `isAdmin(userId)` | env `ADMIN_USER_IDS` 에 `users.id` 포함 | admin.ts:15 |
| `isAdminAsync(userId)` | env 또는 `users.is_admin` | admin.ts:29 |
| `hasActiveSubscription(plan, exp)` | plan truthy AND exp > now | admin.ts:49 |
| `hasActivePaidPlanByUserId(userId, 'BLOGGER')` | admin OR (활성 AND plan ∈ {INFLUENCER, BLOGGER}) | admin.ts:219 |
| `hasActivePaidPlanByUserId(userId, 'INFLUENCER')` | admin OR (활성 AND plan === 'INFLUENCER') | admin.ts:235 |
| `getPaywallContext(authId)` | (판정 아님, 컨텍스트 반환) | admin.ts:280 |
| `requirePaidPlan(req)` | 401/403/402(`requiresPlan:'blogger'`) | admin.ts:247-265 |
| `requireInfluencerPlan(req)` | 401/403(`code:'PLAN_REQUIRED'`) | admin.ts:331-364 |
| `requireBloggerPlusPage` | `!hasActivePaidPlan` → `/subscribe?highlight=blogger` | plan-server-guards.ts:7-19 |
| `requireInfluencerPlusPage` | `!hasActivePaidPlan \|\| plan !== 'INFLUENCER'` → `/subscribe?highlight=influencer` | plan-server-guards.ts:32-46 |

---

## 1. "PRO" 명칭 — 4번째 등급인가, 표시 라벨인가

**결론: 개인 요금제 축에 PRO 라는 등급은 존재하지 않는다.** `users.subscription_plan` 에 저장되는 값은
`'BLOGGER'` / `'INFLUENCER'` 두 개뿐이며(`payment-config.ts:11-13` PlanKey → `billing.ts` 가 tier 를
대문자로 저장, `admin.ts:235-236` 비교), 화면의 "PRO" 는 **활성 유료 플랜 = 아무거나 하나라도 있음**을
뜻하는 표시 라벨이다. 다만 같은 철자가 서로 **다른 뜻으로 3~4곳**에서 쓰이고 있어 통합 시 충돌 위험이 크다.

### 1-A. 사용자에게 보이는 "PRO" (표시 라벨)

| 위치 | 문구 | 판정 기준 | 파일:라인 |
|---|---|---|---|
| 헤더 배지 | `PRO 이용 중` | `/api/usage/today` 의 `isPro` | UsageQuotaBadge.tsx:36-42 |
| 헤더 배지 원천 | — | `hasActivePaidPlanByUserId(userId)` (기본 requiredPlan='BLOGGER') | api/usage/today/route.ts:20 |
| 대시보드 프로필 | `인플루언서 PRO 이용 중` / `블로거 PRO 이용 중` / `PRO 이용 중` | `subscriptionPlan` 문자열 분기 | dashboard/ProfileHeader.tsx:193-196 |
| 만료 배너 | `PRO 이용권이 N일 전 만료` | `user.subscriptionPlan && subscriptionExpiresAt` | SubscriptionExpiryStrip.tsx:41, SubscriptionExpiryBanner.tsx:32,59 |
| 게이트 모달 | `PRO 이용권이 필요합니다` | `?needsPro=1` 쿼리 | TrialEndedModal.tsx:52-55, TrialEndedGateQueryHandler.tsx:15 |
| 구독 페이지 배너 | `이 기능은 PRO 이용권 전용입니다.` | `needsPro && !required` | subscribe/SubscribeClient.tsx:106-125 |
| 약관·개인정보 | `유료 서비스(PRO 이용권)` | 고정 문구 | legal/TermsContent.tsx:17, legal/PrivacyContent.tsx:10 |

### 1-B. 렌더링 경로 (헤더 "PRO 이용 중" 추적)

```
Header.tsx:123  <UsageQuotaBadge />
  └ UsageQuotaBadge.tsx:21  fetch('/api/usage/today')
      └ api/usage/today/route.ts:20  isPro = await hasActivePaidPlanByUserId(authUser.userId)
          └ admin.ts:236  return plan === 'INFLUENCER' || plan === 'BLOGGER'
  └ UsageQuotaBadge.tsx:36-42  if (usage.isPro) → "PRO 이용 중"
```

**→ BLOGGER 구독자도 헤더에서 "PRO 이용 중" 을 본다.** (`admin.ts:236` 에서 BLOGGER 가 true 를 반환하므로.)
`/api/usage/today` 는 `plan` 문자열을 응답에 담지 않아(`route.ts:27-32`) 배지가 등급을 구분할 방법이 아예 없다.
등급을 구분하는 유일한 화면은 `/my` 의 ProfileHeader 뿐이고, 그쪽은 `users.subscription_plan` 을 직접 받아
"블로거 PRO / 인플루언서 PRO" 로 나눠 쓴다(`my/page.tsx:80` → `ProfileHeader.tsx:193-196`).

### 1-C. 내부 로직에서의 "Pro" (=활성 유료 플랜)

| 심볼 | 의미 | 파일:라인 |
|---|---|---|
| `opts.isPro` | "이 카운터를 아예 타지 않음" 플래그. 호출부가 넘긴다 | free-quota.ts:44,56 |
| `requireFeatureAccess({isPro})` | true면 즉시 통과, 차감 없음 | feature-gate.ts:27 |
| `?needsPro=1` | 미들웨어가 붙이는 쿼리 (PAID_PLAN_GATE) | middleware.ts:118, 418 |
| `PAID_PLAN_GATE_PREFIXES` | `/my`, `/rankings/influencer`, `/keywords/bulk`, `/keywords/recommend`, `/competitor` | middleware.ts:126-132 |

미들웨어의 PRO 게이트는 `!ctx.isAdminUser && !ctx.hasActivePaidPlan` 하나만 본다(`middleware.ts:415`).
**등급 구분 없음** — BLOGGER 도 `/keywords/bulk` 같은 "인플루언서 전용" 사이드바 항목의 페이지 게이트를
미들웨어 단계에서는 통과한다(실제 차단은 페이지·API 의 `requireInfluencerPlan` / `requireInfluencerPlusPage`).

### 1-D. **같은 철자, 다른 뜻** — 통합 시 반드시 분리할 것

1. **기업 요금제의 `PRO`** — 이건 진짜 식별자다. `PlanId = 'BASIC' | 'PRO'` (`pricing.ts:16`),
   `PLANS.PRO.seatPrice = 9_900` (`pricing.ts:20`), DB CHECK 제약
   `plan_id IN ('BASIC','PRO')` (`migration-164-enterprise-orgs.sql:57,145`).
   개인 축으로는 `PLAN_TIER.PRO = 'influencer'` 로 매핑된다(`pricing.ts:33`).
2. **레거시 `licenses.plan_name = 'PRO'`** — 스마트스토어 주문 검증이 `licenses` 행을 만들 때 쓰는 문자열
   (`api/smartstore/verify-order/route.ts:150`). 이 경로는 `users.subscription_plan` 을 건드리지 않으므로
   **`getPaywallContext` 에 아무 영향이 없다** — 즉 이 "PRO 라이선스" 만으로는 어떤 기능도 열리지 않는다.
3. 표시 라벨 "PRO"(1-A) — 위 둘과 무관.

---

## 2. 크레딧과 등급의 관계

**결론: 크레딧은 등급과 완전히 독립된 별개 축이며, 지금은 전 구간 비활성(OFF)이다.**
"크레딧만으로 막히고 등급으로는 안 막히는 기능"은 **현재 없다** — 모든 크레딧 과금 라우트는
크레딧 게이트보다 **앞에** 등급/유료 가드를 이미 두고 있다.

### 2-A. 활성화 스위치

`credit-gate.ts:20` `export const CREDITS_ENABLED = process.env.CREDITS_ENABLED === 'true';`
- 로컬 `.env` / `.env.local` 에 `CREDITS_ENABLED` **키 자체가 없다** → 기본 false.
- 프로덕션(Vercel) 환경변수 값은 `코드에 근거 없음`.
- `assertCreditFor` / `chargeCreditIfEnabled` 는 OFF면 각각 `null` / no-op (`credit-gate.ts:30,55`).
- ⚠️ `settings.ts:169-172` 에 `getCreditsEnabledSetting()`(app_settings `credits_enabled`)이 있고
  주석은 "env 와 OR 결합"이라고 쓰여 있지만(`settings.ts:166-167`), **`credit-gate.ts` 는 이 함수를
  전혀 호출하지 않는다**. 즉 관리자 화면에서 `credits_enabled=true` 로 켜도 실제로는 켜지지 않는다.
  주석과 코드가 어긋나 있다.

### 2-B. `CREDIT_COSTS` 전량 (credit-config.ts:34-51) 과 실제 배선 여부

| feature | 값 | 실제 호출부 | 배선 상태 |
|---|---|---|---|
| `ai_titles` | 2 | api/keywords/titles/route.ts:55(assert), :63(charge) | 배선됨(OFF) |
| `ai_content_angles` | 4 | api/keywords/content-angles/route.ts:61, :66 | 배선됨(OFF) |
| `ai_body` | 8 | api/keywords/body/route.ts:77, :85 | 배선됨(OFF) |
| `ai_rewrite` | 4 | api/writing/rewrite/route.ts:87, :109 | 배선됨(OFF) |
| `ai_blog_analyze` | 7 | api/blog/ai-analyze/route.ts:57, :149 | 배선됨(OFF) |
| `ai_youtube_analyze` | 8 | api/content/youtube/analyze/route.ts:52, :111 | 배선됨(OFF) |
| `ai_shortform_analyze` | 250 | api/content/shortform/analyze/route.ts:63, :146 | 배선됨(OFF) |
| `ai_seo_diagnose` | 4 | api/google-indexing/urls/[id]/diagnose/route.ts:89, :114 | 배선됨(OFF) |
| `ai_dashboard_opus` | 6 | api/dashboard/claude/conversations/[id]/messages/route.ts:159, :208 | 배선됨(OFF) |
| `ai_consultant` | **0** | — | **의도적 0** (구독/무료회차만, credit-config.ts:44) |
| `bulk_search_volume` | 8 | api/bulk-search-volume/route.ts:88, :103 | 배선됨(OFF) |
| `bulk_top3` | 5 | — | **미배선** (호출부 없음) |
| `bulk_index_register` | 8 | api/google-indexing/bulk-register/route.ts:38, :86 | 배선됨(OFF) |
| `bulk_exposure_check` | 1(1건당) | api/blog/check-missing/route.ts:68 (`amountOverride`) | 배선됨(OFF, `CREDITS_ENABLED` 직접 검사) |
| `bulk_keyword_rank` | 1(1건당) | api/analytics/lookup-extend/authorize/route.ts:77 | 배선됨(OFF) |
| `bulk_ai_citation` | 1(1건당) | api/analytics/lookup-extend/authorize/route.ts:77 (feature 인자) | 배선됨(OFF) |

`bulk_exposure_check` / `bulk_keyword_rank` / `bulk_ai_citation` 3종만 `credit-gate` 를 안 거치고
`chargeCredit` 을 직접 부른다. 대신 라우트 안에서 `if (!CREDITS_ENABLED) return pass;`
(`api/blog/check-missing/route.ts:62`) 또는 `const amount = CREDITS_ENABLED ? ... : 0`
(`api/analytics/lookup-extend/authorize/route.ts:49`) 로 같은 스위치를 직접 본다.

### 2-C. 기타 크레딧 상수

| 상수 | 값 | 파일:라인 |
|---|---|---|
| `CREDIT_PACKAGES` | 100/₩1,000 · 500/₩4,500 · 1,000/₩8,500 · 3,000/₩24,000 | credit-config.ts:80-85 |
| `PLAN_MONTHLY_CREDITS.blogger` | 400 | credit-config.ts:97 |
| `PLAN_MONTHLY_CREDITS.influencer` | 800 | credit-config.ts:98 |
| `SIGNUP_BONUS_CREDITS` | 20 | credit-config.ts:105 |
| N캐시 적립률 기본 | 0.1 (결제액 10%) | settings.ts:29 |

월 지급은 결제 성공 시 `billing.ts:27-34` `grantSubscriptionCredits(userId, plan.tier, paymentId)` 로
`subgrant:{paymentId}` 멱등 지급. **이건 `CREDITS_ENABLED` 와 무관하게 항상 실행된다** — 즉 크레딧
"지급"은 살아 있고 "차감"만 꺼져 있다.

### 2-D. migration-141 적용 여부

- 파일은 존재: `supabase/migration-141-credit-system.sql` — 테이블 `credits`(:13),
  `credit_transactions`(:22), RPC `get_credit_balance`(:41), `ensure_credit_account`(:51),
  `add_credit`(:82), `use_credit`(:120).
- **DB 적용 여부는 코드에 근거 없음.** 저장소에 마이그레이션 적용 이력 테이블/스크립트가 없다.
- 테이블이 없을 때의 동작: `getCreditBalance` → `ensure_credit_account` 실패 → 폴백
  `get_credit_balance` 도 실패 → `Number(undefined ?? 0) = 0` 반환 (`credits.ts:44-50`).
  즉 **에러 없이 잔액 0 으로 보인다.** `chargeCredit` 은 RPC 에러 시 `{ok:true, charged:0}`
  (`credits.ts:91-97`) 로 **fail-open**. `grantCredit` 도 실패 시 잔액 조회로 폴백(`credits.ts:143-147`).
  → **테이블이 없어도 500이 나지 않는다.** 단 `CREDITS_ENABLED=true` 로 켜는 순간
  `assertCreditFor` 가 balance 0 을 보고 **모든 크레딧 기능을 402 로 막는다**(`credit-gate.ts:31-43`).

### 2-E. 🔴 발견된 결함 — 크레딧 계정 키(id)가 경로마다 다르다

`credits.user_id` 는 `REFERENCES auth.users(id)` (`migration-141:14, :24`). 그런데:

| 호출부 | 넘기는 값 | 파일:라인 |
|---|---|---|
| 헤더 배지 잔액 조회 | `auth.authId` (= auth.users.id) | api/credits/balance/route.ts:13 |
| 노출 확장 조회 잔액/차감 | `auth.userId` (= public.users.id) | api/blog/exposure-extend/plan/route.ts:41, api/blog/check-missing/route.ts:68 |
| 3화면 확장 조회 잔액/차감 | `auth.userId` | api/analytics/lookup-extend/authorize/route.ts:64,77 |
| AI 기능 전체 (assert/charge) | `auth.authUser.userId` | keywords/titles:55, body:77, rewrite:87 … |
| 구독 월지급 / 크레딧 구매 | `opts.userId` (public.users.id) | billing.ts:205,322 · credit-purchase.ts:52,150 |

`getAuthUser` 는 `authId: authUser.id` 와 `userId: profile.id` 를 **서로 다른 값**으로 반환하며
(`auth.ts:74-75`), `public.users.id` 는 `uuid_generate_v4()` 독립 PK 다
(`supabase-schema.sql:10`; `migration-098-youtube-stt-history.sql:34` 주석이 "user_id 는
public.users.id (auth.users.id 아님)" 이라고 명시).
→ **헤더의 "크레딧 N" 은 나머지 전 경로가 쓰는 계정과 다른 키를 읽고 있다.** 또한 `users.id` 로
`credits` 에 쓰려는 모든 시도는 auth.users FK 위반이 되며, 위 fail-open 때문에 **조용히 무시된다.**
통합 전에 어느 쪽을 정본으로 할지 반드시 결정해야 한다.

---

## 3. 무료 한도 숫자 전수 + 리셋 주기

### 3-A. 공용 무료 풀 (`free_daily_usage` 원장)

| 상수 | 값 | 적용 범위 | 등급별 차등 | 리셋 |
|---|---|---|---|---|
| `ANON_DAILY_FREE_LIMIT` | **3** | 비회원, subject `ip:sha256(ip+ua)` | — | 일 단위 (아래 3-D) |
| `MEMBER_DAILY_FREE_LIMIT` | **3** | 로그인 무료회원, subject `user:{userId}` | 유료/관리자는 카운터 미진입 | 일 단위 |
| `PAID_AI_DAILY_CAP` | **50** | 유료 사용자 AI 생성 남용 상한, subject `paidcap:{userId}` | 무료회원엔 해당 없음 | 일 단위 |
| `DEFAULT_FREE_DAILY_LIMIT_MEMBER` | 3 | 위 회원 한도의 settings 폴백 | — | — |
| `DEFAULT_FREE_DAILY_LIMIT_ANON` | 3 | 위 비회원 한도의 settings 폴백 | — | — |

정의: `free-quota.ts:19,20,128` / `settings.ts:27,28`.

- 카운트는 **기능별이 아니라 subject 전체 합산**이다 (`free-quota.ts:12`, `migration-138:4-5`).
  즉 AI 컨설턴트 1회 + 키워드 분석 화면 1회 + 경쟁자 분석 1회 = 하루 3회 소진.
- 한도값 조회 경로가 **두 갈래**다:
  - `consumeFreeDailyQuota` / `getFreeDailyUsage` 는 `getFreeDailyLimit(!!userId)` 로 **app_settings 오버라이드를 반영**한다 (`free-quota.ts:62,175` → `settings.ts:109-113`).
  - `withAnalysisView` 는 `MEMBER_DAILY_FREE_LIMIT` **상수를 직접** 쓴다 (`analysis-quota.ts:119`).
  - `getCompetitorDailyLimit` 도 상수 직접 (`competitor-quota.ts:16`).
  → **관리자가 무료 한도를 바꿔도 분석 화면 3회는 안 바뀐다.** 통합 시 반드시 정리 대상.

### 3-B. 어떤 actionId 가 이 풀을 소모하나

| actionId | 진입점 | 게이트 | 파일:라인 |
|---|---|---|---|
| `ai_consultant` | 홈 AI 질문 | `requireFeatureAccess` | api/ai-consultant/route.ts:190 |
| `ai_consultant` | AI 컨설턴트 대화 메시지 | `requireFeatureAccess` | api/ai-consultant/conversations/[id]/messages/route.ts:165 |
| `competitor_analyze` | 경쟁자 분석 | `consumeFreeDailyQuota` | competitor-quota.ts:36 |
| `keyword_analysis` | 키워드 목록 | `withAnalysisView` | api/keywords/route.ts:15 |
| `inflow_analysis` | 유입/글 분석 | `withAnalysisView` | api/blog/analyze/route.ts:70 |
| `rank_analysis` | 블로거 순위 Top | `withAnalysisView` | api/rankings/top/route.ts:8 |
| `rank_analysis` | 네이버 메이트 랭킹 | `withAnalysisView` | api/rankings/naver-mate/route.ts:9 |
| `rank_analysis` | 내 키워드 순위 상태 | `withAnalysisView`(토큰 필수) | api/my/keyword-ranking-state/route.ts:55 |
| `missing_analysis` | 미노출 상태 | `withAnalysisView`(토큰 필수) | api/my/post-missing-state/route.ts:34 |
| `ai-titles` / `ai-angles` / `ai-body` | 유료 AI 생성 3종 | `consumePaidDailyCap`(50) | keywords/titles:48, content-angles:54, body:70 |
| `shortform_analyze` | 릴스·쇼츠 분석 | `consumePaidDailyCap({max: 3})` | api/content/shortform/analyze/route.ts:26 |

`withAnalysisView` 는 요청 단위가 아니라 **화면(view token) 단위**로 센다 — 같은 `X-View-Token` 의
하위 요청(필터/정렬/페이지네이션)은 재차감 없음, 새 토큰(새로고침/새 탭)만 +1
(`analysis-quota.ts:14-17,121-144`, 클라이언트 `analysis-view.ts:14-26`).

### 3-C. 그 밖의 한도 (풀이 다름)

| 상수 | 값 | 적용 | 리셋 | 파일:라인 |
|---|---|---|---|---|
| `ANON_DAILY_LIMIT` (search-volume) | 30 | `/api/search-volume`, IP+UA, **로그인 여부 무관** | 일 단위 (`tool_anon_quota.day`) | api/search-volume/route.ts:7,46 |
| `ANON_DAILY_LIMIT` (shopping) | 30 | `/api/shopping/keywords`, IP+UA | 일 단위 | api/shopping/keywords/route.ts:9,182 |
| `EXPOSURE_FREE_DAYS` | 30(일) | 최근 30일 글은 무료 조회. 초과 = 회원 전용 | 리셋 개념 없음(글 발행일 기준) | exposure-policy.ts:27 |
| `EXPOSURE_MEMBER_FREE_LOOKUP_LIMIT` | 90(건) | 30일 이전 확장 조회 중 무료 건수. 초과분만 과금 | **리셋 없음 — 요청(job)마다 재계산** | exposure-policy.ts:30 |
| `LOOKUP_FREE_DAYS` | 30(일) | 3화면 공통(노출/키워드순위/AI브리핑) | 동상 | analytics-lookup.ts:34 |
| `LOOKUP_MEMBER_FREE_LIMIT` | 90(건) | 동상 | 요청마다 재계산 | analytics-lookup.ts:36,155 |
| `EXPOSURE_RECHECK_FRESH_MS` | 20시간 | 재검사 신선도 = 과금 멱등 버킷 | 20h 롤링 | exposure-policy.ts:36 |
| `CLAUDE_FREE_TRIAL_LIMIT` | 3 | 글 심층피드백(Claude) 무료 체험 메시지. **미결제 INFLUENCER 한정** | **평생 누적, 리셋 없음** (`users.claude_free_trial_used`) | claude-feedback.ts:49, messages/route.ts:83 |
| `SESSION_LIMIT` | 3 | 동시 로그인 기기 수, 전 플랜 공통 | 리셋 없음(슬롯) | session-limit.ts:17 |
| `DAILY_ATTEMPT_LIMIT` | 5 | 인플루언서 계정 연결 시도 | **UTC 자정** (`toISOString().slice(0,10)`) | api/auth/match-link/route.ts:25,51-55 · api/auth/match-candidates/route.ts:24 |
| `DOWNLOAD_ROW_LIMIT` | 500 | CSV 다운로드 행 수 | — | csv.ts:46 |
| `BULK_RUN_CAP` | 10 | AI 인용 일괄 실행 | — | ai-citation-batch.ts:11 |
| `NAVER_SEARCH_DAILY_QUOTA` | 25,000 | 네이버 검색 API 자체 일일 쿼터(외부) | 외부 기준 | ai-citation-batch.ts:23 |
| `PER_USER_NEW_POST_CAP` | 50 | 크론 글 수집 상한 | 크론 실행 단위 | api/cron/scrape-blog-posts/route.ts:17 |
| `PER_USER_POST_CAP` | 30 | 크론 노출 검사 상한 | 크론 실행 단위 | api/cron/crawl-post-exposure/route.ts:23 |

CSV 다운로드는 별도로 **INFLUENCER 전용**이다: `canDownload = user.isAdmin || user.subscriptionPlan === 'INFLUENCER'` (`keywords/page.tsx:70`, `my/post-analysis/page.tsx:36`).

### 3-D. 🔴 리셋 시각 — 코드가 주는 정확한 답

세 카운터 모두 **Postgres `current_date`** 에 위임되어 있고, **타임존을 명시하지 않는다**:

- `free_daily_usage.day date not null default current_date` (`migration-138-free-daily-quota.sql:12`),
  RPC 안에서도 `where ... and day = current_date` (`:36, :41, :51`, `get_free_daily_usage` `:74`).
- `tool_anon_quota.day ... default current_date` (`migration-086-tool-anon-quota.sql:14, :36`).
- `free_view_tokens.day ... default current_date` (`migration-148-analysis-view-quota.sql:20, :46,51,57,73,78`).

같은 저장소의 다른 마이그레이션은 KST 가 필요할 때 **명시적으로** 썼다 —
`(NOW() AT TIME ZONE 'Asia/Seoul')::date` (`migration-069:22,29`, `migration-078:44`,
`migration-096:24`, `migration-123:58`). 무료 한도 3종에는 그 표기가 **없다.**

> **결론: 리셋 경계는 코드에 고정되어 있지 않다.** DB 세션 타임존(`current_date`)이 결정하며,
> Supabase 기본값이 UTC 라면 **UTC 자정 = KST 09:00** 에 리셋된다. 실제 DB 의 `TimeZone` 설정값은
> **코드에 근거 없음** — `supabase/` 어디에도 `SET timezone` 이 없고 `config.toml` 도 없다.
> "매일 자정(KST)" 이라고 문서화하려면 먼저 DB 실측이 필요하다.
>
> 예외적으로 `DAILY_ATTEMPT_LIMIT` 만은 애플리케이션이 `${today}T00:00:00Z` 로 **UTC 자정**을
> 명시한다 (`api/auth/match-link/route.ts:51-55`).

- 청구주기(billing cycle) 단위로 리셋되는 한도는 **없다**. 구독과 연동되는 주기성 값은
  월 지급 크레딧(`PLAN_MONTHLY_CREDITS`)뿐이며, 이건 한도가 아니라 잔액 적립이다.
- 만료 후 초과분 회수/이월 규칙: **코드에 근거 없음**.

---

## 4. N인플 AI 한도 — 3회인가 5회인가

**결론: 실제 강제되는 값은 3 이다. "무료 5회" 는 갱신되지 않은 주석·문구 잔재다.**

- 강제 경로: `feature-gate.ts:29-36` → `free-quota.ts:62` `getFreeDailyLimit(!!userId)`
  → `settings.ts:109-113` → 폴백 `DEFAULT_FREE_DAILY_LIMIT_MEMBER/ANON = 3` (`settings.ts:27-28`),
  코드 상수 `ANON_DAILY_FREE_LIMIT = 3` / `MEMBER_DAILY_FREE_LIMIT = 3` (`free-quota.ts:19-20`).
  → 회원·비회원 **모두 3**.
- 5 라고 적힌 곳 (전부 주석/기본인자, 강제력 없음):

| 위치 | 내용 |
|---|---|
| feature-gate.ts:5 | JSDoc `"무료 5회 / PRO 무제한" 기능 게이트` |
| free-quota.ts 헤더 주석은 3으로 갱신됨(:8, :98) | — |
| migration-138:2 | `-- "하루 5회 무료" 전역 사용량 카운터` |
| migration-138:26 | `p_max int default 5` — **기본인자일 뿐, 모든 호출부가 p_max 를 명시 전달**(free-quota.ts:69, :149) |
| migration-138:65 | 주석 `"오늘 무료 사용 X/5회"` |
| competitor-quota.ts:8 | 주석 `"하루 5회(비회원)/10회(회원)"` — 값은 `MEMBER_DAILY_FREE_LIMIT`(3) 을 쓴다 |
| api/usage/today/route.ts:9 | 주석 `"오늘 무료 사용 X/5회"` |

- 즉 **CLAUDE.md 의 "하루 3회" 가 맞다.** `p_max default 5` 는 실행 경로에 도달하지 않는다
  (다만 누군가 인자 없이 RPC 를 부르면 5가 되는 잠재 함정이라 통합 시 5→3 정합 권장).

### 4-A. 등급별 AI 한도

| 등급 | AI 컨설턴트(`ai_consultant`) | AI 생성 3종(제목/글감/본문) | 릴스·쇼츠 |
|---|---|---|---|
| 비로그인 | 3/일 (IP+UA 합산 풀) | 접근 불가(로그인 필요) | 접근 불가 |
| 무료 회원 | 3/일 (user 합산 풀) | 접근 불가 (`requirePaidAccess` + 페이지 가드) | 접근 불가 |
| **BLOGGER** | **무제한** (`isPro=true` → 카운터 미진입, feature-gate.ts:27) | 라우트 가드에 따라 다름 · 통과 시 **PAID_AI_DAILY_CAP=50/일** | 페이지가 INFLUENCER 전용 |
| **INFLUENCER** | **무제한** | 동일하게 **50/일** | **3/일** (`max: 3`) |
| 관리자 | 무제한 | **캡 자체를 건너뜀** (`if (!auth.authUser.user.is_admin)`, titles:47) | 캡 적용됨 |

- BLOGGER/INFLUENCER 는 무료 3회 풀을 **아예 타지 않는다**(무제한). 대신 AI 생성 계열은
  `consumePaidDailyCap` 의 **하루 50회 남용 상한**을 공유한다(`free-quota.ts:128,136-161`).
  이 50 은 제목·글감·본문이 **한 풀을 공유**한다(`titles:48`, `content-angles:54`, `body:70` 모두
  `paidcap:{userId}` 서브젝트).
- AI 컨설턴트에는 `consumePaidDailyCap` 이 걸려 있지 않다 → **유료 사용자는 문자 그대로 무제한**.
- `PAID_AI_DAILY_CAP` 은 app_settings 오버라이드 대상이 아니다(코드 상수만).

---

## 5. 기업(Enterprise) 구독과 3등급 축의 관계

**결론: 기업 좌석은 별도 축이 아니라, `users.subscription_plan` 에 `'BLOGGER'`/`'INFLUENCER'` 를
직접 써 넣는 방식으로 개인 티어 축에 합류한다. 따라서 `getPaywallContext` 는 좌석 멤버에게
평범한 `plan: 'BLOGGER'` 또는 `'INFLUENCER'` 를 반환하고, 기능 접근도 정상적으로 열린다.**

핵심 코드 (`enterprise-billing.ts:102-130`):

```ts
export async function syncOrgSeatEntitlements(orgId: string): Promise<void> {
  // org.status === 'active' && org.current_period_end 필요 (:111)
  const { data: members } = await supa.from('enterprise_org_members')
    .select('user_id').eq('org_id', orgId).eq('status', 'active');      // :113-117
  await supa.from('users').update({
    subscription_plan: PLAN_TIER[org.plan_id].toUpperCase(),            // :124
    subscription_expires_at: org.current_period_end,                    // :125
  }).in('id', members.map(m => m.user_id));                             // :127
}
```

| 기업 plan_id | `PLAN_TIER` | `users.subscription_plan` 에 저장되는 값 | `getPaywallContext().plan` |
|---|---|---|---|
| `BASIC` (좌석당 ₩5,500) | `'blogger'` (pricing.ts:32) | `'BLOGGER'` | `'BLOGGER'` |
| `PRO` (좌석당 ₩9,900) | `'influencer'` (pricing.ts:33) | `'INFLUENCER'` | `'INFLUENCER'` |

- `enterprise_org_members.user_id` 는 `REFERENCES users(id)` (`migration-164:90`) 이므로
  `admin.ts` 의 `users.id` 기준과 정합한다.
- 호출 시점은 **두 곳뿐**: 결제 확정 시(`enterprise-billing.ts:84`)와 초대 수락 시
  (`api/org/invite/accept/route.ts:139`). **주기적 재동기화 크론이 없다.**
- 만료 처리: `subscription_expires_at = current_period_end` 를 넣어두므로 그 시각이 지나면
  `hasActiveSubscription` 이 false 가 되어 자연 만료된다(`admin.ts:49-58`). 별도 만료 배치는
  `코드에 근거 없음`.
- 좌석 제거(`status='removed'`) 시 `users.subscription_plan` 을 되돌리는 코드는 **없다** —
  `syncOrgSeatEntitlements` 는 active 멤버에게 쓰기만 하고 회수하지 않는다(`:113-127`).
  제거된 멤버는 `current_period_end` 까지 권한을 유지한다.
- 즉 **기업 멤버십은 티어 게이트와 끊겨 있지 않다.** 다만 연결 방식이 "동기화 시점에 한 번 밀어넣기"
  라서, org 상태가 바뀌어도 사용자 행은 다음 sync 전까지 갱신되지 않는 정합성 창이 있다.
- 기업 좌석 보유자에게 크레딧을 지급하는 코드는 **없다** (`grantSubscriptionCredits` 는
  개인 결제 경로 `billing.ts:205,322` 에서만 호출).

---

## 6. 비로그인 사용자 취급

**결론: 항목에 따라 다르다. AI 무료 풀에서는 회원과 동일(3회)하고, 분석 화면 게이트에서는
"게이트 미적용(=API 레벨 무제한)" 이며, 화면 진입은 미들웨어가 별도로 막는다.**

### 6-A. 회원과 동일한 곳

- `free-quota.ts:19-20` — `ANON_DAILY_FREE_LIMIT = 3` = `MEMBER_DAILY_FREE_LIMIT = 3`. **숫자가 같다.**
- 구분은 subject 키뿐: 비회원 `ip:sha256(ip+ua)` (`free-quota.ts:30-35`), 회원 `user:{userId}`
  (`free-quota.ts:37-39`). 따라서 같은 IP+UA 를 쓰는 여러 비회원은 풀을 **공유**한다(회원보다 불리).
- 문구만 다르다 (`feature-gate.ts:42-48`):
  - 회원: `'오늘 무료 이용을 모두 사용했습니다. 이용권을 구매하면 계속 이용할 수 있습니다.'`
  - 비회원: `'오늘 무료 이용을 모두 사용했습니다. 회원가입하면 더 많이 이용할 수 있습니다.'` + `needsSignup: true`
  - ⚠️ 비회원 문구가 "회원가입하면 더 많이" 라고 하지만 회원 한도도 **똑같이 3** 이다 — 문구와 코드가 어긋남.

### 6-B. 비로그인이 **더 느슨한** 곳 (의도된 설계)

`analysis-quota.ts:49-50`

```ts
// 미로그인 → 이 게이트 미적용 (회원 기준 정책)
if (!authUser) return { userId: null };
```

`resolveViewer` 가 `userId: null` 을 돌려주면 `withAnalysisView` 는 카운트 없이 핸들러를 그대로
실행한다(`analysis-quota.ts:111`). 주석은 그 이유를 "공개/SEO 페이지 보호는 미들웨어·페이지 가드가
담당" 이라고 밝힌다(`analysis-quota.ts:22-23`). 실제 차단은:
- `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:93-108`) → 비회원은 `/?memberOnly=1&redirect=...`
  (`middleware.ts:390-400`)
- `/keywords` 하위는 `PUBLIC_KEYWORDS_PATHS` 2개(`/keywords/blogger`, `/keywords/blog-ranking`) 만
  공개 (`middleware.ts:114`, `:378-387`)
- `AUTH_REQUIRED_PAGE_PREFIXES = ['/community']` (`middleware.ts:83`)

즉 **HTML 진입은 막히지만 API 만 직접 부르면 카운트되지 않는다.**

### 6-C. 비로그인이 **더 엄격한** 곳

| 항목 | 비로그인 | 로그인 무료회원 | 근거 |
|---|---|---|---|
| 30일 이전 글 노출 조회 | **401 `MEMBER_ONLY`** | 90건까지 무료 | api/blog/check-missing/route.ts:59 |
| 3화면 확장 조회 | **401 `MEMBER_ONLY`** | 90건까지 무료 | api/analytics/lookup-extend/authorize/route.ts:32 |
| 블로그 리소스 API | 401 (쿠키 사용자 없으면) | 본인 블로그만 | blog-access.ts:65-71 |
| 크레딧 잔액 배지 | 401 → 배지 미표시 | 표시 | api/credits/balance/route.ts:10, CreditBadge.tsx:16-18 |
| 헤더 사용량 배지 | 표시됨 (IP 기준 카운트) | 표시됨 | UsageQuotaBadge.tsx:14, api/usage/today/route.ts:10 |
| `/api/search-volume`, `/api/shopping/keywords` | 30회/일 | **동일 30회/일** (로그인 여부를 아예 보지 않음) | search-volume/route.ts:46 |

`checkToolAnonQuota` 는 이름과 달리 인증을 확인하지 않으므로, 로그인 사용자도 같은 IP+UA 캡을 탄다
(`anon-quota.ts:14-31`, 호출부 `search-volume/route.ts:46`, `shopping/keywords/route.ts:182`).

### 6-D. 장애 시 동작 (fail-open / fail-closed)

| 게이트 | RPC 실패 시 | 근거 |
|---|---|---|
| `consumeFreeDailyQuota` | **통과**(fail-open) | free-quota.ts:74, :86 |
| `consumePaidDailyCap` | **통과** | free-quota.ts:153, :159 |
| `withAnalysisView` | **통과** | analysis-quota.ts:135, :143 |
| `checkToolAnonQuota` | 통과하되 `degraded: true` | anon-quota.ts:37, :48 |
| └ 이를 받는 search-volume / shopping | **503 차단**(fail-closed, 외부 유료 API 보호) | search-volume/route.ts:51-56 |
| `isRestrictedByUserId` | **차단**(fail-secure) | admin.ts:163, :178 |
| `hasActivePaidPlanByUserId` | **차단**(fail-secure) | admin.ts:239 |
| `getPaywallContext` | 권한 없음으로 폴백 | admin.ts:321 |
| 미들웨어 PRO 게이트 (4초 타임아웃) | **유료 보유로 폴백**(fail-open) | middleware.ts:410-414 |
| `chargeCredit` | **통과**(fail-open, 원장 사후 보정 전제) | credits.ts:91-97 |

---

## 부록 — 통합 전 반드시 결정해야 할 충돌 목록

1. 무료 한도값 조회 경로 이원화: `getFreeDailyLimit()`(settings 반영) vs `MEMBER_DAILY_FREE_LIMIT`
   상수 직접 사용(`analysis-quota.ts:119`, `competitor-quota.ts:16`).
2. `hasActivePaidPlan`(plan 내용 미검사, `admin.ts:314`) vs `hasActivePaidPlanByUserId`(화이트리스트,
   `admin.ts:236`) 의 판정 기준 불일치.
3. 크레딧 계정 키: `auth.users.id`(`api/credits/balance/route.ts:13`) vs `public.users.id`(그 외 전부).
4. `CREDITS_ENABLED` 를 env 만 보고 `app_settings.credits_enabled` 는 무시(`credit-gate.ts:20`,
   주석은 OR 결합이라고 기술 — `settings.ts:166-167`).
5. `migration-138:26` 의 `p_max default 5` 와 실제 정책 3 의 불일치.
6. "PRO" 3중 의미: 표시 라벨 / 기업 `PlanId='PRO'`(pricing.ts:16) / 레거시 `licenses.plan_name='PRO'`.
7. 무료 한도 리셋 타임존이 DB `current_date` 에 위임되어 코드에 고정되지 않음(3-D).
8. `CREDIT_COSTS.bulk_top3 = 5` 는 호출부가 없는 미배선 항목(credit-config.ts:46).
9. 비회원 안내 문구 "회원가입하면 더 많이 이용" 과 실제 한도(둘 다 3)의 불일치(`feature-gate.ts:44`).
