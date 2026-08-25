-- 기업용 문의(B2B) 접수 테이블
-- 개인 사용자는 셀프서비스 가입/결제, 기업 고객은 문의 → 상담 → 맞춤 구성 흐름을 탄다.
-- 접수는 서버(service_role)만 INSERT 하고, 조회/상태변경은 관리자만 가능하다.

CREATE TABLE IF NOT EXISTS enterprise_inquiries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 문의자 정보
  company_name      TEXT NOT NULL,
  contact_name      TEXT NOT NULL,
  contact_title     TEXT,
  email             TEXT NOT NULL,
  phone             TEXT NOT NULL,

  company_type      TEXT NOT NULL CHECK (company_type IN (
    'general', 'agency', 'brand', 'franchise', 'public', 'education', 'etc'
  )),
  team_size         TEXT NOT NULL CHECK (team_size IN (
    '1-5', '6-10', '11-30', '31-100', '100+', 'undecided'
  )),
  -- 관심 기능(복수 선택). 상담 항목일 뿐 제공 확정 기능이 아니다.
  interests         TEXT[] NOT NULL DEFAULT '{}',
  message           TEXT NOT NULL,

  -- 영업 파이프라인 상태
  status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'reviewing', 'scheduled', 'consulted', 'quoted',
    'contracting', 'contracted', 'on_hold', 'closed'
  )),
  admin_note        TEXT,

  -- 접수 맥락 (로그인 상태로 보냈다면 연결, 회원 탈퇴해도 문의는 남긴다)
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  source_url        TEXT,
  privacy_agreed_at TIMESTAMPTZ NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_created_at ON enterprise_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_status ON enterprise_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_email ON enterprise_inquiries(email);

DROP TRIGGER IF EXISTS trg_enterprise_inquiries_updated_at ON enterprise_inquiries;
CREATE TRIGGER trg_enterprise_inquiries_updated_at
  BEFORE UPDATE ON enterprise_inquiries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: 문의에 담당자 개인정보가 들어가므로 관리자 외에는 어떤 경로로도 읽히면 안 된다.
-- INSERT 정책을 두지 않아 anon/authenticated 키로는 접수도 불가 — 접수는 서버 라우트(service_role)만 한다.
ALTER TABLE enterprise_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read enterprise_inquiries" ON enterprise_inquiries;
CREATE POLICY "Admins can read enterprise_inquiries"
  ON enterprise_inquiries
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can update enterprise_inquiries" ON enterprise_inquiries;
CREATE POLICY "Admins can update enterprise_inquiries"
  ON enterprise_inquiries
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Admins can delete enterprise_inquiries" ON enterprise_inquiries;
CREATE POLICY "Admins can delete enterprise_inquiries"
  ON enterprise_inquiries
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));
