-- ══════════════════════════════════════════════
--  N인플: blog_visitor_history 갱신시각 컬럼 추가
--  오늘자 방문자수가 하루 중 처음 크롤링된 값에 고정되는 문제 수정용
--  (updated_at 없이는 "오늘 행 존재 여부"만으로 stale 판단 → 하루 종일 재크롤링 안 됨)
--  Supabase SQL Editor에서 실행하세요
-- ══════════════════════════════════════════════

ALTER TABLE blog_visitor_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE blog_visitor_history SET updated_at = created_at WHERE updated_at IS NULL;
