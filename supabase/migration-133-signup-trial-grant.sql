-- 기존 가입자 중 활성 유료/체험 플랜이 없는 전원에게 배포 시점 기준 7일 INFLUENCER 체험 부여
-- (이미 만료일이 미래인 사람 = 실제 결제 고객 또는 관리자 지급 체험자는 건드리지 않음)
UPDATE public.users
SET subscription_plan = 'INFLUENCER',
    subscription_expires_at = now() + interval '7 days'
WHERE (subscription_plan IS NULL
    OR subscription_expires_at IS NULL
    OR subscription_expires_at < now())
  AND is_admin IS NOT TRUE;
