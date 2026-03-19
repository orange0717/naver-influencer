-- ─── 커뮤니티 신고 테이블 ───

CREATE TABLE IF NOT EXISTS community_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id TEXT NOT NULL,
  reporter_type TEXT NOT NULL DEFAULT 'blogger',
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES community_comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'inappropriate', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- 같은 사람이 같은 게시글/댓글을 중복 신고 방지
  CONSTRAINT unique_post_report UNIQUE (reporter_id, post_id),
  CONSTRAINT unique_comment_report UNIQUE (reporter_id, comment_id),
  -- 게시글 또는 댓글 중 하나는 반드시 지정
  CONSTRAINT report_target CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

CREATE INDEX idx_reports_post_id ON community_reports(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_reports_comment_id ON community_reports(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX idx_reports_status ON community_reports(status);

-- RLS
ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage reports" ON community_reports FOR ALL USING (true);

-- ─── 자동 숨김 트리거: pending 신고 3개 이상이면 게시글/댓글 소프트 삭제 ───

CREATE OR REPLACE FUNCTION auto_hide_reported_content()
RETURNS TRIGGER AS $$
DECLARE
  report_count INT;
BEGIN
  -- 게시글 신고인 경우
  IF NEW.post_id IS NOT NULL THEN
    SELECT COUNT(*) INTO report_count
    FROM community_reports
    WHERE post_id = NEW.post_id AND status = 'pending';

    IF report_count >= 3 THEN
      UPDATE community_posts SET is_deleted = true WHERE id = NEW.post_id;
    END IF;
  END IF;

  -- 댓글 신고인 경우
  IF NEW.comment_id IS NOT NULL THEN
    SELECT COUNT(*) INTO report_count
    FROM community_reports
    WHERE comment_id = NEW.comment_id AND status = 'pending';

    IF report_count >= 3 THEN
      UPDATE community_comments SET is_deleted = true WHERE id = NEW.comment_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_hide_reported
AFTER INSERT ON community_reports
FOR EACH ROW
EXECUTE FUNCTION auto_hide_reported_content();
