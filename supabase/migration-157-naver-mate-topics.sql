-- migration-157: 네이버 메이트 ↔ 분야(주제) 다대다 매칭
-- 기존 naver_mates 는 (platform, platform_key) 유니크에 category/topic_id 를 1개만 들고 있어,
-- 한 명이 여러 분야에 선정된 경우(예: '나트랑도깨비' = 국내여행 + 해외여행) 나중에 크롤된 분야가
-- 앞의 분야를 덮어써서 원래 분야 목록에서 사라졌다. 월별 분야 소속을 별도 테이블로 분리한다.

CREATE TABLE IF NOT EXISTS naver_mate_topics (
  mate_id UUID NOT NULL REFERENCES naver_mates(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  category TEXT NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (mate_id, topic_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_naver_mate_topics_lookup
  ON naver_mate_topics(year, month, category);

ALTER TABLE naver_mate_topics ENABLE ROW LEVEL SECURITY;

-- 공개 랭킹 데이터 — 비로그인 포함 누구나 조회 가능. 쓰기는 Service Role(크롤러) 전용.
DROP POLICY IF EXISTS "naver_mate_topics_public_read" ON naver_mate_topics;
CREATE POLICY "naver_mate_topics_public_read" ON naver_mate_topics FOR SELECT USING (true);

-- 기존 월별 스냅샷의 분야를 그대로 이관(덮어쓰기로 이미 유실된 분야는 다음 크롤 때 복원됨)
INSERT INTO naver_mate_topics (mate_id, topic_id, category, year, month, collected_at)
SELECT mm.mate_id, m.topic_id, m.category, mm.year, mm.month, mm.collected_at
FROM naver_mate_monthly mm
JOIN naver_mates m ON m.id = mm.mate_id
ON CONFLICT DO NOTHING;

COMMENT ON TABLE naver_mate_topics IS '네이버 메이트의 월별 분야 소속(다대다) — 한 메이트가 여러 분야에 선정될 수 있음';
COMMENT ON COLUMN naver_mates.category IS '대표 분야(공식 목록에서 가장 앞선 분야). 분야별 조회는 naver_mate_topics 를 쓸 것';
