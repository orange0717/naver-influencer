-- =============================================
-- 네이버 인플루언서 키워드챌린지 — DB Schema
-- Supabase SQL Editor에서 실행
-- =============================================

-- 0. UUID 확장
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. keyword_challenges (키워드 목록)
-- =============================================
CREATE TABLE IF NOT EXISTS keyword_challenges (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword       TEXT NOT NULL,
  keyword_clean TEXT NOT NULL,               -- 공백 제거·소문자 정규화 (중복 방지 키)
  category      TEXT NOT NULL DEFAULT '',
  participant_count   INT NOT NULL DEFAULT 0,
  content_count       INT NOT NULL DEFAULT 0,
  search_volume_monthly INT,
  search_volume_pc      INT,
  search_volume_mobile  INT,
  competition_level TEXT CHECK (competition_level IN ('low','medium','high')),
  recommendation_score NUMERIC(4,1),
  trend_direction TEXT CHECK (trend_direction IN ('up','down','stable')),
  trend_percentage NUMERIC(6,1),
  naver_keyword_id BIGINT,
  is_new          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  search_volume_updated_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_keyword_clean UNIQUE (keyword_clean)
);

CREATE INDEX IF NOT EXISTS idx_kc_category ON keyword_challenges(category);
CREATE INDEX IF NOT EXISTS idx_kc_active ON keyword_challenges(is_active);
CREATE INDEX IF NOT EXISTS idx_kc_volume ON keyword_challenges(search_volume_monthly DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_kc_participants ON keyword_challenges(participant_count DESC);
CREATE INDEX IF NOT EXISTS idx_kc_score ON keyword_challenges(recommendation_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_kc_naver_keyword_id ON keyword_challenges(naver_keyword_id);

-- =============================================
-- 2. influencers (인플루언서)
-- =============================================
CREATE TABLE IF NOT EXISTS influencers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  naver_id        TEXT NOT NULL,
  display_name    TEXT NOT NULL DEFAULT '',
  profile_url     TEXT DEFAULT '',
  category        TEXT DEFAULT '',
  sub_category    TEXT DEFAULT '',
  fan_count       INT NOT NULL DEFAULT 0,
  blog_neighbor_count INT DEFAULT 0,
  stats_summary   TEXT DEFAULT '',
  total_keywords  INT DEFAULT 0,
  avg_rank        NUMERIC(6,2) DEFAULT 0,
  best_rank       INT DEFAULT 0,
  integrated_top3_count INT DEFAULT 0,
  image_url       TEXT DEFAULT '',
  introduction    TEXT DEFAULT '',
  subscriber_count INT DEFAULT 0,
  total_follower_count INT DEFAULT 0,
  my_keyword_category TEXT DEFAULT '',
  my_keyword      TEXT DEFAULT '',
  category_my_type TEXT DEFAULT '',
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_naver_id UNIQUE (naver_id)
);

CREATE INDEX IF NOT EXISTS idx_inf_category ON influencers(category);
CREATE INDEX IF NOT EXISTS idx_inf_fans ON influencers(fan_count DESC);
CREATE INDEX IF NOT EXISTS idx_inf_follower ON influencers(total_follower_count DESC);
CREATE INDEX IF NOT EXISTS idx_inf_my_keyword_category ON influencers(my_keyword_category);

-- =============================================
-- 3. keyword_rankings (키워드별 순위 스냅샷)
-- =============================================
CREATE TABLE IF NOT EXISTS keyword_rankings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id      UUID NOT NULL REFERENCES keyword_challenges(id) ON DELETE CASCADE,
  influencer_id   UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  rank_position   INT NOT NULL,
  previous_rank   INT,
  rank_change     INT NOT NULL DEFAULT 0,
  fan_count       INT DEFAULT 0,
  is_integrated_top3 BOOLEAN DEFAULT FALSE,
  latest_post_title  TEXT,
  latest_post_url    TEXT,
  snapshot_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  crawled_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_ranking_snapshot UNIQUE (keyword_id, influencer_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_kr_keyword ON keyword_rankings(keyword_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_kr_influencer ON keyword_rankings(influencer_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_kr_date ON keyword_rankings(snapshot_date DESC);

-- =============================================
-- 3-1. influencer_keywords (인플루언서-키워드 발견 관계)
-- =============================================
CREATE TABLE IF NOT EXISTS influencer_keywords (
  influencer_id   UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  keyword_id      UUID NOT NULL REFERENCES keyword_challenges(id) ON DELETE CASCADE,
  discovered_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (influencer_id, keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_ik_keyword ON influencer_keywords(keyword_id);
CREATE INDEX IF NOT EXISTS idx_ik_influencer ON influencer_keywords(influencer_id);

-- =============================================
-- 4. search_volume_history (검색량 히스토리)
-- =============================================
CREATE TABLE IF NOT EXISTS search_volume_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id      UUID NOT NULL REFERENCES keyword_challenges(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  period_type     TEXT NOT NULL DEFAULT 'daily', -- daily, weekly, monthly
  search_volume_total   INT,
  search_volume_pc      INT,
  search_volume_mobile  INT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_volume_history UNIQUE (keyword_id, period_start, period_type)
);

CREATE INDEX IF NOT EXISTS idx_svh_keyword ON search_volume_history(keyword_id, period_start DESC);

-- =============================================
-- 5. daily_recommendations (일일 추천 키워드)
-- =============================================
CREATE TABLE IF NOT EXISTS daily_recommendations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id          UUID NOT NULL REFERENCES keyword_challenges(id) ON DELETE CASCADE,
  recommendation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rank_in_day         INT NOT NULL,
  reason              TEXT DEFAULT '',
  is_free             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dr_date ON daily_recommendations(recommendation_date DESC);

-- =============================================
-- 6. crawl_jobs (크롤링 작업 로그)
-- =============================================
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  total_items     INT DEFAULT 0,
  processed_items INT DEFAULT 0,
  failed_items    INT DEFAULT 0,
  error_message   TEXT,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cj_type ON crawl_jobs(job_type, created_at DESC);

-- =============================================
-- 7. users (사용자)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id         UUID UNIQUE,  -- Supabase Auth uid
  email           TEXT,
  nickname        TEXT DEFAULT '',
  point_balance   INT NOT NULL DEFAULT 0,
  total_charged   INT NOT NULL DEFAULT 0,
  total_used      INT NOT NULL DEFAULT 0,
  linked_influencer_id UUID REFERENCES influencers(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 8. point_transactions (포인트 거래 내역)
-- =============================================
CREATE TABLE IF NOT EXISTS point_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          INT NOT NULL,        -- 양수=충전, 음수=차감
  balance_after   INT NOT NULL,
  tx_type         TEXT NOT NULL,        -- 'charge', 'deduct', 'bonus'
  description     TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pt_user ON point_transactions(user_id, created_at DESC);

-- =============================================
-- 9. user_views (열람 기록 — 24시간 내 재열람 무료)
-- =============================================
CREATE TABLE IF NOT EXISTS user_views (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id       TEXT NOT NULL,
  view_type       TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uv_user ON user_views(user_id, target_id, view_type, created_at DESC);

-- =============================================
-- 10. RPC: 포인트 차감 (atomic)
-- =============================================
CREATE OR REPLACE FUNCTION deduct_points(
  p_user_id UUID,
  p_amount  INT,
  p_description TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INT;
BEGIN
  -- 잔액 조회 (FOR UPDATE 잠금)
  SELECT point_balance INTO v_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: % < %', v_balance, p_amount;
  END IF;

  -- 차감
  UPDATE users
  SET point_balance = point_balance - p_amount,
      total_used = total_used + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  -- 거래 기록
  INSERT INTO point_transactions (user_id, amount, balance_after, tx_type, description)
  VALUES (p_user_id, -p_amount, v_balance - p_amount, 'deduct', p_description);
END;
$$;

-- =============================================
-- 11. RPC: 포인트 충전 (atomic)
-- =============================================
CREATE OR REPLACE FUNCTION charge_points(
  p_user_id UUID,
  p_amount  INT,
  p_description TEXT DEFAULT ''
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INT;
BEGIN
  SELECT point_balance INTO v_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE users
  SET point_balance = point_balance + p_amount,
      total_charged = total_charged + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO point_transactions (user_id, amount, balance_after, tx_type, description)
  VALUES (p_user_id, p_amount, v_balance + p_amount, 'charge', p_description);
END;
$$;

-- =============================================
-- 12. updated_at 자동 갱신 트리거
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kc_updated_at
  BEFORE UPDATE ON keyword_challenges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_inf_updated_at
  BEFORE UPDATE ON influencers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 13. RLS (Row Level Security)
-- =============================================
-- 크롤링 관련 테이블은 service_role만 쓰기 가능, anon은 읽기만
ALTER TABLE keyword_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_volume_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_views ENABLE ROW LEVEL SECURITY;

ALTER TABLE influencer_keywords ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 (키워드, 인플루언서, 순위, 추천)
CREATE POLICY "public_read_keywords" ON keyword_challenges FOR SELECT USING (true);
CREATE POLICY "public_read_influencers" ON influencers FOR SELECT USING (true);
CREATE POLICY "public_read_rankings" ON keyword_rankings FOR SELECT USING (true);
CREATE POLICY "public_read_recommendations" ON daily_recommendations FOR SELECT USING (true);
CREATE POLICY "public_read_influencer_keywords" ON influencer_keywords FOR SELECT USING (true);
CREATE POLICY "public_read_volume_history" ON search_volume_history FOR SELECT USING (true);

-- 유저 본인 데이터만 읽기
CREATE POLICY "users_read_own" ON users FOR SELECT USING (auth.uid() = auth_id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = auth_id);
CREATE POLICY "pt_read_own" ON point_transactions FOR SELECT USING (
  user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "uv_read_own" ON user_views FOR SELECT USING (
  user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
);

-- service_role은 모든 테이블에 전체 접근 가능 (기본 동작)
