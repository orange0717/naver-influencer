#!/usr/bin/env bash
# 프로덕션 크론 엔드포인트가 401 없이 응답하는지 빠르게 확인합니다.
# 사용: CRON_BASE_URL CRON_SECRET 환경변수 필수
#
#   CRON_BASE_URL=https://your-domain.com CRON_SECRET=xxx npm run cron:smoke

set -euo pipefail

CRON_BASE_URL="${CRON_BASE_URL:?Set CRON_BASE_URL (예: https://ninflu.kr)}"
CRON_SECRET="${CRON_SECRET:?Set CRON_SECRET (Vercel Production 환경변수와 동일)}"

BASE="${CRON_BASE_URL%/}"

check() {
  local name="$1"
  local path_query="$2"
  local max_time="${3:-90}"
  local url="${BASE}${path_query}"

  echo ""
  echo "=== ${name} ==="
  echo "GET ${url}"

  local http_code
  http_code="$(curl -sS --max-time "${max_time}" -o /tmp/ninfle-cron-smoke.json -w "%{http_code}" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Accept: application/json" \
    "${url}")"

  echo "HTTP ${http_code}"
  if [[ "${http_code}" != "200" ]]; then
    cat /tmp/ninfle-cron-smoke.json 2>/dev/null || true
    echo >&2 "[cron-smoke] 실패: ${name}"
    exit 1
  fi
  head -c 500 /tmp/ninfle-cron-smoke.json
  echo ""
}

echo "크론 스모크 시작 (BASE=${BASE})"

# 챌린지 순위: 소량 배치로 부하 최소화
check "crawl-challenge-ranks" "/api/cron/crawl-challenge-ranks?batch=2&concurrency=1" 120

# 인플루언서 피드 수집 (키워드당 대기 포함 → 여유 타임아웃)
check "crawl-influencers" "/api/cron/crawl-influencers" 120

echo ""
echo "크론 스모크 완료 (모든 요청 HTTP 200)."
