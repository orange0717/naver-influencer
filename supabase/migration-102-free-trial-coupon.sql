-- ─────────────────────────────────────────────────────────────
-- migration-102-free-trial-coupon.sql (2026-07-06)
-- 특정 회원 1인 전용 N일 무료 체험 쿠폰 시스템
--
-- 정책:
--   - 관리자가 특정 이메일(target_email) 대상으로 쿠폰 발급 (코드 자동 생성)
--   - 해당 이메일로 로그인한 회원만 등록 가능 (redeem 시 서버에서
--     인증된 유저의 users.email 로 직접 대조, 클라이언트 입력 신뢰 안 함)
--   - 1회용 — 등록 성공 시 used=true 로 즉시 잠김, 재사용 불가
--     (원자적 UPDATE ... WHERE used=false 로 동시 요청 시 1회만 성공)
--   - 등록 성공 시 users.subscription_plan/subscription_expires_at 부여
--     (기존 종료일이 미래면 그 날짜에서 duration_days 연장, 아니면 현재부터 duration_days)
--     → 기존 hasActiveSubscription()/isRestricted()/requireBloggerPlusPage() 등
--       모든 유료 게이트를 그대로 통과하게 되어 별도 컬럼 없이 기존 결제 로직과 통합
--   - first_paid_at 은 건드리지 않음 (실결제와 구분, Claude 모델 분기에 영향 없음)
--
-- ⚠️ Supabase SQL Editor 에서 직접 실행하세요.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL DEFAULT '무료 체험 쿠폰',
  target_email    TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'INFLUENCER' CHECK (plan IN ('BLOGGER', 'INFLUENCER')),
  duration_days   INTEGER NOT NULL DEFAULT 7 CHECK (duration_days > 0),
  used            BOOLEAN NOT NULL DEFAULT false,
  used_at         TIMESTAMPTZ,
  used_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_coupons_target_email ON public.coupons (lower(target_email));

-- service_role(Next.js API 라우트)만 테이블 직접 접근, 일반 사용자는
-- /api/coupons/redeem 라우트(서버 검증)로만 상호작용 — RLS 정책 없음
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- 오렌지 지정 쿠폰 발급: gkdlslsk@naver.com 전용 7일 INFLUENCER 무료 체험
INSERT INTO public.coupons (code, name, target_email, plan, duration_days, created_by)
VALUES ('FREE7-N9K3QX', '7일 무료 체험 쿠폰', 'gkdlslsk@naver.com', 'INFLUENCER', 7, 'admin')
ON CONFLICT (code) DO NOTHING;

-- 검증 (선택)
-- SELECT * FROM public.coupons WHERE target_email = 'gkdlslsk@naver.com';
