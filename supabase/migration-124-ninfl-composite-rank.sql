-- migration-124-ninfl-composite-rank.sql
-- "인플루언서 순위" — 오렌지 기획: 키워드챌린지 TOP3(30%) + 통합검색 평균순위(20%) +
-- 블로그탭 평균순위(20%) + AI 브리핑 인용(15%) + AI 탭 노출(10%) + 최근 포스팅 활동량(5%)
-- - 미노출률(감점) 가중합산 종합 랭킹.
--
-- 범위 주의(2026-08-04 조사 결론): 통합검색/블로그탭 평균순위·AI 브리핑·AI 탭·미노출률은
-- keyword_rank_lookups/ai_briefing_exposures/post_missing_checks 테이블에 저장되는데, 이 3개
-- 테이블 모두 user_id(또는 blog_id 소유권 검증) 기반이라 "실제 N인플에 가입해서 블로그를
-- 연결·조회한 회원"에게만 데이터가 존재함 (discover 크론이 자동 수집하는 전체 발굴
-- 인플루언서 1.3만+명 전체가 아님). 그래서 이 종합 순위는 전체 인플루언서가 아니라
-- "N인플 회원" 풀 안에서만 경쟁하는 순위로 설계함 (오렌지 확인 완료).
--
-- 기존 influencers.ninfl_rank/keyword_score(migration-106, aggregate-influencers 크론)는
-- 전체 발굴 인플루언서 대상 키워드챌린지 점수 기반 별개 지표라 그대로 두고 건드리지 않음
-- (my/page.tsx의 "카테고리 순위"가 이미 keyword_score 비교에 의존 중이라 충돌 방지).

CREATE TABLE IF NOT EXISTS public.influencer_composite_rank_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id         UUID NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  snapshot_date         DATE NOT NULL,
  composite_score       NUMERIC NOT NULL,
  rank                  INT NOT NULL,
  member_pool_size      INT NOT NULL,
  top3_count            INT NOT NULL DEFAULT 0,
  avg_integrated_rank   NUMERIC NULL,
  avg_blog_rank         NUMERIC NULL,
  ai_briefing_count     INT NOT NULL DEFAULT 0,
  ai_tab_count          INT NOT NULL DEFAULT 0,
  posting_count         INT NOT NULL DEFAULT 0,
  missing_rate          NUMERIC NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (influencer_id, snapshot_date)
);

-- "이 인플루언서의 최신 순위"와 "지난주 대비 변동" 둘 다 이 순서로 조회하므로 커버 인덱스로 충분
CREATE INDEX IF NOT EXISTS idx_icrs_influencer_date
  ON public.influencer_composite_rank_snapshots (influencer_id, snapshot_date DESC);

ALTER TABLE public.influencer_composite_rank_snapshots ENABLE ROW LEVEL SECURITY;

-- crawl_jobs/cron_cursors와 동일한 패턴: service_role(크론 + /my 서버 컴포넌트)만 RLS 우회로
-- 접근. 회원 간 점수 비교 데이터라 authenticated/anon에 공개하지 않음(deny_all 명시).
CREATE POLICY "deny_all_influencer_composite_rank_snapshots"
  ON public.influencer_composite_rank_snapshots
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

COMMENT ON TABLE public.influencer_composite_rank_snapshots IS
  'N인플 자체 산정 "인플루언서 순위"(네이버 공식 랭킹 아님) 일일 스냅샷. N인플 회원(블로그 연결 완료) 풀 안에서만 랭킹 — 전체 발굴 인플루언서 대상 아님. aggregate-ninfl-member-ranks 크론이 매일 적재, service_role 전용.';
