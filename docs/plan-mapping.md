# 무료·유료 매핑표

> 지시서 v2.1 §5 (Phase 2) 산출물 · v2.2 / v2.3 확정 반영.
> **안내 정본** = `docs/plan-spec-source.md` (`de4ead69` 재추출본, Phase 1.5)
> **코드 정본** = `src/lib/plans.ts` + 각 page/layout 의 `checkFeaturePage` + 각 route 의 `requireFeature`
> 측정일: 2026-09-01 / HEAD `26c5c005`

## 판정 요약

| 판정 | 건수 | 항목 |
|---|---|---|
| MATCH | 18 | 아래 §2 표 참조 |
| **LEAK** | 1 | 전체 인플루언서 리스트 |
| **CLIENT_ONLY** | 1 | 포스팅 데이터 다운로드 |
| **OVERLOCK** | 1 | MY 블로그 (`/dashboard`) |
| **LIMIT_MISMATCH** | 1 | 동시 로그인 기기 (1대 안내 / 3대 코드) |
| **고지 초과** (v2.1 분류에 없던 형태) | 1 | 블로거 순위 — 제품이 스스로 「개발 중」이라고 표시 |
| UNSPECIFIED | 11 + 한도 4 | §3 전수 목록 |

**가장 큰 발견은 표의 어느 한 칸이 아니라 표 밖에 있다.**
`plans.ts` 에 등록된 유료 기능은 22건인데, 이용권 페이지가 이름을 적은 것은 **11건**이다.
정확히 절반이 「돈을 받지만 판매 페이지에서 언급되지 않는」 상태다(§3-A).

---

## 1. 측정 방법과 한계 (먼저 읽을 것)

| | |
|---|---|
| 방법 | 정적 분석. 라우트·가드·상수를 코드에서 직접 읽어 대조했다 |
| **하지 못한 것** | **실계정 세션(무료 / 예비 인플루언서 / 인플루언서)으로 HTTP 를 실제로 쏘아 보지 못했다.** 지시서 §5.3 「우회 실측」은 **호출 결과가 아니라 가드 코드 경로 추적**으로 대신했다 |
| 왜 | 이 작업에는 3개 등급의 실계정·세션이 없다. 과거에도 무료 회원 403 은 미들웨어 401 이 먼저 떠서 검증되지 못했다 |
| 결론 | §4 의 우회 항목은 **「코드상 이렇게 열려 있다」**까지가 근거다. 「실제로 200 이 떨어지는 것을 봤다」로 읽지 말 것 |

---

## 2. 매핑표 — 이용권 페이지가 이름을 적은 항목

열은 지시서 v2.1 §5.2 의 11열이다. 지면상 「안내」/「코드」로 묶어 표기한다.

### 2-A. 계정 정책

| 새 통일명 | 새 카테고리 | 종류 | 안내 등급 | 안내 한도 | 코드 등급 | 코드 한도 | 클라 차단 | 서버 차단 | 근거 위치 | 판정 |
|---|---|---|---|---|---|---|---|---|---|---|
| 동시 로그인 기기 | — (기능 아님) | 정책 | 전 플랜 | **1대** | 전 플랜 | **3대** | – | 미들웨어 `verifySession` | `plan-spec-source.md` §B / `src/lib/session-limit.ts:18` | **LIMIT_MISMATCH** |

🚨 **이것만은 「안내값으로 코드를 고친다」가 오답이다.**
`session-limit.ts:5~12` 에 이유가 남아 있다 — 1대 정책은 웹·모바일·데스크톱·확장이 서로 세션을 밀어내
「다른 PC 에서 로그인하면 기존 기기가 강제 로그아웃되는」 사고를 냈고, 2026-08-12 에 **의도적으로 3대로 올렸다**.
코드를 1대로 되돌리면 그 사고가 재발한다. **고쳐야 하는 쪽은 이용권 페이지 문구(1대 → 3대)다.**

### 2-B. 분석 > 내 블로그

| 새 통일명 | 종류 | 안내 등급 | 안내 한도 | 코드 등급 | 코드 한도 | 클라 차단 | 서버 차단 | 근거 위치 | 판정 |
|---|---|---|---|---|---|---|---|---|---|
| **MY 블로그** `/dashboard` | 메뉴 | **무료 ✓✓✓** | 없음 | 화면=로그인만 / **데이터=유료(BLOGGER↑)** | 없음 | – | 미들웨어 `/api/my` 유료 게이트 → **402** | `middleware.ts:130~145, 440~453` · `BlogDashboardKpiBar` | **OVERLOCK** |
| **MY 포스팅 분석** `/my/post-analysis` | 메뉴 | 무료 「기본 분석만」 / 예비 ✓ / 인플 ✓ | 기본분석 비회원3·회원10 | 기본=로그인 / AI·표절·문장=**BLOGGER↑** | 동일 | – | `requireLoginPage` + `requirePaidPlan` + `withAnalysisView` | `my/post-analysis/layout.tsx` · `api/blog/{analyze,ai-analyze,plagiarism-check,text-analyze}` | MATCH ⚠ |
| **MY 키워드순위** `/my/keyword-ranking` | 메뉴 | – / ✓ / ✓ | 없음 | BLOGGER | 없음 | 사이드바 자물쇠 | `checkFeaturePage` + 미들웨어 유료 게이트 | `plans.ts` `my.keyword-ranking` · `my/keyword-ranking/layout.tsx:7` | MATCH |
| **포스팅 데이터 내려받기** | **액션** | 인플루언서만 | **1회 500건** | 없음(서버 API 부재) | 클라 루프 500 | `canDownload` 로 버튼 숨김 | **없음** | `my/post-analysis/page.tsx:36,47` · `csv.ts:46` | **CLIENT_ONLY** |

🔴 **OVERLOCK 상세.** `/dashboard` 는 무료 카드 첫 줄이자 비교표 `MY 블로그 ✓ ✓ ✓` 인데,
화면이 KPI 를 채우는 `/api/my/blog-dashboard-summary` · `/api/my/blog-custom-profile` ·
`/api/my/keyword-ranking-state` 가 전부 미들웨어의 `/api/my` 유료 게이트 아래에 있다.
예외로 열린 것은 `/api/my/link` · `/api/my/link-blog` · `/api/my/post-missing-state` ·
`/api/my/post-missing-history` **4개뿐**이다. 즉 **무료 회원은 화면은 열리는데 KPI 가 402 로 비는** 모양이다.
(`/api/blog/stats` · `visitors` · `score` 는 열려 있어 화면이 통째로 비지는 않는다 — 그래서 지금까지 안 드러났다.)

🔴 **CLIENT_ONLY 상세.** 포스팅 데이터 다운로드에는 **서버 API 가 아예 없다.** 화면이 이미 받아 둔 행으로
브라우저에서 CSV 를 만든다(`rowsToCsv` → `downloadCsvInBrowser`). 등급 판정은 `canDownload =
user.isAdmin || user.subscriptionPlan === 'INFLUENCER'` 한 줄, 500건 상한은
`if (rows.length >= DOWNLOAD_ROW_LIMIT) break` 클라 루프다. 원본 `/api/blog/posts` 는 **본인 블로그인지만**
확인하고 등급을 보지 않는다. 버튼이 숨겨질 뿐 데이터는 이미 브라우저에 있다.

> ⚠️ **`docs/category-proposal.md` §2-D 정정.** 거기서 이 기능의 API 를 `/api/downloads/my-keyword-ranking`
> 이라 적었는데 **틀렸다**. 그것은 MY 키워드순위 전체 리포트다. 따라서 §2-D 의 「둘 다 등급·한도가 이미
> 판매 문구와 일치한다」는 문장도 **절반만 맞다** — 키워드 쪽만 맞고 포스팅 쪽은 서버 차단이 없다.

### 2-C. 분석 > 인플루언서

| 새 통일명 | 종류 | 안내 등급 | 코드 등급 (화면) | 코드 등급 (API) | 서버 차단 | 근거 위치 | 판정 |
|---|---|---|---|---|---|---|---|
| **인플루언서 순위** `/influencers` | 메뉴 | – / – / **✓** | INFLUENCER | **BLOGGER** | `requireFeature('competitor.analysis')` | `influencers/page.tsx:7` vs `api/influencers/route.ts:25` | **LEAK** |
| **인플루언서 명단** `/influencers/free-plan` | 메뉴 | 무료 ✓✓✓ | FREE(로그인) | 로그인 | 미들웨어 MEMBER_ONLY + 라우트 자체 체크 | `middleware.ts:95` · `api/influencers/free-plan` | MATCH |
| **선정 현황** `/stats` | 메뉴 | 무료 ✓✓✓ | 없음(공개) | 없음 | – | `stats/layout.tsx` (metadata 뿐) | MATCH |
| **네이버 메이트** `/naver-mate-ranking` | 메뉴 | 무료 (카드) | FREE(로그인) | 로그인만 | 미들웨어 MEMBER_ONLY | `plans.ts` `rankings.naver-mate` · `middleware.ts:435~439` | MATCH |
| **블로거 순위** `/rankings/blogger` | 메뉴 | 무료 (카드·FAQ·JSON-LD) | 없음(공개) | 없음 | – | `rankings/blogger/page.tsx` | **고지 초과** |

🔴 **LEAK 상세.** 화면 `/influencers` 는 `influencers.list`(INFLUENCER)로 잠겨 있지만, 그 화면이 부르는
데이터 API `/api/influencers` 는 `competitor.analysis`(**BLOGGER**)로 잠겨 있다.
**예비 인플루언서 계정이 `/api/influencers?limit=2000` 을 직접 부르면 전체 리스트가 그대로 나온다.**
(상한은 `route.ts:32` 의 `Math.min(2000, …)` 이다. 초안에 200 으로 적었던 것은 과소 기술이었다.)
`plans.ts:135~136` 에 「경쟁자 분석이 같은 API 를 쓰므로 서버 가드는 둘 중 낮은 BLOGGER 로 두고 상세
화면만 INFLUENCER 로 막는다」고 의도가 적혀 있다. 의도는 기록돼 있으나 **이용권 페이지가 인플루언서
전용이라고 파는 것과는 어긋난다.** 봉합하려면 경쟁자 분석용 API 를 분리해야 한다.

✅ **2026-09-01 해소**(`e71829f1`). 검색 전용 `/api/influencers/search` 가 이미 있었는데 경쟁자 분석이
옮겨 타지 않고 있었다. `CompetitorDashboard.tsx:91` 을 그쪽으로 돌리고 `/api/influencers` 는
`influencers.list`(INFLUENCER)로 되돌렸다.

🔴 **고지 초과 상세 — v2.1 판정 분류에 없던 형태다.**
「블로거 순위」는 무료 카드(`SubscribeClient.tsx:249`)·FAQ(`faq-data.ts:28`)·구조화 데이터
(`layout.tsx:184`) **세 곳에서 제공 기능으로 안내된다.** 그런데 실제 화면은:

- `/rankings/blogger` 본문에 **「개발 중」 배지**가 박혀 있다
- 상위 허브 `/rankings` 는 「**현재 제공 중인 랭킹 기능이 없습니다**」라고 말한다
- 사이드바 어디에도 없다 (`sidebar-nav.ts` 에 항목 없음)
- 페이지 제목은 「블로그 순위」인데 이용권은 「블로거 순위」라 **이름도 다르다**

이건 등급 불일치가 아니라 **판매 문구가 제품보다 앞서 있는 것**이다. LEAK/OVERLOCK 어디에도
들어가지 않아 별도 판정으로 세운다. `docs/category-proposal.md` §2-E 는 `/rankings/blogger` 를
「껍데기」로 분류해 카테고리 축에서 뺐는데, **그 판단은 맞지만 이용권 페이지가 이를 반영하지 않았다.**

### 2-D. 분석 > 키워드

| 새 통일명 | 종류 | 안내 등급 | 안내 한도 | 코드 등급 | 코드 한도 | 서버 차단 | 근거 위치 | 판정 |
|---|---|---|---|---|---|---|---|---|
| **키워드 검색** `/keywords/blogger` | 메뉴 | 무료 ✓✓✓ | 「회원이면 제한 없이」 | FREE (익명 허용) | **비회원 30회/일** | `checkToolAnonQuota` | `plans.ts` `keywords.blogger-search` · `api/search-volume/route.ts:7,46` | MATCH (한도 UNSPECIFIED) |
| **키워드 검색순위** `/keywords/blog-ranking` | 메뉴 | – / ✓ / ✓ | 없음 | BLOGGER | 없음 | 화면·API 양쪽 `keywords.blog-ranking` | `keywords/blog-ranking/page.tsx:14` · `api/keywords/blog-top/route.ts:207` | MATCH |
| **키워드 챌린지** `/keywords` | 메뉴 | – / – / ✓ | 없음 | INFLUENCER | 없음 | 화면 + API 7개 전부 | `keywords/page.tsx:6` · `api/keywords/[id]/*` | MATCH |
| **키워드 데이터 내려받기** | **액션** | 인플루언서만 | 1회 500건 | INFLUENCER | **서버 `.limit(500)`** | `requireFeature('keywords.challenge')` | `api/downloads/keywords/route.ts:9,21` | MATCH |

비회원 30회(`tool_anon_quota`)는 이용권 페이지에 없다. v1.1 감사에서 **「도구별 30회는 합치지 않는다」로
이미 확정**된 사항이라 여기서 되돌리지 않고 §3-B 에 UNSPECIFIED 로 적재만 한다.

### 2-E. 작성

| 새 통일명 | 종류 | 안내 등급 | 코드 등급 | 코드 한도 | 서버 차단 | 근거 위치 | 판정 |
|---|---|---|---|---|---|---|---|
| **키워드 추천** `/keywords/recommend` | 메뉴 | – / – / ✓ *(비교표만)* | INFLUENCER | 없음 | `requireFeature('keywords.recommend')` | `keywords/recommend/page.tsx:30` · `api/keywords/recommend` | MATCH |
| **글감 찾기** `/dashboard/writing/content-angles` | 메뉴 | – / – / ✓ *(비교표만)* | INFLUENCER | **paid-daily-cap 50** | `requireFeature('writing.content-angles')` | `plans.ts` · `api/keywords/content-angles` | MATCH (한도 UNSPECIFIED) |
| **제목 생성** `/dashboard/writing/titles` | 메뉴 | – / – / ✓ | INFLUENCER | **paid-daily-cap 50** | `requireFeature('writing.titles')` | `api/keywords/titles` · `free-quota.ts:132` | MATCH (한도 UNSPECIFIED) |
| **맞춤법 검사** `/dashboard/writing/spellcheck` | 메뉴 | – / ✓ / ✓ *(데모 제외)* | BLOGGER | 없음 | `requireFeature('writing.spellcheck')` | `api/writing/spellcheck` | MATCH + **데모 UNSPECIFIED** |
| **글 피드백 (AI)** `/dashboard/claude` | 메뉴 | – / – / ✓ *(데모 제외)* | INFLUENCER | **무료 체험 3회** | `getClaudeFeedbackUser` (자체 판정) | `claude-feedback.ts:49,105~109` | MATCH |
| **릴스·쇼츠 분석** `/dashboard/content/shortform` | 메뉴 | – / – / ✓ *(비교표만)* | INFLUENCER | paid-daily-cap 50 | `requireFeature('content.shortform')` | `api/content/shortform/analyze` | MATCH |

🚨 **§9-11 「데모 제외」의 데모 — 절반만 실체가 있다.**
- **블로그 글 피드백**: 실체 **있다**. `CLAUDE_FREE_TRIAL_LIMIT = 3` (`claude-feedback.ts:49`) —
  인플루언서 플랜이 아니어도 3회까지 대화할 수 있고, 「데모 제외」는 그 3회를 가리킨다.
- **맞춤법 검사**: 실체 **없다**. spellcheck 경로 어디에도 체험 카운터가 없다.
  `spellcheck/page.tsx:12` 의 주석 「데모 체험 제외, 가입 회원 전용」이 전부이고,
  화면·API 모두 `writing.spellcheck`(BLOGGER)로만 판정한다. **살 사람이 「데모로 먼저 써 볼 수 있나」를
  물으면 답이 없다.** → §9-11 은 이 항목에서 **미해소로 확정**한다.

또한 **글 피드백만 `requireFeature` 를 쓰지 않는다.** API 3개(`/api/dashboard/claude/conversations*`)가
`getClaudeFeedbackUser` 로 자체 판정한다. 결과 등급은 같지만 **게이팅 정본(`plans.ts`) 바깥에 있어
`plans.ts` 를 고쳐도 이 기능만 안 따라온다.**

### 2-F. 관리 · 기타

| 새 통일명 | 종류 | 안내 등급 | 코드 등급 | 코드 한도 | 서버 차단 | 근거 위치 | 판정 |
|---|---|---|---|---|---|---|---|
| **노출 현황** `/my/missing-posts` | 메뉴 | 무료 (카드) | FREE(로그인) | 없음 | 미들웨어 MEMBER_ONLY, 유료 게이트에서 **명시 예외** | `middleware.ts:136~141` | MATCH |
| **경쟁자 분석** `/competitor` | 메뉴 | – / 무제한 / 무제한 | BLOGGER | 없음 (`PLAN_QUOTA` 가 FREE 에만 쿼터) | `checkFeaturePage` + `requireFeature` | `competitor/layout.tsx:11` · `plans.ts` | MATCH |
| **커뮤니티** `/community` | 메뉴 | ✓ ✓ ✓ | FREE(공개) | 없음 | – | `plans.ts` `community.read` | MATCH |
| **N인플 AI 대화** `/` | 메뉴 | 무료 · 비회원 3 / 회원 10 (매일) | FREE (익명 허용) | **3 / 10** | `free-quota.ts` | `free-quota.ts:23~24` | MATCH |
| **블로그 기본 분석** (= MY 포스팅 분석 무료칸) | 액션 | 비회원 3 / 회원 10 (매일) | 로그인 | 화면조회(view token) 단위 | `withAnalysisView` | `api/blog/analyze` · `analysis-quota.ts` | MATCH |

---

## 3. UNSPECIFIED 전수 목록 (지시서 §5.4 → §9-16 적재)

### 3-A. 🔴 코드는 돈을 받는데 이용권 페이지가 이름조차 적지 않은 기능 — **11건**

`plans.ts` 의 유료(BLOGGER·INFLUENCER) 기능은 **22건**. 그중 이용권 페이지가 이름을 적은 것은 **11건**.
**나머지 11건, 정확히 절반이 아래다.**

| 기능 (`plans.ts` 키) | 코드 등급 | 라우트 | 개인 안내 | 기업 카드 |
|---|---|---|---|---|
| AI 브리핑 · AI 탭 인용 `my.naver-mate` | INFLUENCER | `/my/naver-mate` | 없음 | PRO 「AI 브리핑 · AI 탭 인용」 |
| 인플루언서 대시보드 `my.dashboard` | INFLUENCER | `/my` | 없음 | PRO 「내 대시보드」 |
| 토픽 `topics.browse` | INFLUENCER | `/topics` | 없음 | PRO 「토픽」 |
| 내 토픽 `topics.mine` | INFLUENCER | `/topics` (API) | 없음 | PRO 「토픽」 |
| 맞팬 관리 `my.fans` | INFLUENCER | `/my/fans` | 없음 | PRO 「맞팬 관리」 |
| 글 심층피드백 `blog.quality-evaluate` | INFLUENCER | `/my/naver-mate/quality-evaluate` | 없음 | PRO 「글 심층피드백」 |
| 대량 키워드 조회 `keywords.bulk` | INFLUENCER | `/keywords/bulk` | 없음 | PRO 「대량 조회」 |
| 인플루언서 상세 `influencers.detail` | INFLUENCER | `/influencers/[id]` | 없음 | — |
| 롱폼 분석 `content.youtube` | INFLUENCER | `/dashboard/content/youtube` | 없음 | — |
| 유튜브 음원 추출 `content.youtube-stt` | **BLOGGER** | `/dashboard/youtube-stt` | 없음 | BASIC 「유튜브 음원 추출」 |
| Google 색인 관리 `google.indexing` | **BLOGGER** | `/dashboard/google-indexing` | 없음 | BASIC 「Google 색인 관리」 |

🚨 **이 표가 §A-2 의 「기업 카드 명칭 체계가 개인과 단절」 문제의 진짜 정체다.**
기업 카드가 개인과 다른 이름을 쓰는 게 아니라, **개인 카드가 이 기능들을 아예 안 판다.**
7건은 기업 카드에만 이름이 있고, 개인 이용권 페이지에는 한 줄도 없다.
예비 인플루언서(5,500원)를 사면 Google 색인 관리와 유튜브 음원 추출이 실제로 열리는데,
**산 사람은 자기가 그걸 샀다는 사실을 이용권 페이지에서 알 방법이 없다.**

이는 Phase 0 의 「메뉴 없는 유료 4건」과 **방향이 반대**다.
- 메뉴 없는 4건 = 산 사람이 **가는 길**을 못 찾는 문제
- 위 11건 = 살 사람이 **뭘 사는지** 모르는 문제

### 3-B. 안내에 없는 한도 — 4건

| 한도 | 값 | 정의 위치 | 적용 대상 |
|---|---|---|---|
| 유료 AI 일일 상한 | 50회/일 | `free-quota.ts:132` `PAID_AI_DAILY_CAP` | 글감 찾기 · 제목 생성 · 릴스·쇼츠 분석 |
| 도구별 비회원 한도 | 30회/일 | `api/search-volume/route.ts:7` | 키워드 검색 (v1.1 에서 「합치지 않음」 확정) |
| 글 피드백 무료 체험 | 3회 | `claude-feedback.ts:49` | `/dashboard/claude` — 「데모 제외」의 실체 |
| 다운로드 행수 | 500 | `csv.ts:46` | 「1회 500건」의 **1회 = 요청 1건**. 일일 횟수 제한은 **없다** |

→ **§9-10 「1회 500건」의 1회 단위 확정**: 요청 1건당 500행이고, 하루 몇 번 받을 수 있는지는
코드에도 안내에도 제한이 없다. 즉 **연속 호출로 사실상 무제한**이다.

### 3-C. 안내에도 `plans.ts` 에도 없는 라우트

`/keywords/hot` · `/blog-quality` · `/dashboard/writing/body` · `/dashboard/writing/rewrite` ·
`/image-converter` · `/my/saved-keywords` · `/my/blogger` · `/influencers/list` · `/decoder` ·
`/dashboard/writing/color-palette` · `/profile`

Phase 1 §4-2 에서 편입 여부를 보류한 것들이다. **현행 유지**하고 여기 목록으로만 남긴다.

---

## 4. 우회 점검 (지시서 §5.3 — 정적 분석)

> ⚠️ 아래는 **코드 경로 추적 결과**다. 실제 HTTP 호출로 확인하지 않았다(§1).

| 점검 항목 | 결과 |
|---|---|
| 낮은 등급 세션으로 유료 API 가 열리는가 | **열린다 1건.** 예비 인플루언서 → `/api/influencers` (전체 인플루언서 리스트). §2-C LEAK |
| 비로그인이 통과하는 API | `/api/rankings/top`(블로거 순위, 한도 없음) · `/api/search-volume`(30회) · `/api/influencers/recent`. 셋 다 무료 안내 범위이거나 그보다 더 열려 있어 **누출은 아니다** |
| 화면에 자물쇠만 있고 데이터는 열린 라우트 | **1건.** `/influencers` — 화면 INFLUENCER, API BLOGGER |
| 액션형 다운로드가 서버에서 막히는가 | 키워드 데이터 ✅ (`requireFeature` + 서버 `.limit(500)`) / 포스팅 데이터 ❌ (**서버 API 자체가 없음**, §2-B CLIENT_ONLY) |
| 한도 초과 시 응답 | AI·기본 분석 = `withAnalysisView` 가 초과 정보를 응답에 실어 화면이 `readQuotaExceeded` 로 안내 / 등급 부족 = `requireFeature` 가 **403** + `featureLocked: true` / 미들웨어 유료 게이트 = **402** |
| 등급이 `plans.ts` 밖에서 정해지는 기능 | **3계열.** ① 글 피드백(`getClaudeFeedbackUser`) ② MY 포스팅 분석의 AI·표절·문장 분석(`requirePaidPlan`) ③ `/api/my` 전반(미들웨어 `getPaywallContext`). `plans.ts` 를 단일 소스라고 부르기엔 아직 셋이 밖에 있다 |

---

## 5. 이 매핑이 다른 문서에 요구하는 정정

| 문서 | 위치 | 정정 내용 |
|---|---|---|
| `docs/category-proposal.md` | §2-D | 포스팅 데이터 내려받기의 API 를 `/api/downloads/my-keyword-ranking` 으로 적은 것은 오기. **서버 API 없음**. 「둘 다 판매 문구와 일치」도 키워드 쪽만 맞다 |
| `docs/category-proposal.md` | §2-E | `/rankings/blogger` 를 축에서 뺀 판단은 맞으나, **그 라우트가 이용권 무료 카드에서 팔리고 있다는 사실**을 함께 적어야 한다 |
| `docs/plan-spec-source.md` | §A-2 각주 | 「기업 카드 명칭 체계가 개인과 다르다」→ 실제로는 **개인 카드가 그 기능들을 안 판다**(§3-A) |
| `docs/feature-inventory.md` | §7 / §9 | §9-10 (1회 단위) · §9-11 (데모 정의) 결론을 §3-B 값으로 확정 |

---

## 6. 승인 요청 (Phase 3 착수 전)

수정 순서는 지시서 v2.1 의 우선순위(LEAK·CLIENT_ONLY 최우선)를 따르되, **어느 쪽으로 맞출지**는
아래 4건에서 갈립니다. 금액·쿼터는 손대지 않습니다.

1. **LEAK — 전체 인플루언서 리스트.** `/api/influencers` 를 인플루언서 전용으로 올리면 경쟁자 분석
   (BLOGGER)이 같이 막힙니다. **API 분리**가 필요합니다. 착수해도 될지요.
2. **CLIENT_ONLY — 포스팅 데이터 다운로드.** 서버 API 를 새로 만들어야 막힙니다
   (`/api/downloads/blog-posts` 신설 + `requireFeature`). 신설해도 될지요.
3. **OVERLOCK — MY 블로그.** 무료로 파는 대로 열려면 `/api/my/blog-dashboard-summary` 등을
   유료 게이트 예외에 추가해야 합니다. **무료 회원에게 KPI 를 여는 것이 맞는지** 확인 바랍니다.
4. **LIMIT_MISMATCH — 동시 로그인 기기.** 코드(3대)가 옳고 **문구(1대)를 고쳐야 합니다**.
   이용권 페이지 문구 수정 승인 바랍니다.

그리고 §3-A **11건**에 대해:

5. 이용권 페이지에 **적을지**, 적는다면 어느 플랜 칸에 넣을지 지시 바랍니다.
   (판매 문구 변경이라 임의로 하지 않습니다. 특히 Google 색인 관리·유튜브 음원 추출은
   **예비 인플루언서** 칸에 들어갑니다 — 지금 안내에는 예비 플랜 항목이 5개뿐입니다.)
6. **블로거 순위** — 「개발 중」인 기능이 무료 카드·FAQ·구조화 데이터 3곳에서 팔리고 있습니다.
   **안내에서 내릴지, 제품을 열지** 결정 바랍니다.

**Phase 3 코드 변경은 위 승인 전까지 착수하지 않습니다.**

---

## 7. 승인 후 처리 결과 (2026-09-01)

오렌지 승인: **「승인 6건 진행합니다」**. 6건 모두 반영했다. 커밋은 두 개로 나뉜다 —
코드 3건 `e71829f1`, 판매 문구 3건은 그 다음 커밋.

| # | 판정 | 처리 | 근거 위치 |
|---|---|---|---|
| ① | LEAK | 경쟁자 분석을 `/api/influencers/search` 로 옮기고 `/api/influencers` 를 `influencers.list`(INFLUENCER)로 되돌림 | `CompetitorDashboard.tsx:91` · `api/influencers/route.ts:25` |
| ② | CLIENT_ONLY | `/api/downloads/post-analysis` 신설 — 등급(`downloads.post-analysis`, INFLUENCER)과 500건 상한을 서버에서 강제 | 새 라우트 · `plans.ts` · `my/post-analysis/page.tsx` |
| ③ | OVERLOCK | `/api/my/blog-dashboard-summary`·`/api/my/blog-custom-profile` 을 유료 게이트 예외로 추가 | `middleware.ts` `PAID_PLAN_GATE_API_EXEMPT` |
| ④ | LIMIT_MISMATCH | 이용권 문구 1대 → **3대**. `SESSION_LIMIT` 은 손대지 않음 | `SubscribeClient.tsx` 비교표 · `plan-spec-source.md` §B |
| ⑤ | 무고지 11건 | 카드·비교표 양쪽에 추가(예비 2건 / 인플루언서 9건) | `SubscribeClient.tsx` · `plan-spec-source.md` §A·§B |
| ⑥ | 고지 초과 | 「블로거 순위」를 무료 카드·FAQ·JSON-LD 3곳에서 삭제 | `SubscribeClient.tsx` · `faq-data.ts:28` · `layout.tsx:184` |

### 처리하면서 갈린 판단 3가지 (기록)

1. **③ 에서 `/api/my/keyword-ranking-state` 는 예외에 넣지 않았다.** 라우트 주석(`:50~53`)에
   「키워드 순위는 예비 인플루언서 이용권 기능이다 … 미들웨어의 유료 게이트에 맡긴다」고 명시돼
   있다. 넣었으면 **BLOGGER 유료 기능이 무료로 열리는** 새 LEAK 이 됐다. `ai-briefing-state` 도 같다.
   두 API 를 못 받아도 `/dashboard` 는 깨지지 않는다(호출부가 `if (!res.ok) return` 으로 넘긴다).
2. **② 는 「데이터를 막는 것」이 아니라 「기능을 서버로 옮기는 것」이다.** 원본 데이터
   (`/api/blog/posts`·`/api/blog/analyze`)는 무료 화면이 이미 쓰는 것이라 그대로 뒀다. 서버 라우트는
   목록을 다시 받아 최근 15건까지 구조 분석을 채우고 500행에서 자른다 — 화면과 같은 17열이다.
3. **⑤ 에서 「비교표에만 있는 유료 3건」(키워드 추천 · 글감 찾기 · 릴스·쇼츠 분석)은 카드에 넣지
   않았다.** 승인 범위가 §3-A 의 11건이라 손대지 않았다. 카드↔비교표 불일치는 이만큼 남아 있다.

### 남은 것

- **HTTP 실측은 여전히 못 했다.** §1 의 한계가 그대로다 — 3개 등급 실계정이 없다.
  ①②③ 은 **코드 경로상** 막혔/열렸다는 뜻이지 「실제로 403/200 이 떨어지는 것을 봤다」가 아니다.
- 배포는 오렌지가 직접 하신다(`vercel deploy --prod`).
