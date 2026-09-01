# Phase 0 — 현황 스캔 (지시서 v2.1 §0·§2·§3 + v2.2 신규 실측)

> 작성일 2026-09-01 / 대상 커밋 `de4ead69` / 방식: 코드 실측. 추정한 곳은 「추정」으로 표시했다.
> **v2.2 가 새로 요구한 실측 5건은 §8 에 따로 모았다** (kind 판별 · MY 한정성 · 롱폼 산출물 ·
> 금액 반올림 판정 · 쿼터 관측). §7 표의 A·C·D 는 그 결과로 해소됐다.

## 0. 요약 — 지시서 §2·§3 전제 중 틀린 것

지시서 v2.1 §2는 라우트 9개를 「미확인」으로 두었으나 **전부 코드에 있다**. 그리고 「미확인」을
채우는 과정에서 §3의 전제 중 **3건이 사실과 다름**을 확인했다.

| 지시서 주장 | 실측 | 판정 |
|---|---|---|
| §3.1 AI 브리핑과 네이버 메이트가 같은 `/my/naver-mate` | 네이버 메이트는 `/naver-mate-ranking` 이다. 서로 다른 페이지·다른 컴포넌트 | ❌ **오판** |
| §3.5 미노출 분석 `/my/missing-posts` 가 사이드바에 없다 | 있다. 「노출 현황」이라는 **다른 이름**으로 등록돼 있다 (`sidebar-nav.ts:51`) | ❌ **오판** (진짜 문제는 부재가 아니라 명칭 불일치 → §3.3 사안) |
| §2 「상단 내비: 공지사항·커뮤니티·이용권…」 | 상단이 아니라 **사이드바 하단** `SIDEBAR_FOOTER_LINKS` (`sidebar-nav.ts:114`) | ❌ **오판** |
| §3.6 이용권 항목 8건 「대응 메뉴 불명」 | 5건은 **실재하는 페이지**다. 불명이 아니라 **사이드바에 링크가 없는 것** | ⚠️ **재정의 필요** |
| §5.1 「이용권 페이지 스펙 (원문)」이 정본 | `484173e2` 시점 문구다. 이후 두 커밋이 페이지를 고쳐 **현재 화면과 다르다** | ❌ **stale** (→ §6) |

**Phase 0 최대 발견 — 돈 받고 파는 기능 4개가 사이드바에 링크가 없다.**
이용권 페이지가 유료 항목으로 판매 중인데 메뉴에서 도달할 수 없다.

| 이용권 판매 항목 | 실제 라우트 | 판매 등급 | 사이드바 |
|---|---|---|---|
| 경쟁자 분석 | `/competitor` | 무료(한도)·유료(무제한) | ❌ 없음 |
| MY 포스팅 분석 | `/my/post-analysis` | 예비 인플루언서 | ❌ 없음 |
| 키워드 검색순위 | `/keywords/blog-ranking` | 예비 인플루언서 | ❌ 없음 |
| 블로그 글 피드백 (Claude AI) | `/dashboard/claude` | 인플루언서 | ❌ 없음 |

---

## 1. 사이드바 구조 (실측 — `src/lib/sidebar-nav.ts`)

지시서 §2의 「라우트 미확인」 9칸을 전부 채웠다. **25개 항목 전부 페이지 파일이 실재**한다(미싱 0건).
`requiredPlan` 은 사이드바가 선언한 값이며, 서버가 실제로 막는지는 §5에서 따로 본다.

### 대시보드 (`icon: 대`)
| 라벨 | 라우트 | 사이드바 선언 |
|---|---|---|
| ▸ 블로그 | `#blog` | (소제목) |
| 대시보드 | `/dashboard` | authOnly |
| 노출 현황 | **`/my/missing-posts`** ← 미확인이었음 | authOnly |
| 키워드 순위 | `/my/keyword-ranking` | blogger |
| AI 브리핑 · AI 탭 인용 | `/my/naver-mate` | influencer |
| ▸ 인플루언서 | `#influencer` | (소제목) |
| 대시보드 | **`/my`** ← 미확인이었음 | influencer |
| 토픽 | `/topics` | influencer |
| 맞팬 관리 | **`/my/fans`** ← 미확인이었음 | influencer |
| ▸ 포스팅 | `#posting` | (소제목) |
| 맞춤법 검사 | `/dashboard/writing/spellcheck` | blogger |
| 글 심층피드백 | `/my/naver-mate/quality-evaluate` | influencer |

### 네이버 데이터 (`icon: 데`)
| 라벨 | 라우트 | 사이드바 선언 |
|---|---|---|
| 네이버 메이트 | **`/naver-mate-ranking`** ← §3.1 전제와 다름 | authOnly |
| 연도별 선정 현황 | `/stats` | (없음 — 비로그인 허용) |
| 키워드 챌린지 | `/keywords` | influencer |
| 키워드 추천 | `/keywords/recommend` | influencer |
| 키워드 검색 | `/keywords/blogger` | (없음 — 비로그인 허용) |
| 대량 키워드 조회 | **`/keywords/bulk`** ← 미확인이었음 | influencer |
| 기본 명단 | **`/influencers/free-plan`** ← 미확인이었음 | authOnly |
| 전체 리스트 | `/influencers` | influencer |

### 콘텐츠 도구 (`icon: 도`)
| 라벨 | 라우트 | 사이드바 선언 |
|---|---|---|
| 글감 찾기 | `/dashboard/writing/content-angles` | influencer |
| 제목 생성 | `/dashboard/writing/titles` | influencer |
| 컬러 팔레트 | `/dashboard/writing/color-palette` | (없음 — 비로그인 허용) |
| 이미지 편집 | **`/image-editor`** ← 미확인이었음 | authOnly |
| 롱폼 분석 | **`/dashboard/content/youtube`** ← 미확인이었음 | influencer |
| 릴스·쇼츠 분석 | **`/dashboard/content/shortform`** ← 미확인이었음 | influencer |
| 유튜브 음원 추출 | `/dashboard/youtube-stt` | blogger |

### 구글 (`icon: G`)
| Google 색인 관리 | `/dashboard/google-indexing` | blogger |

### 홈 + 하단 링크
- `SIDEBAR_HOME` = `/` → 라벨 **「N인플 AI」** (`sidebar-nav.ts:37`)
- `SIDEBAR_FOOTER_LINKS` (`:114`) — **상단 내비가 아니라 사이드바 하단이다**:
  공지사항 `/notice` · 커뮤니티 `/community` · 성장후기 `/stories` · 이용권 `/subscribe` ·
  서비스소개 `/intro` · 기업용 문의 `/enterprise`
- `SIDEBAR_HIDDEN_PREFIXES` (`:124`) — 이 6개 링크의 도착지에서는 사이드바 자체가 숨는다.

---

## 2. 사이드바에 없는 라우트 (전수)

`src/app/**/page.tsx` 전량 열거 후 사이드바 25개와 admin·auth·법적고지·동적세그먼트를 뺀 결과다.

### 2-A. 이용권이 파는데 메뉴가 없는 것 🔴
| 라우트 | 정체 | 근거 |
|---|---|---|
| `/competitor` | 경쟁자 분석 | `CompetitorDashboard` 렌더 |
| `/my/post-analysis` | MY 포스팅 분석 + 포스팅 데이터 다운로드 | `DOWNLOAD_ROW_LIMIT` import (`:8`) |
| `/keywords/blog-ranking` | 키워드 검색순위 | `checkFeaturePage` 서버가드 사용 (`:2`) |
| `/dashboard/claude` | 블로그 글 피드백 (클로드 AI) | `metadata.title` |

### 2-B. 기능은 살아있는데 메뉴가 없는 것
| 라우트 | 정체 |
|---|---|
| `/dashboard/writing/body` | 본문 생성 |
| `/dashboard/writing/rewrite` | 리라이팅 |
| `/dashboard/ai-consultant` | N인플 AI 상담(홈 `/` 과 별개 진입점) |
| `/blog-quality` | 블로그 품질지수 |
| `/decoder` | 네이버 URL 디코더 |
| `/image-converter` | 이미지 변환 |
| `/keywords/hot`, `/keywords/hot/[categoryCode]` | 인기 키워드 |
| `/my/saved-keywords` | 저장한 키워드 |
| `/my/blogger` | 블로그 분석 섹션 |
| `/my/link` | 블로그 연결 (`plans.ts` 에는 등록돼 있음) |
| `/profile` | 마이페이지 |
| `/discover/influencers` | 인플루언서 발굴 |
| `/influencers/list` | **세 번째 인플루언서 목록** (아래 §3.3) |
| `/guide` | 서비스 미리보기 (비회원 대상) |
| `/download` | 데스크탑 앱 다운로드 |
| `/bot-info` | NinflBot 안내 |
| `/trial` | 체험 |

### 2-C. 별도 하위 제품 (재정리 대상 여부 판단 필요)
`/campaigns` · `/my/campaigns` · `/my/settlements` · `/messages` · `/orangeconnect/**` (9개 라우트)
— 캠페인 모집·원고료 정산·쪽지함. 광고주 매칭 계열로 3분류 축(분석/작성/관리)과 성격이 다르다.

### 2-D. 죽은 라우트 / 리다이렉트
| `/rankings` | **「랭킹 기능은 현재 제공하지 않습니다」** 안내만 있는 껍데기 |
| `/rankings/blogger` | 블로그 순위 |
| `/rankings/influencer` | — |
| `/search-volume` | `/keywords/blogger` 로 `redirect()` (외부링크 호환용, 의도된 것) |

---

## 3. §3 충돌 7건 — 실측 판정

### §3.1 같은 라우트 두 메뉴 노출 → ❌ **오판**
- AI 브리핑 · AI 탭 인용 = `/my/naver-mate`
- 네이버 메이트 = **`/naver-mate-ranking`** (`sidebar-nav.ts:72`)

서로 다른 라우트, 서로 다른 페이지 파일이다. 중복 노출은 없다. **조치 불필요.**

### §3.2 메뉴 소속과 라우트 계층 불일치 → ✅ 사실 (3건 모두)
| 기능 | 메뉴 위치 | 라우트 계층 |
|---|---|---|
| 글 심층피드백 | 대시보드 > 포스팅 | `/my/naver-mate/…` (네이버 메이트 하위) |
| 맞춤법 검사 | 대시보드 > 포스팅 | `/dashboard/writing/…` (글쓰기) |
| 컬러 팔레트 | 콘텐츠 도구 > 이미지 | `/dashboard/writing/…` (글쓰기) |

다만 **URL 계층이 메뉴 계층과 같아야 할 이유는 없다.** 지시서 §4.4도 라우트 변경을 금지한다.
심각도 낮음 — 표시 구조만 재정리하면 되고 라우트는 그대로 둔다.

### §3.3 같은 기능에 명칭 여러 개 → ✅ 사실. 단 **3종이 아니라 최대 4종**이고, 소스는 **4곳**이다
명칭 정의처가 넷이다: `sidebar-nav.ts` / `ai-consultant-catalog.ts` / `plans.ts` / `SubscribeClient.tsx`(JSX 하드코딩).

| 라우트 | 사이드바 | AI 칩 | plans.ts | 이용권 페이지 |
|---|---|---|---|---|
| `/influencers` | 전체 리스트 | **인플루언서 랭킹** | 전체 인플루언서 | 인플루언서 리스트 |
| `/my/missing-posts` | 노출 현황 | **미노출 분석** | 노출 현황 | MY 포스팅 분석(?) |
| `/my/naver-mate` | AI 브리핑 · AI 탭 인용 | AI 브리핑 · AI 탭 | AI 브리핑 | (없음) |
| `/keywords/blogger` | 키워드 검색 | 키워드 검색 | 키워드 검색 | 키워드 검색 ✅ |

「리스트 / 랭킹 / 명단」이 섞이고, 「노출 / 미노출」이 정반대 어휘로 같은 화면을 가리킨다.

### §3.4 키워드 챌린지가 `/keywords` 점유 → ✅ 사실이나 **의도된 것**
`sidebar-nav.ts:75` 주석: *「'키워드 챌린지'(/keywords)는 순위가 아니라 키워드 전체 목록 성격 →
키워드 그룹으로 이동(사용자 요청 2026-08-12)」*. 오렌지 요청으로 이미 옮긴 자리다. **조치 불필요.**

### §3.5 메뉴 없는 미노출 분석 → ❌ **오판**
`/my/missing-posts` 는 사이드바 `:51` 에 **「노출 현황」**으로 있다. 부재가 아니라 §3.3의 명칭 불일치다.

### §3.6 이용권 항목 8건 대응 메뉴 불명 → ⚠️ **5건 해소, 3건 잔존**
| 이용권 표기 | 실측 |
|---|---|
| MY 포스팅 분석 | ✅ `/my/post-analysis` — 메뉴만 없음 |
| 키워드 검색순위 | ✅ `/keywords/blog-ranking` — 메뉴만 없음 (사이드바 「키워드 순위」 `/my/keyword-ranking` 와 **별개 기능**) |
| 경쟁자 분석 | ✅ `/competitor` — 메뉴만 없음 |
| 포스팅 데이터 다운로드 | ✅ 액션형. `/api/downloads/my-keyword-ranking` |
| 키워드 데이터 다운로드 | ✅ 액션형. `/api/downloads/keywords` |
| 커뮤니티 | ✅ `SIDEBAR_FOOTER_LINKS` (지시서가 상단 내비라 한 것은 오판) |
| **MY 블로그** | ❌ 불명. 이 문자열은 `SubscribeClient.tsx:244,418` **두 곳에만** 존재하고 코드 어디에도 대응 라벨이 없다 |
| **MY 키워드 챌린지** | ❌ 불명. 사이드바엔 `/keywords` 「키워드 챌린지」 하나뿐. MY 버전 라우트 없음 |

추가 발견: 이용권의 **「블로그 글 피드백 (Claude AI)」**은 사이드바 「글 심층피드백」과 **다른 페이지**다
(`/dashboard/claude` vs `/my/naver-mate/quality-evaluate`). 지시서는 이 둘을 다루지 않았다.

### §3.7 기능 단위 ≠ 메뉴 단위 (액션형) → ✅ 사실. 그리고 **한도가 등급별로 갈라져 있지 않다**
- `src/lib/csv.ts:46` — `export const DOWNLOAD_ROW_LIMIT = 500;` **상수 하나뿐, 등급 분기 없음.**
- 소비처: `/api/downloads/keywords`, `/api/downloads/my-keyword-ranking`,
  `/my/post-analysis:47`, `AiBriefingSection.tsx:272,289`, `KeywordRankingSection.tsx:223,243`
- 이용권은 **INFLUENCER 의 포스팅 데이터 다운로드를 「무제한」**으로 판다. 코드에는 무제한 경로가 없다.
  → 등급을 올려도 500건에서 잘린다 (**LIMIT_MISMATCH, 유료 고지 위반 소지**).

---

## 4. 지시서와 확정 결정의 충돌 — 착수 전 확인 필요

### 4-1. §6.5 「합산 쿼터 제거」는 이미 내려진 결정과 반대다 🔴
이용권 페이지 「운영 스펙」이 **「무료 이용 — 하루 3회 (회원가입 시 매일)」**를 사용자에게 명시 고지 중이다
(`docs/plan-spec-source.md` §C). 앞선 v1.1 감사에서 **「쿼터 유지, 3회 문구는 정상」으로 확정**됐다.
§6.5 를 그대로 수행하면 판매 페이지의 고지를 코드가 배신한다. **지시서 §9-12 의 선행 확인 대상이기도 하므로 착수하지 않는다.**

### 4-2. §6.1 `lib/features.ts` 신설 vs 기존 `lib/plans.ts`
`src/lib/plans.ts` 가 이미 `FEATURES: Record<FeatureKey, FeatureDefinition>` 33개를 갖고 있다
(등급·쿼터·익명허용). 지시서가 요구하는 `label`·`category`·`kind`·`route`·`apiRoutes`·`showInSidebar` 가 없을 뿐이다.
**새 파일을 만들면 정본이 둘이 된다.** `plans.ts` 를 확장할지, 구조(features)와 권한(plans)을 쪼갤지는 Phase 1에서 제안한다.

### 4-3. 등급 타입이 두 벌이다
- `PlanKey = 'FREE' | 'BLOGGER' | 'INFLUENCER'` (`plans.ts:24`) — 대문자
- `PlanTier = 'free' | 'blogger' | 'influencer'` (`dashboard-catalog.ts`) — 소문자, 사이드바가 사용

`dashboard-catalog.ts` 는 **이제 이 한 줄만 남은 껍데기 파일**인데 6개 파일이 여전히 참조한다.
(`sidebar-nav.ts:3` 주석은 사라진 `DASHBOARD_APPS` 를 아직 가리킨다 — stale.)

### 4-4. 이용권 페이지 자체가 내부 모순
`SubscribeClient.tsx` 카드(`:248`)는 경쟁자 분석 **1일 1회**, 비교표(`:535`)는 **1일 3회**. 정본 미정.

---

## 5. 게이팅 층 (파일 위치)

| 층 | 파일 | 차단 방식 |
|---|---|---|
| 미들웨어 | `src/middleware.ts` | 로그인 여부(페이지 리다이렉트 / API 401), `/api/my/**` 만 유료 402 |
| 페이지 가드 | `src/lib/plan-server-guards.ts` `checkFeaturePage` | **Server Component 판정** → `<FeatureLocked>` 렌더 (리다이렉트 아님) |
| API 가드 | `src/lib/guards/requireFeature.ts` | `plans.ts` FEATURES 조회 → 401 / 403 (`featureLocked:true`) |
| 등급 강제 | `src/lib/admin.ts` `requirePaidPlan`(402) · `requireInfluencerPlan`(403) | `requireFeature` 와 **별개 경로** |
| 쿼터 | `src/lib/free-quota.ts` | RPC 카운터 |
| UI | `src/components/gate/PlanBadge.tsx`, `FeatureLocked.tsx` | 표시 |
| 가격 | `src/lib/payment-config.ts` (정본), `src/lib/pricing.ts` (기업) | — |

게이팅 자체는 **서버측이고 신뢰할 수 있다**. 페이지 21곳이 `checkFeaturePage`, API 49곳이
`requireFeature` 를 쓴다. 클라이언트만 막고 API 가 열린 `CLIENT_ONLY` 패턴은 이번 스캔에서 나오지 않았다.
문제는 차단의 유무가 아니라 **차단 기준이 이용권 판매 문구와 어긋나는 곳**이다(아래 §6).

> 다만 등급 강제 경로가 두 갈래다. `requireFeature`(plans.ts 참조, 403)와
> `requireInfluencerPlan`(하드코딩, 403) · `requirePaidPlan`(402)이 공존해 상태코드와 정본이 갈린다.

---

## 6. 이용권 판매 문구 ↔ 코드 — 실측 결과 **불일치 없음**

> 🚨 **지시서 v2.1 §5.1 의 「이용권 스펙 원문」은 stale 이다.**
> 그 원문은 커밋 `484173e2` 시점의 `/subscribe` 화면이고, 이후 `3d5a7bef` · `de4ead69` 두 커밋이
> 판매 문구를 코드에 맞춰 이미 고쳤다. `docs/plan-spec-source.md` 도 같은 이유로 stale 이다.
> **아래는 `SubscribeClient.tsx` 현재 내용을 직접 읽은 것이다.**

### 6-1. 현재 판매 문구 (실측)

| FREE | 예비 인플루언서 | INFLUENCER |
|---|---|---|
| MY 블로그 | 무료 플랜 전체 포함 | 예비 인플루언서 플랜 전체 포함 |
| 인플루언서 기본 명단 | MY 키워드순위 | 전체 인플루언서 리스트 |
| 연도별 인플루언서 선정 현황 | MY 포스팅 분석 (AI) | 키워드 챌린지 |
| 키워드 검색 (검색량 포함) | 키워드 검색순위 | 제목 생성 (AI) |
| 커뮤니티 | 맞춤법 검사 (데모 제외) | 블로그 글 피드백 (Claude AI) |
| 노출 현황 · 네이버 메이트 · 블로거 순위 | 경쟁자 분석 (무제한) | 포스팅 데이터 다운로드 (1회 500건) |
| N인플 AI 대화 · 블로그 기본 분석 (하루 10회) | | 키워드 데이터 다운로드 (1회 500건) |

### 6-2. 지시서가 문제라고 지목한 것들 — 전부 **이미 해소됨**

| 지시서 §9 미해결 항목 | 실측 | 판정 |
|---|---|---|
| 경쟁자 분석이 무료(1일 1회)인데 코드는 BLOGGER (OVERLOCK) | 무료 카드에서 **삭제됨**. 지금은 예비·인플루언서 「무제한」 = `plans.ts:137` `minPlan: 'BLOGGER'` 와 일치 | ✅ **MATCH** |
| 카드 「1일 1회」 vs 비교표 「1일 3회」 모순 (§9-9) | 카드·비교표 **둘 다 「무제한」**. 모순 없음 | ✅ **해소** |
| 포스팅 데이터 다운로드가 예비인데 코드는 INFLUENCER | 이용권이 **INFLUENCER 로 이동**. `/api/downloads/my-keyword-ranking:29` `requireInfluencerPlan()` 과 일치 | ✅ **MATCH** |
| INFLUENCER 다운로드 「무제한」인데 코드는 500 고정 | **「무제한」 표기가 삭제**됨. 양 등급 모두 「1회 500건」 = `csv.ts:46` 과 일치 | ✅ **MATCH** |
| 키워드 다운로드만 500건인 차등이 의도인가 (§9-10) | 이제 **포스팅·키워드 둘 다 500건**. 차등 자체가 없어짐 | ✅ **해소** |
| 무료 한도 「하루 3회」 (§9-12) | 현재 문구는 **「비회원 3회 / 회원 10회 (매일)」** = `free-quota.ts:23,24` 와 정확히 일치 | ✅ **MATCH** |
| MY 키워드 챌린지 매핑 불명 (§3.6) | 라우트가 없어 **이용권에서 이미 삭제**됨. 지시서 §5.1 에만 남아 있다 | ✅ **해소** |
| 맞춤법 검사 (데모 제외) 등급 | 예비 카드(`:292`)·비교표(`:511`) = `plans.ts:105` `minPlan: 'BLOGGER'` | ✅ **MATCH** |

**결론: 판매 문구와 코드의 등급·한도 불일치는 현재 남아 있지 않다.**
지시서 §9 의 「스펙 자체의 모순」 5건(§9-8~12)은 착수 대상이 아니다.

### 6-3. 그래도 남는 것 — MY 포스팅 분석의 페이지 가드
`src/app/my/post-analysis/page.tsx` 는 `checkFeaturePage` 를 호출하지 않고 미들웨어의 로그인 확인만 받는다.
**다만 이것은 결함이 아니라 의도된 상태다** — 한 화면에 무료 「블로그 기본 분석」(하루 10회)과
유료 AI 분석이 섞여 있고 유료 쪽은 API 에서 `requirePaidPlan` 으로 막힌다. 화면째 잠그면 무료 기능이 죽는다.
이용권 비교표(`:431`)도 무료 칸을 **「기본 분석만」**으로 이미 적고 있다. **손대지 않는다.**

---

## 7. 가격 실측 — 지시서 §7.1 기준값과 10칸 중 5칸이 다르다

정본은 `src/lib/payment-config.ts:25~38` `PLANS` 하나뿐이다. `SubscribeClient.tsx:37~42` 의
`PRICE_TABLE` 은 **같은 숫자를 표시용으로 다시 적어둔 두 번째 정의처**다(값은 일치, 구조적 위험).

| 주기 | 예비 §7.1 | 예비 코드 | 인플 §7.1 | 인플 코드 |
|---|---|---|---|---|
| 1개월 | 5,500 | **5,500** ✅ | 9,900 | **9,900** ✅ |
| 3개월 | 15,675 | **15,700** ❌ +25 | 28,215 | **28,200** ❌ −15 |
| 6개월 | 29,700 | **29,700** ✅ | 53,460 | **53,500** ❌ +40 |
| 9개월 | 42,075 | **42,100** ❌ +25 | 75,735 | **75,700** ❌ −35 |
| 12개월 | 55,000 | **55,000** ✅ | 99,000 | **99,000** ✅ |

코드는 **100원 단위로 반올림**한 값이다. 지시서 §7.1 은 할인율을 곧이곧대로 곱한 값이라
실제 청구액과 다르다. 지시서가 「코드가 다르면 차이를 보고」하라 했으므로 보고만 하고 **고치지 않는다** —
반올림이 의도된 것일 가능성이 높다(§9 로 올림).

**금액 안전성은 문제없다.** 클라이언트는 `planKey` 만 보내고 금액은 서버가 `getPlan()` 으로 조회한다.
`src/lib/billing.ts:127` 에서 `plan.amount` · `intent.amount` · `paidTotal` **3중 대조** 후 통과시킨다.

---

## 6. Phase 1 로 넘기는 결정 사항

1. §2-C 캠페인·정산·오렌지커넥트 계열을 3분류 축에 넣을 것인가, 별도 축으로 뺄 것인가
2. §2-D `/rankings` 껍데기·`/rankings/*` 를 재정리에 포함할 것인가 삭제 후보로 볼 것인가
3. ~~「MY 블로그」·「MY 키워드 챌린지」의 정체~~ → 「MY 키워드 챌린지」는 §8-2 로 해소(본인 한정이
   아니라 MY 를 붙이면 안 되는 이름, 이용권에서 이미 삭제). 「MY 블로그」만 확인 대기
4. ~~유료 판매 중인데 메뉴가 없는 4건을 어디에 넣을 것인가~~ → §8-1 kind 판별 + v2.2 §6 규칙으로
   **4건 모두 menu → 전부 편입** 확정
5. `/influencers` · `/influencers/free-plan` · `/influencers/list` 세 목록의 관계
6. 「글 심층피드백」과 「블로그 글 피드백(Claude AI)」이 별개 상품인가

## 7. 오렌지 확인이 필요한 것 (Phase 2 이후 차단 사유)

| # | 항목 | 상태 |
|---|---|---|
| A | 3·6·9개월 금액의 **100원 반올림**이 의도된 것인가 | ✅ **v2.2 §7 판정 완료 → §8-4.** 화면·결제 양쪽이 같은 반올림값이라 「규칙이 일관됨」. 남은 건 명문화 여부뿐 |
| B | **「MY 블로그」의 정체** | ⏳ v2.2 의 MY 유지 확정으로 `/dashboard` 가 유일 후보가 됐다(`category-proposal.md` §4-3). 확인만 필요 |
| C | §6.5 「합산 쿼터 제거」 지시를 취소할 것인가 | ✅ **v2.2 §5 로 절 자체가 삭제.** 쿼터는 관측 전용, 제거하지 않는다 → §8-5 |
| D | 유료로 파는데 메뉴가 없는 4건(§0)을 사이드바에 올릴 것인가 | ✅ **v2.2 §6 규칙 + §8-1 kind 판별로 결정됨** — 4건 모두 `menu` 라 전부 편입 |

> 지시서 §9 의 나머지 미해결 항목 중 **§9-8(경쟁자 분석 중복 표기) · §9-9(카드/비교표 모순) ·
> §9-10(다운로드 한도 차등) · §9-11(맞춤법 데모) · §9-12(무료 한도)** 는 §6-2 에서 전부 해소 확인됐다.
> §9-13(등급 키 명칭)도 `PlanKey` 3종으로 이미 정리돼 있다. **다시 올리지 말 것.**

---

# 8. 지시서 v2.2 신규 실측 항목

> v2.2 가 새로 요구한 5가지를 코드로 확인한 결과다. 전부 **읽기만 했고 코드는 고치지 않았다.**

## 8-1. 메뉴 없는 유료 기능 4건의 `kind` (v2.2 §6)

**4건 모두 `menu`(독립 화면)다. 판별 불가 0건.**

| 라우트 | 판정 | 코드 근거 |
|---|---|---|
| `/competitor` | **menu** | `page.tsx` 가 자체 탭 상태(`AnalysisTab`)·쿼터·`CompetitorDashboard` 를 렌더 |
| `/my/post-analysis` | **menu** | `page.tsx` 가 자체 화면 상태 + mount 당 조회 토큰(`newViewToken()`) 보유 |
| `/keywords/blog-ranking` | **menu** | `page.tsx:14` `checkFeaturePage('keywords.blog-ranking', …)` 서버 가드 |
| `/dashboard/claude` | **menu** | `page.tsx:14` `checkFeaturePage('ai.deep-chat', …)` 서버 가드 |

→ v2.2 §6 규칙에 따라 **4건 전부 새 구조의 대분류에 편입**한다.
`action` 인 것은 다운로드 2종(`/api/downloads/keywords`, `/api/downloads/my-keyword-ranking`)뿐이고,
이 둘은 사이드바에 올리지 않고 버튼 옆 배지로 처리한다.

## 8-2. MY 항목이 실제로 본인 데이터 한정인가 (v2.2 §3 넷째 규칙)

| 이용권 표기 | 라우트 | 데이터 범위 | 판정 |
|---|---|---|---|
| MY 블로그 | `/dashboard` | 본인 blogId 기준 지표 | ✅ 본인 한정 |
| MY 포스팅 분석 | `/my/post-analysis` | 본인 블로그 포스팅 + 조회 토큰 | ✅ 본인 한정 |
| MY 키워드순위 | `/my/keyword-ranking` | `/api/my/saved-keywords`·`/api/blog/posts?blogId=` 등 본인 blogId 고정 | ✅ 본인 한정 |
| MY 인플루언서 | `/my` | 본인 `naverId`·`internalUserId` 로 조회 | ✅ 본인 한정 |
| **MY 키워드 챌린지** | `/keywords` | `Client.tsx:247` `/api/keywords` — **전체 키워드 목록** | 🚨 **본인 한정 아님** |

🚨 「MY 키워드 챌린지」는 MY 를 붙이면 안 되는 이름이다. 다만 **이미 이용권 페이지에서 삭제된
표기**라 지금 화면에 나타나는 곳이 없다. 되살리지 말 것.

## 8-3. 롱폼 분석이 무엇을 산출하는가 (v2.2 §9 신규)

`/api/content/youtube/analyze` 응답 형태(`ContentAnalysisClient.tsx:5~33`):

- **타 채널 성과 지표** — `viewCount` · `likeCount` · `commentCount` · `durationSeconds` · `channelTitle`
- **구조 점수 4종** — `hookScore` · `infoScore` · `readabilityScore` · `ctaScore` (각 10점 만점)
- **기획 재료** — `chapters[]`(시간·라벨) · `recurringThemes[]` · `dropOffRiskNote` · `colorPalette`

즉 **측정치와 기획 재료가 한 화면에 같이 나온다.** 어느 쪽이 주 용도인지는 코드로 결정되지 않으므로
두 후보와 근거를 `category-proposal.md` §3-2 에 올리고 결정을 기다린다. 임의 배치하지 않았다.

## 8-4. 금액 반올림 — v2.2 §7 판정 (판정: **규칙이 일관됨**)

| 지점 | 값(3개월 예비/인플) | 성격 |
|---|---|---|
| 화면 표기 | `SubscribeClient.tsx:39` `PRICE_TABLE` → **15,700 / 28,200** | 반올림값 |
| 결제 요청 금액 | `BillingButton.tsx:167` `totalAmount: issueData.amount` ← 서버 `/api/portone/billing/issue` → `getPlan(planKey)` → `payment-config.ts` **15,700 / 28,200** | 반올림값 |

**클라이언트는 `planKey` 만 보내고 금액은 서버가 정한다**(`issue/route.ts:9,25,49`).
즉 화면 표기 = 결제 요청 = 같은 반올림값 → v2.2 §7 판정표의 **「반올림값 / 반올림값 = 규칙이
일관됨」**에 해당한다. **결제 고지 불일치는 없다.**

- 반올림 단위: **100원**. 적용 지점은 정의처 두 곳에 이미 반올림된 상수로 박혀 있고,
  런타임에 반올림하는 코드는 없다(`Math.round` 는 `SubscribeClient.tsx:93` 의 *월 환산 표시*에만 쓰인다).
- 정의처는 둘이다 — `payment-config.ts:25~38` `PLANS`(정본) / `SubscribeClient.tsx:37~42`
  `PRICE_TABLE`(표시용 재기재). **값은 10칸 전부 일치**하지만 구조적으로는 갈라질 수 있는 자리다.
- 후속 제안(승인 대상): 반올림 규칙을 코드에 명문화하고 지시서 §7.1 기준값 쪽을 교체.
  **금액은 고치지 않았다.**

## 8-5. 합산 차감 쿼터 — 관측 기록 (v2.2 §5, 관측 전용·수정 금지)

| 항목 | 실측 |
|---|---|
| 카운터 정의 위치 | 테이블 `free_daily_usage`(`migration-138`·`migration-148`). 코드는 `src/lib/free-quota.ts` · `src/lib/analysis-quota.ts` 두 곳만 이 테이블을 만진다(`competitor-quota.ts` 는 자체 카운터 없는 얇은 래퍼) |
| 차감 로직 | 서버 RPC. subject 키가 `user:{id}` / `ip:{hash}`, 유료 남용 상한은 같은 테이블의 `paidcap:{id}` 로 **예산만 분리** |
| 초기화 | Postgres `current_date` 위임. **타임존 미지정** — UTC 로 돌면 KST 09:00 리셋이다(DB 실측 미수행) |
| 별도 카운터 | `tool_anon_quota` = 완전 별개 테이블, 도구별 각 30회. 공용 풀과 합치지 않기로 이미 결정됨 |
| 헤더 표시 | `UsageQuotaBadge.tsx:54,60` — 「무료 N회 남음 (하루 N회 · AI·분석 기능 합산)」. **크레딧이 아니라 이 카운터를 읽는다** |
| 「크레딧 100」과 같은 자원인가 | ❌ **아니다.** 크레딧은 `credit-gate.ts:20` `CREDITS_ENABLED` 가 `.env` 에 없어 기본 false → 전 구간 no-op. 헤더 배지에도 크레딧은 나오지 않는다 |
| 결제·정산 연결 | ❌ **없다.** `free_daily_usage` 를 참조하는 코드는 위 2개 모듈뿐이고 결제·정산 경로에서 읽지 않는다 |

→ 결론: **제거 대상이 아니며 이번 작업 범위 밖이다.** 관련 문구(3회·남음·합산·차감)도 손대지 않는다.
