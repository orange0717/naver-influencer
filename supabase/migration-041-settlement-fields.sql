-- =============================================
-- ad_settlements 테이블에 포스팅 기한일자 컬럼 추가
-- + 기존 컬럼명 변경 (client_name → advertiser_name)
-- Supabase SQL Editor에서 실행
-- =============================================

-- 포스팅 기한일자 추가
ALTER TABLE ad_settlements
  ADD COLUMN IF NOT EXISTS posting_deadline DATE,
  ADD COLUMN IF NOT EXISTS order_date DATE;

-- order_date 기본값: settled_date와 동일 (기존 데이터 호환)
UPDATE ad_settlements SET order_date = settled_date WHERE order_date IS NULL;
