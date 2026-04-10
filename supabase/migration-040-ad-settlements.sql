-- =============================================
-- 원고료 정산내역 테이블
-- Supabase SQL Editor에서 실행
-- =============================================

-- 기존 테이블이 있으면 삭제 후 재생성 (스키마 변경)
DROP TABLE IF EXISTS ad_settlements;

CREATE TABLE ad_settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naver_id        TEXT NOT NULL,            -- 인플루언서 naver_id
  settled_date    DATE NOT NULL,            -- 정산 일자
  client_name     TEXT NOT NULL DEFAULT '', -- 거래처 (광고주명)
  fee             INT NOT NULL DEFAULT 0,   -- 원고료 (원)
  commission      INT NOT NULL DEFAULT 0,   -- 수수료 (원)
  net_amount      INT NOT NULL DEFAULT 0,   -- 수수료 차감 후 정산액 (원)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_as_naver ON ad_settlements(naver_id);
CREATE INDEX IF NOT EXISTS idx_as_date ON ad_settlements(settled_date DESC);

-- RLS (서비스 역할만 접근)
ALTER TABLE ad_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_select" ON ad_settlements FOR SELECT USING (false);
CREATE POLICY "deny_all_insert" ON ad_settlements FOR INSERT WITH CHECK (false);
CREATE POLICY "deny_all_update" ON ad_settlements FOR UPDATE USING (false);
CREATE POLICY "deny_all_delete" ON ad_settlements FOR DELETE USING (false);

-- updated_at 트리거
CREATE TRIGGER trg_as_updated_at
  BEFORE UPDATE ON ad_settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
