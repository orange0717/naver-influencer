-- =============================================
-- 이용권(라이선스) 테이블 — 스마트스토어 연동
-- Supabase SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS licenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_code    TEXT UNIQUE NOT NULL,
  plan_name       TEXT NOT NULL DEFAULT 'PRO',
  duration_days   INT NOT NULL DEFAULT 30,
  price           INT NOT NULL DEFAULT 9900,

  -- 구매자 정보 (활성화 시 기록)
  buyer_id        TEXT,              -- naver_id 또는 blog_id
  buyer_name      TEXT,
  buyer_type      TEXT,              -- 'influencer' 또는 'blogger'

  -- 상태
  is_used         BOOLEAN DEFAULT false,
  activated_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,

  -- 스마트스토어 주문 (선택)
  order_id        TEXT,              -- 스마트스토어 주문번호

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_lic_code ON licenses(license_code);
CREATE INDEX IF NOT EXISTS idx_lic_buyer ON licenses(buyer_id);
CREATE INDEX IF NOT EXISTS idx_lic_used ON licenses(is_used);
CREATE INDEX IF NOT EXISTS idx_lic_expires ON licenses(expires_at DESC);

-- RLS
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

-- 자기 이용권만 읽기 (service_role은 전체 접근 가능)
CREATE POLICY "read_own_license" ON licenses
  FOR SELECT USING (true);

-- updated_at 트리거
CREATE TRIGGER trg_lic_updated_at
  BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
