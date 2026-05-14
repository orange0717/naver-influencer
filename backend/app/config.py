from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# 항상 backend/.env 를 읽습니다 (cwd가 프로젝트 루트여도 동일). Docker 이미지에는 .env가 없어 무시됩니다.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = (
        "postgresql+psycopg://naver_influencer:naver_influencer@localhost:5432/naver_influencer"
    )
    crawler_base_url: str = "https://ninfle.kr/"
    crawl_use_ninfle_public_api: bool = True
    crawl_api_page_size: int = 500
    crawl_api_max_pages: int = 500
    crawl_api_pause_seconds: float = 1.0
    crawl_api_429_max_retries: int = 5
    crawl_api_429_base_sleep_seconds: float = 10.0
    crawler_http_user_agent: str = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    crawl_schedule_timezone: str = "Asia/Seoul"
    crawl_daily_hour: int = 0
    crawl_daily_minute: int = 0
    playwright_headless: bool = True
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:80"
    api_trigger_token: str | None = None
    embed_scheduler_in_api: bool = False
    skip_auto_migrate: bool = False
    run_crawl_on_startup: bool = True
    crawl_lock_key1: int = 8_811_422
    crawl_lock_key2: int = 1


# 이미지 재빌드·배포 반영 여부 확인용 (crawler-info / 기동 로그와 동일)
APP_BUILD_MARKER = "ninfle-public-api-v2.2-env-backend"


settings = Settings()
