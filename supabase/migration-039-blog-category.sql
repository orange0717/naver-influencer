-- migration-039: blog_scores에 category 컬럼 추가
-- 블로그 대시보드 카테고리별 순위를 위한 컬럼

ALTER TABLE blog_scores ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '기타';
CREATE INDEX IF NOT EXISTS idx_bs_category ON blog_scores(category);
