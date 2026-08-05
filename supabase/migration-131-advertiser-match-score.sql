-- migration-131-advertiser-match-score.sql
-- 광고주 매칭 플랫폼 1단계: Match Score 알고리즘 (설계안, 2026-08-04)
--
-- 배경: 광고주가 업종/키워드(예: "세무")를 입력하면 해당 분야에서 실제 성과를 내는
--   인플루언서를 점수순으로 추천한다. 신규 크롤링 없이 기존 데이터(keyword_rankings,
--   blog_rank_history, keyword_challenges, ai_briefing_exposures)만 재조합한다.
--
-- 산식 (100점 만점, 2026-08-04 오렌지 확정 → 2026-08-04 실데이터 검증 후 재조정):
--   통합검색 평균순위   35점  (keyword_rankings.rank_position)
--   챌린지 TOP3 점유율  25점  (keyword_rankings.is_integrated_top3)
--   최근 N일 포스팅 빈도 15점  (매칭 키워드 내 서로 다른 포스팅 URL 수, 프록시)
--   해당 분야 포스팅 비율 15점  (매칭 키워드 수 / 전체 보유 키워드 수)
--   블로그탭 순위 + AI 브리핑/AI탭 노출  가점 +10 (5+5, 둘 다 옵트인 데이터라 미보유시 0점 처리 —
--                                                  전체 100점 중 기본 90점은 항상 확보되도록 재설계)
--
-- ⚠️ 재조정 이유 (2026-08-04, '세무' 카테고리로 실제 RPC 호출해서 발견):
--   - blog_rank_history가 완전히 0행이었음 — 원인은 크론 실패가 아니라, 이 테이블의 소스인
--     blog_keywords가 "사용자가 직접 자기 블로그+키워드를 등록해야" 쌓이는 옵트인 테이블인데
--     등록자가 0명이었기 때문. 즉 통합검색순위/챌린지/인플루언서정보처럼 전체 인플루언서를
--     자동 크롤링하는 데이터가 아니어서, 애초에 25점짜리 핵심 요소로 두면 안 되는 데이터였음.
--   - ai_briefing_exposures도 동일 성격 확인(오렌지 본인 블로그 테스트 데이터 몇 건뿐, 회원 미사용).
--   - 따라서 두 데이터는 모두 "가점"으로 격하하고, 핵심 4개 요소(통합검색/챌린지/포스팅빈도/
--     포스팅비율)만으로 기본 90점을 항상 채우도록 재설계함 (조건부 재분배 로직 불필요해짐).
--
-- ⚠️ 알려진 제약:
--   - blog_rank_history.blog_id는 TEXT라 influencers.naver_id와 문자열 매칭에 의존
--     (blog_keywords 등록자가 생기기 시작하면 포맷 일치 여부 재검증 필요)
--   - 포스팅 빈도는 별도 포스팅 이력 테이블이 없어 키워드랭킹 내 latest_post_url distinct 수로 근사
--     (실제 포스팅 수보다 적게 잡힐 수 있음 — 추후 전용 집계 테이블 고려)
--   - benchmark 상수(포스팅 15개/90일 등)는 실데이터 분포 확인 전 임시값, 튜닝 필요
--   - 매칭 키워드 수가 적은 인플루언서가 포스팅비율에서 유리해지는 왜곡 확인됨(표본 1개=100% 매칭)
--     → 다음 튜닝 대상으로 남겨둠
--
-- ⚠️ 이 마이그레이션은 설계 초안이며 Supabase에 아직 적용되지 않음 (SQL Editor 수동 실행 필요).
--    aggregate_influencer_stats_batch()(migration-106) 패턴을 따라 SECURITY DEFINER +
--    명시적 statement_timeout으로 작성 — 게이트웨이 타임아웃 재발 방지.

CREATE OR REPLACE FUNCTION public.calculate_advertiser_match_score(
  p_category TEXT,           -- 광고주 입력 업종/키워드 (keyword_challenges.keyword ILIKE 매칭, category 대분류 일치도 허용)
  p_days     INT DEFAULT 90, -- 포스팅 빈도/순위 집계 기간
  p_limit    INT DEFAULT 20
)
RETURNS TABLE (
  influencer_id        UUID,
  display_name         TEXT,
  naver_id             TEXT,
  match_score          NUMERIC,
  avg_search_rank      NUMERIC,
  avg_blogtab_rank     NUMERIC,
  top3_ratio           NUMERIC,
  recent_post_count    INT,
  category_post_ratio  NUMERIC,
  ai_exposure_count    INT,
  matched_keyword_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '90s'
AS $$
BEGIN
  RETURN QUERY
  WITH matched_keywords AS (
    -- category는 네이버 인플루언서 대분류 16개 고정값이라 "세무"처럼 세부 업종은
    -- keyword 텍스트 포함 매칭으로 찾아야 함 (2026-08-04 실데이터 확인).
    -- 대분류명 그대로 검색하는 경우(예: "뷰티")도 지원하도록 category 일치도 함께 허용.
    SELECT id, keyword
    FROM keyword_challenges
    WHERE (keyword ILIKE '%' || p_category || '%' OR category = p_category)
      AND is_active = TRUE
  ),
  latest_rankings AS (
    SELECT DISTINCT ON (kr.influencer_id, kr.keyword_id)
      kr.influencer_id,
      kr.keyword_id,
      kr.rank_position,
      kr.is_integrated_top3,
      kr.latest_post_url,
      kr.snapshot_date
    FROM keyword_rankings kr
    JOIN matched_keywords mk ON mk.id = kr.keyword_id
    WHERE kr.snapshot_date >= CURRENT_DATE - p_days
    ORDER BY kr.influencer_id, kr.keyword_id, kr.snapshot_date DESC
  ),
  search_stats AS (
    SELECT
      lr.influencer_id AS inf_id,
      ROUND(AVG(lr.rank_position), 2) AS avg_rank,
      COUNT(*)::INT AS matched_kw_count,
      COUNT(*) FILTER (WHERE lr.is_integrated_top3)::NUMERIC / NULLIF(COUNT(*), 0) AS top3_ratio,
      COUNT(DISTINCT lr.latest_post_url)::INT AS post_count
    FROM latest_rankings lr
    GROUP BY lr.influencer_id
  ),
  total_keyword_footprint AS (
    SELECT ik.influencer_id AS inf_id, COUNT(*)::NUMERIC AS total_kw
    FROM influencer_keywords ik
    GROUP BY ik.influencer_id
  ),
  blogtab_stats AS (
    SELECT
      inf.id AS inf_id,
      ROUND(AVG(br.rank_position), 2) AS avg_blogtab_rank
    FROM influencers inf
    JOIN search_stats ss ON ss.inf_id = inf.id  -- 검색 매칭 없는 인플루언서는 스코어링 대상 아님(비용 절감)
    JOIN matched_keywords mk ON TRUE
    JOIN LATERAL (
      SELECT DISTINCT ON (blog_id, keyword) rank_position
      FROM blog_rank_history
      WHERE blog_id = inf.naver_id
        AND keyword = mk.keyword
        AND snapshot_date >= CURRENT_DATE - p_days
        AND rank_position IS NOT NULL
      ORDER BY blog_id, keyword, snapshot_date DESC
    ) br ON TRUE
    GROUP BY inf.id
  ),
  ai_stats AS (
    SELECT
      inf.id AS inf_id,
      COUNT(*) FILTER (WHERE abe.has_ai_briefing OR abe.has_ai_tab)::INT AS exposure_count
    FROM influencers inf
    JOIN search_stats ss ON ss.inf_id = inf.id  -- 검색 매칭 없는 인플루언서는 스코어링 대상 아님(비용 절감)
    JOIN matched_keywords mk ON TRUE
    JOIN ai_briefing_exposures abe
      ON abe.blog_id = inf.naver_id
     AND abe.keyword = mk.keyword
    GROUP BY inf.id
  ),
  combined AS (
    SELECT
      s.inf_id,
      s.avg_rank,
      s.matched_kw_count,
      COALESCE(s.top3_ratio, 0) AS top3_ratio,
      s.post_count,
      COALESCE(bt.avg_blogtab_rank, NULL) AS avg_blogtab_rank,
      COALESCE(s.matched_kw_count::NUMERIC / NULLIF(tf.total_kw, 0), 0) AS post_ratio,
      COALESCE(ai.exposure_count, 0) AS ai_exposure_count,
      -- 정규화 점수 (0~1)
      GREATEST(0, (31 - s.avg_rank)) / 30.0 AS n_search,
      CASE WHEN bt.avg_blogtab_rank IS NULL THEN NULL
           ELSE GREATEST(0, (31 - bt.avg_blogtab_rank)) / 30.0 END AS n_blogtab,
      LEAST(1, s.post_count::NUMERIC / 15) AS n_freq,  -- benchmark: 90일 15건 = 만점 (임시값)
      LEAST(1, COALESCE(ai.exposure_count, 0)::NUMERIC / 5) AS n_ai  -- benchmark: 5건 = 만점 (임시값)
    FROM search_stats s
    LEFT JOIN total_keyword_footprint tf ON tf.inf_id = s.inf_id
    LEFT JOIN blogtab_stats bt ON bt.inf_id = s.inf_id
    LEFT JOIN ai_stats ai ON ai.inf_id = s.inf_id
  ),
  scored AS (
    SELECT
      c.*,
      -- 기본 90점(통합검색35/챌린지25/포스팅빈도15/포스팅비율15)은 항상 확보,
      -- 블로그탭+AI브리핑은 옵트인 데이터라 있으면만 가점(5+5=최대10), 재분배 불필요
      ROUND(
        c.n_search * 35 + c.top3_ratio * 25 + c.n_freq * 15 + c.post_ratio * 15
        + COALESCE(c.n_blogtab, 0) * 5 + c.n_ai * 5
      , 2) AS final_score
    FROM combined c
  )
  SELECT
    inf.id,
    inf.display_name,
    inf.naver_id,
    sc.final_score,
    sc.avg_rank,
    sc.avg_blogtab_rank,
    ROUND(sc.top3_ratio, 3),
    sc.post_count,
    ROUND(sc.post_ratio, 3),
    sc.ai_exposure_count,
    sc.matched_kw_count
  FROM scored sc
  JOIN influencers inf ON inf.id = sc.inf_id
  ORDER BY sc.final_score DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_advertiser_match_score(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_advertiser_match_score(TEXT, INT, INT) TO service_role;
