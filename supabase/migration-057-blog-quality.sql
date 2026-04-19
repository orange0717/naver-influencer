-- 블로그 품질지수 검사 결과 저장
-- 24시간 캐시: 같은 blog_id 를 재검사할 때 기존 결과 재사용

CREATE TABLE IF NOT EXISTS blog_quality_checks (
  id BIGSERIAL PRIMARY KEY,
  blog_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  score INT NOT NULL CHECK (score >= 0 AND score <= 100),
  grade TEXT NOT NULL CHECK (grade IN ('OPTIMAL_1', 'OPTIMAL_2', 'SEMI_OPTIMAL', 'NORMAL', 'LOW')),
  exposure_score INT NOT NULL,
  activity_score INT NOT NULL,
  topic_score INT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_quality_blog_id_checked_at
  ON blog_quality_checks (blog_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_quality_user_id_checked_at
  ON blog_quality_checks (user_id, checked_at DESC)
  WHERE user_id IS NOT NULL;

-- IP 기반 비로그인 체험 집계를 위한 별도 테이블
CREATE TABLE IF NOT EXISTS blog_quality_rate_limits (
  id BIGSERIAL PRIMARY KEY,
  ip_or_user TEXT NOT NULL,
  scope TEXT NOT NULL, -- 'ip' | 'user'
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_quality_rate_limits_lookup
  ON blog_quality_rate_limits (ip_or_user, scope, checked_at DESC);
