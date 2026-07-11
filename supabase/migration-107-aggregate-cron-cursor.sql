-- migration-107-aggregate-cron-cursor.sql
-- aggregate-influencers 크론 진행 커서 저장용 테이블
--
-- 배경 (2026-07-11, migration-106 배치 분할 적용 후 라이브 테스트 중 발견):
--   - keyword_rankings 가 인플루언서당 참여 키워드 수 편차가 매우 커서(수십~2,000+),
--     인플루언서 300명 배치는 쿼리 플래너가 비효율적인 실행계획으로 전환되며 90초
--     statement_timeout 에 걸림 (실측: 0~300번 300명 묶음 실패, 0~200/200~300으로
--     나누면 각각 15초/14초로 정상). 배치 크기를 80명으로 낮춤(코드 측 조정, SQL 불변).
--   - 더 심각한 문제: 기존 크론 코드는 "시간 예산 초과 시 다음 실행에서 이어감"이라고
--     주석에 적었지만 실제로는 매 실행마다 influencers.id 오름차순 전체 목록을 다시 읽어
--     처음부터 배치를 도는 구조라, 진행 상태를 어디에도 저장하지 않았음. 그 결과 300초
--     예산 안에 못 도는 인플루언서(뒤쪽 id)는 사실상 영원히 갱신되지 않는 구조적 결함이었음.
--   - 해결: 마지막으로 처리 시도한 influencer id를 이 테이블에 저장해두고, 다음 실행은
--     그 지점 다음부터 이어서 처리. 전체 목록을 다 돌면 커서를 NULL로 리셋해 처음부터
--     순환(cycle) — crawl-challenge-ranks 의 24시간 순환 큐와 유사한 사상.

CREATE TABLE IF NOT EXISTS public.cron_cursors (
  key          text         PRIMARY KEY,
  cursor_value text,
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_cron_cursors" ON public.cron_cursors;
CREATE POLICY "deny_all_cron_cursors" ON public.cron_cursors
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

COMMENT ON TABLE public.cron_cursors IS
  '배치형 크론(aggregate-influencers 등)의 마지막 처리 지점을 저장. service_role만 RLS 우회로 접근 (REST 직접 select/upsert, 별도 RPC 불필요).';
