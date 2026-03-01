-- ============================================================
-- 네이버 인플루언서 키워드챌린지 대시보드 - Supabase DB 스키마
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  nickname VARCHAR(100) NOT NULL,
  linked_influencer_id UUID,
  naver_influencer_id VARCHAR(100),
  naver_influencer_url VARCHAR(500),
  phone VARCHAR(20),
  point_balance INTEGER DEFAULT 0,
  total_charged INTEGER DEFAULT 0,
  total_used INTEGER DEFAULT 0,
  free_daily_recommendations INTEGER DEFAULT 3,
  free_daily_used INTEGER DEFAULT 0,
  free_daily_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_users_linked_influencer ON users(linked_influencer_id) WHERE linked_influencer_id IS NOT NULL;

-- 2. influencers
CREATE TABLE influencers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  naver_id VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  profile_url VARCHAR(500),
  category VARCHAR(100),
  sub_category VARCHAR(200),
  fan_count INTEGER DEFAULT 0,
  blog_neighbor_count INTEGER DEFAULT 0,
  stats_summary VARCHAR(500),
  total_keywords INTEGER DEFAULT 0,
  avg_rank DECIMAL(5,2),
  best_rank INTEGER,
  integrated_top3_count INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_influencer_category ON influencers(category);
CREATE INDEX idx_influencer_fan_count ON influencers(fan_count DESC);

ALTER TABLE users ADD CONSTRAINT fk_users_influencer
  FOREIGN KEY (linked_influencer_id) REFERENCES influencers(id);

-- 3. point_transactions
CREATE TABLE point_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  payment_key VARCHAR(200),
  payment_method VARCHAR(50),
  deduct_reason VARCHAR(50),
  deduct_keyword VARCHAR(200),
  description VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_point_tx_user ON point_transactions(user_id, created_at DESC);

-- 4. keyword_challenges
CREATE TABLE keyword_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword VARCHAR(200) NOT NULL,
  keyword_clean VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  participant_count INTEGER DEFAULT 0,
  participant_breakdown JSONB,
  content_count INTEGER DEFAULT 0,
  search_volume_monthly INTEGER,
  search_volume_pc INTEGER,
  search_volume_mobile INTEGER,
  search_volume_updated_at TIMESTAMPTZ,
  competition_level VARCHAR(20),
  recommendation_score DECIMAL(3,1),
  trend_direction VARCHAR(20),
  trend_percentage DECIMAL(5,2),
  is_active BOOLEAN DEFAULT true,
  integrated_top3_exists BOOLEAN DEFAULT false,
  integrated_section_position INTEGER,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_keyword_unique ON keyword_challenges(keyword_clean);
CREATE INDEX idx_keyword_category ON keyword_challenges(category);
CREATE INDEX idx_keyword_recommendation ON keyword_challenges(recommendation_score DESC);
CREATE INDEX idx_keyword_search_volume ON keyword_challenges(search_volume_monthly DESC NULLS LAST);

-- 5. keyword_rankings
CREATE TABLE keyword_rankings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id UUID NOT NULL REFERENCES keyword_challenges(id),
  influencer_id UUID NOT NULL REFERENCES influencers(id),
  rank_position INTEGER NOT NULL,
  previous_rank INTEGER,
  rank_change INTEGER DEFAULT 0,
  fan_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  is_integrated_top3 BOOLEAN DEFAULT false,
  latest_post_title VARCHAR(500),
  latest_post_date TIMESTAMPTZ,
  snapshot_date DATE NOT NULL,
  crawled_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ranking_keyword ON keyword_rankings(keyword_id, snapshot_date DESC, rank_position);
CREATE INDEX idx_ranking_influencer ON keyword_rankings(influencer_id, snapshot_date DESC, rank_position);
CREATE UNIQUE INDEX idx_ranking_unique ON keyword_rankings(keyword_id, influencer_id, snapshot_date);

-- 6. search_volume_history
CREATE TABLE search_volume_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id UUID NOT NULL REFERENCES keyword_challenges(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type VARCHAR(20) DEFAULT 'monthly',
  search_volume_total INTEGER,
  search_volume_pc INTEGER,
  search_volume_mobile INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_volume_unique ON search_volume_history(keyword_id, period_start, period_type);

-- 7. daily_recommendations
CREATE TABLE daily_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id UUID NOT NULL REFERENCES keyword_challenges(id),
  recommendation_date DATE NOT NULL,
  rank_in_day INTEGER NOT NULL,
  reason VARCHAR(500),
  is_free BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_daily_rec_date ON daily_recommendations(recommendation_date DESC, rank_in_day);

-- 8. user_views
CREATE TABLE user_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  view_type VARCHAR(50) NOT NULL,
  keyword_id UUID REFERENCES keyword_challenges(id),
  points_spent INTEGER DEFAULT 0,
  is_free BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_views ON user_views(user_id, keyword_id, view_type);

-- 9. crawl_jobs
CREATE TABLE crawl_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. pricing
CREATE TABLE pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type VARCHAR(50) UNIQUE NOT NULL,
  point_cost INTEGER NOT NULL,
  description VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO pricing (action_type, point_cost, description) VALUES
  ('keyword_list', 0, '전체 키워드 리스트 (무료)'),
  ('daily_recommendation_free', 0, '일일 추천 키워드 3개 (무료)'),
  ('daily_recommendation_full', 50, '전체 추천 리스트 열람'),
  ('keyword_detail', 30, '키워드 상세 (검색량+참여자+트렌드)'),
  ('ranking_view', 50, '키워드별 순위 전체 열람'),
  ('influencer_profile', 50, '인플루언서 프로필 + 참여 키워드 열람'),
  ('search_volume_history', 30, '검색량 히스토리 차트'),
  ('trend_analysis', 50, '트렌드 분석 리포트'),
  ('my_dashboard', 0, '내 대시보드 기본 현황 (무료)');

-- 11. point_packages
CREATE TABLE point_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  point_amount INTEGER NOT NULL,
  price_krw INTEGER NOT NULL,
  bonus_points INTEGER DEFAULT 0,
  is_popular BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO point_packages (name, point_amount, price_krw, bonus_points, is_popular, sort_order) VALUES
  ('체험', 100, 1000, 0, false, 1),
  ('스타터', 500, 4500, 50, false, 2),
  ('프로', 1000, 8000, 200, true, 3),
  ('비즈니스', 3000, 20000, 1000, false, 4);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self ON users FOR ALL USING (id = auth.uid());
CREATE POLICY point_tx_self ON point_transactions FOR ALL USING (user_id = auth.uid());
CREATE POLICY user_views_self ON user_views FOR ALL USING (user_id = auth.uid());
CREATE POLICY keyword_read ON keyword_challenges FOR SELECT USING (true);
CREATE POLICY ranking_read ON keyword_rankings FOR SELECT USING (true);
CREATE POLICY influencer_read ON influencers FOR SELECT USING (true);
CREATE POLICY daily_rec_read ON daily_recommendations FOR SELECT USING (true);
CREATE POLICY pricing_read ON pricing FOR SELECT USING (true);
CREATE POLICY packages_read ON point_packages FOR SELECT USING (true);

-- 함수: 포인트 차감
CREATE OR REPLACE FUNCTION deduct_points(
  p_user_id UUID, p_amount INTEGER, p_reason VARCHAR(50), p_keyword VARCHAR(200) DEFAULT NULL
) RETURNS JSON AS $$
DECLARE v_balance INTEGER; v_new_balance INTEGER;
BEGIN
  SELECT point_balance INTO v_balance FROM users WHERE id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RETURN json_build_object('success', false, 'error', 'user_not_found'); END IF;
  IF v_balance < p_amount THEN RETURN json_build_object('success', false, 'error', 'insufficient_points', 'balance', v_balance); END IF;
  v_new_balance := v_balance - p_amount;
  UPDATE users SET point_balance = v_new_balance, total_used = total_used + p_amount WHERE id = p_user_id;
  INSERT INTO point_transactions (user_id, type, amount, balance_after, deduct_reason, deduct_keyword)
  VALUES (p_user_id, 'deduct', -p_amount, v_new_balance, p_reason, p_keyword);
  RETURN json_build_object('success', true, 'balance', v_new_balance, 'deducted', p_amount);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 함수: 포인트 충전
CREATE OR REPLACE FUNCTION charge_points(
  p_user_id UUID, p_amount INTEGER, p_payment_key VARCHAR(200), p_payment_method VARCHAR(50) DEFAULT 'tosspay'
) RETURNS JSON AS $$
DECLARE v_new_balance INTEGER;
BEGIN
  UPDATE users SET point_balance = point_balance + p_amount, total_charged = total_charged + p_amount
  WHERE id = p_user_id RETURNING point_balance INTO v_new_balance;
  INSERT INTO point_transactions (user_id, type, amount, balance_after, payment_key, payment_method, description)
  VALUES (p_user_id, 'charge', p_amount, v_new_balance, p_payment_key, p_payment_method, p_amount || '포인트 충전');
  RETURN json_build_object('success', true, 'balance', v_new_balance, 'charged', p_amount);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 함수: 일일 무료 리셋
CREATE OR REPLACE FUNCTION reset_daily_free_quota() RETURNS void AS $$
BEGIN
  UPDATE users SET free_daily_used = 0, free_daily_reset_at = NOW()
  WHERE free_daily_reset_at IS NULL OR free_daily_reset_at < CURRENT_DATE;
END; $$ LANGUAGE plpgsql;

-- 트리거: updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER keywords_updated_at BEFORE UPDATE ON keyword_challenges FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER pricing_updated_at BEFORE UPDATE ON pricing FOR EACH ROW EXECUTE FUNCTION update_updated_at();
