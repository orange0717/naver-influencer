-- =============================================
-- 원고료 정산내역 테이블
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS ad_settlements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naver_id        TEXT NOT NULL,            -- 인플루언서 naver_id
  year_month      TEXT NOT NULL,            -- 'YYYY-MM' 형식
  count           INT NOT NULL DEFAULT 0,   -- 건수
  amount          INT NOT NULL DEFAULT 0,   -- 총 금액 (원)
  memo            TEXT DEFAULT '',           -- 메모 (광고주명 등)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(naver_id, year_month)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_as_naver ON ad_settlements(naver_id);
CREATE INDEX IF NOT EXISTS idx_as_month ON ad_settlements(year_month DESC);

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
