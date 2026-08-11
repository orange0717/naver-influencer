-- =================================================================
-- 20260811: 블로그 순위(iblog_rank_*) 독립 시스템 — Phase 1 (DB 스키마)
--
-- 목적:
--   기존 "키워드순위"(keyword_rankings)와 "블로그탭 순위"(blog_rank_history,
--   blog_scores, blog_keywords)와는 완전히 분리된 독립 시스템.
--   네이버 "통합검색"에서 분석 대상 키워드들을 검색했을 때, 블로그 콘텐츠가
--   어느 블로거의 것인지 식별하여 블로거별 노출 횟수를 누적하고, 그 합산
--   노출량으로 "블로거 자체"의 순위(블로그 순위)를 산정한다.
--
-- 분리 원칙 (오렌지 지시):
--   - keyword_rankings / blog_rank_history 등 기존 순위 데이터를 재사용하지 않음
--   - 접두사 iblog_rank_ 로 네임스페이스를 완전히 분리
--   - 공식 순위 기준은 "네이버 통합검색 블로그 노출 횟수"
--
-- 적용: Supabase 콘솔 SQL Editor 에서 수동 실행 후 커밋 메시지/메모리에 기록.
--
-- 보안(RLS):
--   이 프로젝트 최신 방향(2026-08-11 lockdown)에 맞춰, 모든 iblog_rank_*
--   테이블은 RLS 를 켜되 정책을 두지 않는다. authenticated/anon 롤은 base
--   권한까지 회수하므로 클라이언트는 직접 접근 불가하고, 크론과 조회 API 는
--   service_role(RLS 우회)로만 읽고 쓴다. 페이월/소유자 게이팅은 API 라우트
--   (requireInfluencerPlan 등)가 담당한다.
-- =================================================================

-- -----------------------------------------------------------------
-- 1) iblog_rank_keywords — 블로그 순위 분석 대상 키워드 풀 (전용)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iblog_rank_keywords (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword     text NOT NULL,
  -- 키워드 출처: title_extract(포스팅 제목 추출) | user_registered(사용자 등록)
  --            | service_collected(서비스 수집) | category(카테고리 주요 키워드)
  source      text NOT NULL DEFAULT 'service_collected',
  category    text,
  is_active   boolean NOT NULL DEFAULT true,
  -- 마지막으로 이 키워드에 대해 통합검색 수집이 완료된 날짜(배치 재개/스킵 판단용)
  last_crawled_date date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iblog_rank_keywords_keyword_unique UNIQUE (keyword)
);

COMMENT ON TABLE public.iblog_rank_keywords IS '블로그 순위(통합검색) 분석 대상 키워드 풀 — 키워드순위 기능과 무관한 전용 풀';

CREATE INDEX IF NOT EXISTS idx_iblog_rank_keywords_active
  ON public.iblog_rank_keywords (is_active) WHERE is_active = true;

-- -----------------------------------------------------------------
-- 2) iblog_rank_blogs — 블로그/블로거 고유 정보
--    블로거 식별 우선순위: 블로그 URL > 블로그 ID > 프로필 URL > 작성자 식별 > 블로그명
--    이 시스템의 안정 식별자는 blog_id(blog.naver.com/{blog_id}).
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iblog_rank_blogs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id       text NOT NULL,           -- blog.naver.com/{blog_id} (소문자 정규화 저장)
  blog_name     text,
  blog_url      text,
  profile_url   text,
  -- 내 블로그 대시보드 연동용. 사용자가 자신의 블로그를 연결하면 채워진다.
  owner_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iblog_rank_blogs_blog_id_unique UNIQUE (blog_id)
);

COMMENT ON TABLE public.iblog_rank_blogs IS '블로그 순위 시스템의 블로거 고유 정보 — blog_id 로 유일 식별';

CREATE INDEX IF NOT EXISTS idx_iblog_rank_blogs_owner
  ON public.iblog_rank_blogs (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- -----------------------------------------------------------------
-- 3) iblog_rank_results — 키워드×블로거 일별 노출 결과 (raw)
--    한 키워드의 통합검색 결과에서 특정 블로거의 노출 포스팅 수를 저장.
--    (동일 블로거의 여러 포스팅은 exposure_count 로 합산됨 — 명세 7)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iblog_rank_results (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date  date NOT NULL,
  keyword        text NOT NULL,
  blog_id        text NOT NULL,
  exposure_count integer NOT NULL DEFAULT 0,   -- 해당 키워드 통합검색에서 이 블로거의 노출 포스팅 수
  best_position  integer,                       -- 통합검색 내 최상위 노출 위치(1-based, 확장용)
  -- 노출 출처: integrated(통합검색 HTML) | blog_api(블로그검색 API 보완) | hybrid(둘 다)
  source         text NOT NULL DEFAULT 'integrated',
  post_ids       text[],                        -- 노출된 포스팅 식별자(확장용)
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iblog_rank_results_unique UNIQUE (snapshot_date, keyword, blog_id)
);

COMMENT ON TABLE public.iblog_rank_results IS '키워드별 블로거 통합검색 노출 결과(일별 raw) — 블로그 순위 집계의 원천';

CREATE INDEX IF NOT EXISTS idx_iblog_rank_results_date
  ON public.iblog_rank_results (snapshot_date);
CREATE INDEX IF NOT EXISTS idx_iblog_rank_results_date_blog
  ON public.iblog_rank_results (snapshot_date, blog_id);
CREATE INDEX IF NOT EXISTS idx_iblog_rank_results_date_keyword
  ON public.iblog_rank_results (snapshot_date, keyword);

-- -----------------------------------------------------------------
-- 4) iblog_rank_daily — 날짜별 최종 블로그 순위 (집계 결과)
--    전체 분석 키워드에 대한 블로거별 노출량 합산 → 내림차순 순위.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iblog_rank_daily (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date  date NOT NULL,
  blog_id        text NOT NULL,
  total_exposure integer NOT NULL DEFAULT 0,   -- 전체 키워드 노출량 합산 (공식 순위 기준)
  keyword_count  integer NOT NULL DEFAULT 0,   -- 노출된 키워드 수
  rank           integer NOT NULL,
  previous_rank  integer,                       -- 직전 스냅샷에서의 순위 (없으면 NULL = NEW)
  rank_change    integer,                       -- 양수=상승, 음수=하락, 0=유지, NULL=NEW
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iblog_rank_daily_unique UNIQUE (snapshot_date, blog_id)
);

COMMENT ON TABLE public.iblog_rank_daily IS '날짜별 최종 블로그 순위 — 통합검색 노출량 합산 기준 정렬';

CREATE INDEX IF NOT EXISTS idx_iblog_rank_daily_date_rank
  ON public.iblog_rank_daily (snapshot_date, rank);
CREATE INDEX IF NOT EXISTS idx_iblog_rank_daily_blog
  ON public.iblog_rank_daily (blog_id, snapshot_date DESC);

-- -----------------------------------------------------------------
-- 5) iblog_rank_history — 블로거별 순위 변화 이력 (시계열)
--    iblog_rank_daily 를 블로거 중심 시계열로 누적하여, 대시보드의
--    "전일 대비"·순위 추이 차트 조회를 가볍게 한다.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iblog_rank_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id        text NOT NULL,
  snapshot_date  date NOT NULL,
  rank           integer NOT NULL,
  total_exposure integer NOT NULL DEFAULT 0,
  previous_rank  integer,
  rank_change    integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iblog_rank_history_unique UNIQUE (blog_id, snapshot_date)
);

COMMENT ON TABLE public.iblog_rank_history IS '블로거별 블로그 순위 변화 이력(시계열) — 추이/전일대비 조회용';

CREATE INDEX IF NOT EXISTS idx_iblog_rank_history_blog_date
  ON public.iblog_rank_history (blog_id, snapshot_date DESC);

-- -----------------------------------------------------------------
-- RLS: service_role 전용 (클라이언트 직접 접근 차단)
-- -----------------------------------------------------------------
ALTER TABLE public.iblog_rank_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iblog_rank_blogs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iblog_rank_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iblog_rank_daily    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iblog_rank_history  ENABLE ROW LEVEL SECURITY;

-- 정책을 두지 않아 authenticated/anon 은 RLS 로 전면 차단되며, base 권한도 회수한다.
-- service_role 은 RLS 및 GRANT 를 우회하므로 크론/조회 API 접근에는 영향 없다.
REVOKE ALL ON public.iblog_rank_keywords FROM anon, authenticated;
REVOKE ALL ON public.iblog_rank_blogs    FROM anon, authenticated;
REVOKE ALL ON public.iblog_rank_results  FROM anon, authenticated;
REVOKE ALL ON public.iblog_rank_daily    FROM anon, authenticated;
REVOKE ALL ON public.iblog_rank_history  FROM anon, authenticated;
