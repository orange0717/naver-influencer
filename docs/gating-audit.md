# N인플 등급별 기능 게이팅 감사 (Phase 1)

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

## 5. Phase 2 착수 조건

지시서 §7에 따라 여기서 멈춥니다. Phase 2(`lib/plans.ts` + 가드 3종 구현)는 위 **4-2의 1·2번(CONFLICT 14건의 정답 방향)** 이 정해져야 시작할 수 있습니다. 나머지 항목은 Phase 2와 병행 확인이 가능합니다.

단, **3-1의 세 건(`/api/ad/search`, `/api/ad/auth/signup`, `/api/influencers/[id]`)은 등급 결정과 무관한 결함**이므로, 원하시면 Phase 2를 기다리지 않고 먼저 막을 수 있습니다.
