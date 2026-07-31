-- 구글 색인등록 "전체 포스트 등록" 무제한 확장용 백그라운드 잡 큐.
-- 기존 bulk-register(mode=all)는 타임아웃 방지로 최대 300개(10페이지)만 한 요청에서 처리했음.
-- 300개를 넘는 나머지는 이 테이블에 커서(next_page)를 남겨두고
-- cron(google-indexing-bulk-continue)이 몇 분 간격으로 이어서 처리한다.
-- 사용자당 진행 중인 "전체 등록" 작업은 최대 1개(재요청 시 기존 잡을 이어서 갱신).

CREATE TABLE IF NOT EXISTS bulk_index_jobs (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blog_id          TEXT NOT NULL,
  page_size        INT NOT NULL DEFAULT 30,
  next_page        INT NOT NULL DEFAULT 1,      -- 다음에 이어서 가져올 페이지 번호
  total_count      INT,                          -- 네이버가 보고한 전체 글 수 (알게 되는 즉시 채움)
  registered_count INT NOT NULL DEFAULT 0,       -- 지금까지 indexed_urls에 등록한 누적 건수
  status           TEXT NOT NULL DEFAULT 'running', -- running|completed|failed
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bulk_index_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bij_select ON bulk_index_jobs FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
