-- 구글 색인등록(Google Indexing) 기능 — OAuth 토큰, 등록 URL, 상태 이력, 사이트맵, 자동감지 커서.
-- API 라우트는 항상 service-role 클라이언트로 접근하므로 RLS는 방어적 백스톱 역할이지만,
-- indexed_urls는 프론트에서 Realtime(postgres_changes)으로 직접 구독하므로 RLS가 실제로
-- 통과해야 이벤트가 전달된다(schema.sql의 users_read_own 등과 동일하게
-- `auth.uid() = auth_id`로 조회한 users.id와 비교 — users.id는 auth_id와 다른 별도 UUID이므로
-- migration-111의 `user_id = auth.uid()` 패턴은 여기선 쓰지 않는다).
--
-- 주의: 이 기능은 "즉시 색인"을 보장하지 않는다. Google Indexing API는 공식적으로
-- JobPosting/BroadcastEvent 전용이라 일반 블로그 글에는 사용하지 않고,
-- 사이트맵 제출 + URL Inspection API 상태조회의 공식 준수 방식만 사용한다.

-- 1) Google OAuth 토큰 (사용자당 1개, service-role만 접근 — RLS enable만 하고
--    정책은 두지 않아 anon/authenticated 클라이언트는 기본적으로 접근 불가)
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_email      TEXT,
  access_token_enc  TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  scope             TEXT NOT NULL DEFAULT 'https://www.googleapis.com/auth/webmasters',
  expires_at        TIMESTAMPTZ NOT NULL,
  site_url          TEXT,             -- 예: 'https://blog.naver.com/{blogId}/' (GSC property, URL-prefix)
  site_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- 2) 등록된 URL (색인 요청 대상)
CREATE TABLE IF NOT EXISTS indexed_urls (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id               TEXT NOT NULL,
  post_no               TEXT NOT NULL,
  url                   TEXT NOT NULL,   -- https://blog.naver.com/{blogId}/{postNo}
  title                 TEXT,
  source                TEXT NOT NULL DEFAULT 'manual', -- manual|bulk_recent|bulk_all|rss|auto_crawl
  status                TEXT NOT NULL DEFAULT 'pending', -- pending|submitted|checking|indexed|not_indexed|error
  progress_stage        TEXT NOT NULL DEFAULT 'registering', -- registering|requesting|checking|done
  registered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at       TIMESTAMPTZ,
  next_check_at         TIMESTAMPTZ,     -- 다음 자동 재확인 예정 시각 (30분/12h/24h 스케줄)
  check_count           INT NOT NULL DEFAULT 0,
  indexed_at            TIMESTAMPTZ,
  google_verdict        TEXT,            -- GSC inspectionResult.indexStatusResult.verdict 원문
  google_coverage_state TEXT,            -- coverageState 원문
  failure_reason_code   TEXT,            -- robots_blocked|canonical_issue|duplicate_content|not_found|noindex|meta_issue|thin_internal_links|thin_content|crawl_pending|not_discovered
  ai_diagnosis          TEXT,            -- Claude 생성 진단/제안 텍스트 (Phase 2)
  seo_score             INT,
  seo_sub_scores        JSONB,
  retry_count           INT NOT NULL DEFAULT 0,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, url)
);

CREATE INDEX IF NOT EXISTS idx_iu_user ON indexed_urls (user_id, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_iu_next_check ON indexed_urls (next_check_at) WHERE status IN ('submitted', 'checking');

ALTER TABLE indexed_urls ENABLE ROW LEVEL SECURITY;
CREATE POLICY iu_select ON indexed_urls FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY iu_insert ON indexed_urls FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY iu_update ON indexed_urls FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY iu_delete ON indexed_urls FOR DELETE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Supabase Realtime은 supabase_realtime publication을 구독한 테이블만 이벤트를 내보낸다
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'indexed_urls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE indexed_urls;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime publication 설정 스킵 (supabase_realtime 미존재): %', SQLERRM;
END $$;

-- 3) 상태확인 이력 (감사로그 + 관리자 화면용)
CREATE TABLE IF NOT EXISTS indexed_url_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indexed_url_id   UUID NOT NULL REFERENCES indexed_urls(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verdict          TEXT,
  coverage_state   TEXT,
  raw_response     JSONB,
  api_call_success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_iuc_url ON indexed_url_checks (indexed_url_id, checked_at DESC);

ALTER TABLE indexed_url_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY iuc_select ON indexed_url_checks FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 4) 사용자별 사이트맵 (ninfl.kr이 호스팅하는 프록시 sitemap.xml의 메타)
CREATE TABLE IF NOT EXISTS user_sitemaps (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blog_id            TEXT NOT NULL,
  url_count          INT NOT NULL DEFAULT 0,
  last_generated_at  TIMESTAMPTZ,
  last_submitted_at  TIMESTAMPTZ,
  last_submit_status TEXT,   -- success|error
  last_submit_error  TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_sitemaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY us_select ON user_sitemaps FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 5) 자동감지 커서 (Phase 2 신규 글 자동등록용 — 테이블만 미리 생성, 미사용)
CREATE TABLE IF NOT EXISTS auto_index_watch (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blog_id           TEXT NOT NULL,
  enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_post_no TEXT,
  detection_method  TEXT NOT NULL DEFAULT 'rss', -- rss|crawl
  last_checked_at   TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE auto_index_watch ENABLE ROW LEVEL SECURITY;
CREATE POLICY aiw_select ON auto_index_watch FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY aiw_update ON auto_index_watch FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
