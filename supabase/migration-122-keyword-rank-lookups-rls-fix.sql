-- keyword_rank_lookups(migration-099)의 RLS가 user_id를 auth.uid()와 직접 비교하고 있었음.
-- 그런데 user_id는 public.users.id이고, auth.uid()는 auth.users.id(=users.auth_id) — 서로 다른 UUID라서
-- (migration-117에서 이미 같은 문제를 지적·수정한 패턴) 이 정책은 클라이언트 세션으로는 절대 만족될 수 없었다.
-- 지금까지는 모든 접근이 service_role(RLS 우회) API 경유라 데이터 조회엔 문제가 없었지만,
-- Realtime postgres_changes 이벤트 전달은 SELECT RLS를 통과해야 하므로 /my/keyword-ranking 실시간
-- 반영을 위해 정정한다.

DROP POLICY IF EXISTS krl_select ON keyword_rank_lookups;
DROP POLICY IF EXISTS krl_insert ON keyword_rank_lookups;
DROP POLICY IF EXISTS krl_update ON keyword_rank_lookups;
DROP POLICY IF EXISTS krl_delete ON keyword_rank_lookups;

CREATE POLICY krl_select ON keyword_rank_lookups FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY krl_insert ON keyword_rank_lookups FOR INSERT WITH CHECK (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY krl_update ON keyword_rank_lookups FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY krl_delete ON keyword_rank_lookups FOR DELETE USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));
