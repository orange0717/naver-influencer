# API 서버 게이팅 감사 (읽기 전용 조사)

- 대상: `src/app/api/**/route.ts` — **총 309개 파일**
- 기준일: 2026-09-01
- 원칙: 코드에 **실제로 있는** 것만 기록한다. 등급 규칙을 추정·창작하지 않는다.

## 판정 기준

| 판정 | 뜻 |
| --- | --- |
| `OK` | 인증 + 등급 강제가 라우트/미들웨어에 존재하고 화면 등급과 어긋나지 않음 |
| `CLIENT_ONLY` | 화면은 잠겨 있는데 API에 서버측 등급 검사가 없음 (무료/하위 등급이 직접 호출 가능) |
| `UNMAPPED` | 해당 엔드포인트에 대한 등급 규칙이 어디에도 없음 |
| `CONFLICT` | 같은 기능에 대해 두 곳이 서로 다른 등급을 강제 |

## 등급 판정 함수 (이 문서에서 반복 인용)

| 함수 | 파일:줄 | 통과 조건 | 실패 응답 |
| --- | --- | --- | --- |
| `getAuthUser` | `src/lib/auth.ts:12` | Bearer 또는 쿠키 세션 + `users` 프로필 존재 | 라우트가 직접 401 |
| `getCookieUser` | `src/lib/auth.ts:127` | 서명된 `identity_sig` 쿠키 또는 실세션 유도 | 라우트가 직접 401 |
| `requirePaidPlan` | `src/lib/admin.ts:247` | `hasActivePaidPlanByUserId(userId)` = **BLOGGER 이상** | 401 / 403(restricted) / 402 |
| `requireInfluencerPlan` | `src/lib/admin.ts:331` | `hasActivePaidPlanByUserId(userId,'INFLUENCER')` = **INFLUENCER 전용** | 401 / 403 `PLAN_REQUIRED` |
| `requireAdmin` | `src/lib/admin.ts:129` | `users.is_admin` 또는 `ADMIN_USER_IDS` | 401/403 |
| `assertBlogResourceAccess` | `src/lib/blog-access.ts:34` | 관리자 **또는 유료(BLOGGER 이상) 아무나 전 블로그** **또는** 무료회원의 본인 블로그 | 400/401/403 |
| `withAnalysisView(actionId)` | `src/lib/analysis-quota.ts:94` | 미로그인·유료·관리자는 무제한 통과, 무료회원만 하루 `MEMBER_DAILY_FREE_LIMIT` | 402 `quotaExceeded` |
| `requireFeatureAccess` | `src/lib/feature-gate.ts:22` | `isPro`면 통과, 아니면 하루 무료 1회 차감 | 402 `quotaExceeded` |
| `checkToolAnonQuota` | `src/lib/anon-quota.ts:14` | 인증 없음. IP+UA 해시 일일 캡만 | 429 |
| `assertCreditFor` / `chargeCreditIfEnabled` | `src/lib/credit-gate.ts:29,52` | **`CREDITS_ENABLED !== 'true'` 이면 전부 no-op** | 402 `INSUFFICIENT_CREDITS` |

수치 정의 위치:
- `ANON_DAILY_FREE_LIMIT = 3`, `MEMBER_DAILY_FREE_LIMIT = 3` — `src/lib/free-quota.ts:20,21` (운영 override 는 `getFreeDailyLimit`, `src/lib/settings.ts:109`)
- `PAID_AI_DAILY_CAP = 50` — `src/lib/free-quota.ts:141`
- `CLAUDE_FEEDBACK_MESSAGE_LIMIT = 8000` — `src/lib/claude-feedback.ts:14`
- 크레딧 단가 `CREDIT_COSTS` — `src/lib/credit-config.ts:34~50`
- 도구용 익명 캡 `ANON_DAILY_LIMIT = 30` — `src/app/api/search-volume/route.ts:7`, `src/app/api/shopping/keywords/route.ts:9`

## 미들웨어 요약 (`src/middleware.ts`)

- `/api/keywords*`, `/api/downloads/keywords` → 비로그인 401 (`:428`)
- `/api/influencers*` → 비로그인 401. 단 `/recent`, `/list*`, `/free-plan*` 제외 (`:435~442`)
- `/api/influencers` **정확 일치만** → `!hasActivePaidPlan` 이면 402 (`:449~458`)
- `/api/rankings/naver-mate*` → 비로그인 401 (`:462`)
- `PAID_PLAN_GATE_API_PREFIXES = ['/api/my']` → `!hasActivePaidPlan` 이면 402 (`:136`, `:473~486`).
  예외: `/api/my/link`, `/api/my/link-blog`, `/api/my/representative-keywords/extract` (`:143`),
  그리고 `X-View-Token` 헤더가 붙은 GET + `VIEW_TOKEN_GATED_API_PREFIXES`(`:153`) 4종.
- 🚨 `getPaywallContext.hasActivePaidPlan` 은 BLOGGER/INFLUENCER 를 **구분하지 않는다**(`src/lib/admin.ts:315`).
  즉 미들웨어의 402 는 전부 **BLOGGER 급**이며 INFLUENCER 급 게이트는 미들웨어에 존재하지 않는다.
- 미들웨어는 Supabase 지연 시 `hasActivePaidPlan: true` 로 **폴백**한다(`:414`, `:453`, `:480`). 가용성 우선 설계로, 4초 이상 지연 상황에서는 유료 게이트가 열린다.

## 화면 등급 선언 원본 (`src/lib/sidebar-nav.ts`)

`requiredPlan` 선언이 아래 표의 "화면 등급" 기준이다. 서버 페이지 가드는 `src/lib/plan-server-guards.ts` 를 쓰는 8곳뿐이다
(`/topics`, `/influencers`, `/influencers/[id]`, `/dashboard/claude`, `/my/fans` = INFLUENCER / `/influencers/list`, `/influencers/free-plan`, `/my/keyword-ranking`, `/my/post-analysis` = 로그인만).

---

# 그룹 요약 (개별 열거 생략)

## `/api/cron/*` — 41개

전부 동일 가드다. `verifyCronSecret(request)`(`src/lib/crawler.ts`)를 핸들러 첫 줄에서 호출하고 실패 시 401 로 끝낸다.
`/api/cron/run` 만 동적 import 로 같은 함수를 불러온다(`src/app/api/cron/run/route.ts:32`). **이탈 라우트 없음.**
미들웨어의 전역 rate limit 은 `DEFAULT_RATE_LIMIT_BYPASS`(`src/middleware.ts:72`)로 크론을 제외하고,
`*.vercel.app` 호스트 차단도 `/api/cron/` 만 예외로 둔다(`:284`) — Vercel Cron 스케줄러가 배포 URL로만 호출 가능하기 때문.
`/api/cron/analyze-topic-insights:47`, `/api/cron/crawl-naver-topics:36`, `/api/cron/curate-blog-topics:52`, `/api/cron/scrape-blog-posts:58` 은
`.eq('subscription_plan','INFLUENCER')` 로 **처리 대상 회원을 INFLUENCER 로 한정**한다(접근 가드가 아니라 대상 필터).
판정: 전부 `OK`.

**크론 계열이지만 `/api/cron` 밖에 있는 3개** — 같은 `verifyCronSecret` 을 쓰므로 동일 취급:
`/api/admin/cleanup-influencers`(`:29,:57`), `/api/admin/import-datalab`(`:26`), `/api/admin/migrate`(`:8`), `/api/test/crawl`(`:77`).
이 4개는 이름이 `admin`/`test` 인데 실제 가드는 크론 시크릿이다 — 관리자 세션으로는 호출되지 않는다. 판정 `OK`(가드는 있음), 다만 명명 불일치.

## `/api/admin/*` — 30개

`/api/admin/cleanup-influencers`, `/api/admin/import-datalab`, `/api/admin/migrate` 3개(위 크론 그룹)를 제외한 **나머지 27개 전부**
핸들러 첫 줄에서 `requireAdmin(req)`(`src/lib/admin.ts:129`)를 호출하고 실패하면 즉시 반환한다.
`/api/admin/judges/[id]/verify:64` 만 다른 라우트보다 늦게(사전 파싱 뒤) 호출하지만 DB 쓰기 전이라 실질 동일.
`requireAdmin` 은 `users.is_admin` 우선 + `ADMIN_USER_IDS` 환경변수 폴백이다. **이탈 라우트 없음.** 판정: 전부 `OK`.
참고 — `/api/admin` 경로가 아니면서 관리자 전용인 라우트가 3개 더 있다:
`/api/analytics/referrers:38`, `/api/analytics/stats:8`(`requireAdmin`), `/api/promo/broadcast:12~18`(`getAuthUser` + `isAdminFromProfile`),
`/api/notifications/create:37`(`verifyAuthorizationToken(ADMIN_NOTIFICATION_TOKEN)` — 세션이 아닌 정적 토큰),
`/api/iblog-rank/keywords:17,31,82,107`(`requireAdmin`), `/api/stories/[id]:85,130`(DELETE/PATCH 만 `requireAdmin`).

## `/api/auth/*` — 15개

공통 가드는 없다. 성격상 3분류다.
1. **세션 필요**: `/auth/delete-account:15`(`getAuthUser`), `/auth/signup:20~36`(`createRouteHandlerClient`+`getUser`, authId·email 일치까지 403 검증),
   `/auth/logout`, `/auth/sync-cookies`, `/auth/match-candidates:28`, `/auth/match-link:29`,
   `/auth/blog/request-page-code:50`, `/auth/blog/verify-page:54`, `/auth/demo/request-page-code:50`, `/auth/demo/verify-page:53` — 모두 자체 401.
2. **의도적 공개**: `/auth/me`(비로그인이면 null 반환), `/auth/login-log`.
3. **폐지 스텁**: `/auth/demo/start`(19줄), `/auth/trial`(12줄) — 데모 정책 폐지 후 남은 껍데기.
미들웨어 `SESSION_CHECK_BYPASS`(`:63`)가 `/api/auth/` 를 동시로그인 검증에서 제외한다.
등급(플랜) 검사는 이 그룹 어디에도 없다 — 인증 전 단계이므로 정상. 판정: `OK`.

## `/api/portone/*` — 4개

- `/api/portone/webhook`: `PORTONE_WEBHOOK_SECRET` 기반 Standard Webhooks 서명 검증, 실패 시 400 `Invalid signature`(`:22~39`). 세션 불필요. `OK`.
- `/api/portone/billing/issue:29~45`, `/billing/complete:30`, `/billing/cancel:18`: `createRouteHandlerClient`+`getUser` 로 401,
  `issue` 는 추가로 403(`:45`). 미들웨어 rate limit 은 `/api/portone/` 을 우회시킨다(`:72`).
- 🚨 결제 계열이지만 `/api/portone` 밖에 있는 것: `/api/credits/purchase/{prepare,complete,ncash}` (전부 `createRouteHandlerClient`+`getUser` 401),
  `/api/org/checkout/{prepare,complete}` (`getAuthUser().catch(()=>null)`), `/api/smartstore/verify-order`(`getCookieUser`).
  이들은 rate-limit 우회 목록에 없으므로 전역 IP 캡을 받는다. 판정: `OK`.

## 웹훅

`/api/portone/webhook` 이 유일한 외부 웹훅이다(HMAC 검증). 별도 `/api/webhooks/*` 디렉터리는 존재하지 않는다.

---

# 라우트별 상세

표기 규칙 — 인증: `있음`(핸들러 자체 검사) / `없음` / `미들웨어만`. 등급: 없으면 `없음`.

## `/api/my/*` (39개)

미들웨어가 `/api/my` 전체에 **BLOGGER급 402** 를 건다. 아래 "등급" 열의 `미들웨어만(blogger급)` 은 전부 이 뜻이다.

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/my/dashboard` GET | 있음 `route.ts:28` | 미들웨어만(blogger급) | 없음 | CONFLICT (화면 `/my` 는 influencer, `sidebar-nav.ts:55`) |
| `/api/my/topics` GET | 있음 `:64` | 미들웨어만(blogger급) | 없음 | CONFLICT (화면 `/topics` 는 `requireInfluencerPlusPage`, `src/app/topics/layout.tsx:4`) |
| `/api/my/topics/[id]` GET | 있음 `:35` | 미들웨어만(blogger급) | 없음 | CONFLICT (동일) |
| `/api/my/topics/sync` POST | 있음 `:21` | 미들웨어만(blogger급) | 없음 | CONFLICT (동일) |
| `/api/my/ai-briefing-state` GET,PATCH,DELETE | 있음 `:61` | 미들웨어만(blogger급) | 없음 | CONFLICT (화면 `/my/naver-mate` 는 influencer, `sidebar-nav.ts:53`) |
| `/api/my/ai-briefing-history` GET | 있음 `:25`, restricted 403 `:28` | 미들웨어만(blogger급) | 없음 | CONFLICT (동일) |
| `/api/my/fans` GET | 있음 | `requireInfluencerPlan` `:39` | 없음 | OK |
| `/api/my/fans/history` GET | 있음 | `requireInfluencerPlan` `:11` | 없음 | OK |
| `/api/my/fans/cross-match` GET | 있음 | `requireInfluencerPlan` `:35` | 없음 | OK |
| `/api/my/fans/upload` POST,OPTIONS | 있음 | `requireInfluencerPlan` `:56` | 없음 | OK |
| `/api/my/influencer-center` GET | 있음 | `requireInfluencerPlan` `:11` | 없음 | OK |
| `/api/my/influencer-center/upload` POST,OPTIONS | 있음 | `requireInfluencerPlan` `:47` | 없음 | OK |
| `/api/my/keyword-ranking-state` GET | 있음(래퍼 내부) | `withAnalysisView('rank_analysis')` `:55` | 무료회원 3회/일 (`free-quota.ts:21`) | OK |
| `/api/my/keyword-ranking-state` PUT,PATCH,DELETE | 있음 `:42` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/keyword-ranking/history` GET | 있음 `:17` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/keyword-ranking/refresh-gate` GET,POST | 있음 `:33,:42` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/post-missing-state` GET | 있음(`assertBlogResourceAccess` `:38`) | `withAnalysisView('missing_analysis')` `:34` | 무료회원 3회/일 | OK |
| `/api/my/post-missing-state` POST | 있음 `:99` | 미들웨어만(blogger급) + 소유확인 | 없음 | OK |
| `/api/my/post-missing-history` GET | 있음 `:30` | `assertBlogResourceAccess`(유료 or 본인) | 없음 | OK |
| `/api/my/representative-keywords-state` GET | 있음 `:29` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/my/representative-keywords/audit` GET | 있음 `:25` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/my/representative-keywords/extract` POST | 있음 `:55` | `assertBlogResourceAccess` (미들웨어 402 **면제**, `middleware.ts:146`) | 없음 | OK (면제 사유 주석 존재) |
| `/api/my/representative-keywords/reextract` POST | 있음 `:45` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/my/exposure-accuracy` GET | 있음 `:17` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/my/exposure-label` GET,POST | 있음 `:19,:50,:53` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/my/blog-dashboard-summary` GET | 있음 `:121` | `assertBlogResourceAccess` `:133` | 없음 | OK |
| `/api/my/blog-custom-profile` GET,PUT | 있음 `:15` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/saved-keywords` GET,POST,PATCH,DELETE | 있음 `:15,:114,:152,:201` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/competitors` GET,POST,DELETE | 있음 `:15,:62,:127` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/campaigns` GET | 있음 `:14` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/ad-profile` GET,PATCH | 있음 `:11` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/ad-settlements` GET | 있음 `:11` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/rankings/history` GET | 있음 `:17` (+쿠키 폴백 `:42`) | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/keywords/sync` POST | 있음 `getCookieUser` `:155` | 미들웨어만(blogger급) | 없음 | OK |
| `/api/my/link` POST | 있음 `:11~15` | 미들웨어 402 **면제**(`middleware.ts:144`) — 의도적 | 없음 | OK |
| `/api/my/link-blog` POST | 있음 `:13~17` | 미들웨어 402 **면제** — 의도적 | 없음 | OK |

## `/api/influencers/*` (6개)

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/influencers` GET | 미들웨어만 (401, `middleware.ts:440`) | 미들웨어만(blogger급) `middleware.ts:449~458` | `searchLimiter` IP | **CONFLICT** — 화면은 `requireInfluencerPlusPage` (`src/app/influencers/page.tsx:6`) |
| `/api/influencers/[id]` GET | 미들웨어만 (401) | **없음** | 없음 | **CLIENT_ONLY** — 화면은 `requireInfluencerPlusPage` (`src/app/influencers/[id]/page.tsx:80`) |
| `/api/influencers/list` GET | 있음 `:24~29` | 없음 (로그인만) | 없음 | OK (화면 `/influencers/list` 도 `requireLoginPage`) |
| `/api/influencers/free-plan` GET | 있음 `:26~31` | 없음 (로그인만) | 없음 | OK |
| `/api/influencers/search` GET | 있음 `:25~30` | 없음 (로그인만) | 없음 | OK (계정 연결용 경량 검색) |
| `/api/influencers/recent` GET | 없음 (공개, 인트로용) | 없음 | 상위 10건 고정 `:29` | OK |

## `/api/keywords/*` + 키워드 도구 (16개)

미들웨어가 `/api/keywords*` 전체에 401(로그인)을 건다.

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/keywords` GET | 미들웨어만 | 없음 | `withAnalysisView('keyword_analysis')` `:15` — 무료회원 3회/일 | CONFLICT (사이드바 `/keywords` 는 influencer, `sidebar-nav.ts:76`) |
| `/api/keywords/[id]` GET | 미들웨어만 | **없음** | 없음 | CLIENT_ONLY |
| `/api/keywords/[id]/rankings` GET | 미들웨어만 | **없음** | 없음 | CLIENT_ONLY |
| `/api/keywords/[id]/related` GET | 미들웨어만 | **없음** | 없음 | CLIENT_ONLY |
| `/api/keywords/[id]/trend` GET | 미들웨어만 | **없음** | 없음 | CLIENT_ONLY |
| `/api/keywords/[id]/naver-trend` GET | 미들웨어만 | **없음** | 없음 (외부 DataLab API 호출) | CLIENT_ONLY |
| `/api/keywords/[id]/search-exposure` GET | 있음 `getCookieUser` `:17` | 없음 | 없음 | OK |
| `/api/keywords/batch-top3` GET | 미들웨어만 | **없음** | 키워드 최대 50개 `:18` | CLIENT_ONLY |
| `/api/keywords/blog-top` GET | 미들웨어만 | **없음** | `blogAnalyzeLimiter` IP + 5분 캐시 | CLIENT_ONLY |
| `/api/keywords/stats` GET | 있음 `:26` | 없음 | 없음 | OK |
| `/api/keywords/recommend` GET | 있음 | `requireInfluencerPlan` `:20` | 없음 | OK |
| `/api/keywords/titles` GET | 있음 | `requirePaidPlan` `:18` (**blogger급**) | `consumePaidDailyCap('ai-titles')` 기본 50/일 `:48` + `assertCreditFor('ai_titles')` 2크레딧 | CONFLICT (사이드바 `/dashboard/writing/titles` = influencer, `sidebar-nav.ts:94`) |
| `/api/keywords/content-angles` GET | 있음 | `requireInfluencerPlan` `:18` | `consumePaidDailyCap('ai-angles')` 50/일 `:54` + `ai_content_angles` 4크레딧 | OK |
| `/api/keywords/body` POST | 있음 | `requireInfluencerPlan` `:20` | `consumePaidDailyCap('ai-body')` 50/일 `:70` + `ai_body` 8크레딧 | OK |
| `/api/bulk-search-volume` POST | 있음 | `requireInfluencerPlan` `:50` | `bulk_search_volume` 8크레딧 `:88` | OK |
| `/api/related-keywords` POST | 있음 | `requireInfluencerPlan` `:13` | 없음 | OK |

## `/api/rankings/*`, `/api/iblog-rank/*`, `/api/downloads/*`, `/api/stats*`, `/api/recommendations`

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/rankings/naver-mate` GET | 미들웨어만 (401, `middleware.ts:462`) | 없음 | `withAnalysisView('rank_analysis')` `:9` — 무료회원 3회/일 | OK (무료 3회 정책 명시) |
| `/api/rankings/top` GET | 없음 | 없음 | `withAnalysisView('rank_analysis')` `:8` | UNMAPPED (비로그인은 게이트를 아예 타지 않음, `analysis-quota.ts:47`) |
| `/api/rankings/[blogId]` GET | 없음 | 없음 | 없음 | UNMAPPED (공개 위젯용 RPC) |
| `/api/rankings/search` GET | 없음 | 없음 | 없음 | UNMAPPED |
| `/api/iblog-rank` GET | 있음 | `requireInfluencerPlan` `:14` | 없음 | OK |
| `/api/iblog-rank/my` GET | 있음 `:15` | **없음** | 없음 | UNMAPPED |
| `/api/iblog-rank/keywords` GET,POST,PATCH,DELETE | 있음 | `requireAdmin` `:17,31,82,107` | 없음 | OK |
| `/api/downloads/keywords` GET | 있음 | `requireInfluencerPlan` `:9` (+미들웨어 401) | 없음 | OK |
| `/api/downloads/my-keyword-ranking` GET | 있음 | `requireInfluencerPlan` `:29` | 없음 | CONFLICT (원본 화면 `/my/keyword-ranking` 은 blogger급 + 무료 3회) |
| `/api/discover/influencers` GET | 있음 | `requireInfluencerPlan` `:121` | 없음 | OK |
| `/api/stats` GET | 없음 | 없음 | 5분 캐시 테이블 | OK (랜딩 공개 통계) |
| `/api/stats/yearly` GET | 없음 | 없음 | 없음 | OK (공개 `/stats` 화면) |
| `/api/recommendations` GET | 없음 | 없음 | 100건 상한 `:21` | UNMAPPED |
| `/api/naver-topics` GET | 있음 | `requireInfluencerPlan` `:14` | 없음 | OK |
| `/api/naver-topics/[id]` GET | 있음 | `requireInfluencerPlan` `:24` | 없음 | OK |

## `/api/blog/*` (24개)

`assertBlogResourceAccess` = "유료(BLOGGER 이상)면 **아무 블로그나**, 무료면 본인 블로그만".

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/blog/analyze` GET | 있음(`assertBlogResourceAccess` `:81`) | `assertBlogResourceAccess` | `withAnalysisView('inflow_analysis')` `:70` — 무료회원 3회/일 | OK |
| `/api/blog/posts` GET | 있음 `:25` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/stats` GET | 있음 `:18` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/visitors` GET | 있음 `:20` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/category` GET,POST | 있음 `:61,:114,:122` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/score` GET,POST | 있음 `:36,:84` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/subscription` GET | 있음 `:12` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/rankings/history` GET | 있음 `:20` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/extract-keywords` GET | 있음 `:15` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/representative-keywords` GET,PATCH | 있음 `:36,:122` | `assertBlogResourceAccess` | 없음 | OK |
| `/api/blog/check-missing` POST | 있음 `:59` | `assertBlogResourceAccess` `:139` | `chargeCredit(EXPOSURE_CREDIT_FEATURE, amountOverride)` `:68` — 무료 90개 초과분 1개당 1크레딧(`credit-config.ts:48`) | OK |
| `/api/blog/check-ai-briefing` POST | 있음 `:61` | `assertBlogResourceAccess`(**blogger급**) | 없음 | CONFLICT (화면 `/my/naver-mate` 는 influencer) |
| `/api/blog/ai-citation-estimate` GET | 있음 `:26` | `assertBlogResourceAccess` `:35` | 없음 | CONFLICT (동일 화면) |
| `/api/blog/keywords` GET,POST,DELETE | 있음 `:12` | 본인 블로그만 (`requireOwnBlog` `:10~30`) | 없음 | OK |
| `/api/blog/ai-analyze` POST | 있음 | `requirePaidPlan` `:24` | `ai_blog_analyze` 7크레딧 `:57` | OK |
| `/api/blog/quality-evaluate` POST | 있음 | `requirePaidPlan` `:24` (**blogger급**) | `qualityEvaluateLimiter` IP | CONFLICT (사이드바 `/my/naver-mate/quality-evaluate` = influencer, `sidebar-nav.ts:62`) |
| `/api/blog/text-analyze` POST | 있음 | `requirePaidPlan` `:179` | `dashboardLimiter` IP | OK |
| `/api/blog/plagiarism-check` POST | 있음 | `requirePaidPlan` `:155` | `aiAnalyzeLimiter` IP | OK |
| `/api/blog/topics/[id]` GET | 있음 | `requireInfluencerPlan` `:24` | 없음 | OK |
| `/api/blog/topics/summary` GET | 있음 | `requireInfluencerPlan` `:14` | 없음 | OK |
| `/api/blog/exposure-extend/plan` POST | 있음 `:24` | `assertBlogResourceAccess` `:34` | 없음(견적만) | OK |
| `/api/blog/exposure-extend/authorize` POST | 있음 `:26` | `assertBlogResourceAccess` `:36` | 없음(멱등 승인) | OK |
| `/api/blog/exposure-extend/settle` POST | 있음 `:22` | `assertBlogResourceAccess` `:33` | 실행 시점 차감 | OK |
| `/api/blog-quality/check` POST | 있음 `getAuthUser(...).catch` `:46` | **없음** | 없음 | UNMAPPED |

## `/api/analytics/*` (7개)

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/analytics/lookup-extend/plan` POST | 있음 `:21` | `assertBlogResourceAccess` `:32` | 견적만 | OK |
| `/api/analytics/lookup-extend/authorize` POST | 있음 `:30` | `assertBlogResourceAccess` `:42` | `chargeCredit(getLookupCreditFeature, amountOverride, referenceId)` `:77` | OK |
| `/api/analytics/lookup-extend/settle` POST | 있음 `:27` | `assertBlogResourceAccess` `:40` | 실행 시점 차감 | OK |
| `/api/analytics/track` POST | 선택 `:96,:104` | 없음 | 없음 | OK (방문 로깅) |
| `/api/analytics/duration` POST | **없음** (sendBeacon 이라 헤더 불가, `:10` 주석) | 없음 | `dashboardLimiter` IP + duration 0~3600 캡 + 덮어쓰기 금지 | OK (설계상 무인증, 완화책 명시) |
| `/api/analytics/referrers` GET | 있음 | `requireAdmin` `:38` | 없음 | OK |
| `/api/analytics/stats` GET | 있음 | `requireAdmin` `:8` | 없음 | OK |

## `/api/dashboard/*`, `/api/ai-consultant/*`, `/api/writing/*`, `/api/content/*`, `/api/youtube/*`

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/dashboard/claude/conversations` GET,POST | 있음 `:14,:47` | `getClaudeFeedbackUser` → `plan==='INFLUENCER' && expires>now` (`claude-feedback.ts:109~113`) | 없음 | OK |
| `/api/dashboard/claude/conversations/[id]` PATCH,DELETE | 있음 `:20,:72` | 동일 | 없음 | OK |
| `/api/dashboard/claude/conversations/[id]/messages` GET,POST | 있음 `:34,:79` | 동일 | 무료체험 한도 `:83`(`CLAUDE_FREE_TRIAL_LIMIT`), 메시지 8000자 `claude-feedback.ts:14`, `ai_dashboard_opus` 6크레딧 `:159` | OK |
| `/api/ai-consultant` GET,POST | 있음 `:22,:153` | 없음 (무료 개방) | `requireFeatureAccess('ai_consultant')` `:190`, `isPro`=`hasActivePaidPlanByUserId` `:189` — 무료 3회/일 | OK |
| `/api/ai-consultant/conversations` GET,POST | 있음 `:15,:47` | 없음 | 없음 | OK |
| `/api/ai-consultant/conversations/[id]` PATCH,DELETE | 있음 `:19,:73` | 없음 | 없음 | OK |
| `/api/ai-consultant/conversations/[id]/messages` GET,POST | 있음 `:88,:137` | 없음 | `requireFeatureAccess` `:165` + `isPro` `:164` | OK |
| `/api/ai-consultant/queries/[id]` DELETE | 있음 `:18` | 없음 | 없음 | OK |
| `/api/writing/spellcheck` POST | 있음 | `requirePaidPlan` `:19` | 없음 | OK (사이드바 blogger, `sidebar-nav.ts:59`) |
| `/api/writing/rewrite` POST | 있음 | `requirePaidPlan` `:58` | `ai_rewrite` 4크레딧 `:87` | OK |
| `/api/youtube/stt` POST | 있음 | `requirePaidPlan` `:33` | 없음 | OK (사이드바 blogger, `:101`) |
| `/api/content/youtube/analyze` POST | 있음 | `requireInfluencerPlan` `:27` | `ai_youtube_analyze` 8크레딧 `:52` | OK |
| `/api/content/shortform/analyze` POST | 있음 | `requireInfluencerPlan` `:21` | `consumePaidDailyCap('shortform_analyze', max: 3)` `:26` + `ai_shortform_analyze` 250크레딧 `:63` | OK |

## `/api/google-indexing/*` (17개)

사이드바 `/dashboard/google-indexing` = blogger (`sidebar-nav.ts:108`).

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/google-indexing/summary` GET | 있음 | `requirePaidPlan` `:18` | 없음 | OK |
| `/api/google-indexing/urls` GET,DELETE | 있음 | `requirePaidPlan` `:12,:39` | 없음 | OK |
| `/api/google-indexing/urls/[id]/checks` GET | 있음 | `requirePaidPlan` `:10` | 없음 | OK |
| `/api/google-indexing/urls/[id]/recheck` POST | 있음 | `requirePaidPlan` `:12` | 없음 | OK |
| `/api/google-indexing/urls/[id]/diagnose` POST | 있음 | `requirePaidPlan` `:36` | `ai_seo_diagnose` 4크레딧 `:89` | OK |
| `/api/google-indexing/register` POST | 있음 | `requirePaidPlan` `:15` | 없음 | OK |
| `/api/google-indexing/bulk-register` POST | 있음 | `requirePaidPlan` `:20` | `bulk_index_register` 8크레딧 `:38` | OK |
| `/api/google-indexing/bulk-status` GET | 있음 | `requirePaidPlan` `:9` | 없음 | OK |
| `/api/google-indexing/auto-watch` GET,POST | 있음 | `requirePaidPlan` `:12,:27` | 없음 | OK |
| `/api/google-indexing/oauth/start` GET | 있음 | `requirePaidPlan` `:10` | 없음 | OK |
| `/api/google-indexing/oauth/status` GET | 있음 | `requirePaidPlan` `:9` | 없음 | OK |
| `/api/google-indexing/oauth/sites` GET | 있음 | `requirePaidPlan` `:11` | 없음 | OK |
| `/api/google-indexing/oauth/site` POST | 있음 | `requirePaidPlan` `:15` | 없음 | OK |
| `/api/google-indexing/oauth/match` POST | 있음 | `requirePaidPlan` `:11` | 없음 | OK |
| `/api/google-indexing/oauth/disconnect` POST | 있음 | `requirePaidPlan` `:10` | 없음 | OK |
| `/api/google-indexing/oauth/callback` GET | 있음 `:35` | 없음 (OAuth 리디렉트 수신) | 없음 | OK |
| `/api/google-indexing/sitemap/[userId]` GET | **없음** (`:10~12` 주석: 구글 크롤러용 익명 공개) | 없음 | `googleIndexingSitemapLimiter` IP, 1000건 상한 | UNMAPPED (의도된 공개이나 임의 userId 의 등록 URL 목록이 열림) |

## `/api/credits/*`, `/api/ncash/*`, `/api/subscription`, `/api/coupons/*`, `/api/promo*`, `/api/usage/*`, `/api/org/*`

`/api/subscription/*` 디렉터리는 현재 존재하지 않는다(구독 활성화는 PortOne 계열로 이동).

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/credits/balance` GET | 있음 `:9` | 없음 | 없음 | OK |
| `/api/credits/transactions` GET | 있음 `:19` | 없음 | 없음 | OK |
| `/api/credits/purchase/prepare` POST | 있음 `:24~27` | 없음 | 없음 | OK |
| `/api/credits/purchase/complete` POST | 있음 `:24~27` | 없음 | 없음 | OK |
| `/api/credits/purchase/ncash` POST | 있음 `:27~30` | 없음 | 없음 | OK |
| `/api/ncash/balance` GET | 있음 `:9` | 없음 | 없음 | OK |
| `/api/usage/today` GET | 선택 `:15` | `hasActivePaidPlanByUserId` `:20` (표시용) | 조회만 | OK |
| `/api/coupons/available` GET | 있음 `:12` | 없음 | 없음 | OK |
| `/api/coupons/redeem` POST | 있음 `:19` | 없음 (쿠폰이 플랜 부여) | 없음 | OK |
| `/api/promo` POST | 있음 `:32` | 없음 — 코드가 `subscription_plan` 을 직접 부여 `:87` | 중복 사용 차단 `:52~61` | OK (코드는 `loadPromoCodes()` 서버 상수) |
| `/api/promo/broadcast` GET,POST | 있음 `:12,:51` | `isAdminFromProfile` `:18` | 없음 | OK |
| `/api/org/signup` POST | 있음 `:16` | 없음 | 없음 | OK |
| `/api/org/quote` POST | **없음** | 없음 | 없음 | UNMAPPED (가격 계산만) |
| `/api/org/checkout/prepare` POST | 있음 `:16` | 없음 | 없음 | OK |
| `/api/org/checkout/complete` POST | 있음 `:16` | 없음 | 없음 | OK |
| `/api/org/orders/[orderId]` GET | 있음 `:11` | 없음 | 없음 | OK |
| `/api/org/subscription` GET | 있음 `:13` | 없음 | 없음 | OK |
| `/api/org/invite` GET | **없음** | 없음 | 없음 | UNMAPPED (초대 토큰 조회) |
| `/api/org/invite/accept` POST | 있음 `:15` | 없음 | 없음 | OK |
| `/api/enterprise-inquiry` POST | 선택 `:24` | 없음 | 없음 | OK (문의 접수, RLS INSERT 정책 없음은 의도) |

## `/api/competitor*`, `/api/exposure*`

`/api/exposure/*` 디렉터리는 존재하지 않는다 — 노출 관련은 `/api/blog/check-missing`, `/api/blog/exposure-extend/*`, `/api/my/post-missing-*` 로 흩어져 있다.

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/competitors` GET | 있음 `getCookieUser` `:14` | `getPlanTierByCookieUser` → `tryConsumeCompetitor` (`competitor-quota.ts:31`) | free 는 회원 공용 3회/일, blogger·influencer 무제한 (`competitor-quota.ts:16`) | OK |
| `/api/competitors/changes` GET | 있음 `:17` | 없음 | 없음 | OK |
| `/api/competitor/quota` GET | 있음 `:16` | `getPlanTierByCookieUser` `:21` | 조회만 | OK |

## `/api/chat/*`, `/api/community/*`, `/api/stories/*`, `/api/notices/*`, `/api/messages*`, `/api/notifications/*`

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/chat/messages` GET,POST | 있음 `getCookieUser` `:17,:75` | 없음 | rate limiter | OK |
| `/api/chat/messages/[id]` PATCH,DELETE | 있음 `:22,:89` | 없음 | 없음 | OK |
| `/api/chat/messages/[id]/react` POST | 있음 `:21` | 없음 | 없음 | OK |
| `/api/chat/messages/[id]/report` POST | 있음 `:19` | 없음 | 없음 | OK |
| `/api/chat/read` POST | 있음 `:12` | 없음 | 없음 | OK |
| `/api/chat/unread-count` GET | 있음 `:12` | 없음 | 없음 | OK |
| `/api/chat/upload` POST | 있음 `:38` | 없음 | 없음 | OK |
| `/api/community` GET,POST | 있음 `:75` | `requirePaidPlan` `:72` (POST) | 없음 | OK |
| `/api/community/[id]` GET,DELETE | 있음 `:51,:125` | 없음 | 없음 | OK |
| `/api/community/[id]/comments` POST | 있음 `:24` | 없음 | 없음 | OK |
| `/api/community/[id]/like` POST | 있음 `:19` | 없음 | 없음 | OK |
| `/api/community/[id]/report` POST | 있음 `:19` | 없음 | 없음 | OK |
| `/api/community/[id]/vote` POST | 있음 `:23` | 없음 | 없음 | OK |
| `/api/stories` GET,POST | 있음 `:60` | 없음 | 없음 | OK |
| `/api/stories/[id]` GET / PATCH,DELETE | 있음 `:36,:61` / `requireAdmin` `:85,:130` | 관리자(수정·삭제) | 없음 | OK |
| `/api/stories/[id]/comments` GET,POST | 있음 `:50` | 없음 | 없음 | OK |
| `/api/stories/[id]/comments/[commentId]` DELETE | 있음 `:18` | 없음 | 없음 | OK |
| `/api/stories/[id]/like` POST | 있음 `:17` | 없음 | 없음 | OK |
| `/api/stories/upload` POST | 있음 `:21` | 없음 | 없음 | OK |
| `/api/stories/featured` GET | 없음 | 없음 | 없음 | OK (공개) |
| `/api/notices` GET,POST | 있음 `:64` (POST) | `isAdmin` 계열 | 없음 | OK |
| `/api/notices/[id]` GET / PATCH,DELETE | 선택 `:64` / 있음 `:173,:245` | 관리자 | 없음 | OK |
| `/api/notices/[id]/comments` POST | 있음 `:23` | 없음 | 없음 | OK |
| `/api/notices/[id]/like` GET,POST | 있음 `:121,:125` | 없음 | 없음 | OK |
| `/api/notices/[id]/poll/vote` POST | 선택 `:36` | 없음 | 없음 | OK |
| `/api/notices/banner` GET | 없음 | 없음 | 없음 | OK (공개 배너) |
| `/api/messages` GET,POST | 있음 `:16,:107` | 없음 | 없음 | OK |
| `/api/messages/[id]/read` PATCH | 있음 `:15` | 없음 | 없음 | OK |
| `/api/notifications` GET | 있음 `:18` (+쿠키 `:23`) | 없음 | 없음 | OK |
| `/api/notifications/read` PUT | 있음 `:16,:21` | 없음 | 없음 | OK |
| `/api/notifications/settings` GET,PUT | 있음 `:19,:24` | 없음 | 없음 | OK |
| `/api/notifications/register-push` POST,DELETE | 있음 `:21,:71` | 없음 | 없음 | OK |
| `/api/notifications/create` POST | 있음 — 정적 토큰 `:37` | 관리자 토큰 | 없음 | OK (단 세션 아님) |

## `/api/ad/*` (광고주 포털, 11개)

⚠️ `src/app/ad/` **프런트가 존재하지 않는다** — 화면 없이 API만 살아 있다.

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/ad/search` GET | **없음** | **없음** | `searchLimiter` IP, `limit` 최대 50 `:29` | **CLIENT_ONLY** — `influencers` 테이블 `select('*')` `:41` 를 무인증 공개 |
| `/api/ad/parse-query` GET | **없음** | 없음 | 없음 | UNMAPPED |
| `/api/ad/auth/signup` POST | **없음** — `authId` 를 요청 본문에서 그대로 받아 insert `:35` | 없음 | `authLimiter` IP | **CLIENT_ONLY** (세션 미검증 계정 생성) |
| `/api/ad/auth/me` GET | `getAdvertiserUser` `:7` (미인증이면 null 응답) | 없음 | 없음 | OK |
| `/api/ad/auth/logout` POST | 세션 종료만 | 없음 | 없음 | OK |
| `/api/ad/dashboard` GET | 있음 `:12~13` | advertiser `status==='active'` (`ad-auth.ts:42`) | 없음 | OK |
| `/api/ad/campaigns` GET,POST | 있음 `:15,:75` | 동일 | 없음 | OK |
| `/api/ad/campaigns/[id]` GET,PATCH,DELETE | 있음 `:18,:57,:116` | 동일 | 없음 | OK |
| `/api/ad/campaigns/[id]/applications` GET | 있음 `:16` | 동일 | 없음 | OK |
| `/api/ad/campaigns/[id]/applications/[appId]` PATCH | 있음 `:19` | 동일 | 없음 | OK |
| `/api/ad/ai-chat` POST | 있음 `:23` | 동일 | 없음 | OK |

## `/api/widget/*` (5개)

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/widget/[blogId]` GET | 없음 | 없음 | 없음 | OK (외부 블로그 임베드용 공개 위젯 — 설계상 무인증) |
| `/api/widget/rank/[naverId]` GET | 없음 | 없음 | 없음 | OK (동일) |
| `/api/widget/rank/blogger/[blogId]` GET | 없음 | 없음 | 없음 | OK (동일) |
| `/api/widget/rank/mypage/[naverUrlId]` GET | 없음 | 없음 | 없음 | OK (동일) |
| `/api/widget/top3/[naverId]` GET | 없음 | 없음 | 없음 | OK (동일) |

## 기타 (도구·확장·기타)

| API 라우트 | 인증 체크 | 등급 체크 | 사용량 제한 | 판정 |
| --- | --- | --- | --- | --- |
| `/api/search-volume` GET,OPTIONS | 없음 | 없음 | `checkToolAnonQuota('search-volume', 30)` `:46` — `ANON_DAILY_LIMIT=30` `:7` | OK (공개 도구) |
| `/api/shopping/keywords` GET | 없음 | 없음 | `checkToolAnonQuota('shopping-keywords', 30)` `:182` | OK |
| `/api/ext/keyword-analysis` GET,OPTIONS | 선택 `:183` — 비로그인은 `isAllowedExtClient` 통과 시 허용 | 없음 | `extKeywordAnalysisLimiter` + 비로그인 일일 캡 `:193` | OK (확장 프로그램용) |
| `/api/favorites` GET,POST,PUT,DELETE | 있음 `:13,29,48,70` | 없음 | 없음 | OK |
| `/api/color-palettes` GET,PUT | 있음 `:14` | 없음 | 없음 | OK (사이드바 컬러팔레트는 무료) |
| `/api/profile` GET,PATCH,DELETE | 있음 `:9,:51,:146` | 없음 | 없음 | OK |
| `/api/profile/avatar` POST | 있음 `:19,:23` | 없음 | 없음 | OK |
| `/api/campaigns` GET | 선택 `:63` | 없음 | 없음 | OK |
| `/api/campaigns/[id]/apply` POST,DELETE | 있음 `:16,:107` | 없음 | 없음 | OK |
| `/api/agency/blogs` GET,POST,DELETE | 있음 `getCookieUser` `:26,:78,:190` | `licenses.plan_name` AGENCY + 만료 확인 `:36~41` | 없음 | OK (구 AGENCY 플랜 잔재 — `payment-config.ts` 2티어와 별개 축) |
| `/api/session/register` POST | 있음 `:31~32` | 없음 | 없음 | OK |
| `/api/telemetry/desktop` POST | 있음 `:38` | 없음 | 없음 | OK |
| `/api/desktop-release` GET | 없음 | 없음 | 없음 | OK (공개 배포 메타) |
| `/api/build-info` GET | 없음 | 없음 | 없음 | OK |
| `/api/feedback` POST | **없음** | 없음 | `communityLimiter` IP `:9` | OK (익명 피드백 접수) |
| `/api/tools/convert-image` POST | **없음** | 없음 | 파일 1개/요청 `:20`, MIME 허용목록 `:4` | UNMAPPED (sharp 변환 CPU를 무인증 소비) |
| `/api/smartstore/verify-order` POST | 있음 `getCookieUser` `:23` | 없음 | 없음 | OK |
| `/api/auth/demo/start` GET,POST | 없음 | 없음 | 없음 | OK (폐지 스텁, 19줄) |
| `/api/auth/trial` POST | 없음 | 없음 | 없음 | OK (폐지 스텁, 12줄) |
| `/api/trial/start` POST | 없음 | 없음 | 없음 | OK (폐지 스텁, 13줄) |

---

# CLIENT_ONLY (서버 가드 없음 — 우회 가능)

무료(또는 하위 등급) 사용자가 URL만 알면 직접 호출해 유료 데이터를 받아갈 수 있는 건들.

- **`/api/ad/search`** — `src/app/api/ad/search/route.ts:12` 에 인증/등급 검사가 전혀 없다. `:41` 에서 `supabase.from('influencers').select('*')`,
  `:29` 정렬 기본값 `integrated_top3_count`, `limit` 최대 50, `page` 무제한. `searchLimiter` IP 캡만 존재.
  **누출 데이터**: 인플루언서 전체 프로필 행(팬수·구독자수·TOP3 집계·카테고리·소개·활동상태 등) — `/api/influencers` 가 402 로 막는 바로 그 데이터셋.
  프런트(`src/app/ad/`)가 존재하지 않아 화면 없이 API만 노출돼 있다. 미들웨어 경로 목록에도 `/api/ad` 가 없다(`src/middleware.ts:424~486`).
- **`/api/influencers/[id]`** — `src/app/api/influencers/[id]/route.ts` 전체에 등급 검사 없음. 미들웨어는 401(로그인)만 건다(`src/middleware.ts:435~442`).
  402 게이트는 `pathname === '/api/influencers'` **정확 일치**라 상세는 빠진다(`src/middleware.ts:449`).
  반면 화면은 `await requireInfluencerPlusPage(...)` (`src/app/influencers/[id]/page.tsx:80`).
  **누출 데이터**: 인플루언서 상세 프로필 + `runAliveParticipationQuery` 참여 키워드/순위 (`route.ts:4`). 무료 회원이면 누구나 ID를 바꿔가며 전량 수집 가능.
- **`/api/ad/auth/signup`** — `src/app/api/ad/auth/signup/route.ts:9~35`. `authId` 를 요청 **본문**에서 받아 검증 없이 `advertisers` 에 insert 한다.
  세션 확인이 없어 임의 `auth_id` 로 광고주 레코드를 만들 수 있고, `getAdvertiserUser`(`src/lib/ad-auth.ts:37~42`)는 그 행을 신원으로 인정한다
  (통과 조건은 `status === 'active'` 뿐 — 기본값은 DB 스키마에 달려 있어 코드만으로는 확정 불가).
- **`/api/keywords/[id]`, `/[id]/rankings`, `/[id]/related`, `/[id]/trend`, `/[id]/naver-trend`, `/api/keywords/batch-top3`, `/api/keywords/blog-top`**
  — 7개 모두 라우트 내부에 인증·등급 코드가 없다. 미들웨어 401(로그인)만 통과하면 된다(`src/middleware.ts:424~430`).
  같은 디렉터리의 `/api/keywords`(목록)만 `withAnalysisView('keyword_analysis')` 로 무료 3회를 강제하므로(`src/app/api/keywords/route.ts:15`),
  **목록 대신 상세·순위 엔드포인트를 직접 반복 호출하면 무료 3회 캡이 적용되지 않는다.**
  `/[id]/naver-trend` 와 `/blog-top` 은 외부 유료 API(DataLab·네이버 검색)를 태우므로 비용도 함께 샌다.

# CONFLICT

같은 기능인데 두 곳이 서로 다른 등급을 강제하는 건들. 전부 **화면은 INFLUENCER, API는 BLOGGER** 방향이다
(근본 원인: `getPaywallContext.hasActivePaidPlan` 이 두 티어를 구분하지 않는다 — `src/lib/admin.ts:315`).

- **인플루언서 전체 리스트** — 화면 `requireInfluencerPlusPage` (`src/app/influencers/page.tsx:6`) vs API 미들웨어 `!ctx.hasActivePaidPlan → 402`
  (`src/middleware.ts:449~458`). BLOGGER(₩5,500) 구독자가 INFLUENCER(₩9,900) 전용 리스트를 그대로 받아간다.
  주석은 "유료 인플루언서 플랜 전용"이라고 적혀 있으나(`src/middleware.ts:444`) 코드는 blogger 도 통과시킨다.
- **AI 토픽 큐레이션** — 화면 `requireInfluencerPlusPage` (`src/app/topics/layout.tsx:4`), 데이터 API 중
  `/api/naver-topics`(`:14`)·`/api/naver-topics/[id]`(`:24`)는 `requireInfluencerPlan` 인데
  `/api/my/topics`(`:64`)·`/api/my/topics/[id]`(`:35`)·`/api/my/topics/sync`(`:21`)는 `getAuthUser` + 미들웨어 blogger 402 뿐이다.
- **AI 브리핑 · AI 탭 인용** — 사이드바 `requiredPlan: 'influencer'` (`src/lib/sidebar-nav.ts:53`) vs
  `/api/my/ai-briefing-state:61`, `/api/my/ai-briefing-history:25` (blogger 급 미들웨어),
  `/api/blog/check-ai-briefing:61`, `/api/blog/ai-citation-estimate:35` (`assertBlogResourceAccess` = blogger 급, `src/lib/blog-access.ts:56`).
- **인플루언서 대시보드 `/my`** — 사이드바 `requiredPlan: 'influencer'` (`src/lib/sidebar-nav.ts:55`) vs `/api/my/dashboard:28` + 미들웨어 blogger 402.
- **제목 생성** — 사이드바 `/dashboard/writing/titles` = influencer (`src/lib/sidebar-nav.ts:94`) vs `/api/keywords/titles:18` 의 `requirePaidPlan`(blogger).
  같은 글쓰기 묶음의 글감 찾기(`/api/keywords/content-angles:18`)·본문(`/api/keywords/body:20`)은 `requireInfluencerPlan` 이라 내부적으로도 어긋난다.
- **글 심층피드백** — 사이드바 `/my/naver-mate/quality-evaluate` = influencer (`src/lib/sidebar-nav.ts:62`) vs `/api/blog/quality-evaluate:24` 의 `requirePaidPlan`(blogger).
- **키워드 챌린지** — 사이드바 `/keywords` = influencer (`src/lib/sidebar-nav.ts:76`) vs `/api/keywords:15` 의 `withAnalysisView` (무료회원 3회/일 허용).
  화면 게이트도 미들웨어의 로그인 체크뿐이다(`src/middleware.ts:378~387`) — 세 층이 각각 다른 규칙이다.
- **키워드 순위 다운로드** — 화면 `/my/keyword-ranking` 은 `requireLoginPage`(`src/app/my/keyword-ranking/layout.tsx:6`) + 무료 3회이지만,
  `/api/downloads/my-keyword-ranking:29` 는 `requireInfluencerPlan`. 이 건만 **API가 더 엄격한** 방향이다.

# UNMAPPED

등급 규칙이 코드 어디에도 없는 엔드포인트. (일부는 의도된 공개일 수 있으나 명시적 근거가 코드에 없다.)

- `/api/rankings/top` — `src/app/api/rankings/top/route.ts:8`. `withAnalysisView` 로 감싸져 있으나 `resolveViewer`(`src/lib/analysis-quota.ts:47`)가
  **미로그인은 게이트 자체를 건너뛰게** 되어 있어 비회원에게는 무제한이다.
- `/api/rankings/[blogId]` — `route.ts:7`. 인증·등급 없이 `get_blogger_rank` RPC 결과 반환.
- `/api/rankings/search` — `route.ts:7`. 인증 없이 `search_bloggers_by_name` RPC(부분일치 20건) + 전체 활성 블로거 수 반환.
- `/api/recommendations` — `route.ts:10`. 인증 없이 트렌드 상승 키워드 100건 반환.
- `/api/iblog-rank/my` — `route.ts:15`. `getAuthUser` 401 만 있고 등급 없음. 형제 라우트 `/api/iblog-rank:14` 는 `requireInfluencerPlan` 이라 비대칭.
- `/api/blog-quality/check` — `route.ts:46`. `getAuthUser(...).catch(() => null)` 이라 실패해도 계속 진행하며, 이후 등급 확인 없음.
- `/api/google-indexing/sitemap/[userId]` — `route.ts:10~12`. 익명 공개가 주석으로 명시돼 있으나, UUID만 알면 임의 사용자의 등록 URL 1000건이 열린다.
- `/api/ad/parse-query` — `route.ts:17`. 인증 없음. 파워콘텐츠 95K 키워드 사전 매칭 결과를 그대로 노출.
- `/api/tools/convert-image` — `route.ts:6`. 인증·rate limit 모두 없이 `sharp` 변환을 수행(파일 1개 제한만 존재).
- `/api/org/quote` — `route.ts`. 인증 없이 좌석 견적 계산.
- `/api/org/invite` GET — `route.ts`. 인증 없이 초대 정보 조회(토큰 소지 기반).

---

# 부록: 감사 중 확인된 구조적 사항

1. **`hasActivePaidPlan` 은 티어를 구분하지 않는다** (`src/lib/admin.ts:315`). 미들웨어의 402 게이트 3곳(`:416`, `:455`, `:483`)은 전부 BLOGGER 급이다.
   INFLUENCER 급 강제는 `requireInfluencerPlan`(라우트 21곳) 과 `requireInfluencerPlusPage`(페이지 5곳)에만 있다.
2. **미들웨어의 유료 판정은 지연 시 `true` 로 폴백한다** (`src/middleware.ts:414`, `:453`, `:480`). Supabase 응답이 4초를 넘기면 유료 게이트가 열린다.
   `hasActivePaidPlanByUserId` 는 반대로 fail-secure(`src/lib/admin.ts:322`) — 두 경로의 실패 방향이 다르다.
3. **크레딧 과금은 현재 전부 no-op 이다** — `CREDITS_ENABLED !== 'true'` 이면 `assertCreditFor`/`chargeCreditIfEnabled` 가 즉시 반환한다
   (`src/lib/credit-gate.ts:21,30,53`). 표의 "N크레딧" 항목은 환경변수가 켜지기 전까지 실제 차감이 아니다.
   단 `chargeCredit` 을 직접 부르는 3곳(`/api/blog/check-missing:68`, `/api/analytics/lookup-extend/authorize:77`, 그리고
   `credits.ts` 경유 경로)은 이 스위치를 타지 않는다.
4. **무료 쿼터 RPC 는 장애 시 통과시킨다** (`src/lib/analysis-quota.ts:132,138`, `src/lib/free-quota.ts:76,88`).
   `consume_free_view`/`consume_free_daily_quota` RPC 가 없거나 실패하면 무료 3회 제한이 사실상 무제한이 된다.
5. **`assertBlogResourceAccess` 는 유료 사용자에게 타인 블로그 조회를 허용한다** (`src/lib/blog-access.ts:56`) — 주석에 명시된 의도된 동작이다.
   따라서 `/api/blog/*` 의 "소유 확인"은 무료 사용자에게만 적용된다.
6. **사이드바 감사 로직은 등급이 아니라 `authOnly` 만 검사한다** (`src/middleware.ts:200~220`).
   `requiredPlan` 선언과 실제 서버 게이트의 불일치는 이 감사에 잡히지 않으며, 위 CONFLICT 8건이 그 사각지대다.
