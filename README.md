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
│   │   ├── cron/           # 크론 라우트 — 스케줄 개수는 vercel.json 참고
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

스케줄은 **UTC**입니다. 한국 시각(KST)은 **UTC+9**입니다.  
아래 표는 루트 **`vercel.json`과 동일**합니다(복붙 기준용).

| 경로 | Cron (UTC) | 설명 |
|------|------------|------|
| `/api/cron/crawl-keywords` | `0 */3 * * *` | 키워드 챌린지 목록·연동 메타 수집 (3시간마다 정각) |
| `/api/cron/crawl-rankings` | `0 19 * * *` | 키워드별 순위 |
| `/api/cron/crawl-influencers` | `0 0,6,12,18 * * *` | 인플루언서 피드 탐색 (하루 4회) |
| `/api/cron/update-volumes` | `0 20 * * *` | 검색량 등 볼륨 업데이트 |
| `/api/cron/aggregate-influencers` | `15 * * * *` | 인플루언서 통계 집계 (매시 15분) |
| `/api/cron/generate-recommendations` | `0 21 * * *` | 일일 추천 키워드 |
| `/api/cron/crawl-challenge-ranks` | `*/30 * * * *` | 키워드챌린지 공식 순위 (30분마다) |
| `/api/cron/crawl-challenge-ranks?batch=1000&concurrency=10` | `*/5 17-20 * * *` | 위와 동일 잡의 트래픽 증량(UTC 17–20시 매 5분) |
| `/api/cron/verify-daily-coverage` | `30 21 * * *` | 일별 커버리지 검증 |
| `/api/cron/crawl-blog-ranks` | `0 22 * * *` | 블로그 검색 순위 |
| `/api/cron/crawl-blog-visitors` | `30 22 * * *` | 블로그 방문자 |
| `/api/cron/crawl-selection-dates` | `0 23 * * *` | 챌린지 선정일 |
| `/api/cron/update-followers` | `0 */4 * * *` | 구독자/팔로워 수 (4시간마다 정각) |
| `/api/cron/demo-expiry` | `0 9 * * *` | 데모 만료 정리 |
| `/api/cron/subscription-expiry` | `30 9 * * *` | 구독 만료 처리 |
| `/api/cron/send-rank-notifications` | `0 21 * * *` | 순위 변동 알림 |
| `/api/cron/crawl-search-exposure?size=100` | `30 23 * * *` | 검색 노출 크롤 |
| `/api/cron/refresh-stats` | `45 * * * *` | 통계 리프레시 (매시 45분) |
| `/api/cron/charge-recurring` | `0 0 * * *` | 정기 결제 청구 (UTC 자정) |

### 런칭 전 크론 스모크

정식 배포 직후 아래를 순서대로 확인하면 크롤링·챌린지 반영이 멈춘 상태로 공개되는 일을 줄일 수 있습니다.

1. **Vercel Production 환경 변수**에 `CRON_SECRET`이 설정되어 있고, 재배포 후에도 동일한지 확인합니다. (수동 호출·연동 트리거에 필요합니다.)
2. **Vercel 대시보드 → Cron Jobs**에서 최근 실행이 실패하지 않았는지 확인합니다.
3. **Supabase `crawl_jobs`** 테이블에서 최근 잡의 `status`가 `success`인지 확인합니다.
4. 관리자라면 **`/admin/crawler`** 화면에서 크롤러 상태를 확인합니다.
5. 아래 스크립트로 핵심 엔드포인트가 **HTTP 200**인지 즉시 검증합니다. (`crawl-challenge-ranks`는 `batch=2`로 부하를 줄였습니다.)

```bash
CRON_BASE_URL=https://your-production-domain.com \
CRON_SECRET=your-secret \
npm run cron:smoke
```

수동으로 확인할 때는 예시와 같이 `Authorization: Bearer` 헤더를 붙입니다.

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://your-production-domain.com/api/cron/crawl-challenge-ranks?batch=2&concurrency=1"
```

### 인플루언서·키워드 챌린지 데이터는 언제 반영되나요?

공개 UI와 DB는 **크론·온디맨드가 성공적으로 쓴 뒤**에 맞춰집니다. 대략 아래 순서로 이해하면 됩니다.

| 단계 | 무엇이 채워지나 | 주기·트리거 (UTC는 `vercel.json` 표 참고) |
|------|----------------|---------------------------------------------|
| **챌린지 순위** | 참여 키워드·순위·TOP3·`last_challenged_at` 등 | **`/api/cron/crawl-challenge-ranks`** — 대략 30분마다 + 일부 시간대 증량. 인플이 많으면 **큐 순서**라 특정 계정은 다음 몇 턴 뒤일 수 있음. |
| **피드 탐색** | 프로필·팬수·키워드와의 조인 등 | **`/api/cron/crawl-influencers`** — 하루 4회(UTC 0·6·12·18). 챌린지 **상세 순위**는 여기서 안 채움. |
| **연동 직후** | 해당 `naver_id` 한 명 | **`/api/my/link`** 등에서 백그라운드로 `crawl-challenge-ranks?naver_id=` 호출 시 **다른 인플보다 빨리** 붙을 수 있음. |
| **프로필 보정** | 팬·팔로워·참여 키워드 **개수** 등 | **`refreshInfluencerProfile`** — 상세 API·`/my`·대시보드 요청 시, `updated_at` 기준 **6시간** 캐시. 키워드 **별 순위 전체**와는 역할이 다름. |
| **점수·평균 순위** | `keyword_score`, `avg_rank`, `best_rank` 등 | **`/api/cron/aggregate-influencers`** — 매시 15분(UTC). 순위 스냅샷 이후 한 템포 늦게 맞춰질 수 있음. |

**운영에서 막혔는지 보려면:** 관리자 **`/admin/crawler`** 의 **「챌린지·순위 수집 백로그 요약」**과 **최근 crawl_jobs**, 위 **크론 스모크**를 함께 보면 됩니다. (순위 수집 전 행 수·`ownerId` 누락 등으로 원인 좁히기.)

## 시작하기

### 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
CRON_SECRET=   # 프로덕션 권장: 수동 호출·연동 트리거용 Bearer 시크릿
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
