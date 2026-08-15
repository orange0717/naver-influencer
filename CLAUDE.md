# 네이버 인플루언서 키워드챌린지 대시보드

## 프로젝트 개요
네이버 인플루언서가 키워드챌린지 순위, 검색량, 경쟁도를 분석하여 블루오션 키워드를 찾는 유료 대시보드 서비스.

## 기술 스택
- **프레임워크**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **백엔드**: Supabase (PostgreSQL + Auth + RLS)
- **결제**: PortOne V2 (PG: 한국결제네트웍스 KPN)
- **차트**: Recharts (LineChart, AreaChart, BarChart)
- **배포**: Vercel (https://ninfle.kr)
- **Vercel 조직**: orangelibrary

## 배포
```bash
# Vercel CLI 직접 배포 (Vercel↔GitHub 자동배포 미연결 → CLI 수동 배포)
# 배포 디렉토리 = 이 저장소 루트 /Users/orange/개발/ninfle (.git·.vercel/project.json 이 여기 있음)
#   projectName: naver-influencer · org: orangelibrary · 도메인: ninfle.kr · GitHub: orange0717/naver-influencer
#   ⚠️ "naver-influencer" 는 Vercel 프로젝트명/원격 저장소명일 뿐 로컬 디렉토리명이 아니다.
#      /Users/orange/개발/naver-influencer 는 scripts 하나만 든 껍데기 폴더(.git·.vercel 없음)라 거기선 배포 불가.
#      (2026-08-15 확인 — 과거 이 문단이 정반대로 적혀 있었음)
#   ⚠️ --prebuilt 배포는 "Deploying outputs"에서 실패한 이력 → 풀 배포(vercel deploy --prod)를 쓸 것.
#   ⚠️ --prebuilt 를 안 붙여도 .vercel/output 폴더가 남아 있으면 CLI가 그걸 프리빌드 산출물로 보고
#      "Using prebuilt build artifacts" 로 올리다 Error 가 난다(2026-08-15 재발 — 7/22자 산출물이 남아 있었음).
#      배포가 "Deploying outputs"에서 곧장 실패하면 .vercel/output 을 치우고 다시 배포할 것.
vercel deploy --prod
```

## 디자인 시스템
- **테마**: 라이트 로즈 (bg: #FDF6F3, surface: #FFFFFF, border: #F2E2DC)
- **액센트**: 로즈 브라운 #BF877A, 더스티 로즈 #D9ABA0, 블러시 크림 #F2E2DC
- **폰트**: Pretendard (본문), 모노스페이스 (숫자 .font-rank)
- **순위 뱃지**: 금 #D4A017, 은 #A0A0A0, 동 #CD7F32
- **기능색**: 상승 #2E8B57, 하락 #D94848, 유지 #8C7A6E
- **차트 색상**: src/lib/chart-colors.ts에 통합 관리

## 디렉토리 구조
```
src/
├── app/
│   ├── api/              # API 라우트 (209개)
│   │   ├── keywords/     # 키워드 CRUD
│   │   ├── my/           # 내 대시보드/순위 히스토리
│   │   ├── subscription/  # 구독 상태/활성화
│   │   ├── influencers/  # 인플루언서 프로필
│   │   ├── recommendations/ # 일일 추천
│   │   └── cron/         # 크롤링 크론잡 9개 + run 엔드포인트
│   ├── auth/             # 로그인/회원가입
│   ├── subscribe/        # 구독 페이지
│   ├── influencers/[id]/ # 인플루언서 상세
│   ├── keywords/         # 키워드 목록/상세
│   ├── my/               # 내 대시보드, 인플루언서 연결
│   └── profile/          # 프로필 (닉네임 편집, 연결 해제)
├── components/           # 공통 컴포넌트
│   ├── Header.tsx        # 헤더 + 모바일 네비
│   ├── StatCard.tsx      # 통계 카드
│   ├── RankBadge.tsx     # 순위 뱃지 (금/은/동)
│   ├── RankChange.tsx    # 순위 변동 표시
│   ├── TrendBadge.tsx    # 트렌드 뱃지
│   ├── LockOverlay.tsx   # 잠금 오버레이 (포인트 차감)
│   ├── RankHistoryChart.tsx   # 순위 추이 LineChart
│   ├── TrendAreaChart.tsx     # 검색량 추이 AreaChart
│   └── CompetitorBarChart.tsx # 경쟁자 비교 BarChart
├── data/                 # 정적 데이터
│   ├── faq-data.ts       # FAQ 목록
│   └── subcategory-map.ts # 카테고리/서브카테고리 매핑
└── lib/
    ├── types.ts          # TypeScript 인터페이스
    ├── supabase.ts       # Supabase 클라이언트 (anon)
    ├── supabase-server.ts # Supabase 서버 클라이언트 (service_role)
    ├── subscription.ts   # 구독 확인/활성화 로직
    ├── payment-config.ts # 플랜 & 기간 상수 (BLOGGER/INFLUENCER 티어, getPlan/calculateNextChargeAt)
    ├── crawler.ts        # 크롤러 공통 유틸 (fetchWithRetry, verifyCronSecret, crawlJob)
    └── chart-colors.ts   # Recharts 차트 색상 상수
```

## 구독 모델 (프리미엄 모델, 2026-08 전환 · 상세는 src/lib/payment-config.ts)
> ⚠️ 과거 "PERSONAL/INFLUENCER/AGENCY 3플랜 + 7일 체험 + src/lib/plans.ts"는 stale. 현재는 아래 2티어 + 하루 무료다.
- **예비 인플루언서 (tier: blogger)**: ₩5,500(1개월)~₩55,000(12개월), 기간 1/3/6/9/12개월
- **인플루언서 (tier: influencer)**: ₩9,900(1개월)~, 기간 1/3/6/9/12개월 — 인플루언서 순위·챌린지·AI 생성
- **무료(비구독/회원)**: 하루 3회(MEMBER/ANON_DAILY_FREE_LIMIT). PRO 이용권 보유자는 무제한
- **유료 AI 생성 남용 상한**: 사용자당 하루 PAID_AI_DAILY_CAP회(기본 50, free-quota.ts)
- **결제**: PortOne V2 + 한국결제네트웍스(KPN) — 카드 단건 결제, prepare/complete/webhook 3단계 검증.
  플랜은 서버 저장값 payment_intents.plan_key 로만 결정(클라 planKey 불신) + 3중 금액검증, users 페이월 동기화
- **환불**: 7일 이내 미이용 시 전액 환불
- **상세**: src/lib/plans.ts (PlanInfo, PeriodOption, calculatePrice)

## 크론잡 스케줄 (vercel.json)
| UTC | KST | 작업 | 설명 |
|-----|-----|------|------|
| 18:00 | 03:00 | crawl-keywords | Step 1: 키워드 목록 크롤링 (GraphQL 카테고리 + REST 키워드) |
| 19:00 | 04:00 | crawl-rankings | Step 2: 검색 순위 크롤링 (Tier 0~3 배치 전략) |
| 매 10분×2샤드, 5분 엇갈림 (UTC) | — | crawl-challenge-ranks-scheduled?shard=0/1&shards=2 | Step 2.5: 챌린지 순위 24h 전 순환 (병렬 큐, 2026-07-30 3샤드×5분에서 완화) |
| 17:00 UTC (KST 02:00) | — | GitHub `daily-challenge-ranks-drain` | 24h 커버 미달 시 새벽 보충 |
| 20:00 | 05:00 | update-volumes | Step 3: 검색량 업데이트 (네이버 검색광고 + DataLab API) |
| 20:30 | 05:30 | aggregate-influencers | 인플루언서 통계 집계 (total_keywords, avg_rank 등) |
| 21:00 | 06:00 | generate-recommendations | 추천 키워드 생성 (recommendation_score 배치 업데이트) |
| 22:00 | 07:00 | crawl-blog-ranks | 블로그 검색 순위 크롤링 (Cheerio HTML 파싱) |

**인플루언서 신규 발굴 + 선정일(naver_created_at) 백필은 Vercel Cron이 아니라 GitHub Actions가 담당** (2026-07-15부터 vercel.json에서 crawl-influencers/crawl-selection-dates 제거 — 각각 2026-05-11/2026-05-22 이후 Vercel에서 죽어있었고 GH Actions가 이미 대체 수행 중이었음):
- `discover-new-influencers.yml` (매일 KST 04:00): keyword_challenges 참가자 기반 발굴
- `discover-via-search.yml` (매일 KST 05:00): search.naver.com 인플루언서 탭 기반 발굴 + `bulk-crawl-details.mjs --phase 1`로 신규 등록분 선정일 채우기
- `refresh-influencer-profiles.yml` (매일 KST 03:00, 3-shard): 전체 인플루언서 프로필 갱신
- ⚠️ 이 3개 모두 "우리가 이미 추적 중인 키워드에서 검색/참여된 사람"만 신규로 인식하는 프록시 방식 — 어떤 챌린지에도 참여 안 하고 검색 상위에도 안 걸린 신규 선정자는 구조적으로 발견 불가

## 반응형 전략
- Desktop (md+): 테이블 형태
- Mobile (<md): 카드 형태로 자동 전환
- `hidden md:block` / `md:hidden` 패턴 사용 (전 컴포넌트 통일, 2026-07-09)

## 현재 상태
- 프론트엔드: 완료 (오렌지 테마 + 구독 UI)
- API: DB 전환 완료
- DB: supabase/schema.sql (최신, Feed API 컬럼 포함)
- 인증: getAuthUser 공통 유틸 + Supabase Auth
- 구독: 백엔드 로직 완료, PortOne V2 + KPN 코드 연동 완료 (콘솔에서 채널 등록 후 환경변수만 추가하면 활성화)
- 크롤러: 9개 크론잡 구현 완료 + run 엔드포인트, 코드리뷰 + 보안감사 완료 (2026-03-16)
- 보안: timingSafeEqual 인증, SSRF 방지, naverId 포맷 검증, 레이트 리밋 추가
- 성능: N+1 → 배치 upsert 최적화 (crawl-rankings, generate-recommendations)

## 환경변수 (필요)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_PORTONE_STORE_ID=
NEXT_PUBLIC_PORTONE_CHANNEL_KEY=
PORTONE_API_SECRET=
PORTONE_WEBHOOK_SECRET=
CRON_SECRET=
# update-volumes용 (선택)
NAVER_API_KEY=
NAVER_SECRET_KEY=
NAVER_CUSTOMER_ID=
NAVER_DATALAB_CLIENT_ID=
NAVER_DATALAB_CLIENT_SECRET=
```

## 전체 인플루언서 순위 로직 (예정)
1. 포스팅 빈도수
2. 전체 참여한 게시글 수
3. 전체 참여한 챌린지 수
4. TOP3 비율
5. 키워드 검색량
6. 모든 키워드의 전체 순위분포
7. 토픽 수
8. 구독자수 (모든 플랫폼)
9. 팬수

## 스펙 원본
`/Users/orange/Downloads/naver-influencer-platform-spec (4).html`
