# 화면(page) 접근 권한 감사표

- 기준 커밋 시점: 2026-09-01 · 대상: `src/app` 아래 `page.tsx` **111개** 전부 + 인증/플랜 검사를 수행하는 `layout.tsx`
- 이 문서는 **현재 코드가 실제로 하는 일만** 기록한다. "이 화면은 원래 인플루언서 전용이어야 한다" 같은 당위는 적지 않는다.
- 요금제 티어: FREE(무료) / BLOGGER(예비 인플루언서) / INFLUENCER(인플루언서)

## 읽는 법 — 세 층의 게이트

| 층 | 파일 | 성격 |
|---|---|---|
| ① 사이드바 선언 | `src/lib/sidebar-nav.ts` | **표시 전용**. `authOnly`면 비회원에게 자물쇠(`AppSidebar.tsx:106`), `requiredPlan` 미달이면 자물쇠 + `/subscribe?highlight=…`로 이동(`AppSidebar.tsx:123-136`). 서버 강제력 **없음** |
| ② 미들웨어 | `src/middleware.ts` | `Accept: text/html` 요청에만 동작. 대부분 `!user && !authIndeterminate`(=확정 비회원)일 때만 리다이렉트 |
| ③ 페이지/레이아웃 가드 | 각 `page.tsx` / `layout.tsx` | 서버 컴포넌트에서 `redirect()`. 소프트 내비게이션에도 동작하는 유일한 층 |

### 미들웨어 규칙 요약 (인용은 원문 그대로)

- `AUTH_REQUIRED_PAGE_PREFIXES = ['/community']` (`middleware.ts:84`) → 비회원 `/?memberOnly=1`
- `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:93-108`) — 로그인 여부만 확인, 플랜은 안 봄
- `PUBLIC_KEYWORDS_PATHS = ['/keywords/blogger', '/keywords/blog-ranking']` (`middleware.ts:114`), 그 외 `/keywords*` HTML은 `needsKeywordsLogin` (`middleware.ts:378-387`)
- `PAID_PLAN_GATE_PREFIXES = ['/my','/rankings/influencer','/keywords/bulk','/keywords/recommend','/competitor']` (`middleware.ts:124-130`), 예외 `PAID_PLAN_GATE_EXEMPT = ['/my/link','/my/link-blog','/my/post-analysis','/my/missing-posts','/my/keyword-ranking']` (`middleware.ts:134`)
  - 🚨 **이 게이트는 `ctx.hasActivePaidPlan` 만 본다(`middleware.ts:416`). BLOGGER 구독자와 INFLUENCER 구독자를 구분하지 않는다.**
  - 🚨 **`if (needsPaidPlanGate && user)` 이므로 비로그인 사용자에게는 아예 동작하지 않는다(`middleware.ts:409`).** 비회원 차단은 `MEMBER_ONLY_GATE_PREFIXES`가 따로 커버해야 한다.
- `GATE_HANDLED_ELSEWHERE` (`middleware.ts:183-198`) — 페이지 자체 검사로 처리한다고 선언한 목록

### 페이지 가드 함수 (`src/lib/plan-server-guards.ts`)

| 함수 | 통과 조건 | 위치 |
|---|---|---|
| `requireLoginPage()` | 로그인만 | `plan-server-guards.ts:22` |
| `requireBloggerPlusPage()` | `ctx.hasActivePaidPlan` 또는 관리자 (**BLOGGER·INFLUENCER 모두 통과**) | `plan-server-guards.ts:6` |
| `requireInfluencerPlusPage()` | `ctx.plan === 'INFLUENCER'` 또는 관리자 | `plan-server-guards.ts:33` |

> 참고: `requireBloggerPlusPage`는 코드베이스 어디에서도 **호출되지 않는다**(전수 grep 결과). 같은 효과를 내는 인라인 `getPaywallContext` 검사가 각 페이지에 흩어져 있다.

---

## 대시보드 그룹

| 화면 라우트 | 사이드바 선언 | 미들웨어 게이트 | 페이지 자체 가드 | 클라이언트 게이팅 | 판정 |
|---|---|---|---|---|---|
| `/dashboard` | `authOnly` (`sidebar-nav.ts:50`) | 없음 (`GATE_HANDLED_ELSEWHERE`, `middleware.ts:197`) | 인라인: `getUserWithTimeout` → 로그인 시 `isRestricted`면 `redirect('/subscribe')`, 비로그인 + 세션쿠키 없음이면 `redirect('/?memberOnly=1&redirect=%2Fdashboard')` (`dashboard/page.tsx:24-45`) | 리다이렉트 | 선언=실제 (로그인) |
| `/my/missing-posts` | `authOnly` (`sidebar-nav.ts:51`) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:100`) · `PAID_PLAN_GATE_EXEMPT`로 유료게이트 면제 (`middleware.ts:134`) | 없음 | 없음 (클라이언트 컴포넌트 렌더만) | 선언=실제 (로그인) |
| `/my/keyword-ranking` | `requiredPlan: 'blogger'` + `authOnly` (`sidebar-nav.ts:52`) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:99`) · **유료게이트 면제** (`middleware.ts:134`) | `requireLoginPage('/my/keyword-ranking')` (`my/keyword-ranking/layout.tsx:6`) | 없음 | ⚠️ **CONFLICT** — 메뉴는 BLOGGER 이상인데 실제 강제는 **로그인만** |
| `/my/naver-mate` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:53`) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:97`) + `PAID_PLAN_GATE_PREFIXES('/my')` (`middleware.ts:125`) | 없음 (`my/naver-mate/page.tsx` 7줄, 클라이언트 래퍼) | 없음 | ⚠️ **CONFLICT** — 메뉴는 INFLUENCER인데 **BLOGGER 구독자도 통과** |
| `/my` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:55`) | `PAID_PLAN_GATE_PREFIXES` (`middleware.ts:125`, 로그인 사용자만) · `GATE_HANDLED_ELSEWHERE` (`middleware.ts:184`) | 인라인: 로그인 + `isRestricted`면 `/subscribe` (`my/page.tsx:66-71`), 연결 블로그 없으면 `/profile`·`/my/blogger`로 분기 (`my/page.tsx:102-131`). 비로그인은 `GuestDashboard` 렌더 | 리다이렉트 + 게스트 빈 화면 | ⚠️ **CONFLICT** — INFLUENCER 선언, 실제로는 유료면 아무 티어나 통과 |
| `/topics` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:56`) | 없음 (`GATE_HANDLED_ELSEWHERE`, `middleware.ts:193`) | `requireInfluencerPlusPage('/topics')` (`topics/layout.tsx:4`) | 클라이언트에서도 `/?memberOnly=1` 리다이렉트 (`topics/page.tsx:321,332`) | ✅ 선언=실제 |
| `/my/fans` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:57`) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:98`) + `PAID_PLAN_GATE_PREFIXES` | `requireInfluencerPlusPage('/my/fans')` (`my/fans/layout.tsx:4`) | `/?memberOnly=1` 리다이렉트 (`my/fans/page.tsx:118`) | ✅ 선언=실제 |
| `/dashboard/writing/spellcheck` | `requiredPlan: 'blogger'` + `authOnly` (`sidebar-nav.ts:59`) | 없음 (`GATE_HANDLED_ELSEWHERE`, `middleware.ts:186`) | 인라인: 비로그인은 안내 화면 렌더, 이후 `ctx.isAdminUser \|\| ctx.hasActivePaidPlan` 아니면 `redirect('/subscribe?highlight=blogger')` (`dashboard/writing/spellcheck/page.tsx:35-37`) | 비로그인 시 로그인 안내 화면(리다이렉트 아님) | ✅ 선언=실제 (BLOGGER 이상) |
| `/my/naver-mate/quality-evaluate` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:62`) | `MEMBER_ONLY_GATE_PREFIXES('/my/naver-mate')` + `PAID_PLAN_GATE_PREFIXES('/my')` | 없음 (`my/naver-mate/quality-evaluate/page.tsx` 전체 21줄, 가드 없음) | 없음 | ⚠️ **CONFLICT** — INFLUENCER 선언, BLOGGER 구독자 통과 |

## 네이버 데이터 그룹

| 화면 라우트 | 사이드바 선언 | 미들웨어 게이트 | 페이지 자체 가드 | 클라이언트 게이팅 | 판정 |
|---|---|---|---|---|---|
| `/naver-mate-ranking` | `authOnly` (`sidebar-nav.ts:72`) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:96`) | 없음 (`naver-mate-ranking/page.tsx`, 가드 없음) | 없음 | ✅ 선언=실제 (로그인) |
| `/stats` | 선언 없음 (`sidebar-nav.ts:73`) | 없음 | 없음 (`stats/layout.tsx`는 메타데이터만) | 없음 | 공개 — 선언과 일치 |
| `/keywords` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:76`) | `needsKeywordsLogin` (`middleware.ts:378-387`) — **로그인만** | `keywords/layout.tsx:43-45` 비로그인 `redirect('/?memberOnly=1&redirect=/keywords')` — **로그인만** | `useAuth` → `/?memberOnly=1` (`keywords/page.tsx:80`), 무료 3회 초과 시 402 안내 화면 (`keywords/page.tsx:421`) | 🚨 **CONFLICT(가장 큼)** — INFLUENCER 선언인데 **무료 회원도 그대로 열림**. 유료 강제가 세 층 어디에도 없음 |
| `/keywords/recommend` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:77`) | `needsKeywordsLogin` + `PAID_PLAN_GATE_PREFIXES` (`middleware.ts:128`) | `keywords/layout.tsx:43-45` (로그인만). 페이지 자체 가드 없음 | 없음 | ⚠️ **CONFLICT** — INFLUENCER 선언, **BLOGGER 구독자 통과** |
| `/keywords/blogger` | 선언 없음 = 공개 (`sidebar-nav.ts:78`) | `PUBLIC_KEYWORDS_PATHS`로 **면제** (`middleware.ts:114`) | 🚨 `keywords/layout.tsx:43-45`가 **부모 레이아웃으로 상속되어 비로그인을 전부 리다이렉트** | 없음 | 🚨 **역방향 CONFLICT(과잉 차단)** — 메뉴·메타데이터는 "무료", 미들웨어도 SEO 목적 면제인데 레이아웃이 막는다 |
| `/keywords/bulk` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:79`) | `needsKeywordsLogin` + `PAID_PLAN_GATE_PREFIXES` (`middleware.ts:127`) | `keywords/bulk/layout.tsx:33-35` — `subscription_plan === 'INFLUENCER'` + 만료일 유효 아니면 `redirect('/subscribe?required=influencer')` | 없음 | ✅ 선언=실제 (INFLUENCER) |
| `/influencers/free-plan` | `authOnly` (`sidebar-nav.ts:82`) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:95`) | `requireLoginPage('/influencers/free-plan')` (`influencers/free-plan/layout.tsx:32`) | 없음 | ✅ 선언=실제 (로그인) |
| `/influencers` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:83`) | `pathname === '/influencers'` exact 매칭으로 회원 게이트 (`middleware.ts:393`) | `requireInfluencerPlusPage('/influencers')` (`influencers/page.tsx:6`) | 없음 | ✅ 선언=실제 |

## 콘텐츠 도구 그룹

| 화면 라우트 | 사이드바 선언 | 미들웨어 게이트 | 페이지 자체 가드 | 클라이언트 게이팅 | 판정 |
|---|---|---|---|---|---|
| `/dashboard/writing/content-angles` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:93`) | 없음 (`GATE_HANDLED_ELSEWHERE`, `middleware.ts:188`) | 인라인: 비로그인은 안내 화면, 이후 `users.subscription_plan === 'INFLUENCER'` + 만료 검사 실패 시 `redirect('/subscribe?required=influencer')` (`dashboard/writing/content-angles/page.tsx:33-46`) | 비로그인 시 로그인 안내 화면 | ✅ 선언=실제 |
| `/dashboard/writing/titles` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:94`) | 없음 (`middleware.ts:189`) | 위와 동일 패턴 (`dashboard/writing/titles/page.tsx:46`) | 비로그인 안내 화면 | ✅ 선언=실제 |
| `/dashboard/writing/color-palette` | 선언 없음 (`sidebar-nav.ts:96`) | 없음 | 없음 | 없음 | 공개 — 선언과 일치 |
| `/image-editor` | `authOnly` (`sidebar-nav.ts:97`) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:107`) | 없음 (`image-editor/layout.tsx`는 메타데이터만) | 없음 | ✅ 선언=실제 (로그인) |
| `/dashboard/content/youtube` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:99`) | 없음 (`middleware.ts:195`) | 인라인 INFLUENCER 검사 (`dashboard/content/youtube/page.tsx:46`) | 비로그인 안내 화면 | ✅ 선언=실제 |
| `/dashboard/content/shortform` | `requiredPlan: 'influencer'` + `authOnly` (`sidebar-nav.ts:100`) | 없음 (`middleware.ts:196`) | 인라인 INFLUENCER 검사 (`dashboard/content/shortform/page.tsx:46`) | 비로그인 안내 화면 | ✅ 선언=실제 |
| `/dashboard/youtube-stt` | `requiredPlan: 'blogger'` + `authOnly` (`sidebar-nav.ts:101`) | 없음 (`middleware.ts:191`) | 인라인: 비로그인 `redirect('/?memberOnly=1…')`, `hasActivePaidPlan` 아니면 `redirect('/subscribe?highlight=blogger')` (`dashboard/youtube-stt/page.tsx:19-23`) | 리다이렉트 | ✅ 선언=실제 (BLOGGER 이상) |

## 구글 그룹

| 화면 라우트 | 사이드바 선언 | 미들웨어 게이트 | 페이지 자체 가드 | 클라이언트 게이팅 | 판정 |
|---|---|---|---|---|---|
| `/dashboard/google-indexing` | `requiredPlan: 'blogger'` + `authOnly` (`sidebar-nav.ts:108`) | 없음 (`GATE_HANDLED_ELSEWHERE`, `middleware.ts:194`) | 인라인: 비로그인 `redirect('/?memberOnly=1…')`, `isAdminUser \|\| hasActivePaidPlan` 아니면 `redirect('/subscribe?highlight=blogger')` (`dashboard/google-indexing/page.tsx:18-22`) | 리다이렉트 | ✅ 선언=실제 (BLOGGER 이상) |

## 하단 링크 (SIDEBAR_FOOTER_LINKS)

| 화면 라우트 | 사이드바 선언 | 미들웨어 게이트 | 페이지 자체 가드 | 클라이언트 게이팅 | 판정 |
|---|---|---|---|---|---|
| `/notice` | 선언 없음 (`sidebar-nav.ts:115`) | 없음 | 없음 (`notice/layout.tsx` 메타데이터만) | 없음 | 공개 |
| `/community` | 선언 없음 (`sidebar-nav.ts:116`) | `AUTH_REQUIRED_PAGE_PREFIXES` (`middleware.ts:84`) | 🚨 `community/layout.tsx:39-47` — 비로그인 `/?memberOnly=1`, **`hasActivePaidPlan` 아니면 `redirect('/subscribe?highlight=blogger')`** | 리다이렉트 | ⚠️ **역방향 CONFLICT(과잉 차단)** — 메뉴엔 자물쇠도 없는데 실제로는 **유료 전용** |
| `/stories` | 선언 없음 (`sidebar-nav.ts:117`) | 없음 | 없음 | `useAuth`로 작성 버튼만 분기 | 공개 |
| `/subscribe` | 선언 없음 (`sidebar-nav.ts:118`) | 없음 | 없음 | 없음 | 공개 (의도적 — 결제 안내) |
| `/intro` | 선언 없음 (`sidebar-nav.ts:119`) | 없음 | 없음 | 없음 | 공개 (마케팅/SEO, 의도적) |
| `/enterprise` | 선언 없음 (`sidebar-nav.ts:120`) | 없음 | 없음 | 없음 | 공개 (마케팅, 의도적) |

## 사이드바 미등록 라우트

| 화면 라우트 | 사이드바 선언 | 미들웨어 게이트 | 페이지 자체 가드 | 클라이언트 게이팅 | 판정 |
|---|---|---|---|---|---|
| `/` (홈) | `SIDEBAR_HOME` (`sidebar-nav.ts:37`) | 없음 | 인라인: 로그인 + `isRestricted`면 `redirect('/subscribe')` (`page.tsx:22-29`) | 게스트/회원 분기 자체 처리 + `?memberOnly=1` 모달 핸들러(`MemberOnlyGateQueryHandler.tsx`) | 공개 (의도적) |
| `/auth/login` | (사이드바 없음) | `SESSION_CHECK_BYPASS` | `redirect('/?authModal=login…')` (`auth/login/page.tsx:28`) | 리다이렉트 | 공개 — 홈 모달로 통합됨 |
| `/auth/signup` | (사이드바 없음) | 없음 | `redirect('/?authModal=signup…')` (`auth/signup/page.tsx:26`) | 리다이렉트 | 공개 |
| `/auth/forgot` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 (의도적) |
| `/auth/reset` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 (의도적 — 메일 링크 진입) |
| `/auth/onboard` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 — 의도 불명 (판단 보류) |
| `/blog-quality` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 — 마케팅/SEO로 보임 |
| `/bot-info` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 (크롤러 고지, 의도적) |
| `/guide` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 (이용 안내, 의도적) |
| `/download` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 (앱 다운로드, 의도적) |
| `/privacy` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 (약관, 의도적) |
| `/terms` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 (약관, 의도적) |
| `/decoder` | (사이드바 없음) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:104`) | 없음 | 없음 | 로그인 전용. 단 메타데이터는 "무료"·canonical 지정 → SEO 의도와 어긋남(판단 보류) |
| `/image-converter` | (사이드바 없음) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:106`) | 없음 | 없음 | 로그인 전용 |
| `/competitor` | (사이드바 없음) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:105`) + `PAID_PLAN_GATE_PREFIXES` (`middleware.ts:129`) | `competitor/layout.tsx:17-19` 비로그인 `/?memberOnly=1` | 무료 3회 쿼터 + `업그레이드 →` CTA (`competitor/page.tsx:347-360`) | 유료(아무 티어) 전용. 단 클라이언트는 "하루 3회 무료" UI를 그리므로 **미들웨어와 화면 문구가 서로 다른 정책을 말한다**(판단 보류) |
| `/profile` | (사이드바 없음) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:103`) | 없음 (`profile/layout.tsx` 메타데이터만) | `useAuth` → `/?memberOnly=1` (`profile/page.tsx:80`) | 로그인 전용 |
| `/messages` | (사이드바 없음) | 없음 | `messages/layout.tsx:16-18` 비로그인 `/?memberOnly=1` | 없음 | 로그인 전용 |
| `/dashboard/claude` | (사이드바 없음) | 없음 (`middleware.ts:192`) | `requireInfluencerPlusPage('/dashboard/claude')` (`dashboard/claude/page.tsx:13`) | 리다이렉트 | INFLUENCER 전용 |
| `/dashboard/writing/body` | (사이드바 없음) | 없음 (`middleware.ts:190`) | 인라인 INFLUENCER 검사 (`dashboard/writing/body/page.tsx:46`) | 비로그인 안내 화면 | INFLUENCER 전용 |
| `/dashboard/writing/rewrite` | (사이드바 없음) | 없음 (`middleware.ts:187`) | 인라인 INFLUENCER 검사 (`dashboard/writing/rewrite/page.tsx:46`) | 비로그인 안내 화면 | INFLUENCER 전용 |
| `/dashboard/ai-consultant` | (사이드바 없음) | 없음 | `redirect('/')` 무조건 (`dashboard/ai-consultant/page.tsx:9`) | 리다이렉트 | 폐기됨 |
| `/trial` | (사이드바 없음) | 없음 | `redirect('/')` 무조건 (`trial/page.tsx:9`) | 리다이렉트 | 폐기됨(체험 폐지) |
| `/search-volume` | (사이드바 없음) | 없음 | `redirect('/keywords/blogger')` (`search-volume/page.tsx:8`) | 리다이렉트 | 구 URL 리다이렉트 |
| `/discover/influencers` | (사이드바 없음) | 없음 | `redirect('/influencers?tab=topic')` (`discover/influencers/page.tsx:5`) | 리다이렉트 | 구 URL 리다이렉트 |
| `/campaigns` | (사이드바 없음) | 없음 | `campaigns/layout.tsx:8` `redirect('/')` 무조건 | 리다이렉트 | 개발 중(봉인) |
| `/my/campaigns` | (사이드바 없음) | `PAID_PLAN_GATE_PREFIXES('/my')` | `my/campaigns/layout.tsx:8` `redirect('/my')` 무조건 | 리다이렉트 | 개발 중(봉인) |
| `/my/blogger` | (사이드바 없음) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:101`) + `PAID_PLAN_GATE_PREFIXES` | 없음 (`my/blogger/page.tsx` 7줄) | 없음 | 유료(아무 티어) 전용 |
| `/my/saved-keywords` | (사이드바 없음) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:102`) + `PAID_PLAN_GATE_PREFIXES` | 없음 | 없음 | 유료(아무 티어) 전용 |
| `/my/fans/sync` | (사이드바 없음) | `MEMBER_ONLY_GATE_PREFIXES('/my/fans')` + `PAID_PLAN_GATE_PREFIXES` | `requireInfluencerPlusPage('/my/fans')` (`my/fans/layout.tsx:4`, 상속) | `/?memberOnly=1` (`my/fans/sync/page.tsx:29`) | INFLUENCER 전용 |
| `/my/post-analysis` | (사이드바 없음) | 없음 (`PAID_PLAN_GATE_EXEMPT`, `middleware.ts:134`) | `requireLoginPage('/my/post-analysis')` (`my/post-analysis/layout.tsx:6`) | `useAuth` + 402 시 안내 화면 (`my/post-analysis/page.tsx:80,315`) | 로그인 전용(무료 3회 정책) |
| `/my/link` | (사이드바 없음) | 없음 (`PAID_PLAN_GATE_EXEMPT`, `MEMBER_ONLY` 미포함) | 없음 (`my/link/page.tsx` 10줄) | 없음 (클라이언트에서 API 401 처리) | 🚨 **비로그인도 화면 렌더됨** (데이터 API만 401) |
| `/my/settlements` | (사이드바 없음) | `PAID_PLAN_GATE_PREFIXES` — **로그인 사용자에게만 동작** (`middleware.ts:409`) | 없음 (`my/settlements/page.tsx` 24줄) | 없음 | 🚨 **비로그인 우회 가능** — 어떤 층도 비회원을 막지 않음 |
| `/my/topics/[id]` | (사이드바 없음) | `PAID_PLAN_GATE_PREFIXES` — 로그인 사용자에게만 | 없음 (`my/topics/[id]/page.tsx` 9줄) | 없음 | 🚨 **비로그인 우회 가능** |
| `/topics/naver/[id]` | (사이드바 없음) | 없음 (`GATE_HANDLED_ELSEWHERE '/topics'`) | `requireInfluencerPlusPage('/topics')` (`topics/layout.tsx:4`, 상속) | `/?memberOnly=1` (`topics/naver/[id]/page.tsx:68`) | INFLUENCER 전용 |
| `/rankings` | (사이드바 없음) | 없음 (`PAID_PLAN_GATE`는 `/rankings/influencer`만) | `rankings/layout.tsx:36-38` — INFLUENCER 아니면 `redirect('/subscribe?required=influencer')` | 리다이렉트 | INFLUENCER 전용. 정작 내용은 "제공 중인 랭킹 없음" 안내문 → 과잉 차단(판단 보류) |
| `/rankings/blogger` | (사이드바 없음) | 없음 | `rankings/layout.tsx:36-38` 상속 → INFLUENCER 전용 | 리다이렉트 | ⚠️ 무료 정책 문서상 "블로그 순위"인데 레이아웃이 INFLUENCER로 막음(판단 보류) |
| `/rankings/influencer` | (사이드바 없음) | `MEMBER_ONLY_GATE_PREFIXES` (`middleware.ts:94`) + `PAID_PLAN_GATE_PREFIXES` (`middleware.ts:126`) | `rankings/layout.tsx:36-38` (INFLUENCER) → 통과 후 페이지가 `redirect('/my')` (`rankings/influencer/page.tsx:4`) | 리다이렉트 | 폐기됨. 단 미들웨어 게이트는 "아무 유료", 레이아웃은 INFLUENCER로 **두 층이 서로 다른 티어를 요구** |
| `/influencers/list` | (사이드바 없음) | 없음 (`needsMemberOnlyGate`는 `/influencers` exact만, `middleware.ts:393`) | `requireLoginPage('/influencers/list')` (`influencers/list/layout.tsx:32`) | 없음 | 로그인 전용 |
| `/influencers/[id]` | (사이드바 없음) | 없음 (OG 공개 목적으로 의도적 제외, `middleware.ts:90-91` 주석) | `requireInfluencerPlusPage('/influencers/${id}')` (`influencers/[id]/page.tsx:80`) | 리다이렉트 | ⚠️ 미들웨어 주석은 "OG 공유용 공개 페이지"라고 하는데 페이지 가드는 INFLUENCER 전용 — **주석과 코드가 모순** |
| `/keywords/[id]` | (사이드바 없음) | `needsKeywordsLogin` (`middleware.ts:378-387`) | `keywords/layout.tsx:43-45` (로그인) + `notFound()` (`keywords/[id]/page.tsx:88`) | 없음 | 로그인 전용 |
| `/keywords/blog-ranking` | (사이드바 없음) | `PUBLIC_KEYWORDS_PATHS`로 면제 (`middleware.ts:114`) | `keywords/layout.tsx:43-45`(로그인) 상속 + 페이지: 로그인 상태에서 `hasActivePaidPlan` 아니면 `redirect('/subscribe?highlight=blogger')` (`keywords/blog-ranking/page.tsx:18-21`) | 리다이렉트 | ⚠️ 미들웨어는 "완전 공개 SEO", 레이아웃은 로그인, 페이지는 유료 — **세 층이 전부 다른 정책** |
| `/keywords/hot` | (사이드바 없음) | `needsKeywordsLogin` | `keywords/layout.tsx` 상속 + `redirect('/keywords/blogger')` (`keywords/hot/page.tsx:5`) | 리다이렉트 | 구 URL 리다이렉트 (단 레이아웃 로그인 게이트가 먼저 걸림) |
| `/keywords/hot/[categoryCode]` | (사이드바 없음) | `needsKeywordsLogin` | 위와 동일 (`keywords/hot/[categoryCode]/page.tsx:5`) | 리다이렉트 | 구 URL 리다이렉트 |
| `/community/[id]` | (사이드바 없음) | `AUTH_REQUIRED_PAGE_PREFIXES` (`middleware.ts:84`) | `community/layout.tsx:39-47` 상속 (로그인 + 유료) | 로그인 확인 실패/비로그인 분기 화면 (`community/[id]/page.tsx:70-126`) | 유료(아무 티어) 전용 |
| `/community/write` | (사이드바 없음) | `AUTH_REQUIRED_PAGE_PREFIXES` | `community/layout.tsx:39-47` 상속 | `/?memberOnly=1` (`community/write/page.tsx:41`) | 유료(아무 티어) 전용 |
| `/notice/[id]` | (사이드바 없음) | 없음 | 없음 | `useAuth`로 편집 버튼만 분기 | 공개 |
| `/notice/write` | (사이드바 없음) | 없음 | 없음 | `useAuth` → 비로그인이면 `router.push('/notice')` (`notice/write/page.tsx:33-37`) | 🚨 **서버 가드 전무** — 클라이언트 로그인 확인만. 관리자 확인도 화면단엔 없음(작성 API가 검사) |
| `/notice/[id]/edit` | (사이드바 없음) | 없음 | 없음 | `useAuth` → 비로그인이면 `router.push('/notice')` (`notice/[id]/edit/page.tsx:31-35`) | 🚨 **서버 가드 전무**, 위와 동일 |
| `/stories/[id]` | (사이드바 없음) | 없음 | 없음 | `useAuth` (표시 분기용) | 공개 |
| `/stories/write` | (사이드바 없음) | 없음 | 없음 (`stories/write/layout.tsx` 메타데이터만) | 제출 시점에만 `alert('로그인이 필요합니다')` + `router.push('/login?redirect=…')` (`stories/write/page.tsx:64-65`) | 🚨 서버 가드 없음 + **`/login` 라우트가 존재하지 않아 404로 빠지는 막다른 길** |
| `/enterprise/signup` | (사이드바 없음) | 없음 | 없음 | 클라이언트 폼 (`robots: noindex`) | 공개 (셀프서비스 가입, 의도적) |
| `/enterprise/checkout` | (사이드바 없음) | 없음 | 없음 | 클라이언트에서 세션 확인 | 서버 가드 없음 — 결제는 서버 검증에 의존 |
| `/enterprise/invite` | (사이드바 없음) | 없음 | 없음 | 클라이언트에서 토큰 확인 | 공개 (초대 토큰 링크, 의도적) |
| `/enterprise/manage` | (사이드바 없음) | 없음 | 없음 | 클라이언트: 로그인 확인 실패/비로그인 카드 분기 (`enterprise/manage/ManageClient.tsx:105-132`) | 서버 가드 없음 — 데이터 API 401에 의존 |
| `/orangeconnect` | (사이드바 없음) | 없음 | 없음 (`orangeconnect/layout.tsx:155`는 셸만) | 없음 | 공개 (광고주 포털 랜딩, 별도 인증 체계) |
| `/orangeconnect/login` | (사이드바 없음) | 없음 | 없음 | 없음 | 공개 (의도적) |
| `/orangeconnect/signup` | (사이드바 없음) | 없음 | 없음 | `useAuth` (`orangeconnect/signup/page.tsx:119`) | 공개 (의도적) |
| `/orangeconnect/dashboard` | (사이드바 없음) | 없음 | 없음 | `useAdAuth` → 비로그인 시 "로그인이 필요합니다" 카드 렌더 (`orangeconnect/dashboard/page.tsx:47,80-81`) | 클라이언트 전용 게이팅 |
| `/orangeconnect/search` | (사이드바 없음) | 없음 | 없음 | `useAdAuth` | 클라이언트 전용 게이팅 |
| `/orangeconnect/campaign` | (사이드바 없음) | 없음 | 없음 | `useAdAuth` | 클라이언트 전용 게이팅 |
| `/orangeconnect/campaign/new` | (사이드바 없음) | 없음 | 없음 | `useAdAuth` | 클라이언트 전용 게이팅 |
| `/orangeconnect/campaign/[id]` | (사이드바 없음) | 없음 | 없음 | `useAdAuth` | 클라이언트 전용 게이팅 |
| `/orangeconnect/campaign/[id]/edit` | (사이드바 없음) | 없음 | 없음 | `useAdAuth` | 클라이언트 전용 게이팅 |
| `/admin/*` (17개 화면) | (사이드바 없음, `SIDEBAR_HIDDEN_PREFIXES`에 `/admin` 포함) | 없음 | `admin/layout.tsx:9-48` — `getUserWithTimeout` → `users.is_admin === true \|\| isAdmin(profile.id)` 아니면 `redirect('/')`. 예외적으로 `/admin/judges`는 페이지에서 한 번 더 `notFound()` (`admin/judges/page.tsx:50`) | 리다이렉트 | ✅ 레이아웃 1곳에서 일괄 차단. 하위 17개 페이지는 모두 `'use client'`이며 자체 가드 없음 — 레이아웃 단일 의존 |

> `/admin` 하위 17개 화면: `/admin`, `/admin/analytics`, `/admin/bulk-grant`, `/admin/community`, `/admin/coupons`, `/admin/crawler`, `/admin/desktop-app`, `/admin/enterprise`, `/admin/google-indexing`, `/admin/influencers`, `/admin/judges`, `/admin/members`, `/admin/payments`, `/admin/promo`, `/admin/restricted`, `/admin/stories`, `/admin/trials`

---

## CONFLICT 후보

사이드바가 선언한 티어와 실제 서버 강제가 어긋나는 경우. **아래 모두 "메뉴에는 자물쇠가 있는데 URL로 들어가면 열린다"** 또는 그 반대다.

### A. 메뉴는 INFLUENCER인데 BLOGGER 구독자가 통과 (원인: `PAID_PLAN_GATE_PREFIXES`가 티어를 구분하지 않음)

`middleware.ts:416` 의 `if (!ctx.isAdminUser && !ctx.hasActivePaidPlan)` 는 플랜 종류를 보지 않는다. 아래 화면들은 **월 5,500원 BLOGGER 구독자가 그대로 진입 가능**하다.

- `/my` — `sidebar-nav.ts:55` `requiredPlan: 'influencer'` vs `middleware.ts:125` `'/my'` (페이지 가드 없음, `my/page.tsx:66-71`은 `isRestricted`만 확인)
- `/my/naver-mate` — `sidebar-nav.ts:53` vs `middleware.ts:125`, `my/naver-mate/page.tsx` 전체 7줄에 가드 없음
- `/my/naver-mate/quality-evaluate` — `sidebar-nav.ts:62` vs `middleware.ts:125`, `my/naver-mate/quality-evaluate/page.tsx` 전체 21줄에 가드 없음
- `/keywords/recommend` — `sidebar-nav.ts:77` vs `middleware.ts:128`, `keywords/layout.tsx:43-45`는 로그인만 확인

### B. 메뉴는 BLOGGER 이상인데 **무료 회원**이 통과

- `/my/keyword-ranking` — `sidebar-nav.ts:52` `requiredPlan: 'blogger'` vs 실제로는 `PAID_PLAN_GATE_EXEMPT`(`middleware.ts:134`)로 유료 게이트 면제 + `my/keyword-ranking/layout.tsx:6` `requireLoginPage` = **로그인만**

### C. 메뉴는 INFLUENCER인데 **무료 회원**이 통과 (가장 큰 격차)

- `/keywords` — `sidebar-nav.ts:76` `requiredPlan: 'influencer'` vs
  - 미들웨어: `needsKeywordsLogin` (`middleware.ts:378-387`) = 로그인만
  - 레이아웃: `keywords/layout.tsx:43-45` = 로그인만
  - 페이지: `keywords/page.tsx:80` 클라이언트 `useAuth` 리다이렉트 = 로그인만
  - **세 층 어디에도 유료 확인이 없다.** 데이터는 `withAnalysisView` 무료 3회로만 제한되고(`keywords/page.tsx:421`의 402 처리), 화면 자체는 무료 회원에게 열려 있다.

### D. 역방향 — 메뉴엔 아무 표시 없는데 실제로는 더 강하게 막힘 (사용자가 "왜 막혀?" 하게 되는 쪽)

- `/community` — `sidebar-nav.ts:116`에 `requiredPlan`·`authOnly` 없음(=자물쇠 미표시) vs `community/layout.tsx:44-47` **유료 플랜 필수**
- `/keywords/blogger` — `sidebar-nav.ts:78` 선언 없음 + `middleware.ts:114` `PUBLIC_KEYWORDS_PATHS`로 SEO 목적 면제 vs `keywords/layout.tsx:43-45`가 상속되어 **비로그인 전원 리다이렉트**. 페이지 메타데이터는 "무료로 분석하세요"(`keywords/blogger/page.tsx:6`)
- `/keywords/blog-ranking` — 같은 `PUBLIC_KEYWORDS_PATHS` 면제인데 레이아웃(로그인) + 페이지(유료, `keywords/blog-ranking/page.tsx:18-21`) **3층이 각각 다른 정책**

### E. 층끼리 요구 티어가 다른 경우

- `/rankings/influencer` — 미들웨어는 "아무 유료"(`middleware.ts:126`), 레이아웃은 `subscription_plan === 'INFLUENCER'`(`rankings/layout.tsx:36-38`)
- `/influencers/[id]` — 미들웨어 주석은 "OG 공유용 공개 페이지라 제외"(`middleware.ts:90-91`)인데 페이지는 `requireInfluencerPlusPage`(`influencers/[id]/page.tsx:80`). OG 크롤러가 상세를 못 읽는다
- `/competitor` — 미들웨어는 유료 하드 게이트(`middleware.ts:129`)인데 화면은 "하루 3회 무료(다른 기능과 합산)" 문구를 그린다(`competitor/page.tsx:347`)
- `/rankings/blogger` — 미들웨어 게이트 없음인데 `rankings/layout.tsx:36-38`이 INFLUENCER를 요구

---

## LEAK 후보

사이드바 선언 또는 화면 성격상 보호가 필요한데 **서버측 강제가 어느 층에도 없는** 경우.

> `middleware.ts:215-220`의 `[member-gate-audit]` 자동 점검은 **사이드바에 등록된 `authOnly` href만** 검사한다. 아래는 전부 사이드바 미등록이라 그 감사망에 애초에 잡히지 않는다.

- **`/my/settlements` — 비로그인 접근 차단 없음.** 미들웨어 유료 게이트는 `if (needsPaidPlanGate && user)`(`middleware.ts:409`)라 비로그인엔 미동작, `MEMBER_ONLY_GATE_PREFIXES`에 `/my` 계열 중 이 경로 없음(`middleware.ts:93-108`), 페이지 24줄에 가드 없음(`my/settlements/page.tsx:9-23`). 원고료 정산 화면 껍데기가 비회원에게 렌더된다(데이터는 `AdSettlements` 내부 API 401에 의존).
- **`/my/topics/[id]` — 동일 구조.** `my/topics/[id]/page.tsx:1-9` 전체가 클라이언트 래퍼, 서버 가드 0.
- **`/my/link` — 미들웨어·페이지 모두 게이트 없음.** `PAID_PLAN_GATE_EXEMPT`(`middleware.ts:134`)로 유료 면제이면서 `MEMBER_ONLY_GATE_PREFIXES`에도 없다. `my/link/page.tsx:1-10`에 가드 없음. (계정 연결은 원래 무료 개방이 의도이나, **비로그인 개방까지 의도인지는 불명**)
- **`/notice/write`, `/notice/[id]/edit` — 서버 가드 전무.** 클라이언트 `useEffect` 로그인 확인만 있다(`notice/write/page.tsx:33-37`, `notice/[id]/edit/page.tsx:31-35`). JS를 끄거나 리다이렉트 전에 폼이 렌더된다. 공지 작성은 관리자 기능인데 **화면단에는 관리자 확인 자체가 없다**(작성 API가 검사하는 것으로 보이나 화면 감사 범위 밖).
- **`/stories/write` — 서버 가드 없음 + 막다른 길.** 제출 시점에만 확인하고 `router.push('/login?redirect=/stories/write')`(`stories/write/page.tsx:64-65`)로 보내는데 **`src/app/login` 라우트가 존재하지 않는다**(전체 `page.tsx` 목록에 없음). 비로그인이 글을 다 쓰고 제출하면 404로 떨어지며 작성 내용을 잃는다.
- **`/enterprise/manage` — 서버 가드 없음.** 기업 계정 관리 화면인데 `enterprise/manage/page.tsx:11`은 `<ManageClient />` 렌더뿐이고, 차단은 클라이언트 카드 분기(`ManageClient.tsx:105-132`)에만 있다.
- **`/orangeconnect/*` 6개 화면(dashboard·search·campaign 계열) — 서버 가드 없음.** 전부 `useAdAuth` 클라이언트 훅 결과로 "로그인이 필요합니다" 카드를 그릴 뿐이다(`orangeconnect/dashboard/page.tsx:47,80-81`). 광고주 포털은 Supabase Auth와 별도 체계라 미들웨어가 전혀 관여하지 않는다.

---

## 판단 보류(근거 없음)

코드만으로는 "버그"인지 "의도"인지 결론 낼 수 없어, 오렌지 확인이 필요한 항목.

- **`/decoder`** — `MEMBER_ONLY_GATE_PREFIXES`(`middleware.ts:104`)로 로그인 전용인데, 페이지 메타데이터는 "무료" + `alternates.canonical` 지정(`decoder/page.tsx:5-20`)으로 명백히 SEO 유입을 노린다. 로그인 게이트가 의도인지, canonical만 남은 잔재인지 불명.
- **`/rankings` 허브** — 내용이 "현재 제공 중인 랭킹 기능이 없습니다" 안내문뿐인데(`rankings/page.tsx:8-19`) `rankings/layout.tsx:36-38`이 INFLUENCER를 요구한다. 안내문을 보려고 결제해야 하는 상태가 의도인지 불명.
- **`/rankings/blogger`** — 무료 정책 문서상 "블로그 순위"는 무료 3회 대상으로 읽히는데(`middleware.ts:123` 주석이 `/rankings/blogger`를 유료 게이트에서 **제거**했다고 명시) 정작 `rankings/layout.tsx`가 INFLUENCER로 막는다. 미들웨어에서 뺀 의도가 레이아웃에서 무효화된 것인지, 레이아웃이 정답인지 불명.
- **`/auth/onboard`** — 아무 가드가 없고 사이드바에도 없다. 가입 직후 전용 화면으로 보이나 진입 조건이 코드에 없어 공개가 의도인지 판단 불가.
- **`/keywords/hot`, `/keywords/hot/[categoryCode]`** — 페이지는 단순 `redirect('/keywords/blogger')`(`keywords/hot/page.tsx:5`)인데, 부모 `keywords/layout.tsx:43-45`가 먼저 실행되어 **비로그인은 리다이렉트 목적지에 도달조차 못 한다**. 구 URL 보존이 목적이라면 깨진 상태다.
- **`requireBloggerPlusPage()` 미사용** — `plan-server-guards.ts:6`에 정의되어 있으나 `src/app` 어디서도 호출되지 않는다. 대신 `dashboard/writing/spellcheck/page.tsx:35-37`, `dashboard/youtube-stt/page.tsx:21-23`, `dashboard/google-indexing/page.tsx:20-22`, `community/layout.tsx:44-46`, `keywords/blog-ranking/page.tsx:19-21` 5곳이 같은 로직을 각자 복사해 갖고 있다. 통합 대상인지 확인 필요.
- **INFLUENCER 판정 방식이 2종** — `requireInfluencerPlusPage`는 `getPaywallContext(...).plan === 'INFLUENCER'`(`plan-server-guards.ts:43`)를 쓰고, `rankings/layout.tsx:28-34`·`keywords/bulk/layout.tsx:28-31`·`dashboard/writing/*/page.tsx:41-45`는 `users` 테이블을 직접 읽어 `subscription_plan === 'INFLUENCER' && expires > now`를 계산한다. 두 판정이 항상 같은 결과인지(특히 기업 좌석·쿠폰 부여 계정에서) 검증되지 않았다.
