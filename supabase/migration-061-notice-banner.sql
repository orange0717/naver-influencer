-- ================================================
-- Migration 061: 공지 → 배너 등록 기능
-- ================================================
-- notices 에 show_on_banner 플래그 추가.
-- 글쓰기/수정 시 체크하면 상단 UpdateBanner 에 노출된다.

ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS show_on_banner BOOLEAN NOT NULL DEFAULT FALSE;

-- 배너 대상 공지를 빠르게 조회하기 위한 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_notices_banner
  ON notices (created_at DESC)
  WHERE show_on_banner = TRUE AND is_deleted = FALSE;
