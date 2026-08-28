-- ─────────────────────────────────────────────────────────────────────────
-- migration-164-enterprise-orgs.sql
--
-- 기업(법인) 셀프서비스 가입 — 조직 / 좌석 / 초대 / 주문.
-- 기존 enterprise_inquiries(migration-160)는 "상담 문의" 파이프라인이고,
-- 이 테이블들은 상담 없이 바로 결제하는 자가가입 경로(/enterprise/signup)를 담당한다.
--
-- 확정된 정책 (2026-08-27):
--   · 요금제 2종. BASIC 좌석당 5,500원 / PRO 좌석당 9,900원, 금액 = 좌석당 단가 × 좌석 수(VAT 포함).
--     기능 차등은 새로 만들지 않고 기존 개인 티어를 그대로 쓴다 — BASIC=blogger, PRO=influencer.
--   · 좌석은 대표(OWNER) 포함. 최소 1명, 상한 없음.
--   · 역할은 OWNER / MEMBER 2단계.
--   · 월 선불 1회성 결제, 가입일 기준 매월(일할 없음). 현재 PG 채널이 빌링키를 미지원해
--     자동청구가 불가능하므로 구독(subscriptions)이 아니라 만료일 기반으로 관리한다.
--   · 증원은 즉시 차액 결제, 감원은 다음 주기부터 반영(환불 없음) → pending_seat_limit.
--   · 초대는 7일 만료, 초대받은 이메일 본인만 수락.
--
-- 적용 방법: Supabase Dashboard → SQL Editor → 이 파일 전체 실행.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 0. update_updated_at() 보증 ──────────────────────────────────────────
-- 아래 5절 트리거 4개가 이 함수에 의존한다. SQL Editor 는 붙여넣은 스크립트 전체를
-- 한 트랜잭션으로 돌리므로, 이 함수가 DB에 없으면 테이블 4개까지 통째로 롤백된다
-- ("성공했다고 생각했는데 아무것도 안 생김"의 전형). schema.sql §12 와 본문이 동일하므로
-- 이미 있으면 사실상 아무 일도 일어나지 않는다.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 1. enterprise_orgs : 기업 조직 ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_orgs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 기업 정보 (전 항목 필수)
  company_name         TEXT NOT NULL,
  -- 형식(숫자 10자리)만 검증한다. 국세청 진위확인 API는 쓰지 않는다.
  biz_reg_no           TEXT NOT NULL CHECK (biz_reg_no ~ '^[0-9]{10}$'),
  ceo_name             TEXT NOT NULL,
  -- enterprise_inquiries.company_type 과 동일한 7종 — 두 파이프라인의 업종 통계를 합칠 수 있게 맞춘다.
  industry             TEXT NOT NULL CHECK (industry IN (
    'general', 'agency', 'brand', 'franchise', 'public', 'education', 'etc'
  )),
  manager_name         TEXT NOT NULL,
  manager_phone        TEXT NOT NULL,
  manager_email        TEXT NOT NULL,
  tax_invoice_email    TEXT NOT NULL,

  owner_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- BASIC → 개인 요금제의 blogger 티어, PRO → influencer 티어 권한을 좌석에 부여한다.
  plan_id              TEXT NOT NULL CHECK (plan_id IN ('BASIC', 'PRO')),
  -- 결제한 좌석 수 (OWNER 포함)
  seat_limit           INTEGER NOT NULL CHECK (seat_limit >= 1),
  -- 감원 예약분. 다음 갱신 때 seat_limit 으로 내려앉는다. NULL = 예약 없음.
  pending_seat_limit   INTEGER CHECK (pending_seat_limit >= 1),

  status               TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment', 'active', 'expired', 'cancelled'
  )),

  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,

  tos_agreed_at        TIMESTAMPTZ NOT NULL,
  privacy_agreed_at    TIMESTAMPTZ NOT NULL,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ent_orgs_owner ON enterprise_orgs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ent_orgs_status ON enterprise_orgs(status);
-- 만료 처리 배치가 훑는 경로
CREATE INDEX IF NOT EXISTS idx_ent_orgs_period_end ON enterprise_orgs(current_period_end)
  WHERE status = 'active';
-- 결제까지 마친 조직은 사업자번호당 하나. 미결제(pending_payment) 시도는 중복을 허용해
-- 결제 이탈 후 재시도가 막히지 않게 한다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_orgs_biz_reg_no_live ON enterprise_orgs(biz_reg_no)
  WHERE status IN ('active', 'expired');

-- ── 2. enterprise_org_members : 좌석 점유자 ──────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_org_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES enterprise_orgs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  email      TEXT NOT NULL,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ent_members_org ON enterprise_org_members(org_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_members_org_user ON enterprise_org_members(org_id, user_id)
  WHERE status = 'active';
-- 한 사람이 동시에 두 조직의 좌석을 차지할 수 없다. 권한·좌석 소속이 하나로 확정되어야
-- current_user_org_id() 가 모호해지지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_members_one_active_org ON enterprise_org_members(user_id)
  WHERE status = 'active';
-- 조직당 OWNER 는 한 명
CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_members_single_owner ON enterprise_org_members(org_id)
  WHERE role = 'OWNER' AND status = 'active';

-- ── 3. enterprise_org_invites : 멤버 초대 ────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_org_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES enterprise_orgs(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER')),
  -- 원문 토큰은 메일로만 나가고 DB에는 SHA-256 해시만 남긴다. DB 열람으로 좌석을 가로챌 수 없게.
  token_hash   TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'expired', 'revoked'
  )),
  expires_at   TIMESTAMPTZ NOT NULL,
  -- 결제 확정 전에는 발송하지 않으므로 가입 직후에는 NULL이다.
  sent_at      TIMESTAMPTZ,
  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ent_invites_org ON enterprise_org_invites(org_id, status);
CREATE INDEX IF NOT EXISTS idx_ent_invites_expires ON enterprise_org_invites(expires_at)
  WHERE status = 'pending';
-- 같은 조직에 같은 주소로 살아있는 초대가 둘일 수 없다 (좌석 이중 점유 방지)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ent_invites_org_email_live ON enterprise_org_invites(org_id, lower(email))
  WHERE status = 'pending';

-- ── 4. enterprise_orders : 기업 결제 주문 ────────────────────────────────
CREATE TABLE IF NOT EXISTS enterprise_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES enterprise_orgs(id) ON DELETE CASCADE,

  kind          TEXT NOT NULL CHECK (kind IN ('initial', 'renewal', 'seat_add')),
  plan_id       TEXT NOT NULL CHECK (plan_id IN ('BASIC', 'PRO')),
  -- 이 주문이 확정하는 좌석 수 (seat_add 는 증원 후 총 좌석)
  seat_count    INTEGER NOT NULL CHECK (seat_count >= 1),
  -- 청구 시점의 좌석당 단가. 나중에 단가를 올려도 과거 주문의 근거가 남아야 한다.
  seat_price    INTEGER NOT NULL CHECK (seat_price >= 0),
  -- 서버에서 재계산한 금액(원, VAT 포함). 클라이언트가 보낸 값은 저장하지 않는다.
  amount        INTEGER NOT NULL CHECK (amount >= 0),
  currency      TEXT NOT NULL DEFAULT 'KRW' CHECK (currency = 'KRW'),

  status        TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN (
    'pending_payment', 'paid', 'failed', 'cancelled'
  )),

  -- PortOne paymentId. 웹훅 멱등 처리의 기준키.
  payment_id    TEXT UNIQUE,
  paid_at       TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ent_orders_org ON enterprise_orders(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ent_orders_status ON enterprise_orders(status);

-- ── 5. updated_at 트리거 ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_ent_orgs_updated_at ON enterprise_orgs;
CREATE TRIGGER trg_ent_orgs_updated_at
  BEFORE UPDATE ON enterprise_orgs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_ent_members_updated_at ON enterprise_org_members;
CREATE TRIGGER trg_ent_members_updated_at
  BEFORE UPDATE ON enterprise_org_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_ent_invites_updated_at ON enterprise_org_invites;
CREATE TRIGGER trg_ent_invites_updated_at
  BEFORE UPDATE ON enterprise_org_invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_ent_orders_updated_at ON enterprise_orders;
CREATE TRIGGER trg_ent_orders_updated_at
  BEFORE UPDATE ON enterprise_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 6. 소속 조회 헬퍼 ────────────────────────────────────────────────────
-- SECURITY DEFINER 로 RLS 를 우회한다. 멤버 정책이 멤버 테이블을 다시 조회하면
-- 정책이 무한 재귀하므로, 소속 판정은 반드시 이 함수를 거친다.
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.org_id
    FROM enterprise_org_members m
    JOIN users u ON u.id = m.user_id
   WHERE u.auth_id = auth.uid()
     AND m.status = 'active'
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_user_org_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_user_org_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_current_user_org_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM enterprise_org_members m
      JOIN users u ON u.id = m.user_id
     WHERE u.auth_id = auth.uid()
       AND m.status = 'active'
       AND m.role = 'OWNER'
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_org_owner() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_org_owner() TO authenticated, service_role;

-- ── 7. RLS ───────────────────────────────────────────────────────────────
-- 쓰기는 전부 service_role(서버 라우트) 전용이다. 금액·좌석 수를 클라이언트가
-- 직접 바꿀 수 있으면 결제 검증이 무의미해진다.

ALTER TABLE enterprise_orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read own org" ON enterprise_orgs;
CREATE POLICY "Members can read own org"
  ON enterprise_orgs
  FOR SELECT TO authenticated
  USING (id = public.current_user_org_id());

DROP POLICY IF EXISTS "Admins can read enterprise_orgs" ON enterprise_orgs;
CREATE POLICY "Admins can read enterprise_orgs"
  ON enterprise_orgs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "deny_write_enterprise_orgs" ON enterprise_orgs;
CREATE POLICY "deny_write_enterprise_orgs"
  ON enterprise_orgs
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

ALTER TABLE enterprise_org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read same org members" ON enterprise_org_members;
CREATE POLICY "Members can read same org members"
  ON enterprise_org_members
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "Admins can read enterprise_org_members" ON enterprise_org_members;
CREATE POLICY "Admins can read enterprise_org_members"
  ON enterprise_org_members
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "deny_write_enterprise_org_members" ON enterprise_org_members;
CREATE POLICY "deny_write_enterprise_org_members"
  ON enterprise_org_members
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

-- 초대는 토큰 해시를 들고 있어 읽기를 아예 막는다. 목록 조회(S7)도 서버 라우트가 대신한다.
ALTER TABLE enterprise_org_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_enterprise_org_invites" ON enterprise_org_invites;
CREATE POLICY "deny_all_enterprise_org_invites"
  ON enterprise_org_invites
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

ALTER TABLE enterprise_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read own org orders" ON enterprise_orders;
CREATE POLICY "Owner can read own org orders"
  ON enterprise_orders
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND public.is_current_user_org_owner());

DROP POLICY IF EXISTS "Admins can read enterprise_orders" ON enterprise_orders;
CREATE POLICY "Admins can read enterprise_orders"
  ON enterprise_orders
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "deny_write_enterprise_orders" ON enterprise_orders;
CREATE POLICY "deny_write_enterprise_orders"
  ON enterprise_orders
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

-- ── 8. 코멘트 ────────────────────────────────────────────────────────────
COMMENT ON TABLE enterprise_orgs IS
  '기업 셀프서비스 가입 조직. 월 선불 1회성이라 current_period_end 만료 기반으로 관리한다.';
COMMENT ON COLUMN enterprise_orgs.pending_seat_limit IS
  '감원 예약분. 감원은 환불 없이 다음 갱신에 반영되므로 즉시 seat_limit 을 내리지 않는다.';
COMMENT ON TABLE enterprise_org_invites IS
  '멤버 초대. 결제 확정(enterprise_orders.status=paid) 이후에만 발송한다.';
COMMENT ON COLUMN enterprise_org_invites.token_hash IS
  '초대 토큰의 SHA-256 해시. 원문은 메일로만 전달한다.';
COMMENT ON TABLE enterprise_orders IS
  '기업 결제 주문. payment_id UNIQUE 로 PortOne 웹훅 재수신 시 멱등성을 보장한다.';
