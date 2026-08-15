-- AI 브리핑·AI 탭: 자체 키워드 저장소 폐기에 따른 고아 행 정리
--
-- 배경: ai_briefing_exposures 는 원래 "키워드 할당 + 결과"를 겸했다(migration-100).
-- 그래서 AI 브리핑 화면이 키워드순위와 별개의 키워드 목록을 갖게 됐고,
-- 키워드순위에서 키워드를 수정해도 AI 브리핑에는 옛 키워드가 남는 불일치가 생겼다.
-- 이제 키워드 SoT는 keyword_rank_lookups + post_representative_keywords 뿐이고,
-- ai_briefing_exposures 는 "결과 전용" 테이블이다(PUT 핸들러 제거됨).
--
-- ⚠️ 이 마이그레이션은 ai_briefing_exposures / ai_briefing_exposure_history 만 건드린다.
--    keyword_rank_lookups · post_representative_keywords · post_ai_scores 는 절대 삭제하지 않는다.

-- ── 0) 사전 확인 (지우기 전에 먼저 실행해서 건수를 확인할 것) ──────────
-- 결과 없이 키워드 등록만 남은 행 (구 PUT 핸들러의 잔재)
--   SELECT COUNT(*) FROM ai_briefing_exposures
--   WHERE checked_at IS NULL AND check_status IS NULL;
--
-- 현재 키워드 SoT 어디에도 존재하지 않는 키워드를 가진 행 (예: 포스팅 제목이 키워드로 박힌 행)
--   SELECT post_id, keyword, checked_at FROM ai_briefing_exposures abe
--   WHERE NOT EXISTS (
--     SELECT 1 FROM keyword_rank_lookups krl
--     WHERE krl.user_id = abe.user_id AND krl.post_id = abe.post_id
--       AND btrim(krl.keyword) = btrim(abe.keyword))
--   AND NOT EXISTS (
--     SELECT 1 FROM post_representative_keywords prk
--     WHERE prk.blog_id = abe.blog_id AND prk.post_id = abe.post_id
--       AND btrim(COALESCE(prk.representative_keyword, '')) = btrim(abe.keyword))
--   ORDER BY post_id;

BEGIN;

-- ── 1) 결과가 한 번도 없는 "키워드 등록 전용" 행 삭제 ────────────────
-- checked_at·check_status 가 모두 NULL = 확인된 적 없음 = 순수 키워드 할당 레코드.
-- 이런 행은 이제 키워드 SoT 가 대신 표현하므로 남길 이유가 없다.
DELETE FROM ai_briefing_exposures
WHERE checked_at IS NULL AND check_status IS NULL;

-- ── 2) 키워드 SoT 에서 도달 불가능한 결과 행 삭제 ─────────────────────
-- 키워드순위의 보조/추가 키워드(keyword_rank_lookups) 에도,
-- 대표 키워드(post_representative_keywords) 에도 없는 키워드로 저장된 결과.
-- 화면에 절대 표시되지 않는 죽은 데이터이며, 옛 "제목 = 검색어" 방식의 잔재다.
DELETE FROM ai_briefing_exposures abe
WHERE NOT EXISTS (
        SELECT 1 FROM keyword_rank_lookups krl
        WHERE krl.user_id = abe.user_id
          AND krl.post_id = abe.post_id
          AND btrim(krl.keyword) = btrim(abe.keyword)
      )
  AND NOT EXISTS (
        SELECT 1 FROM post_representative_keywords prk
        WHERE prk.blog_id = abe.blog_id
          AND prk.post_id = abe.post_id
          AND btrim(COALESCE(prk.representative_keyword, '')) = btrim(abe.keyword)
      );

-- ── 3) 대응하는 결과 행이 사라진 이력 삭제 ────────────────────────────
-- 타임라인은 (user, post, keyword) 로 조회되므로, 결과 행이 없으면 조회 경로가 없다.
DELETE FROM ai_briefing_exposure_history abeh
WHERE NOT EXISTS (
        SELECT 1 FROM ai_briefing_exposures abe
        WHERE abe.user_id = abeh.user_id
          AND abe.post_id = abeh.post_id
          AND abe.keyword = abeh.keyword
      );

COMMIT;

-- ── 4) 사후 확인 ──────────────────────────────────────────────────────
--   SELECT COUNT(*) AS remaining_results FROM ai_briefing_exposures;
--   SELECT COUNT(*) AS remaining_history FROM ai_briefing_exposure_history;
--   -- 키워드순위 데이터가 그대로인지 확인 (이 마이그레이션은 여기를 건드리지 않는다)
--   SELECT COUNT(*) AS keyword_sot_rows FROM keyword_rank_lookups;
