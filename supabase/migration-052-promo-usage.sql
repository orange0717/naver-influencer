-- 프로모션 코드 사용 기록
CREATE TABLE IF NOT EXISTS promo_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  plan TEXT NOT NULL,
  days INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 같은 코드 중복 사용 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_usage_user_code ON promo_usage(user_id, code);

-- users 테이블에 구독 필드 추가 (없으면)
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT NULL;

-- RLS
ALTER TABLE promo_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own promo usage" ON promo_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can insert promo usage" ON promo_usage
  FOR INSERT WITH CHECK (true);
