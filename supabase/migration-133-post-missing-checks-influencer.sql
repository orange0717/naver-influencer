-- 미노출 페이지 개편: 인플루언서탭 노출 여부도 영속화
-- 기존: view_exposed(통합검색) / blog_exposed(블로그탭)만 저장, 인플루언서탭은 키워드 지정 조회(/my/keyword-ranking)에서만
--       일시적으로 확인하고 저장하지 않았음.
-- 변경: 미노출 페이지 재검사 시 인플루언서탭도 함께 확인해 저장 (기존 행은 NULL = "미검사"로 취급).

ALTER TABLE post_missing_checks
  ADD COLUMN IF NOT EXISTS influencer_exposed BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS influencer_rank INT NULL;
