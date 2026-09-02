# N인플 네비게이션 분류 감사 (지시서 v1.0) — Phase 1 리포트

- 작성: 2026-09-02
- 기준 커밋: `a304cb8a`
- 상태: **감사만 완료. 코드 미변경. §5 승인 대기**
- 검증 방식: 코드 정적 대조 (등급별 실계정이 없어 HTTP 실측 불가 — [[ninfle-plan-gating-audit]] 와 동일 한계)

---

## 1. 정의 위치 조사 결과

| 영역 | 정의 파일 | 렌더 |
|---|---|---|
| 사이드바 | `src/lib/sidebar-nav.ts` — `SIDEBAR_HOME`(:37) · `SIDEBAR_GROUPS`(:39) · `SIDEBAR_FOOTER_LINKS`(:115) | `src/components/AppSidebar.tsx:241~356` |
| 상단 네비 | **독립 정의 없음** — `src/components/Header.tsx:78` 이 `SIDEBAR_FOOTER_LINKS` 를 그대로 재사용. 비로그인은 `authOnly` 필터본(`GUEST_NAV_LINKS`, `:18`) | `Header.tsx:108~116` |
| 추천 칩 | `src/lib/ai-consultant-catalog.ts` — `AI_CONSULTANT_CATALOG`(:29), 16개 | `AiConsultantClient.tsx:49` `FEATURE_SHORTCUTS` = `external` 제외 → **15개**, `:452~460` |

파생 소비처(정의 아님): `HeaderSearch.tsx:14` 가 `SIDEBAR_GROUPS` 에서 검색 색인을 만든다.

### 중복 정의 여부: **있음 (3축)**

1. **등급 값이 두 벌.** 사이드바 `requiredPlan` 은 `sidebar-nav.ts` 에 **하드코딩**돼 있고 `src/lib/plans.ts` 의 `FEATURES` 를 import 하지 않는다(`sidebar-nav.ts:7` 은 타입만 가져온다). 대조 결과 **값 자체는 25개 전부 일치**하지만 정본이 둘이다.
2. **명칭이 네 벌.** `sidebar-nav.ts` / `ai-consultant-catalog.ts` / `plans.ts` `FEATURES[].label` / 각 페이지 `<h1>`. → §3-4 라벨 불일치 6건의 구조적 원인.
3. **href 가 두 벌.** 사이드바와 칩이 같은 15개 경로를 각각 따로 적는다.

상단 네비는 중복이 아니다(동일 배열 재사용).

> 지시서 §5.1 마지막 문단대로 **단일 소스화는 이번 범위가 아니다.** 발견 사실만 기록한다(⚠3 참조).

### 라우트 실재 여부: **미싱 0건**

사이드바 25 + 하단/상단 6 + 홈 1 = 32개 href 전부 대응 `page.tsx` 가 존재한다. 404·미구현·리다이렉트 0건.

---

## 2. 전체 매핑 표

권한 열 표기: `M`=미들웨어 로그인 게이트(`MEMBER_ONLY_GATE_PREFIXES`) · `P`=페이지/레이아웃 `checkFeaturePage` · `—`=가드 없음(공개)

### 2-1. 사이드바

> ⚠️ **이 표는 감사 시점(2026-09-02 오전, v2.3 적용 전) 스냅샷이다.** 오후에 §5 2차 승인으로
> 대분류가 **분석 / 작성 / 관리** 3개로 재편되고 유료 4건이 신설돼, 아래 「카테고리」 열은 현행과 다르다.
> 항목별 href·plans.ts 키·실제 가드는 그대로 유효하다. 현행 트리는 `src/lib/sidebar-nav.ts` 가 정본.

| 카테고리 | 항목(라벨) | 표시 배지 | href | 라우트 | plans.ts 키 / minPlan | 실제 가드 | 페이지 실제 기능(h1) |
|---|---|---|---|---|---|---|---|
| (단독) | N인플 AI | 없음 | `/` | ✅ | `ai.consultant` / FREE+익명 | — (라우트 402) | AI 상담 + 추천 칩 |
| 대시보드 › 블로그 | 대시보드 | 무료 | `/dashboard` | ✅ | `dashboard.blog` / FREE | page 자체 체크 | 대시보드 |
| 대시보드 › 블로그 | 노출 현황 | 무료 | `/my/missing-posts` | ✅ | `my.missing-posts` / FREE | M | (전용 h1 없음) |
| 대시보드 › 블로그 | 키워드 순위 | 예비 인플루언서 | `/my/keyword-ranking` | ✅ | `my.keyword-ranking` / BLOGGER | M+P | 키워드순위 |
| 대시보드 › 블로그 | AI 브리핑 · AI 탭 인용 | 인플루언서 | `/my/naver-mate` | ✅ | `my.naver-mate` / INFLUENCER | M+P | AI 브리핑 · AI 탭 |
| 대시보드 › 인플루언서 | 대시보드 | 인플루언서 | `/my` | ✅ | `my.dashboard` / INFLUENCER | page 자체(의도) | 내 대시보드 |
| 대시보드 › 인플루언서 | 토픽 | 인플루언서 | `/topics` | ✅ | `topics.browse` / INFLUENCER | P(layout) | 토픽 |
| 대시보드 › 인플루언서 | 맞팬 관리 | 인플루언서 | `/my/fans` | ✅ | `my.fans` / INFLUENCER | M+P | — |
| 대시보드 › 포스팅 | 맞춤법 검사 | 무료 | `/dashboard/writing/spellcheck` | ✅ | `writing.spellcheck` / FREE **+익명** | P | — |
| 대시보드 › 포스팅 | 글 심층피드백 | 인플루언서 | `/my/naver-mate/quality-evaluate` | ✅ | `blog.quality-evaluate` / INFLUENCER | M+P | 글 심층피드백 |
| 네이버 데이터 › 랭킹 | 네이버 메이트 | 무료 | `/naver-mate-ranking` | ✅ | `rankings.naver-mate` / FREE | M | 네이버 메이트 |
| 네이버 데이터 › 랭킹 | 연도별 선정 현황 | 없음(공개) | `/stats` | ✅ | **미등록** | — | 연도별 통계 |
| 네이버 데이터 › 키워드 | 키워드 챌린지 | 인플루언서 | `/keywords` | ✅ | `keywords.challenge` / INFLUENCER | M+P | **키워드 전체 목록** |
| 네이버 데이터 › 키워드 | 키워드 추천 | 인플루언서 | `/keywords/recommend` | ✅ | `keywords.recommend` / INFLUENCER | M+P | — |
| 네이버 데이터 › 키워드 | 키워드 검색 | 없음(공개) | `/keywords/blogger` | ✅ | `keywords.blogger-search` / FREE **+익명** | — (공개 예외) | — |
| 네이버 데이터 › 키워드 | 대량 키워드 조회 | 인플루언서 | `/keywords/bulk` | ✅ | `keywords.bulk` / INFLUENCER | M+P | — |
| 네이버 데이터 › 리스트 | 기본 명단 | 무료 | `/influencers/free-plan` | ✅ | `influencers.free-plan` / FREE | M | **리스트(무료)** |
| 네이버 데이터 › 리스트 | 전체 리스트 | 인플루언서 | `/influencers` | ✅ | `influencers.list` / INFLUENCER | M+P | **리스트(유료)** |
| 콘텐츠 도구 › 글쓰기 | 글감 찾기 | 인플루언서 | `/dashboard/writing/content-angles` | ✅ | `writing.content-angles` / INFLUENCER | P | — |
| 콘텐츠 도구 › 글쓰기 | 제목 생성 | 인플루언서 | `/dashboard/writing/titles` | ✅ | `writing.titles` / INFLUENCER | P | — |
| 콘텐츠 도구 › 이미지 | 컬러 팔레트 | 없음(공개) | `/dashboard/writing/color-palette` | ✅ | **미등록** | — | 컬러 팔레트 |
| 콘텐츠 도구 › 이미지 | 이미지 편집 | 무료 | `/image-editor` | ✅ | `tools.image-editor` / FREE | M | — |
| 콘텐츠 도구 › 유튜브·인스타 | 롱폼 분석 | 인플루언서 | `/dashboard/content/youtube` | ✅ | `content.youtube` / INFLUENCER | P | — |
| 콘텐츠 도구 › 유튜브·인스타 | 릴스·쇼츠 분석 | 인플루언서 | `/dashboard/content/shortform` | ✅ | `content.shortform` / INFLUENCER | P | — |
| 콘텐츠 도구 › 유튜브·인스타 | 유튜브 음원 추출 | 예비 인플루언서 | `/dashboard/youtube-stt` | ✅ | `content.youtube-stt` / BLOGGER | P | — |
| **구글** | Google 색인 관리 | 예비 인플루언서 | `/dashboard/google-indexing` | ✅ | `google.indexing` / BLOGGER | P | — |

> 🚨 **지시서 §3.1 목록에 「구글」 대분류가 통째로 빠져 있다.** `sidebar-nav.ts:105~111` 에 실재하는 4번째 대분류이고, 「콘텐츠 도구」 하위가 아니다(⚠2 답).
>
> 🚨 **지시서 §3.1 이 「콘텐츠 도구」로 추정한 하위 항목**은 위 표대로 3개 소그룹 7개다(⚠2 답).

### 2-2. 상단 네비 = 사이드바 하단 (동일 배열)

| 항목 | href | 라우트 | plans.ts | 실제 가드 |
|---|---|---|---|---|
| 공지사항 | `/notice` | ✅ | `notice.read` / FREE | — |
| 커뮤니티 | `/community` | ✅ | `community.read` / FREE | — |
| 성장후기 | `/stories` | ✅ | 미등록 | 목록 공개 / `/stories/write` 만 로그인 |
| 이용권 | `/subscribe` | ✅ | 미등록(판매 페이지) | — |
| 서비스소개 | `/intro` | ✅ | 미등록 | — |
| 기업용 문의 | `/enterprise` | ✅ | 미등록 | — |

지시서 §3.2 의 **「네이버 검색데이터 분석」은 메뉴가 아니다** → §3-3 C-2.

### 2-3. 추천 칩 15개

| 칩 라벨 | href | 칩 `authOnly` | 사이드바 라벨 | plans.ts minPlan | 라벨 일치 | 배지 |
|---|---|---|---|---|---|---|
| 미노출 분석 | `/my/missing-posts` | true | **노출 현황** | FREE | ❌ | 없음 |
| 키워드 추천 | `/keywords/recommend` | true | 키워드 추천 | INFLUENCER | ✅ | 없음 |
| 키워드 검색 | `/keywords/blogger` | false | 키워드 검색 | FREE+익명 | ✅ | 없음 |
| 키워드 순위 | `/my/keyword-ranking` | true | 키워드 순위 | BLOGGER | ✅ | 없음 |
| 글감 찾기 | `/dashboard/writing/content-angles` | true | 글감 찾기 | INFLUENCER | ✅ | 없음 |
| 제목 생성 | `/dashboard/writing/titles` | true | 제목 생성 | INFLUENCER | ✅ | 없음 |
| 맞춤법 검사 | `/dashboard/writing/spellcheck` | **true** | 맞춤법 검사 | FREE **+익명** | ✅ | 없음 |
| 글 심층피드백 | `/my/naver-mate/quality-evaluate` | true | 글 심층피드백 | INFLUENCER | ✅ | 없음 |
| AI 브리핑 · AI 탭 | `/my/naver-mate` | true | **AI 브리핑 · AI 탭 인용** | INFLUENCER | ❌ | 없음 |
| Google 색인 관리 | `/dashboard/google-indexing` | true | Google 색인 관리 | BLOGGER | ✅ | 없음 |
| 인플루언서 랭킹 | `/influencers` | **false** | **전체 리스트** | **INFLUENCER** | ❌ | 없음 |
| 토픽 | `/topics` | true | 토픽 | INFLUENCER | ✅ | 없음 |
| 키워드 챌린지 | `/keywords` | true | 키워드 챌린지 | INFLUENCER | ✅ | 없음 |
| 유튜브 음원 추출 | `/dashboard/youtube-stt` | true | 유튜브 음원 추출 | BLOGGER | ✅ | 없음 |
| 컬러 팔레트 | `/dashboard/writing/color-palette` | false | 컬러 팔레트 | 미등록(공개) | ✅ | 없음 |

**칩 15개 href 는 전부 사이드바에 존재한다.** 반대 방향(사이드바에만 10건)은 §3-4 D-7.

---

## 3. 불일치 목록

### 3-1. 기준 A 위반 (라우트 / 페이지 기능)

**404·미구현·리다이렉트: 0건.** 아래는 라벨↔기능 및 세그먼트↔카테고리 불일치다.

| # | 항목 | 문제 | 근거 | 제안 조치 |
|---|---|---|---|---|
| A-1 | 키워드 챌린지 | 라벨은 「키워드 챌린지」인데 페이지 h1 이 **「키워드 전체 목록」**이고, 데이터도 `/api/keywords` **전체 목록**이다(본인 참여분 한정 아님). 라벨이 기능을 좁게 표현 | `sidebar-nav.ts:77` · `keywords/Client.tsx` h1 · `Client.tsx:247` | 라벨 또는 h1 중 어느 쪽이 정본인지 **오렌지 판단 필요**(지시서 §7 라벨 변경 금지) |
| A-2 | AI 브리핑 · AI 탭 인용 | 라우트 세그먼트가 `/my/naver-mate` 인데 실제 기능은 AI 브리핑이다. **「네이버 메이트」는 `/naver-mate-ranking`** 이라 서로 다른 기능이 같은 단어를 세그먼트로 쓴다 | `sidebar-nav.ts:53` vs `:73` | 라우트 변경은 지시서 §7 금지. **보고만** |
| A-3 | 글 심층피드백 | 세그먼트가 `/my/naver-mate/quality-evaluate` 로 A-2 하위인데, 사이드바 카테고리는 「대시보드 › 포스팅」이다. 세그먼트 상위(`AI 브리핑`)와 카테고리가 다름 | `sidebar-nav.ts:63` | 라우트 변경 금지. **보고만**. 카테고리는 §4 충돌 3 |
| A-4 | 맞춤법 검사 | 세그먼트 `/dashboard/writing/*` 인데 **같은 세그먼트의 다른 3건(글감 찾기·제목 생성·컬러 팔레트)은 전부 「콘텐츠 도구」**에 있다. 이 항목만 「대시보드 › 포스팅」 | `sidebar-nav.ts:60` vs `:94,95,97` | 카테고리 이동 후보 → §5 승인 #1 |

### 3-2. 기준 B 위반 (권한 배지)

| # | 항목 | 문제 | 근거 | 제안 조치 |
|---|---|---|---|---|
| **B-1** 🔴 | **추천 칩 15개 전부** | **배지가 하나도 렌더되지 않는다.** `AiConsultantFeature.authOnly` 는 주석에 "추천 카드에 «로그인 필요» 뱃지 표시용"이라 적혀 있으나, 칩도 AI 추천 카드도 `f.label` 만 출력한다. 그 결과 INFLUENCER 8건·BLOGGER 2건이 **잠금 표시 없이** 노출된다(사이드바는 자물쇠+배지를 붙인다) | `ai-consultant-catalog.ts:23~24` (선언) · `AiConsultantClient.tsx:452~460` (칩) · `:501~530` (추천 카드) · `grep authOnly src/` = 렌더 0건 | 배지 추가 여부는 **오렌지 판단**(⚠5 와 연동) |
| **B-2** 🔴 | 인플루언서 랭킹 (칩) | `authOnly: false` 로 선언 — **비로그인도 되는 것처럼 적혀 있다.** 실제 `/influencers` 는 `influencers.list` = **INFLUENCER** + `checkFeaturePage` + 미들웨어 로그인 게이트 | `ai-consultant-catalog.ts:121` vs `plans.ts:144` · `influencers/page.tsx` · `middleware.ts:179`(exact match) | 선언이 틀렸다. 코드가 옳음 |
| **B-3** | 맞춤법 검사 (칩) | `authOnly: true` 인데 `writing.spellcheck` 는 **`allowAnonymous: true`**(2026-09-01 무료·비로그인 전환). 사이드바는 고쳤으나 칩 카탈로그가 안 따라옴 | `ai-consultant-catalog.ts:87` vs `plans.ts:111~116` · `sidebar-nav.ts:59~60` | 선언이 stale. 코드가 옳음 |
| B-4 | 사이드바 전체 | `requiredPlan` 이 `plans.ts` 를 읽지 않고 **하드코딩**이다. **다만 25개 값 대조 결과 불일치 0건** — 현재는 우연히 맞다 | `sidebar-nav.ts:7,12` | 값 수정 불필요. 구조는 ⚠3 |
| B-5 | 연도별 선정 현황 | 「네이버 데이터 › 랭킹」 두 항목 중 이것만 `authOnly` 가 없다(같은 그룹 「네이버 메이트」는 로그인 필요). `plans.ts` **미등록** + 가드 없음 = 완전 공개. **배지 없음은 실제와 일치**하나 그룹 내 유일 | `sidebar-nav.ts:74` · `plans.ts` 미등록 | 실제 동작이 맞는지 **오렌지 확인 필요** |
| B-6 | 컬러 팔레트 | 「콘텐츠 도구 › 이미지」 두 항목 중 이것만 `authOnly` 없음. `plans.ts` **미등록**, 페이지 주석이 "로그인·구독 없이 공개 제공"이라 명시 → 의도된 공개. 같은 소그룹 「이미지 편집」은 `tools.image-editor` FREE + 미들웨어 로그인 게이트 | `color-palette/page.tsx:8` · `sidebar-nav.ts:97,98` | 의도 확인됨. **UNMAPPED 로만 기록** |

> **UNMAPPED 2건**: `/stats`, `/dashboard/writing/color-palette` — 사이드바에는 있으나 `plans.ts` `FEATURES` 에 없다. 둘 다 실제로 공개라 누출은 아니다.

### 3-3. 기준 C 위반 (상단 네비 정합성)

| # | 항목 | 문제 | 근거 | 제안 조치 |
|---|---|---|---|---|
| C-1 | 하단/상단 6개 | 상단 네비와 사이드바 하단이 **같은 배열**이라 경로 불일치는 구조적으로 불가능. 다만 `SIDEBAR_HIDDEN_PREFIXES` 가 그 6개 목적지를 **전부 포함**해, 해당 페이지에서는 사이드바가 사라지고 상단 네비만 남는다 | `Header.tsx:78` · `sidebar-nav.ts:125~134` | 의도로 보임. **확인만** |
| **C-2** 🚨 | 「네이버 검색데이터 분석」 | **메뉴 항목이 아니다.** `Header.tsx:102~104` 의 정적 태그라인(`네이버 검색 데이터 분석`)이고 `<Link>` 가 아니라 `<span>`, `lg` 이상에서만 보인다 | `Header.tsx:102~104` | 지시서 §3.2 전제 오류. **감사 대상에서 제외** |
| C-3 | 비로그인 상단 네비 | `GUEST_NAV_LINKS = SIDEBAR_FOOTER_LINKS.filter(!authOnly)` 인데 6개 중 `authOnly` 인 항목이 **하나도 없다** → 필터가 항상 전부 통과. 로그인/비로그인 분기가 사실상 무동작 | `Header.tsx:18,78` · `sidebar-nav.ts:116~121` | 죽은 분기. **보고만** |

### 3-4. 기준 D 기타 발견

| # | 항목 | 문제 | 근거 |
|---|---|---|---|
| **D-1** 🔴 | `/influencers` | **한 화면이 네 가지 이름으로 불린다** — 사이드바 「전체 리스트」 / 칩 「인플루언서 랭킹」 / plans.ts 「전체 인플루언서」 / 페이지 h1 **「리스트(유료)」** | `sidebar-nav.ts:84` · `ai-consultant-catalog.ts:117` · `plans.ts:144` · `InfluencersListClient.tsx:213` |
| D-2 | `/influencers/free-plan` | 사이드바·plans.ts 「기본 명단」 / 페이지 h1 **「리스트(무료)」** | `sidebar-nav.ts:83` · `plans.ts:143` · `free-plan/page.tsx:7` |
| D-3 | `/my/missing-posts` | 사이드바·plans.ts 「노출 현황」 / 칩 **「미노출 분석」** | `sidebar-nav.ts:51` · `plans.ts:86` · `ai-consultant-catalog.ts:32` |
| D-4 | `/my/naver-mate` | 사이드바 「AI 브리핑 · AI 탭 **인용**」 / 칩·페이지 h1 「AI 브리핑 · AI 탭」 / plans.ts 「**AI 브리핑**」 | `sidebar-nav.ts:53` · `ai-consultant-catalog.ts:101` · `plans.ts:96` · `AiBriefingSection.tsx` |
| D-5 | `/my/keyword-ranking` | 사이드바·칩·plans.ts 「키워드 순위」 / 페이지 h1 **「키워드순위」**(띄어쓰기 없음) | `KeywordRankingSection.tsx` |
| D-6 | `/dashboard` ↔ `/my` | **사이드바 안에 「대시보드」 라벨이 두 개**다(블로그 하위 / 인플루언서 하위). 하위그룹 제목으로만 구분되고, plans.ts 는 각각 「대시보드」·「인플루언서 대시보드」, 페이지 h1 은 「대시보드」·「내 대시보드」 | `sidebar-nav.ts:50,55` · `plans.ts:83,103` |
| D-7 | 칩 ↔ 사이드바 | 칩 15개는 전부 사이드바에 있으나, **사이드바에만 있는 10건**: `/dashboard` · `/my` · `/my/fans` · `/naver-mate-ranking` · `/stats` · `/keywords/bulk` · `/influencers/free-plan` · `/image-editor` · `/dashboard/content/youtube` · `/dashboard/content/shortform` | §2-1 / §2-3 대조 |
| D-8 | 3영역 전부 누락 | 판매 중인 유료 화면 4건이 사이드바·상단 네비·칩 **어디에도 없다**: `/competitor`(경쟁자 분석) · `/my/post-analysis`(MY 포스팅 분석) · `/keywords/blog-ranking`(키워드 검색순위) · `/dashboard/claude`(심층 대화) | `plans.ts:150,133,189` · `docs/feature-inventory.md` 선행 기록 |
| D-9 | 칩 카탈로그 | `authOnly` 필드가 **완전히 죽어 있다** — 카탈로그 → API 응답 → `Recommendation` 인터페이스까지 전파되지만 렌더 지점이 0곳 | B-1 과 동일 근거 |

---

## 4. 기준 간 충돌 항목

> 지시서 §5.3 · §7 에 따라 **자동 해결하지 않는다.** ⚠1(기준 간 우선순위) 미확정 상태에서는 전부 보류다.

| # | 항목 | 기준 A 결론 | 기준 B 결론 | 기준 C/D 결론 | 충돌 내용 |
|---|---|---|---|---|---|
| 충돌 1 | **키워드 순위** (`/my/keyword-ranking`) | `/my/*` = 개인화 → **「대시보드 › 블로그」 유지가 옳다** | 그룹 내 유일한 「예비 인플루언서」 배지(형제 3건은 무료·무료·인플루언서) → 배지 일관성으로는 근거 없음, **판정 불가** | D: 라벨은 3곳 일치 | 지시서 §6-1 제기 건. A 는 "그대로 두라", B 는 답을 못 준다. **「네이버 데이터 › 키워드」로 옮길 근거는 라우트에 없다** — 그 그룹은 비개인화 데이터 전용(`sidebar-nav.ts:68` 주석) |
| 충돌 2 | **AI 브리핑 · AI 탭 인용** (`/my/naver-mate`) | `/my/*` = 개인화 → 「대시보드」 소속 확정. **블로그/인플루언서 중 어디인지는 라우트로 안 갈린다** | INFLUENCER 배지 → 형제가 전부 INFLUENCER 인 **「인플루언서」 하위그룹과 일치** (현재는 「블로그」 하위, 형제는 FREE·FREE·BLOGGER) | D-4 라벨 3중 불일치 | 지시서 §6-2 제기 건. A 판정 불가 / B 는 이동 지지. **우선순위 미확정이라 보류** |
| 충돌 3 | **글 심층피드백** (`/my/naver-mate/quality-evaluate`) | 세그먼트 상위가 `/my/naver-mate`(AI 브리핑) → 「대시보드」 소속. 「콘텐츠 도구」 근거 없음 | INFLUENCER — 「포스팅」 그룹의 다른 항목(맞춤법 검사)은 FREE+익명 → **그룹 내 배지가 갈린다** | — | 지시서 §6-4 제기 건. A 는 대시보드 유지, B 는 그룹이 이질적임을 지적. **A·B 결론이 다름 → 보류** |
| 충돌 4 | **연도별 선정 현황** (`/stats`) | 라우트·기능 모두 비개인화 통계 → 「네이버 데이터 › 랭킹」 적합 | `plans.ts` **미등록** = 등급 축 밖. 배지 판정 자체가 불가 | B-5 | A 는 현행 유지, B 는 판정 불가. 실질 충돌은 아니나 **등록 여부가 오렌지 결정 사항**(⚠4 계열) |

---

## 5. 승인 요청 목록

> **2026-09-02 오렌지 승인 결과 — 5-A 3건(+1-a)만 실행, 5-B 7건은 보류 유지.**
> - **1 + 1-a 승인**: 맞춤법 검사를 「콘텐츠 도구 › 글쓰기」로 이동, 「포스팅」 소분류 해체,
>   글 심층피드백을 **대시보드 대분류 직속**(`bullet: true`)으로 승격. → 반영 완료
> - **2·3 승인**: 칩 `authOnly` 선언 정합성만 교정. → 반영 완료
> - **5(D-1 `/influencers` 명칭) 정본 = 「전체 리스트」**(사이드바 현행)로 지정됨.
>   단 **라벨 통일 실행은 이번 범위 밖** — 칩/`plans.ts`/페이지 h1 은 그대로 두고 다음 회차로 넘긴다.
> - **4(칩 등급 배지) 이번엔 붙이지 않음.** 선언 정합성만 맞추고 새 UI 는 만들지 않는다.
>
> **후속 (`20bf92d6`)**: 오렌지 지시로 **죽은 `authOnly` 필드 자체를 제거**했다.
> 위 2·3번(값 교정)은 이 커밋으로 무의미해졌고, B-1 은 "선언은 있으나 렌더 안 됨"이 아니라
> **"선언조차 없음"** 상태가 됐다. 유료 칩 10건에 잠금 표시가 없는 사실은 그대로다 —
> 붙이려면 `plans.ts` 를 근거로 새로 구현해야 한다.

> **2026-09-02 2차 승인 — D-8(§5-B 9번) 해소: v2.3 트리 전면 적용.**
> 오렌지 결정 4건:
> 1. **진행 방식 = v2.3 트리 전면 적용** — 4건을 현행 구조에 끼워 넣지 않고
>    `docs/category-proposal.md` §6 대로 대분류를 **분석 / 작성 / 관리** 3개로 재편했다.
>    구 체계(대시보드·네이버 데이터·콘텐츠 도구·구글)는 «데이터가 개인화냐»로 갈라서
>    같은 목적의 기능이 그룹을 넘나들었다(내 키워드순위 ↔ 키워드 검색순위).
> 2. **신설 범위 = 유료 4건만** — `/my/post-analysis` · `/keywords/blog-ranking` ·
>    `/competitor` · `/dashboard/claude`. `/my/saved-keywords` 와 `/my/link` 는 제외했고,
>    그 결과 v2.3 이 예정했던 「관리 › 내 자료」 소분류는 **만들지 않았다**(소분류 8개, 9개 아님).
> 3. **`/influencers` 라벨 = 「인플루언서 순위」** — 위 1차 승인의 「전체 리스트」를 **번복**한 값이다.
>    v2.3 트리를 통째로 채택하면서 그 안의 명칭을 함께 채택했다. §5-B 5번의 정본은 이쪽이다.
> 4. **「구글」 대분류 흡수** — `/dashboard/google-indexing` 은 「관리 › 검색 노출 › 색인 관리」로
>    들어갔다. 네이버 노출(노출 현황)과 구글 색인은 둘 다 "내 글이 검색에 잡히나"라서 한 묶음이다.
>
> D-6(「대시보드」 라벨 2개)은 이 재편의 부수 효과로 해소됐다 — **MY 블로그** / **MY 인플루언서** 로 갈렸다.
> 신설 4건의 `requiredPlan` 은 전부 `plans.ts` 의 `minPlan` 을 옮긴 값이라 §7 "권한 배지 임의 조정"에
> 해당하지 않는다. 단 `/my/post-analysis` 는 **화면 자체가 로그인 전용**이고 유료 경계는
> AI 분석·`downloads.post-analysis` 에 있어 `authOnly` 만 붙였다(등급 배지 없음).
> 서버 차단은 3건이 이미 걸려 있었고, `/my/post-analysis` 만 `middleware.ts` 의
> `GATE_HANDLED_ELSEWHERE` 에 등록했다(실제 가드는 `app/my/post-analysis/layout.tsx` 의 `requireLoginPage`).

### 5-A. 네 기준이 같은 결론을 가리켜 §5.3 수정 대상이 되는 건

| # | 건 | 근거 | 수정 내용 (정의 파일만) |
|---|---|---|---|
| **1** | **맞춤법 검사 → 「콘텐츠 도구 › 글쓰기」 이동** | ① 기준 A-4: 세그먼트 `/dashboard/writing/*` 의 나머지 3건이 전부 콘텐츠 도구다. ② 기준 B: `allowAnonymous: true` — **비로그인도 쓴다.** 그런데 「대시보드」 그룹의 정의는 `sidebar-nav.ts:42` 주석에 *"로그인한 user_id 의 실제 데이터에 기반해 동작하는 기능만"* 이라고 못박혀 있다 → **그룹 정의 자체를 위반**한다 | `sidebar-nav.ts` 에서 항목 1줄 이동 |
| **1-a** | ↳ **연동 결정 필요** | 1번을 실행하면 「대시보드 › 포스팅」 소그룹에 **「글 심층피드백」 1건만** 남는다. v2.2 확정 규칙 *"항목 하나뿐인 소분류는 대분류 직속으로 올린다"* 가 발동한다 | 「포스팅」 heading 삭제 + 글 심층피드백을 대시보드 직속으로 (또는 충돌 3 결론에 따름) |
| **2** | **칩 `influencer-list.authOnly` `false` → `true`** (B-2) | 네 기준 모두 동일 결론. `/influencers` 는 INFLUENCER 등급이며 미들웨어 로그인 게이트까지 걸린다. 선언만 틀렸다 | `ai-consultant-catalog.ts:121` 1줄 |
| **3** | **칩 `spellcheck.authOnly` `true` → `false`** (B-3) | 2026-09-01 무료·비로그인 전환의 누락분. `plans.ts:115` `allowAnonymous: true` 가 정본 | `ai-consultant-catalog.ts:87` 1줄 |

> ⚠️ 2·3 은 **현재 렌더되지 않는 필드**다(B-1). 고쳐도 화면은 안 바뀐다 — 선언 정합성만 맞춘다. 그래도 고칠지 판단 필요.

### 5-B. 판단이 필요해 멈춘 건 (지시서 §7 금지사항에 걸림)

| # | 건 | 왜 멈췄나 |
|---|---|---|
| 4 | **B-1 칩 배지 미표시** — 유료 10건이 잠금 표시 없이 노출 | 배지를 새로 붙이는 건 **사용자 노출 UI 신설**이다. §7 "사용자 노출 문구 신규 작성 금지" → ⚠ 중단. ⚠5(칩↔사이드바 대응 규칙)와 함께 결정 필요 |
| 5 | **D-1 `/influencers` 4중 명칭** | §7 "메뉴 라벨 임의 변경 금지". 어느 이름이 정본인지 오렌지 지정 필요. 후보: 전체 리스트 / 인플루언서 랭킹 / 전체 인플루언서 / 리스트(유료) |
| 6 | **D-2~D-6 라벨 불일치 5건** | 동일 사유. 특히 **D-6(「대시보드」 라벨 2개)** 는 사이드바 안에서 같은 글자가 두 번 나오는 건이라 우선순위가 높다 |
| 7 | **A-1 키워드 챌린지 라벨 ↔ 「키워드 전체 목록」 기능** | 라벨 변경 금지 + 페이지 h1 변경은 정의 파일 밖(§5.3 "페이지 컴포넌트 내부 로직 변경 금지"). 어느 쪽이 정본인지 지정 필요 |
| 8 | **충돌 1~4** (§4) | ⚠1 기준 우선순위 미확정. 지시서가 "충돌 시 보류"라 그대로 보류 |
| 9 | **D-7 사이드바 전용 10건 / D-8 3영역 누락 4건** | ⚠5 미확정. 특히 **D-8 은 돈 받고 파는데 어디서도 도달할 수 없는 화면**이라 매출에 직결된다 |
| 10 | **B-5/B-6 UNMAPPED 2건** (`/stats`·`/dashboard/writing/color-palette`) | `plans.ts` 등록 여부는 등급 결정이라 §7 "권한 배지 임의 조정 금지"에 걸린다 |

---

## 6. 지시서 §8 미해결 항목에 대한 실측 답변

| ⚠ | 항목 | 실측 결과 |
|---|---|---|
| ⚠1 | 기준 간 우선순위 | **여전히 미확정.** §4 에 충돌 4건을 격리해 뒀다. 확정 시 충돌 1·2·3 이 자동 수정 범위로 들어온다 |
| ⚠2 | 콘텐츠 도구 하위 항목 | ✅ **확인 완료.** 글쓰기 2(글감 찾기·제목 생성) / 이미지 2(컬러 팔레트·이미지 편집) / 유튜브·인스타그램 3(롱폼 분석·릴스·쇼츠 분석·유튜브 음원 추출) = **7개**. 추가로 지시서가 누락한 **「구글」 대분류 1개**(Google 색인 관리)가 별도로 존재 |
| ⚠3 | 정의 파일 통합 여부 | **미확정.** 중복은 3축으로 실재한다(§1). 다만 **`lib/features.ts` 신설은 v2.2 에서 이미 금지 확정**됐고, `plans.ts` 를 API 가드 49 + 페이지 가드 21 = 70곳이 읽는다. 통합한다면 `sidebar-nav.ts` 가 `plans.ts` 를 import 하는 방향이지 그 반대가 아니다. **별도 프롬프트 분리 권고** |
| ⚠4 | 배지-권한 불일치 시 정답 | **불일치 3건 전부 코드가 옳고 선언이 틀렸다**(B-2·B-3 은 칩 선언 stale, B-4 는 불일치 0건). 지시서 §7 대로 양쪽을 모두 보고했고 판정은 하지 않았다 |
| ⚠5 | 칩 ↔ 사이드바 대응 규칙 | **미확정.** 실측: 칩 15 ⊂ 사이드바 25 (칩 전용 0건, 사이드바 전용 10건). 칩은 `external` 만 걸러낸 카탈로그 전량이라 **"일부만 노출"이 아니라 "카탈로그가 사이드바보다 작다"** 가 정확한 서술이다. 카탈로그 확장 여부가 결정 사항 |
| ⚠6 | 리포트 산출물 위치 | ✅ `docs/` 관례와 일치. 기존 `gating-audit.md` · `feature-inventory.md` · `category-proposal.md` · `plan-mapping.md` 와 같은 자리 |

---

## 7. 한계

- **등급별 실계정(무료 / 예비 인플루언서 / 인플루언서)이 없어 HTTP 를 실제로 쏘지 못했다.** §2 의 「실제 권한」 열은 **가드 코드 경로 추적** 결과지 "그 상태 코드가 떨어지는 걸 봤다"가 아니다.
- 라우트 실재는 `page.tsx` 파일 존재로 판정했다. 런타임 리다이렉트·`notFound()` 분기는 대조하지 않았다.
- 사이드바 렌더는 `AppSidebar.tsx` 코드로만 확인했고 실제 화면 스크린샷과 대조하지 않았다.
