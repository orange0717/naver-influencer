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
- **테마**: 다크 (bg: #0F0F1A, surface: #1A1A2E)
- **액센트**: 보라 #6C5CE7, 레드 #E94560
- **폰트**: Pretendard (본문), 모노스페이스 (숫자 .font-rank)
- **순위 뱃지**: 금 #FFD93D, 은 #C0C0C0, 동 #CD7F32
- **기능색**: 상승 #00D68F, 하락 #FF6B6B, 유지 #888888

## 디렉토리 구조
```
src/
├── app/
│   ├── api/              # API 라우트 (18개)
│   │   ├── keywords/     # 키워드 CRUD
│   │   ├── my/           # 내 대시보드/순위 히스토리
│   │   ├── points/       # 포인트 잔액/차감/충전
│   │   ├── influencers/  # 인플루언서 프로필
│   │   ├── recommendations/ # 일일 추천
│   │   └── cron/         # 크롤링 크론잡 5개
│   ├── auth/             # 로그인/회원가입
│   ├── charge/           # 포인트 충전
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
    └── points.ts         # 포인트 차감/캐시 로직
```

## 포인트 경제
- 키워드 리스트: 무료
- 키워드 상세: 30P (24시간 내 재열람 무료)
- 순위 전체 열람: 50P (24시간 캐시)
- 인플루언서 프로필: 50P
- 일일 추천 TOP 3: 무료, 전체: 50P

## 충전 패키지
- 체험 100P = 1,000원
- 스타터 500P+50보너스 = 4,500원
- 프로(인기) 1,000P+200보너스 = 8,000원
- 비즈니스 3,000P+1,000보너스 = 20,000원

## 크론잡 스케줄 (vercel.json)
| UTC | KST | 작업 |
|-----|-----|------|
| 18:00 | 03:00 | Step 1: 키워드 목록 크롤링 |
| 19:00 | 04:00 | Step 2: 순위 크롤링 |
| 20:00 | 05:00 | Step 3: 검색량 업데이트 |
| 20:30 | 05:30 | 인플루언서 집계 |
| 21:00 | 06:00 | 추천 키워드 생성 |

## 반응형 전략
- Desktop (lg+): 테이블 형태
- Mobile (<lg): 카드 형태로 자동 전환
- `hidden lg:block` / `lg:hidden` 패턴 사용

## 현재 상태 (MVP)
- 프론트엔드: 완료 (모든 페이지 + 차트 + 반응형)
- API: Mock 데이터 기반 라우트 완료
- DB: supabase-schema.sql 준비됨 (미실행)
- 인증: UI만 완료 (Supabase Auth 미연결)
- 결제: UI만 완료 (토스페이먼츠 미연결)
- 크롤러: 스켈레톤만 (TODO 주석)

## 환경변수 (필요)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TOSS_CLIENT_KEY=
TOSS_SECRET_KEY=
CRON_SECRET=
```

## 스펙 원본
`/Users/orange/Downloads/naver-influencer-platform-spec (4).html`
