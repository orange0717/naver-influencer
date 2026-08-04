-- 포스팅 대표 키워드 영속화 (미노출/키워드순위/AI브리핑·탭 3개 메뉴가 공용으로 참조할 단일 소스)
-- extractRepresentativeKeywords()(제목+본문 정밀분석, 네이버 포스트 크롤링 포함)의 결과를
-- 매번 재크롤링하지 않도록 (blog_id, post_id) 기준으로 저장한다.
-- post_missing_checks(migration-105)와 동일하게 user_id 없이 blog_id 기준 공용 테이블로 둔다 —
-- 대표 키워드는 포스팅 공개 내용에서 뽑은 객관적 값이라 개인정보가 아니며,
-- 같은 블로그를 여러 계정이 조회해도 중복 크롤링 없이 재사용 가능해야 하기 때문.

CREATE TABLE IF NOT EXISTS post_representative_keywords (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id                 TEXT NOT NULL,
  post_id                 TEXT NOT NULL,
  post_title              TEXT,
  representative_keyword  TEXT,        -- 후보 중 최상위 1개 (다른 메뉴가 조회 기준으로 사용)
  candidates              TEXT[] NOT NULL DEFAULT '{}',  -- 추출된 후보 전체(최대 5개, 순위순) — 재크롤링 없이 참고용
  keyword_source          TEXT CHECK (keyword_source IN ('title+body', 'title', 'fallback', 'none')),
  extracted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blog_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_prk_blog ON post_representative_keywords (blog_id);

ALTER TABLE post_representative_keywords ENABLE ROW LEVEL SECURITY;

-- 노출 여부와 동일하게 공개 읽기 허용(쓰기는 Service Role 전용, API에서 소유권 검증)
CREATE POLICY "public_read_post_representative_keywords" ON post_representative_keywords
  FOR SELECT USING (true);

CREATE TRIGGER trg_prk_updated_at
  BEFORE UPDATE ON post_representative_keywords
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
