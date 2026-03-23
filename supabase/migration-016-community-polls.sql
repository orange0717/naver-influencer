-- migration-016: 커뮤니티 설문 투표 기능

-- 설문
CREATE TABLE community_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  is_multiple BOOLEAN DEFAULT FALSE,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id)
);

-- 선택지
CREATE TABLE community_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  vote_count INT DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_poll_options_poll_id ON community_poll_options(poll_id);

-- 투표 기록
CREATE TABLE community_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES community_poll_options(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

CREATE INDEX idx_poll_votes_poll_id ON community_poll_votes(poll_id);
CREATE INDEX idx_poll_votes_user_id ON community_poll_votes(user_id);

-- vote_count atomic increment RPC
CREATE OR REPLACE FUNCTION increment_poll_vote_count(p_option_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE community_poll_options
  SET vote_count = vote_count + 1
  WHERE id = p_option_id;
END;
$$ LANGUAGE plpgsql;
