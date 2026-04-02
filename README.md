# N인플 (N-Infl)

네이버 인플루언서를 위한 키워드 분석 및 순위 추적 SaaS 플랫폼

## 주요 기능

- **키워드 분석** - 115,000+ 키워드 검색량, 경쟁도, 트렌드 분석
- **순위 추적** - 인플루언서 키워드 챌린지 순위 변동 모니터링
- **대시보드** - 내 키워드 순위, 블로그 점수, 방문자 통계, 경쟁자 비교
- **일일 추천** - 블루오션 키워드 자동 추천 (3개/일 무료)
- **실시간 TOP3** - 키워드별 실시간 상위 인플루언서 조회
- **알림 시스템** - 순위 변동 이메일/인앱 알림
- **커뮤니티** - 인플루언서 간 정보 공유 게시판
- **블로그 분석** - 블로그 키워드 추출, 검색 순위 추적, SEO 점수

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript, React 19 |
| 스타일링 | Tailwind CSS 4 |
| DB / 인증 | Supabase (PostgreSQL + Auth + RLS) |
| 차트 | Recharts 3 |
| 데이터 패칭 | TanStack React Query 5 |
| 크롤링 | Cheerio |
| 이메일 | Resend |
| 결제 | Toss Payments SDK |
| Rate Limit | Upstash Redis |
| 에러 추적 | Sentry |
| 유효성 검증 | Zod 4 |
| 배포 | Vercel Pro |

## 프로젝트 구조

```
src/
├── app/
│   ├── api/                # API 라우트 (23개 모듈, 80+ 엔드포인트)
│   │   ├── auth/           # 인증 (로그인, 회원가입, 데모 체험)
│   │   ├── cron/           # 크론잡 13개 (크롤링, 알림 등)
│   │   ├── keywords/       # 키워드 검색, 상세, 순위, 트렌드
│   │   ├── influencers/    # 인플루언서 목록, 상세
│   │   ├── my/             # 대시보드, 계정 연동, 순위 히스토리
│   │   ├── notifications/  # 알림 조회, 읽음 처리, 설정
│   │   ├── community/      # 게시글, 댓글, 좋아요, 신고
│   │   ├── blog/           # 블로그 분석, 순위, 방문자
│   │   ├── recommendations/# 일일 키워드 추천
│   │   └── ...             # admin, agency, widget 등
│   ├── my/                 # 대시보드 페이지
│   ├── keywords/           # 키워드 리스트/상세 페이지
│   ├── influencers/        # 인플루언서 리스트/상세 페이지
│   ├── community/          # 커뮤니티 페이지
│   └── ...
├── components/             # React 컴포넌트 (40+)
│   ├── dashboard/          # 대시보드 전용 (25개)
│   ├── Header.tsx
│   ├── NotificationBell.tsx
│   └── ...
├── lib/                    # 유틸리티 (28개)
│   ├── supabase-*.ts       # Supabase 클라이언트
│   ├── naver-api.ts        # 네이버 API 연동
│   ├── crawler.ts          # 웹 크롤링
│   ├── notifications.ts    # 알림 로직
│   ├── email.ts            # 이메일 템플릿
│   └── ...
├── hooks/                  # useAuth, useNotifications
└── data/                   # 정적 데이터 (FAQ, 서브카테고리)

supabase/                   # DB 마이그레이션 (22개)
scripts/                    # 유지보수 스크립트
chrome-extension/           # 크롬 확장 프로그램
```

## 크론잡 (Vercel Cron)

| 크론잡 | 스케줄 (UTC) | 설명 |
|--------|-------------|------|
| crawl-keywords | 매일 18:00 | 키워드 목록 크롤링 |
| crawl-rankings | 매일 19:00 | 키워드별 순위 크롤링 |
| crawl-influencers | 매일 0/6/12/18:00 | 인플루언서 탐색 |
| update-volumes | 매일 20:00 | 검색량 업데이트 (DataLab) |
| aggregate-influencers | 매일 20:30 | 통계 집계 |
| generate-recommendations | 매일 21:00 | 추천 키워드 생성 |
| crawl-challenge-ranks | 매일 02:00 | 챌린지 공식 순위 |
| crawl-blog-ranks | 매일 22:00 | 블로그 검색 순위 |
| crawl-blog-visitors | 매일 22:30 | 블로그 방문자 |
| crawl-selection-dates | 매일 23:00 | 챌린지 선정일 |
| update-followers | 매일 21/03/09:00 | 구독자 수 업데이트 |
| demo-expiry | 매일 09:00 | 만료 데모 정리 |
| send-rank-notifications | 매일 21:00 | 순위 변동 알림 발송 |

## 시작하기

### 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
CRON_SECRET=
RESEND_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### 개발 서버

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인

## 데이터베이스

Supabase PostgreSQL + RLS (Row Level Security)

- 22개 마이그레이션 파일 (`supabase/migration-*.sql`)
- 주요 테이블: users, influencers, keyword_challenges, keyword_rankings, notifications, community 등

## 배포

Vercel Pro에 배포 (maxDuration=300s)

```bash
vercel --prod
```

## 라이선스

Private
