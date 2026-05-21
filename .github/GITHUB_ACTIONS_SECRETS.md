# GitHub Actions 시크릿·변수 설정

저장소 **Settings → Secrets and variables → Actions** 에서 등록합니다.  
Vercel 프로덕션(`ninfle.kr`)과 **동일한 값**을 쓰는 것을 권장합니다.

## Repository secrets (필수)

| Secret | 용도 | 사용 워크플로 |
|--------|------|----------------|
| `CRON_SECRET` | `/api/cron/*` Bearer 인증 (Vercel `CRON_SECRET` 과 동일) | `crawl-challenge-ranks`, `daily-challenge-ranks-drain`, `daily-python-worker` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `crawl-content-counts`, `discover-*`, `refresh-*`, `crawl-bloggers` |
| `SUPABASE_SERVICE_ROLE_KEY` | DB 스크립트용 service role | 위와 동일 |

## Repository secrets (선택)

| Secret | 용도 |
|--------|------|
| `NAVER_SEARCH_CLIENT_ID` | 블로거 수집 (`crawl-bloggers`) |
| `NAVER_SEARCH_CLIENT_SECRET` | 블로거 수집 |
| `VERCEL_TOKEN` | 비상 수동 배포 (`vercel-production`, workflow_dispatch 만) |
| `VERCEL_ORG_ID` | 비상 수동 배포 |
| `VERCEL_PROJECT_ID` | 비상 수동 배포 |

## Repository variables (선택)

| Variable | 기본값 | 용도 |
|----------|--------|------|
| `NINFL_BASE_URL` | `https://ninfle.kr` | 크론 호출 대상 URL |

## 크론 인증 (GitHub → Vercel)

GitHub Actions는 `vercel-cron/1.0` User-Agent 와 함께 아래 헤더를 보냅니다.

- `Authorization: Bearer <CRON_SECRET>`
- `x-vercel-cron-auth-token: <워크플로별 라벨>`

`daily-challenge-ranks-drain` 은 과거에 `x-vercel-cron-auth-token` 이 없어 `verify-daily-coverage` 가 401 → `active=0 stale=999999` 오탐으로 60라운드 실패했습니다.  
공통 스크립트: [.github/scripts/ninfle-cron-auth.sh](./scripts/ninfle-cron-auth.sh)

## 워크플로별 `x-vercel-cron-auth-token` 라벨

| 워크플로 | 라벨 |
|----------|------|
| 챌린지 순위 안전망 | `github-actions-safety-net` |
| 일일 drain | `github-actions-drain` |
| 일일 인플 목록 갱신 | `github-actions-daily-sync` |

## 로컬에서 일괄 등록 (권장)

프로젝트 루트에 `.env.local`(또는 `vercel env pull` 한 env)이 있으면:

```bash
chmod +x scripts/setup-github-actions-secrets.sh
./scripts/setup-github-actions-secrets.sh --from-env-local
```

값을 직접 입력하려면 인자 없이 실행합니다. (`gh auth login` 필요)

## 등록 후 확인

1. **Actions → 챌린지 순위 일일 drain → Run workflow** (수동 1회, `max_rounds=2` 로 짧게 테스트 가능)
2. 로그에 `active=2xxxx stale=... coverage=...%` 가 보이고 `Unauthorized` 가 없어야 함
3. **/admin/crawler** (관리자 로그인) 에서 `crawl-challenge-ranks` 최근 job 확인

## Supabase 시크릿이 없을 때

`crawl-content-counts`, `discover-via-search` 등은 시작 단계에서  
`::error ::Supabase secrets 미설정` 으로 즉시 실패합니다. 위 표의 Supabase 두 항목을 추가하세요.
