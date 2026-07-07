-- migration-103: 네이버 메이트(mate.naver.com) AI 브리핑 인용수 랭킹
-- 네이버 공식 AI 펠로우십 프로그램 '네이버 메이트'가 매월 선정하는 블로그/카페/지식iN/프리미엄콘텐츠
-- 크리에이터 명단 + 누적 AI 브리핑 인용수를 자체 크롤러(src/lib/naver-mate-crawler.ts)로 수집해 월별 누적.

CREATE TABLE IF NOT EXISTS naver_mates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL CHECK (platform IN ('blog', 'cafe', 'kin', 'premium')),
  platform_key TEXT NOT NULL,
  category TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  profile_image_url TEXT,
  home_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, platform_key)
);

CREATE TABLE IF NOT EXISTS naver_mate_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mate_id UUID NOT NULL REFERENCES naver_mates(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  ai_briefing_count BIGINT NOT NULL DEFAULT 0,
  is_new BOOLEAN NOT NULL DEFAULT FALSE,
  expertise_value TEXT,
  latest_post_title TEXT,
  latest_post_url TEXT,
  latest_post_date TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mate_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_naver_mates_category ON naver_mates(category);

CREATE INDEX IF NOT EXISTS idx_naver_mate_monthly_ranking
  ON naver_mate_monthly(year, month, ai_briefing_count DESC);

ALTER TABLE naver_mates ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_mate_monthly ENABLE ROW LEVEL SECURITY;

-- 공개 랭킹 데이터 — 비로그인 포함 누구나 조회 가능
DROP POLICY IF EXISTS "naver_mates_public_read" ON naver_mates;
CREATE POLICY "naver_mates_public_read" ON naver_mates FOR SELECT USING (true);

DROP POLICY IF EXISTS "naver_mate_monthly_public_read" ON naver_mate_monthly;
CREATE POLICY "naver_mate_monthly_public_read" ON naver_mate_monthly FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE 는 Service Role(크롤러)에서만 — 별도 정책 없어 anon/authenticated 는 차단됨

COMMENT ON TABLE naver_mates IS '네이버 메이트 프로그램 선정 크리에이터(플랫폼별 고유) — 크롤러가 자동 upsert';
COMMENT ON TABLE naver_mate_monthly IS '네이버 메이트 월별 스냅샷(AI 브리핑 누적 인용수 등) — mate_id+year+month 유니크';
COMMENT ON COLUMN naver_mates.platform_key IS '플랫폼별 고유 식별자(블로그/카페: URL 경로, 지식iN: 암호화된 profileLink 전체 — 평문 ID 없음)';
