-- 네이버메이트(AI 브리핑 노출 분석) 상태 동기화 테이블
-- keyword_rank_lookups(migration-099)와 동일한 (user, post, keyword) 자연키 패턴.
-- 차이점: 통합검색/블로그탭 순위가 아니라 "네이버 AI 브리핑(생성형 검색 답변)" 출처 카드에
-- 내 포스팅 URL이 인용되어 있는지를 저장한다.

CREATE TABLE IF NOT EXISTS ai_briefing_exposures (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blog_id            TEXT NOT NULL,
  post_id            TEXT NOT NULL,
  keyword            TEXT NOT NULL,
  has_ai_briefing    BOOLEAN NULL,   -- 해당 키워드 검색 시 AI 브리핑 자체가 노출되는지
  exposed            BOOLEAN NULL,   -- AI 브리핑 출처 중 내 포스팅이 포함되는지
  source_index       INT     NULL,  -- 출처 카드 내 순번 (1부터, 미노출 시 NULL)
  source_total       INT     NULL,  -- AI 브리핑 출처 카드 총 개수
  matched_title      TEXT    NULL,  -- 매칭된 출처 카드에 표시된 제목(디버그/확인용)
  checked_at         TIMESTAMPTZ NULL,  -- 마지막 확인 시각 (NULL = 키워드만 할당, 미확인)
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_abe_user_blog
  ON ai_briefing_exposures (user_id, blog_id);

ALTER TABLE ai_briefing_exposures ENABLE ROW LEVEL SECURITY;

CREATE POLICY abe_select ON ai_briefing_exposures FOR SELECT USING (user_id = auth.uid());
CREATE POLICY abe_insert ON ai_briefing_exposures FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY abe_update ON ai_briefing_exposures FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY abe_delete ON ai_briefing_exposures FOR DELETE USING (user_id = auth.uid());
