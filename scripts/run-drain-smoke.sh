#!/usr/bin/env bash
# drain 워크플로와 동일한 크론 호출 (로컬 스모크 테스트, 2라운드)
# 사용:
#   export CRON_SECRET='Vercel Production 과 동일한 값'
#   ./scripts/run-drain-smoke.sh
#   ./scripts/run-drain-smoke.sh --rounds 2 --from-env-local

set -euo pipefail

ROUNDS=2
STALE_THRESHOLD=0
SHARDS=3
BATCH=650
CONCURRENCY=18
BASE="${NINFL_BASE_URL:-https://ninfle.kr}"
FROM_ENV=false

for arg in "$@"; do
  case "$arg" in
    --from-env-local) FROM_ENV=true ;;
    --rounds=*) ROUNDS="${arg#*=}" ;;
    --rounds) shift; ROUNDS="${1:-2}" ;;
    --base=*) BASE="${arg#*=}" ;;
    -h|--help)
      echo "Usage: CRON_SECRET=... $0 [--rounds N] [--from-env-local] [--base URL]"
      exit 0
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$FROM_ENV" = true ] && [ -f "$ROOT/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET 가 필요합니다. Vercel Production 값을 export 하세요." >&2
  echo "  export CRON_SECRET='...'" >&2
  exit 1
fi

export NINFLE_CRON_AUTH_LABEL="${NINFLE_CRON_AUTH_LABEL:-github-actions-drain}"
# shellcheck disable=SC1091
source "$ROOT/.github/scripts/ninfle-cron-auth.sh"

echo "Base: $BASE | rounds: $ROUNDS | stale_threshold: $STALE_THRESHOLD"
echo ""

for round in $(seq 1 "$ROUNDS"); do
  COV=$(curl -sS "${NINFLE_CRON_AUTH[@]}" "$BASE/api/cron/verify-daily-coverage" || echo '{"error":"curl failed"}')
  ninfle_cron_assert_json "$COV" "verify-daily-coverage"
  STALE=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.stale ?? 999999)" "$COV")
  TOTAL=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.total_active ?? 0)" "$COV")
  PCT=$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.coverage_pct ?? 0)" "$COV")
  echo "Round $round/$ROUNDS — active=$TOTAL stale=$STALE coverage=${PCT}%"

  if [ "$STALE" -le "$STALE_THRESHOLD" ]; then
    echo "Target reached (stale<=$STALE_THRESHOLD)."
    exit 0
  fi

  for SHARD in $(seq 0 $((SHARDS - 1))); do
    echo "  shard $SHARD/$SHARDS ..."
    BODY=$(curl -sS --max-time 320 "${NINFLE_CRON_AUTH[@]}" \
      "$BASE/api/cron/crawl-challenge-ranks?batch=$BATCH&concurrency=$CONCURRENCY&shard=$SHARD&shards=$SHARDS" \
      || echo '{"error":"curl failed"}')
    ninfle_cron_assert_json "$BODY" "crawl-challenge-ranks shard=$SHARD"
    node -e "const j=JSON.parse(process.argv[1]); console.log('   ', JSON.stringify({ok:j.success,processed:j.influencers_processed,total:j.influencers_total,failed:j.failed}));" "$BODY"
  done
  echo ""
  [ "$round" -lt "$ROUNDS" ] && sleep 45
done

echo "Done ($ROUNDS rounds). stale still > $STALE_THRESHOLD — 정상일 수 있음(백로그)."
