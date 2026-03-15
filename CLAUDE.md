# 네이버 인플루언서 키워드챌린지 대시보드

## 프로젝트 개요
네이버 인플루언서가 키워드챌린지 순위, 검색량, 경쟁도를 분석하여 블루오션 키워드를 찾는 유료 대시보드 서비스.

## 기술 스택
- **프레임워크**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **백엔드**: Supabase (PostgreSQL + Auth + RLS)
- **결제**: 토스페이먼츠 (예정)
- **차트**: Recharts (LineChart, AreaChart, BarChart)
- **배포**: Vercel (https://naver-influencer.vercel.app)
- **Vercel 조직**: orangelibrary

## 배포
```bash
# Vercel CLI 직접 배포 (GitHub remote 미연결 상태)
export PATH="/tmp/node-v20.11.1-darwin-arm64/bin:$PATH"
npx --yes vercel deploy --prod --cwd /Users/orange/개발/naver-influencer
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
│   ├── api/              # API 라우트 (18개)
│   │   ├── keywords/     # 키워드 CRUD
│   │   ├── my/           # 내 대시보드/순위 히스토리
│   │   ├── subscription/  # 구독 상태/활성화
│   │   ├── influencers/  # 인플루언서 프로필
│   │   ├── recommendations/ # 일일 추천
│   │   └── cron/         # 크롤링 크론잡 6개
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
├── data/                 # Mock 데이터
│   ├── mock-keywords.ts  # 키워드 15개 + 카테고리
│   ├── mock-influencers.ts
│   ├── mock-rankings.ts
│   ├── mock-recommendations.ts
│   └── mock-packages.ts  # 충전 패키지 + 가격표
└── lib/
    ├── types.ts          # TypeScript 인터페이스
    ├── supabase.ts       # Supabase 클라이언트 (anon)
    ├── supabase-server.ts # Supabase 서버 클라이언트 (service_role)
    ├── points.ts         # (레거시) 포인트 차감 로직
    ├── subscription.ts   # 구독 확인/활성화 로직
    └── chart-colors.ts   # Recharts 차트 색상 상수
```

## 구독 모델
- **가격**: 월 9,900원
- **구독자**: 모든 기능 무제한 이용
- **비구독자(무료)**: 키워드 목록 + 일일 추천 3개만
- **결제**: 토스페이먼츠 (예정)
- **환불**: 7일 이내 미이용 시 전액 환불

## 크론잡 스케줄 (vercel.json)
| UTC | KST | 작업 |
|-----|-----|------|
| 18:00 | 03:00 | Step 1: 키워드 목록 크롤링 (crawl-keywords) |
| 19:00 | 04:00 | Step 2: 검색 순위 크롤링 (crawl-rankings) |
| 19:30 | 04:30 | Step 2.5: 챌린지 공식 순위 크롤링 (crawl-challenge-ranks) |
| 0,6,12,18 | 매 6시간 | 인플루언서 수집 (crawl-influencers) |
| 20:00 | 05:00 | Step 3: 검색량 업데이트 (update-volumes) |
| 20:30 | 05:30 | 인플루언서 집계 (aggregate-influencers) |
| 21:00 | 06:00 | 추천 키워드 생성 (generate-recommendations) |

## 반응형 전략
- Desktop (lg+): 테이블 형태
- Mobile (<lg): 카드 형태로 자동 전환
- `hidden lg:block` / `lg:hidden` 패턴 사용

## 현재 상태
- 프론트엔드: 완료 (오렌지 테마 + 구독 UI)
- API: DB 전환 완료
- DB: supabase/schema.sql (최신, Feed API 컬럼 포함)
- 인증: getAuthUser 공통 유틸 + Supabase Auth
- 구독: 백엔드 로직 완료, 결제 연동 예정 (토스페이먼츠)
- 크롤러: 7개 크론잡 구현 완료 (crawl-challenge-ranks 추가), 로컬 테스트 통과 (2026-03-15)

## 환경변수 (필요)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
CRON_SECRET=
# update-volumes용 (선택)
NAVER_API_KEY=
NAVER_SECRET_KEY=
NAVER_CUSTOMER_ID=
NAVER_DATALAB_CLIENT_ID=
NAVER_DATALAB_CLIENT_SECRET=
```

## 스펙 원본
`/Users/orange/Downloads/naver-influencer-platform-spec (4).html`
