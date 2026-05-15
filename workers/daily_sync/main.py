"""
GitHub Actions 일일 스케줄에서 호출하는 예시 엔트리포인트.

여기에 ninfle/Supabase 갱신 로직을 채우면 됩니다. 지금은 연결·권한만 검증합니다.
환경변수(Repository secrets와 동일 이름):
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import os
import sys


def main() -> None:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print(
            "ERROR: NEXT_PUBLIC_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    from supabase import create_client

    client = create_client(url, key)
    res = client.table("influencers").select("id", count="exact").limit(1).execute()
    n = res.count if res.count is not None else 0
    print(f"daily_sync: Supabase OK, influencers 행 수(대략) = {n}")


if __name__ == "__main__":
    main()
