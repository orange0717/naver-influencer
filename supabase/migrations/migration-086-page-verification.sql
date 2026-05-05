-- =================================================================
-- 086: naverId 페이지 소유권 증명 (네이버 프로필 소개글 크롤 검증)
--
-- 배경:
--   기존 demo_sessions.verified_at 은 "이메일 OTP 통과" 만 의미하므로,
--   누구나 자기 이메일로 임의 naverId 의 OTP 를 받아 "verified" 상태를
--   만들 수 있었다 → 진짜 소유권 증명이 아님.
--
-- 새 모델:
--   사용자가 in.naver.com/{naverId} 의 자기 소개글에 page_code 를 붙여
--   넣고, 서버가 og:description 을 크롤해서 확인하면 page_verified_at
--   을 채운다. /api/my/link 는 page_verified_at IS NOT NULL 만 통과시킨다.
-- =================================================================

ALTER TABLE public.demo_sessions
  ADD COLUMN IF NOT EXISTS page_code              TEXT,
  ADD COLUMN IF NOT EXISTS page_code_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS page_verified_at       TIMESTAMPTZ;

-- 같은 (email, naver_id) 조합당 활성 page_code 가 1개만 존재하도록 — race 시 우선순위.
CREATE INDEX IF NOT EXISTS idx_demo_sessions_page_code
  ON public.demo_sessions (email, naver_id)
  WHERE page_code IS NOT NULL AND page_verified_at IS NULL;

-- page_verified_at 검색 가속 (/api/my/link 의 핫 패스).
CREATE INDEX IF NOT EXISTS idx_demo_sessions_page_verified
  ON public.demo_sessions (email, naver_id, page_verified_at)
  WHERE page_verified_at IS NOT NULL;
