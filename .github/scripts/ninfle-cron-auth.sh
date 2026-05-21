#!/usr/bin/env bash
# GitHub Actions → ninfle.kr /api/cron/* 호출 시 공통 인증 헤더.
# 사용: source .github/scripts/ninfle-cron-auth.sh
#       curl -sS "${NINFLE_CRON_AUTH[@]}" "$BASE/api/cron/..."
#
# 필수 env: CRON_SECRET (Repository secret, Vercel CRON_SECRET 과 동일 권장)
# 선택 env: NINFLE_CRON_AUTH_LABEL (기본 github-actions)

set -euo pipefail

if [ -z "${CRON_SECRET:-}" ]; then
  echo "::error::CRON_SECRET repository secret is required." >&2
  exit 1
fi

_label="${NINFLE_CRON_AUTH_LABEL:-github-actions}"
NINFLE_CRON_AUTH=(
  -A "vercel-cron/1.0"
  -H "Authorization: Bearer ${CRON_SECRET}"
  -H "x-vercel-cron-auth-token: ${_label}"
)

# verify-daily-coverage 등 JSON 응답이 인증 실패인지 검사
ninfle_cron_assert_json() {
  local body="$1"
  local ctx="${2:-cron API}"
  if node -e "
    const j = JSON.parse(process.argv[1]);
    if (j.error) process.exit(1);
  " "$body" 2>/dev/null; then
    return 0
  fi
  echo "::error::${ctx} unauthorized or invalid response: ${body}" >&2
  return 1
}
