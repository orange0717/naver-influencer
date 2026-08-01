-- =================================================================
-- 124: blog.naver.com 블로그 소유권 증명 (Google 온보딩 자동연결용)
--
-- 배경:
--   migration-086 은 in.naver.com/{naverId} (인플루언서 홈) 소개글 크롤
--   검증만 지원한다. 블로그(blog.naver.com/{blogId})는 다른 페이지 구조라
--   별도 검증이 필요하다. demo_sessions 를 재사용하지 않고 전용 테이블을
--   신설해 인플루언서/블로그 두 트랙을 분리한다.
--
-- 모델 (migration-086과 동일 패턴):
--   사용자가 blog.naver.com/{blogId} 프로필 소개글에 page_code 를 붙여
--   넣고, 서버가 og:description 을 크롤해서 확인하면 page_verified_at
--   을 채운다. /api/my/link-blog 는 page_verified_at IS NOT NULL 만 통과시킨다.
-- =================================================================

CREATE TABLE IF NOT EXISTS public.blog_verifications (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                   TEXT NOT NULL,
  blog_id                 TEXT NOT NULL,
  page_code               TEXT,
  page_code_expires_at    TIMESTAMPTZ,
  page_verified_at        TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- 같은 (email, blog_id) 조합당 활성 page_code 가 1개만 존재하도록 — race 시 우선순위.
CREATE INDEX IF NOT EXISTS idx_blog_verifications_page_code
  ON public.blog_verifications (email, blog_id)
  WHERE page_code IS NOT NULL AND page_verified_at IS NULL;

-- page_verified_at 검색 가속 (/api/my/link-blog 의 핫 패스).
CREATE INDEX IF NOT EXISTS idx_blog_verifications_page_verified
  ON public.blog_verifications (email, blog_id, page_verified_at)
  WHERE page_verified_at IS NOT NULL;
