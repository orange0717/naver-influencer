# N인플 등급별 기능 게이팅 감사·구조화·적용

작성일: 2026-09-01 · 대상: `/Users/orange/개발/ninfle` (main, `78d0c883`)
범위: 감사만 수행. **코드는 한 줄도 수정하지 않았습니다.**

## 이 문서를 읽는 법

이 문서는 요약이자 판정입니다. 라우트 하나하나의 근거는 아래 세 문서에 있습니다.

| 문서 | 내용 |
| --- | --- |
| [gating-audit-pages.md](gating-audit-pages.md) | 화면 111개 전수 — 사이드바 선언 / 미들웨어 / 페이지 가드 / 클라이언트 게이팅 |
| [gating-audit-api.md](gating-audit-api.md) | API 309개 전수 — 인증 / 등급 / 사용량 제한 / 판정 |
| [gating-audit-limits.md](gating-audit-limits.md) | 한도·크레딧·등급 명칭·기업 좌석·비로그인 취급 |

---

## 1. 먼저 확인해야 할 사실 — 등급 판정은 지금 "2단계"로만 작동합니다

지시서의 등급 축은 무료 / 블로거 / 인플루언서 3단계입니다. 그런데 코드에서 실제로 등급을 판정하는 함수는 다음과 같습니다.

`src/lib/admin.ts:280` 의 `getPaywallContext()` 가 거의 모든 게이트의 근거이고, 이 함수가 돌려주는 값은 세 가지입니다.

- `isAdminUser` — 관리자는 모든 게이트를 무조건 통과합니다.
- `hasActivePaidPlan` — **블로거와 인플루언서를 구분하지 않습니다** (`admin.ts:315`). 유료면 참입니다.
- `plan` — `'BLOGGER'` 또는 `'INFLUENCER'` 문자열. 이걸 직접 비교해야만 3단계가 됩니다.

게이팅 수단은 현재 **4종**이 병존합니다.

| 수단 | 위치 | 실제 강제 등급 |
| --- | --- | --- |
| 미들웨어 402 게이트 3곳 | `middleware.ts:416`, `:455`, `:483` | **블로거급** (`hasActivePaidPlan`) |
| `requirePaidPlan` (API) | 라우트 다수 | **블로거급** |
| `requireInfluencerPlan` (API) | `admin.ts:331`, 라우트 21곳 | 인플루언서급 |
| `requireInfluencerPlusPage` (화면) | `plan-server-guards.ts:33`, 화면 5곳 | 인플루언서급 |

**결론: 미들웨어는 구조적으로 인플루언서 등급을 강제할 수 없습니다.** 사이드바에 인플루언서 자물쇠가 달린 메뉴 중 미들웨어에만 의존하는 것들은 전부 월 5,500원 블로거 구독자에게 열려 있습니다. 이것이 아래 CONFLICT 대부분의 단일 원인입니다.

덧붙여 `requireBloggerPlusPage()` (`plan-server-guards.ts:6`) 는 **정의만 되어 있고 어디서도 호출되지 않습니다.** 같은 로직이 5개 화면에 각각 복사되어 있습니다.

---

## 2. 기능별 게이팅 실태

판정 기호: `OK` 일치 · `CONFLICT` 층마다 요구 등급이 다름 · `CLIENT_ONLY` 화면만 막고 API는 열림 · `UNMAPPED` 등급 규칙 자체가 없음

### 2-1. 대시보드 — 블로그

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 대표 API | API 강제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| 대시보드 | `/dashboard` | authOnly | 페이지 자체 로그인 체크 | `/api/dashboard/*` | 로그인 | OK |
| 노출 현황 | `/my/missing-posts` | authOnly | 로그인 (`PAID_PLAN_GATE_EXEMPT`) | `/api/my/post-missing-state` | 무료 3회 (`X-View-Token`) | OK |
| 키워드 순위 | `/my/keyword-ranking` | **blogger** | **로그인만** (`requireLoginPage`) | `/api/my/keyword-ranking-state` | 무료 3회 | **CONFLICT** |
| AI 브리핑 · AI 탭 | `/my/naver-mate` | **influencer** | **블로거급** (미들웨어) | `/api/my/ai-briefing-state` | 블로거급 | **CONFLICT** |

### 2-2. 대시보드 — 인플루언서

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 대표 API | API 강제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| 대시보드 | `/my` | **influencer** | **블로거급** (미들웨어, 페이지 가드 0줄) | `/api/my/dashboard` | 블로거급 | **CONFLICT** |
| 토픽 | `/topics` | influencer | `requireInfluencerPlusPage` | `/api/naver-topics` | 인플루언서급 | OK |
| 〃 (내 토픽) | — | — | — | `/api/my/topics`, `/sync` | **블로거급** | **CONFLICT** |
| 맞팬 관리 | `/my/fans` | influencer | 블로거급 (미들웨어) | `/api/my/fans` | 블로거급 | **CONFLICT** |

### 2-3. 대시보드 — 포스팅

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 대표 API | API 강제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| 맞춤법 검사 | `/dashboard/writing/spellcheck` | blogger | 페이지 자체 유료 체크 | `/api/writing/spellcheck` | `requirePaidPlan` | OK |
| 글 심층피드백 | `/my/naver-mate/quality-evaluate` | **influencer** | **블로거급** (페이지 가드 0줄) | `/api/blog/quality-evaluate` | `requirePaidPlan` (블로거급) | **CONFLICT** |

### 2-4. 네이버 데이터 — 랭킹

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 대표 API | API 강제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| 네이버 메이트 | `/naver-mate-ranking` | authOnly | 로그인 (`MEMBER_ONLY_GATE`) | `/api/rankings/naver-mate` | 로그인 + 무료 3회 | OK |
| 연도별 선정 현황 | `/stats` | 선언 없음 | 없음 (공개) | `/api/stats` | 없음 | OK (공개 의도로 보임) |

### 2-5. 네이버 데이터 — 키워드

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 대표 API | API 강제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| 키워드 챌린지 | `/keywords` | **influencer** | **로그인만** (미들웨어·레이아웃·클라이언트 3층 모두) | `/api/keywords` | 무료 3회 | **CONFLICT (격차 최대)** |
| 〃 상세 7종 | — | — | — | `/api/keywords/[id]`, `/rankings`, `/related`, `/trend`, `/naver-trend`, `batch-top3`, `blog-top` | **로그인만, 무료 3회 캡 없음** | **CLIENT_ONLY** |
| 키워드 추천 | `/keywords/recommend` | **influencer** | **블로거급** (미들웨어) | `/api/recommendations` | **없음** | **CONFLICT + UNMAPPED** |
| 키워드 검색 | `/keywords/blogger` | 선언 없음 (SEO 공개 의도) | **로그인 필수** (부모 레이아웃 상속) | — | — | **CONFLICT (역방향)** |
| 대량 키워드 조회 | `/keywords/bulk` | influencer | 레이아웃이 `subscription_plan` 직접 비교 | `/api/keywords/bulk-*` | 인플루언서급 | OK |

### 2-6. 인플루언서 리스트

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 대표 API | API 강제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| 기본 명단 | `/influencers/free-plan` | authOnly | 로그인 | `/api/influencers/free-plan` | 로그인 | OK |
| 전체 리스트 | `/influencers` | influencer | `requireInfluencerPlusPage` | `/api/influencers` (정확일치) | **블로거급 402** | **CONFLICT** |
| 〃 상세 | `/influencers/[id]` | — | `requireInfluencerPlusPage` | `/api/influencers/[id]` | **로그인만** | **CLIENT_ONLY** |
| 〃 (광고주용) | 화면 없음 | — | — | `/api/ad/search` | **인증 자체가 없음** | **CLIENT_ONLY (최고 위험)** |

### 2-7. 콘텐츠 도구

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 대표 API | API 강제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| 글감 찾기 | `/dashboard/writing/content-angles` | influencer | 페이지 자체 체크 | `/api/keywords/content-angles` | 인플루언서급 | OK |
| 제목 생성 | `/dashboard/writing/titles` | **influencer** | 페이지 자체 체크 | `/api/keywords/titles` | **`requirePaidPlan` (블로거급)** | **CONFLICT** |
| 컬러 팔레트 | `/dashboard/writing/color-palette` | 선언 없음 | 없음 | — | — | OK (공개) |
| 이미지 편집 | `/image-editor` | authOnly | 로그인 | (브라우저 WASM) | — | OK |
| 롱폼 분석 | `/dashboard/content/youtube` | influencer | 페이지 자체 체크 | `/api/content/youtube/analyze` | 인플루언서급 | OK |
| 릴스·쇼츠 분석 | `/dashboard/content/shortform` | influencer | 페이지 자체 체크 | `/api/content/shortform/analyze` | 인플루언서급 + 하루 3회 | OK |
| 유튜브 음원 추출 | `/dashboard/youtube-stt` | blogger | 페이지 자체 유료 체크 | `/api/youtube/stt` | `requirePaidPlan` | OK |

### 2-8. 구글 / AI

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 대표 API | API 강제 | 판정 |
| --- | --- | --- | --- | --- | --- | --- |
| Google 색인 관리 | `/dashboard/google-indexing` | blogger | 페이지 자체 유료 체크 | `/api/google-indexing/*` 16개 | `requirePaidPlan` 전수 | OK |
| 〃 사이트맵 | — | — | — | `/api/google-indexing/sitemap/[userId]` | **인증 없음 (익명 공개 주석)** | **UNMAPPED** |
| N인플 AI 대화 | `/` (홈) | — | 없음 (비회원도 사용) | `/api/ai-consultant` | 무료 **3회/일**, 유료 무제한 | OK |
| 심층 대화 (Opus) | `/dashboard/claude` | — | `plan==='INFLUENCER'` | `/api/dashboard/claude/*` | 인플루언서급 | OK |

### 2-9. 하단 링크

| 기능 | 화면 | 사이드바 선언 | 실제 서버 강제 | 판정 |
| --- | --- | --- | --- | --- |
| 공지사항 | `/notice` | 선언 없음 | 로그인 | OK |
| 커뮤니티 | `/community` | **선언 없음 (자물쇠 미표시)** | **유료 플랜 필수** (`community/layout.tsx:44-47`) | **CONFLICT (역방향)** |
| 성장후기 | `/stories` | 선언 없음 | 없음 | OK |
| 이용권 | `/subscribe` | 선언 없음 | 없음 | OK |
| 서비스소개 | `/intro` | 선언 없음 | 없음 | OK |
| 기업용 문의 | `/enterprise` | 선언 없음 | 없음 | OK |

> 지시서 §3의 상단 내비 항목 중 "네이버 검색 데이터 분석"은 메뉴가 아니라 브랜드 태그라인입니다 (`Header.tsx:102`, `AppSidebar.tsx:232`). 감사 대상 기능이 아닙니다.

---

## 3. 판정 집계

| 판정 | 건수 | 성격 |
| --- | --- | --- |
| OK | 대다수 | 그대로 `lib/plans.ts` 로 이관 가능 |
| **CONFLICT** | **12건** | 층마다 요구 등급이 다름 — 어느 쪽이 정답인지 오렌지 결정 필요 |
| **CLIENT_ONLY** | **10개 엔드포인트 (3묶음)** | 화면은 막혔으나 API가 열림 — 등급 판단 불필요, 서버 가드만 추가하면 됨 |
| **UNMAPPED** | 11건 | 등급 규칙이 코드 어디에도 없음 |
| **LEAK** | 7건 | 비로그인이 화면에 그대로 도달 (사이드바 미등록이라 기존 자동감사가 못 잡음) |

### 3-1. 가장 급한 것 — ✅ 2026-09-01 조치 완료

이 세 건은 **등급 결정을 기다릴 필요가 없는 명백한 결함**이라 오렌지 승인 후 선조치했습니다.

1. **`/api/ad/search` — 인증이 아예 없었습니다.**
   `influencers` 테이블을 `select('*')` 로 통째 반환했습니다 (팬수·구독자수·TOP3 집계·카테고리·소개·활동상태). `/api/influencers` 가 402로 막는 바로 그 데이터셋입니다. IP 레이트리밋만 걸려 있어 페이지 순회로 전량 수집이 가능했습니다.
   → **`/api/ad/*` 그룹의 표준 가드인 `getAdvertiserUser` 를 적용했습니다.** 호출부가 코드 전체에 하나도 없어(화면 없는 API 표면) 회귀 위험이 없습니다.

2. **`/api/ad/auth/signup` — 세션 검증 없이 신원을 만들었습니다.**
   `authId` 를 요청 본문에서 받아 검증 없이 `advertisers` 에 insert 하고, 이후 `getAdvertiserUser` 가 그 행을 신원으로 신뢰했습니다.
   → **`auth_id` 를 본문이 아니라 서버가 확인한 세션에서 가져오도록 바꿨습니다.** `ad-auth.ts` 에 `resolveAdAuthUser()` 를 분리하고(advertisers 행이 아직 없는 가입 시점용), 스키마와 클라이언트에서 `authId` 필드를 제거했습니다. 가입 직후 쿠키 타이밍에 기대지 않도록 클라이언트가 Bearer 토큰을 명시로 넘깁니다.

3. **`/api/influencers/[id]` — 로그인만 하면 상세를 전량 수집할 수 있었습니다.**
   화면은 `requireInfluencerPlusPage` 로 막혀 있는데(`influencers/[id]/page.tsx:80`), 미들웨어의 402는 `pathname === '/api/influencers'` **정확 일치**라 상세가 빠졌습니다(`middleware.ts:449`).
   → **`requirePaidPlan`(블로거급)을 적용했습니다.** ⚠️ 화면과 같은 인플루언서급으로 올리지 **않은** 이유: 이 엔드포인트를 상세 화면 외에 **경쟁자 분석(`/competitor`)도 함께 씁니다**(`competitor/page.tsx:70`). 인플루언서급으로 올리면 블로거 구독자의 경쟁자 분석이 깨집니다. 무료 회원 차단이라는 목적은 달성했고, 두 기능의 등급 정리는 Phase 2에서 `/competitor` 등급 결정과 함께 다룹니다.

**남은 것:** `/api/keywords/*` 상세 7종은 여전히 무료 3회 캡을 우회시키며, 그중 `naver-trend`·`blog-top` 은 외부 유료 API를 태워 **비용까지 함께 샙니다.** 이건 `/keywords` 등급 결정(CONFLICT)과 묶여 있어 Phase 3에서 처리합니다.

### 3-2. 감사 중 드러난 구조적 사항 4가지

1. **미들웨어의 유료 판정은 지연 시 "유료"로 폴백합니다.** (`middleware.ts:414`, `:453`, `:480`) Supabase가 4초를 넘기면 유료 게이트가 열립니다. 반대로 `hasActivePaidPlanByUserId` 는 실패 시 차단(fail-secure) — **두 경로의 실패 방향이 반대입니다.**
2. **무료 쿼터 RPC는 장애 시 통과시킵니다.** (`analysis-quota.ts:132,138`, `free-quota.ts:76,88`) RPC가 없거나 실패하면 무료 3회 제한이 사실상 무제한이 됩니다.
3. **크레딧 차감은 현재 전 구간 꺼져 있습니다.** `CREDITS_ENABLED` 가 `.env` 어디에도 없어 기본 false이고, `assertCreditFor`/`chargeCreditIfEnabled` 가 즉시 반환합니다 (`credit-gate.ts:21,30,53`). 표의 "N크레딧"은 아직 실제 차감이 아닙니다.
4. **기존 `[member-gate-audit]` 자동 점검은 `authOnly` 만 봅니다.** (`middleware.ts:200~220`) `requiredPlan` 불일치는 검사 대상이 아니며, 위 CONFLICT 12건이 정확히 그 사각지대입니다.

---

## 4. 미해결 항목 (§9 갱신) — 확인 전까지 코드에 반영하지 않습니다

지시서 §9의 9개 항목 중 **코드로 답이 나온 것과 여전히 오렌지 결정이 필요한 것**을 구분했습니다.

### 4-1. 코드로 답이 나온 것 (결정 불필요)

| §9 항목 | 코드가 준 답 |
| --- | --- |
| ⚠ 등급 명칭 불일치 (PRO) | **PRO는 4번째 등급이 아니라 "유효한 유료 플랜 보유" 표시 라벨**입니다. `hasActivePaidPlanByUserId` 기본 인자가 `'BLOGGER'` 라 **블로거 구독자도 "PRO 이용 중"을 봅니다.** 단 `ProfileHeader.tsx:193-196` 은 "블로거 PRO / 인플루언서 PRO"로 갈라 씁니다. 문제는 같은 글자가 세 뜻으로 쓰인다는 것 — 표시 라벨 / 기업 플랜 식별자 `PlanId='PRO'`(DB CHECK 제약이 걸린 실제 값) / 권한 없는 레거시 `licenses.plan_name='PRO'`. |
| ⚠ N인플 AI 한도 | **실제 강제값은 3입니다** (`free-quota.ts:19-20`, 회원·비회원 동일). 코드 주석의 "5"와 RPC 기본 인자 `p_max default 5` 는 모든 호출부가 값을 명시로 넘겨 도달하지 않습니다. 유료 등급은 무료 풀을 건너뛰어 무제한이되, AI 생성은 하루 `PAID_AI_DAILY_CAP = 50`(`free-quota.ts:128`) 공용 상한을 공유합니다. |
| ⚠ 기업용 구독과의 관계 | **별도 축이 아닙니다.** `syncOrgSeatEntitlements` 가 BASIC→BLOGGER, PRO→INFLUENCER 로 `users.subscription_plan` 에 직접 써넣어 개인 등급 축에 합류시킵니다. |
| ⚠ 기능별 등급 매핑표 | 위 §2 로 확정. 단 CONFLICT 12건은 매핑이 아니라 결정 사항입니다. |

### 4-2. 여전히 오렌지 결정이 필요한 것

1. **⚠ CONFLICT 12건 — 각각 어느 쪽이 정답입니까.** 가장 돈이 걸린 것부터: `/my`(인플루언서 대시보드), `/my/naver-mate`(AI 브리핑), `/my/naver-mate/quality-evaluate`(글 심층피드백), `/keywords`(키워드 챌린지), `/influencers`(전체 리스트), `/dashboard/writing/titles`(제목 생성) — 메뉴는 인플루언서인데 실제로는 블로거(일부는 무료)가 씁니다. **메뉴 표시를 내릴지, 서버 강제를 올릴지**에 따라 기존 블로거 구독자의 권한이 줄어들 수 있습니다.
2. **⚠ 역방향 CONFLICT 2건 — `/community` 와 `/keywords/blogger`.** 커뮤니티는 메뉴에 자물쇠가 없는데 유료 전용이고, 키워드 검색은 SEO 공개 의도인데 부모 레이아웃이 비로그인을 전부 튕깁니다. 둘 다 "무료로 보이는데 막힌다"라 이탈로 직결됩니다.
3. **⚠ 한도 초과 시 복구 주기 — 코드에 근거가 없습니다.** 세 카운터 모두 Postgres `current_date` 에 그냥 위임하고 타임존을 붙이지 않았습니다. 같은 저장소의 다른 마이그레이션은 `AT TIME ZONE 'Asia/Seoul'` 을 명시하는데 여기만 빠져 있어, **한국 사용자의 리셋 시각이 자정인지 오전 9시인지 코드만으로 확정할 수 없습니다.** DB 실측이 필요합니다.
4. **⚠ 크레딧과 등급의 관계.** 크레딧은 등급과 독립된 축이며 크레딧으로만 막히는 기능은 없습니다. 다만 **지금 전 구간 비활성(`CREDITS_ENABLED` 미설정)** 이라, 이번 작업에서 크레딧을 게이팅 축에 넣을지 뺄지 결정이 필요합니다. (지시서 §2는 등급만을 축으로 지정했으므로 기본값은 "제외"로 두었습니다.)
5. **⚠ 비로그인 사용자 취급.** AI 무료 풀은 회원과 동일한 3회지만 IP+UA 해시 기준이라 같은 IP를 공유하면 더 불리합니다. 반면 `withAnalysisView` 는 비로그인에게 게이트를 **건너뛰어** 오히려 느슨합니다(`analysis-quota.ts:47`). 즉 현재 비로그인은 기능에 따라 무료 회원보다 엄격하기도, 느슨하기도 합니다. 어느 쪽으로 통일할지 결정이 필요합니다.
6. **⚠ 접근 불가 시 표현 방식.** 현재 4가지가 혼재합니다 — 메뉴 자물쇠 / `/subscribe` 리다이렉트 / 회원 전용 모달(`?memberOnly=1`) / 클라이언트 카드 분기. 표준을 정해야 합니다.
7. **⚠ LEAK 7건 — 비로그인 노출이 의도입니까.** `/my/settlements`(원고료 정산), `/my/topics/[id]`, `/my/link`, `/notice/write`, `/notice/[id]/edit`, `/enterprise/manage`, `/orangeconnect/*` 6개. 화면 껍데기가 비회원에게 렌더되며 데이터만 API 401에 의존합니다. **`/notice/write` 는 공지 작성인데 화면단에 관리자 확인 자체가 없습니다.**
8. **⚠ UNMAPPED 11건 — 공개가 의도입니까.** 특히 `/api/rankings/search`(전체 블로거 검색), `/api/recommendations`(트렌드 키워드 100건), `/api/google-indexing/sitemap/[userId]`(UUID만 알면 임의 사용자의 등록 URL 1000건), `/api/tools/convert-image`(인증·레이트리밋 모두 없이 `sharp` 변환).
9. **⚠ INFLUENCER 판정 방식 2종.** `getPaywallContext().plan` 경유(5곳)와 `users` 테이블 직접 조회(3곳)가 갈려 있습니다. 기업 좌석·쿠폰 부여 계정에서 두 판정이 항상 같은 결과인지 검증되지 않았습니다.

---

## 5. Phase 2 착수 조건 — ✅ 충족

지시서 §7에 따라 Phase 1은 여기서 멈췄고, **4-2의 1·2번(CONFLICT)에 대한 오렌지 결정 3건**이 아래와 같이 내려져 Phase 2·3을 진행했습니다.

| 질문 | 오렌지 결정 (2026-09-01) | 결과 |
| --- | --- | --- |
| CONFLICT 12건 — 메뉴와 서버 중 어느 쪽이 정답인가 | **메뉴 선언이 정답** | 서버 강제를 메뉴가 표시하던 등급으로 올렸습니다. 블로거 구독자가 쓰던 일부 기능의 권한이 실제로 줄어듭니다(결정 시 고지됨). |
| 역방향 CONFLICT 2건 — 무료로 보이는데 막혀 있다 | **화면을 열어준다** | `/community` 는 로그인만 요구(구독 불필요), `/keywords/blogger` 는 비로그인도 열립니다. |
| `/competitor` 등급 | **블로거부터 (현행 유지)** | `/api/influencers`·`/api/influencers/[id]` 도 블로거로 유지됩니다. |
| 접근 불가 시 표현 방식 | **화면 안에서 안내** | 페이지를 열고 잠긴 자리만 안내 카드로 덮습니다. |

---

## 6. Phase 2 — 구조 (커밋 `ae5a4ee7`)

**`src/lib/plans.ts` 하나가 정본입니다.** 등급 축은 `FREE` / `BLOGGER` / `INFLUENCER` 누적이며, 화면·API·사이드바가 전부 이 파일의 `FEATURES` 를 참조합니다.

가드 3종:

| 층 | 함수 | 동작 |
| --- | --- | --- |
| 서버 컴포넌트 | `checkFeaturePage(feature, path)` | 판정만 돌려줍니다. 비로그인은 회원 전용 모달로 보내고, **등급 부족은 리다이렉트하지 않아** 호출한 페이지가 `FeatureLocked` 를 화면 안에 띄웁니다. |
| 서버 컴포넌트(자리 없음) | `requireFeaturePage(feature, path)` | 위를 감싼 강제 버전. 안내를 그릴 자리가 없는 레이아웃 전용. |
| API | `requireFeature(feature)` | 부족하면 **403**. |
| 클라이언트 | `FeatureGate` / `useFeatureAccess` | 잠기면 `FeatureLocked` 카드로 대체. |

`FeatureLocked` 는 서버·클라이언트가 함께 쓰는 단일 안내 카드입니다(§6 문구 규칙 준수 — 상태코드·`plan`·`tier` 를 노출하지 않고 `/subscribe` 로만 안내).

**`limits` 는 의도적으로 비어 있습니다.** §8("한도 숫자를 새로 만들지 않습니다")에 따라 무료 3회는 기존 `free-quota.ts` 가 그대로 강제합니다.

---

## 7. Phase 3 — 적용

### 7-1. 화면 (20개 라우트)

`checkFeaturePage` + `FeatureLocked` 로 이관했습니다. 각 페이지에 흩어져 있던 `subscription_plan === 'INFLUENCER'` + 만료일 비교 인라인 로직(페이지당 30~35줄)이 2줄로 줄었습니다.

주요 변경:
- `/keywords` 는 클라이언트 전용이라 게이팅할 서버 자리가 없었습니다. `page.tsx` → `Client.tsx` 로 분리하고 서버 `page.tsx` 를 새로 만들었습니다.
- `/keywords/layout.tsx` 의 일괄 로그인 요구를 제거했습니다 — 이 레이아웃이 무료 공개인 `/keywords/blogger` 까지 덮고 있었습니다(역방향 CONFLICT의 실제 원인).
- `/my/keyword-ranking` 은 무료 → **블로거**로 올라갑니다("메뉴 선언이 정답"). 무료 회원 하루 3회는 `withAnalysisView` 가 그대로 유지합니다.
- `/competitor/layout.tsx` 에 블로거 가드를 **먼저 넣고 나서** 미들웨어에서 뺐습니다(순서를 바꿨으면 누출).
- **`/my` 만 예외로 `checkFeaturePage` 를 쓰지 않습니다.** 이 페이지의 `getUserWithTimeout` + 쿠키 재시도를 우회하면 알려진 supabase auth 락 교착이 되살아납니다. 등급 임계값은 여전히 `FEATURES['my.dashboard']` 에서 읽으므로 정본은 하나입니다.

### 7-2. API (46개 라우트)

`requirePaidPlan` / `requireInfluencerPlan` → `requireFeature(<key>)` 로 교체했습니다.

⚠️ **상태코드가 402 → 403 으로 바뀝니다.** 402를 보고 분기하던 클라이언트를 전수 확인해 `YoutubeSttClient.tsx`, `SpellcheckClient.tsx` 두 곳을 403도 받도록 고쳤습니다. 나머지(`KeywordRankingSection`, `MissingPostsSection`, `AiConsultantClient`)의 402는 미들웨어·쿼터에서 오는 것이라 영향이 없습니다.

**§8에 따라 손대지 않은 API:** `plans.ts` 에 키가 없거나(=UNMAPPED), 이관하면 등급이 바뀌는 것들입니다 — `api/community`, `api/blog/ai-analyze`, `api/blog/plagiarism-check`, `api/blog/text-analyze`, `api/writing/rewrite`, `api/blog/topics/*`, `api/my/influencer-center*`, `api/related-keywords`, `api/iblog-rank`, `api/discover/influencers`, `api/keywords/body`, `api/downloads/my-keyword-ranking`(현재 인플루언서인데 `my.keyword-ranking` 은 블로거라 이관하면 **느슨해집니다**).

### 7-3. 미들웨어

페이지 유료 게이트를 `['/my', '/rankings/influencer', '/keywords/bulk', '/keywords/recommend', '/competitor']` → **`['/rankings/influencer']`** 로 줄였습니다.

이유는 순서입니다. 미들웨어가 먼저 `/subscribe` 로 튕기면 오렌지가 결정한 "화면 안에서 안내"가 **영원히 렌더되지 않습니다.** 남은 한 건은 `plans.ts` 에 등급이 없어 기존 동작을 유지해야 하는 경로입니다.

`/api/influencers` 정확일치 402 블록도 제거했습니다 — 이제 라우트의 `requireFeature('competitor.analysis')` 가 단독으로 판정합니다.

**그대로 둔 것:** `PUBLIC_KEYWORDS_PATHS`, `MEMBER_ONLY_GATE_PREFIXES`, `/api/my` 유료 프리픽스(아직 이관 안 된 라우트가 많아 하한선으로 유용), `VIEW_TOKEN_GATED_API_PREFIXES`.

### 7-4. Phase 3에서 새로 드러난, 아직 손대지 않은 것

1. **`/keywords/blog-ranking` 이 반쪽입니다.** 화면은 비로그인에 공개(`PUBLIC_KEYWORDS_PATHS`)인데 데이터 호출 `/api/keywords/blog-top` 은 미들웨어의 `isKeywordsApi` 규칙으로 비로그인에 401입니다. 즉 **빈 화면이 열립니다.** 오렌지 결정("화면을 열어준다")은 `/keywords/blogger` 만 명시했고 이쪽은 범위 밖이라 그대로 뒀습니다. (`/keywords/blogger` 는 `/api/search-volume` 을 쓰므로 정상입니다.)
2. **`/influencers/list`(무료 명단)가 감사표에 없었습니다.** 페이지에 서버 가드가 없고 `/api/influencers/list` 는 미들웨어의 **유료** 게이트에서 면제됩니다. 다만 실측 결과 화면·API 모두 **로그인은 요구합니다**(307 / 401) — `MEMBER_ONLY_GATE_PREFIXES` 의 `/influencers` 가 하위를 덮기 때문입니다. 즉 "비구독 회원에게 열린 명단"이지 비로그인 공개가 아닙니다. 누출은 아니나 `plans.ts` 에 키가 없어 **UNMAPPED 12번째 항목**으로 올립니다.

### 7-5. 여전히 오렌지 결정이 필요한 것

§4-2 중 **3·4·5·7·8·9번이 그대로 남아 있습니다** (한도 리셋 주기 DB 실측 / 크레딧을 게이팅 축에 넣을지 / 비로그인 취급 통일 / LEAK 7건이 의도인지 / UNMAPPED가 공개 의도인지 / INFLUENCER 판정 2종 일치 검증). 여기에 7-4의 2건이 추가됩니다.

### 7-6. 배포·라이브 검증 (2026-09-01 완료)

`vercel deploy --prod` → `dpl_AJ47CNUuU71ZFcZGYvTpEQcx49S3`, `ninfle.kr` 별칭 반영 완료.

비로그인 기준 실측:

| 경로 | 결과 | 확인한 것 |
| --- | --- | --- |
| `/keywords/blogger` | 200 | 역방향 CONFLICT 해소 — 이전엔 부모 레이아웃이 비로그인을 튕겼습니다 |
| `/competitor` | 307 → `?memberOnly=1` | **미들웨어에서 뺐는데도 여전히 차단됩니다** — 레이아웃 가드가 받아냈고 누출이 없습니다 |
| `/keywords`, `/keywords/recommend`, `/influencers`, `/community` | 307 → `?memberOnly=1` | 비로그인 처리 정상 |
| `/api/influencers`, `/api/my/dashboard`, `/api/keywords/blog-top` | 401 | API 가드 정상 |
| `/api/search-volume` | 200 | `/keywords/blogger` 가 쓰는 공개 API — 의도대로 열려 있습니다 |
| `/my` | 200 | 비로그인은 마케팅 랜딩. 기존 동작이며 회귀가 아닙니다 |

⚠️ **로그인 상태 검증은 계정이 필요해 남아 있습니다.** curl로는 확인할 수 없는 항목입니다 — ①블로거 계정으로 인플루언서 전용 화면에 들어갔을 때 `FeatureLocked` 카드가 실제로 뜨는지, ②403이 된 API가 클라이언트에서 올바른 문구로 표시되는지. 특히 "메뉴 선언이 정답" 결정으로 권한이 줄어드는 블로거 구독자 경로를 한 번 눈으로 보시는 것을 권합니다.

---

# 8. 공용 이용 횟수(쿼터) 감사 — 지시서 v1.1

v1.1에서 "무료 3회는 AI 전용 한도가 아니라 서비스 전체 공용 횟수"라는 전제가 추가되었습니다. 이 장은 그 전제를 코드에 대조한 결과입니다. **여기까지가 Phase 1이며, 구조 변경(Phase 2)은 아직 하지 않았습니다.**

## 8-1. 결론 — 전제는 맞습니다. 다만 풀이 하나가 아닙니다

오렌지가 말한 "기능 합산 공용 카운터"는 **이미 그렇게 구현돼 있습니다.** 새로 만들 개념이 아닙니다. `free-quota.ts:12` 주석이 그대로 적고 있습니다 — *"카운트는 '기능별'이 아니라 subject 전체 합산"*.

문제는 그 공용 풀이 **전부를 덮지 못한다**는 것입니다. 실제로는 카운터가 **3개**이고, 그중 하나만 공용입니다.

| # | 카운터 | 저장 위치 | 범위 | 공용 풀인가 |
| --- | --- | --- | --- | --- |
| 1 | 무료 공용 풀 | `free_daily_usage` (`user:{id}` / `ip:{hash}`) | AI 상담 + 경쟁자 분석 + 분석 화면 5종 | ✅ **예 — 이것이 "하루 3회"** |
| 2 | 유료 남용 상한 | `free_daily_usage` (`paidcap:{id}`) | AI 생성 4종 | ❌ 같은 테이블·다른 네임스페이스 → 별개 예산 (하루 50) |
| 3 | 비회원 도구 캡 | **`tool_anon_quota`** (별도 테이블) | `search-volume`, `shopping-keywords` | ❌ **도구별로 각각 30회** — 공용 풀과 완전 무관 |

`migration-148:11` 이 1번을 명시합니다 — *"카운터 원장은 migration-138 의 `free_daily_usage.count` 를 그대로 재사용한다"*. `competitor-quota.ts` 는 그 풀을 부르는 얇은 래퍼일 뿐 자체 카운터가 없습니다(`:36`).

즉 **3번이 전제에서 벗어나 있습니다.** 비회원이 검색량 조회 30회 + 쇼핑키워드 30회를 쓰면서도 공용 3회는 그대로 남습니다.

## 8-2. 쿼터를 차감하는 기능 (§3.1 신설 컬럼)

| 기능 | API 라우트 | 카운터 | actionId | 차감 단위 | 차감 시점 | 실패 시 환불 |
| --- | --- | --- | --- | --- | --- | --- |
| AI 상담 | `/api/ai-consultant` | ① 공용 | `ai_consultant` | 요청 1회 = 1 | AI 호출 **전** | ✅ 있음 |
| AI 상담 (대화 이어가기) | `/api/ai-consultant/conversations/[id]/messages` | ① 공용 | `ai_consultant` | 요청 1회 = 1 | AI 호출 **전** | ✅ 있음 |
| 경쟁자 분석 | `/api/competitors` | ① 공용 | `competitor_analyze` | 요청 1회 = 1 | 조회 전 | ❌ 없음 |
| 유입 분석 | `/api/blog/analyze` | ① 공용 | `inflow_analysis` | **화면 조회 1건** | 예약 후 성공 시 확정 | ✅ 있음 |
| 순위 분석 | `/api/rankings/top`, `/api/rankings/naver-mate`, `/api/my/keyword-ranking-state` | ① 공용 | `rank_analysis` | **화면 조회 1건** | 예약 후 성공 시 확정 | ✅ 있음 |
| 미노출 분석 | `/api/my/post-missing-state` | ① 공용 | `missing_analysis` | **화면 조회 1건** (토큰 있을 때만) | 예약 후 성공 시 확정 | ✅ 있음 |
| 제목 생성 | `/api/keywords/titles` | ② 유료 상한 | `ai-titles` | 요청 1회 = 1 | AI 호출 **전** | ❌ 없음 |
| 본문 생성 | `/api/keywords/body` | ② 유료 상한 | `ai-body` | 요청 1회 = 1 | AI 호출 **전** | ❌ 없음 |
| 글감 찾기 | `/api/keywords/content-angles` | ② 유료 상한 | `ai-angles` | 요청 1회 = 1 | AI 호출 **전** | ❌ 없음 |
| 릴스·쇼츠 분석 | `/api/content/shortform/analyze` | ② 유료 상한 | `shortform_analyze` (max **3**) | 요청 1회 = 1 | 외부 호출 **전** | ❌ 없음 |
| 검색량 조회 | `/api/search-volume` | ③ 도구별 | `search-volume` (max 30) | 요청 1회 = 1 | 외부 API **전** | ❌ 없음 |
| 쇼핑 키워드 | `/api/shopping/keywords` | ③ 도구별 | `shopping-keywords` (max 30) | 요청 1회 = 1 | 크롤 **전** | ❌ 없음 |

**차감 단위가 두 종류입니다.** AI·도구 계열은 "요청 1회 = 1"이지만, 분석 화면 5종은 **화면 조회 1건**입니다(`X-View-Token` 헤더로 dedup). 같은 화면에서 필터·정렬·페이지를 아무리 눌러도 1회지만, **새로고침·새 탭·뒤로가기는 각각 +1** 입니다(`analysis-quota.ts:15`).

✅ **클라이언트 전용 차감은 없습니다.** 세 카운터 모두 서버 RPC가 정본이고, localStorage·zustand로 횟수를 세는 곳은 발견되지 않았습니다. 지시서가 우려한 `CLIENT_ONLY` 결함은 쿼터 축에는 존재하지 않습니다.

## 8-3. 🚨 감사에서 새로 드러난 결함 4가지

**(가) 한도값 출처가 두 갈래입니다 — 관리자가 설정을 바꾸면 갈라집니다.**
`free-quota.ts:62` 는 한도를 관리자 설정에서 읽습니다(`getFreeDailyLimit` → `app_settings.free_daily_limit_member`, 기본 3). 그런데 **같은 풀을 쓰는** `analysis-quota.ts:119` 는 상수 `MEMBER_DAILY_FREE_LIMIT`(=3)를 하드코딩합니다. 지금은 둘 다 3이라 증상이 없지만, 관리자 화면에서 한도를 5로 올리면 **AI·경쟁자는 5회, 분석 화면은 3회에서 막힙니다.** 같은 카운터를 서로 다른 상한으로 읽는 상태입니다.

**(나) 비로그인 취급이 모듈마다 반대입니다.**
`free-quota.ts:60` 은 비회원을 `ip:{hash}` 로 카운트합니다. 반면 `analysis-quota.ts:50` 은 **비로그인을 아예 게이트 없이 통과**시킵니다(주석상 의도: "무료 3회는 회원 기준 정책", 공개 보호는 미들웨어 담당). §9-7의 "비로그인 취급" 질문은 **코드에 답이 두 개** 있는 상태입니다.

**(다) 죽은 주석의 숫자가 공개 FAQ로 새어나갔습니다.**
`competitor-quota.ts:8` 은 공용 풀을 *"하루 5회(비회원)/10회(회원)"* 라고 적고 있으나 **실제 코드값은 3/3** 입니다(`free-quota.ts:19-20`). `feature-gate.ts:5` 도 *"무료 5회"* 로 적혀 있습니다. 이 스테일 숫자가 사용자에게 보이는 문서까지 전파됐습니다 — `src/data/faq-data.ts:98` *"하루 10회"*, `:117` *"하루 5회, 회원가입하면 하루 10회"*. **FAQ가 실제 동작보다 큰 숫자를 약속하고 있습니다.**

**(라) 유료 AI 4종은 실패해도 환불이 없습니다.**
`consumePaidDailyCap` 은 환불 함수를 돌려주지 않습니다(`free-quota.ts:161`). 제목·본문·글감·쇼츠는 AI 호출 **전에** 차감하므로, Claude가 실패하면 사용자는 결과 없이 횟수만 잃습니다. 특히 쇼츠는 `max: 3` 이라 한 번 실패가 1/3입니다. 무료 풀 쪽은 이미 환불이 구현돼 있어(`free-quota.ts:105`) **같은 문제를 한쪽만 해결한 상태**입니다.

## 8-4. 이미 맞게 돼 있는 것 (건드릴 필요 없음)

- **권한 부족과 쿼터 소진의 상태 코드가 이미 분리돼 있습니다.** 권한 = **403**(`requireFeature.ts:55,70`), 쿼터 소진 = **402**(`feature-gate.ts:51`, `analysis-quota.ts:74`). 지시서 §4.2가 요구한 "서로 다른 사유 코드"는 충족입니다. 🚨 이 계약을 바꾸면 클라이언트를 전수 grep해야 합니다(Phase 3에서 402→403 전환이 스펠체크를 조용히 깨뜨릴 뻔한 전례).
- **쿼터 소진 문구가 기능 이름을 넣지 않습니다.** `feature-gate.ts:44` — *"오늘 무료 이용을 모두 사용했습니다."* 지시서 §6 요구와 일치합니다.

## 8-5. 문구 정정 대상 (§5.1) — 목록만, 문구 확정은 보류

지시서 §5.1에 따라 **대상만 산출하고 대체 문구는 확정하지 않았습니다**(§9-3-3 미결).

**정정 필요 — 공용 횟수를 "AI 질문"으로 좁혀 말합니다:**

| 파일 | 라인 | 현재 문구 | 노출 위치 |
| --- | --- | --- | --- |
| `src/components/UsageQuotaBadge.tsx` | 56 | `AI 질문 ${남은}회 남음` / `AI 질문 무료 소진` | **헤더 배지 본문** |
| `src/components/UsageQuotaBadge.tsx` | 51 | `오늘 무료 AI 질문 ${남은}회 남음(하루 ${limit}회)` | 헤더 배지 툴팁 |
| `src/app/dashboard/ai-consultant/AiConsultantClient.tsx` | 432 | `(무료 하루 3회)` | AI 입력창 하단 |
| `src/components/FirstVisitModal.tsx` | 73 | `N인플 AI 질문은 회원가입 없이 하루 3회` | 첫 방문 모달 |
| `src/components/MemberOnlyModal.tsx` | 51 | `N인플 AI 질문 하루 3회뿐입니다` | 회원 전용 모달 |

**숫자가 사실과 다름 — 문구가 아니라 값의 오류입니다:**

| 파일 | 라인 | 현재 | 코드 실제값 |
| --- | --- | --- | --- |
| `src/data/faq-data.ts` | 98 | 경쟁자 분석 `하루 10회` | **3회** |
| `src/data/faq-data.ts` | 117 | `하루 5회 / 회원가입 시 10회` | **3회 / 3회** |
| `src/lib/competitor-quota.ts` | 8 | 주석 "5회/10회" | 3/3 (죽은 주석) |
| `src/lib/feature-gate.ts` | 5 | 주석 "무료 5회 / PRO 무제한" | 3 (죽은 주석) |

**이미 올바른 표현 (참고용 — 정정 대상 아님):** `faq-data.ts:28` *"전체 기능 합산"*, `TermsContent.tsx:59` *"주요 기능"*, `layout.tsx:184`.

**정정 대상 아님 (다른 한도입니다):** `subscribe/SubscribeClient.tsx:535` 의 `1일 3회`는 값이 맞습니다. 검색량·쇼핑 도구의 30회는 카운터 ③이라 별개입니다.

## 8-6. §9 갱신 — 오렌지 확인이 필요한 것

코드가 답한 것과 여전히 결정이 필요한 것을 갈라 적습니다.

**✅ 코드로 답이 나왔습니다 (결정 불필요):**
- §9-2 크레딧과 쿼터의 관계 → **별개 자원이며, 크레딧은 현재 전 구간 no-op** 입니다(`CREDITS_ENABLED` 미설정). 헤더의 "크레딧 100"과 "3회 남음"은 서로 다른 축입니다.
- §9-3-1 차감 대상 기능 집합 → **§8-2 표가 현행입니다.**
- §9-3-2 차감 단위 → **요청 단위와 화면 조회 단위 두 종류**입니다(§8-2).

**⚠️ 여전히 결정이 필요합니다:**
1. **카운터 ③(도구별 30회)을 공용 풀에 합칠지.** 합치면 검색량 조회가 무료 3회를 잡아먹어 **체감 한도가 크게 줄어듭니다.** 현행 유지가 안전하다고 보지만, "전체 합산"이라는 전제와는 어긋난 채로 남습니다. 지시서 §8이 "차감 여부를 새로 판단하지 말라"고 해 **손대지 않았습니다.**
2. **FAQ의 10회·5회를 코드(3회)에 맞출지, 코드를 FAQ에 맞출지.** 지금은 사용자에게 더 많이 약속하고 덜 주는 상태입니다. 숫자 변경은 §8 금지사항이라 **보류했습니다.**
3. **(가) 한도 출처 이원화** — `analysis-quota` 도 관리자 설정을 읽게 할지. 값 변경이 아니라 버그 수정에 가깝습니다.
4. **(나) 비로그인 취급** — 분석 화면도 비로그인에 3회를 물릴지, 현행(무제한 통과)을 유지할지.
5. **(라) 유료 AI 4종 환불 추가 여부.**
6. **리셋 시각은 여전히 DB 실측이 필요합니다.** 세 RPC 모두 `current_date` 를 타임존 없이 씁니다(`migration-138:36`, `-148:46`, `-086:36`). 같은 저장소의 다른 마이그레이션 5개 이상은 `AT TIME ZONE 'Asia/Seoul'` 을 명시하는데 **쿼터 3종만 빠져 있습니다.** DB 세션 타임존이 UTC(Supabase 기본)라면 리셋은 **자정이 아니라 KST 오전 9시**입니다. §5.1의 "내일 다시 이용" 문구가 사실과 다를 수 있어, 문구 확정 전에 확인이 필요합니다.
