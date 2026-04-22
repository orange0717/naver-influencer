# N인플 TODO — 코드 리뷰(1~5차) 잔여 과제

> 마지막 갱신: 2026-04-22. Quick Win 은 모두 반영됐고, 아래는 설계 변경 또는
> 범위가 큰 과제로 별도 시간·검토가 필요한 항목을 모아둔다.

## 🔴 보안·규정 관련

### 1. Demo 만료 서버 사이드 재검증
- 현재 `src/app/my/page.tsx:100-111` 은 쿠키 `trial_started` 만 신뢰해 만료를 계산한다.
- 사용자가 쿠키를 과거 타임스탬프로 조작하면 유료 플로우를 우회할 여지가 있다.
- 해결 방향: `/my` 진입 시마다 `demo_sessions.expires_at` 을 서버에서 확인하고,
  만료 3일 전 배너·만료 후 제한된 대시보드 → 7일 후 강제 `/subscribe` 로 점진적 이탈 UX.

### 2. 회원 soft delete 전환 (5년 보관 의무)
- `src/app/api/profile/route.ts:136~` 에서 hard delete 를 사용하면
  전자상거래법·개인정보보호법상 5년 보관 의무를 충족하지 못한다.
- 해결 방향: `users` 에 `deleted_at timestamptz NULL` 컬럼 추가,
  쿼리 전역에 `deleted_at IS NULL` 필터 강제, 5년 후 crontab 으로 hard delete.
  마이그레이션 + 전체 쿼리 리팩토링이 필요해 별도 브랜치에서 진행 권장.

### 3. 이메일 인증 흐름 점검
- Supabase Auth 의 email confirmation 설정이 Enforced 인지 Dashboard 에서 확인.
- 이메일 미인증 상태에서도 회원가입 플로우가 완료되는지 실측 테스트 필요.
- 필요 시 `/api/auth/signup` 쪽에 인증 토큰 verify 강제 게이트 추가.

## 🟡 UX·온보딩

### 4. 신규 가입자 온보딩 플로우 신설
- 로그인 직후 닉네임 미설정 사용자는 `/my` 진입 시 `NicknameRequiredModal` 이
  강제로 뜨는데, "뭘 해야 할지" 맥락이 없어 이탈률이 높다.
- 제안 경로: 가입 완료 → `/onboarding` (1) 닉네임 (2) 블로거/인플루언서
  선택 (3) 네이버 ID 입력 → `/my` 이동.
- 영향 파일: `src/app/auth/callback/`, `src/app/auth/signup/`,
  `src/app/my/page.tsx`, 새 `/onboarding` 라우트.

### 5. 제한 사용자(RESTRICTED_USER_EMAILS) 경로 일관화
- 현재 유료 API 는 9개 route 에서 차단하지만, 커뮤니티·공지 등 일부 무료 페이지는 열려 있다.
- `/subscribe` 리다이렉트 시 경쟁사 안내 배너 + 문의 링크 노출 권장.

## 🟢 운영·관찰성

### 6. 크론잡 실패 알림 연동
- `vercel.json` 에 14개 크론이 등록돼 있지만 연속 실패 감지 장치가 없다.
- 제안: 각 크론 핸들러 말미에 실패 시 Sentry `captureMessage('cron_failed', { ...job })`
  또는 Slack Webhook 호출. 크론 전용 `crawl_jobs` 테이블 정기 체크 RPC 도 고려.

### 7. Supabase 마이그레이션 추적
- `supabase/migration-001.sql` ~ `migration-062.sql` 파일만 있고 적용 여부가 파일로
  드러나지 않아 온보딩 시 헷갈린다.
- 제안: `supabase` CLI 도입 또는 `supabase/APPLIED.md` 에 적용 날짜 기록.
