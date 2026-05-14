from __future__ import annotations

from fastapi import Header, HTTPException

from app.config import settings


def require_crawl_auth(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    authorization: str | None = Header(default=None),
) -> None:
    expected = (settings.api_trigger_token or "").strip()
    if not expected:
        return
    token = (x_api_key or "").strip()
    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing crawl credentials")
