#!/usr/bin/env bash
# GitHub Actions Repository secrets 일괄 등록 (로컬에서 1회 실행)
# 사용: ./scripts/setup-github-actions-secrets.sh
#       ./scripts/setup-github-actions-secrets.sh --from-env-local
#
# 필요: gh CLI 로그인 (gh auth login), 저장소 push 권한

set -euo pipefail

REPO="${GITHUB_REPOSITORY:-orange0717/naver-influencer}"
FROM_ENV_LOCAL=false

for arg in "$@"; do
  case "$arg" in
    --from-env-local) FROM_ENV_LOCAL=true ;;
    -h|--help)
      echo "Usage: $0 [--from-env-local]"
      echo "  --from-env-local  프로젝트 루트 .env.local 에서 값 읽기"
      exit 0
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI 가 필요합니다: https://cli.github.com/" >&2
  exit 1
fi

read_var() {
  local name="$1"
  local val="${!name:-}"
  if [ -n "$val" ]; then
    echo "$val"
    return
  fi
  read -r -s -p "${name}: " val
  echo >&2
  echo "$val"
}

if [ "$FROM_ENV_LOCAL" = true ]; then
  ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.local"
  if [ ! -f "$ENV_FILE" ]; then
    echo ".env.local 없음: $ENV_FILE" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

echo "Repository: $REPO"
echo "등록할 secret (비어 있으면 건너뜀):"

set_secret() {
  local key="$1"
  local val="${2:-}"
  if [ -z "$val" ]; then
    val="$(read_var "$key" 2>/dev/null || true)"
  fi
  if [ -z "$val" ]; then
    echo "  skip $key"
    return
  fi
  echo "  set $key"
  gh secret set "$key" --body "$val" --repo "$REPO"
}

set_secret CRON_SECRET "${CRON_SECRET:-}"
set_secret NEXT_PUBLIC_SUPABASE_URL "${NEXT_PUBLIC_SUPABASE_URL:-}"
set_secret SUPABASE_SERVICE_ROLE_KEY "${SUPABASE_SERVICE_ROLE_KEY:-}"
set_secret NAVER_SEARCH_CLIENT_ID "${NAVER_SEARCH_CLIENT_ID:-}"
set_secret NAVER_SEARCH_CLIENT_SECRET "${NAVER_SEARCH_CLIENT_SECRET:-}"

if ! gh variable list --repo "$REPO" 2>/dev/null | grep -q '^NINFL_BASE_URL'; then
  echo "  set variable NINFL_BASE_URL=https://ninfle.kr"
  gh variable set NINFL_BASE_URL --body "https://ninfle.kr" --repo "$REPO" 2>/dev/null || true
fi

echo "완료. Actions → 챌린지 순위 일일 drain → Run workflow (max_rounds=2) 로 확인하세요."
