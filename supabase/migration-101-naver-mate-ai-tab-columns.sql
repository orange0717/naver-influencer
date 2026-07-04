-- 네이버메이트 AI 탭(전체화면 채팅형 UI) 컬럼 추가
-- 2026-07-04(4차) 아키텍처 전면 재검토: "AI 브리핑"(통합검색 인라인 위젯, fds-aib-* 클래스)과
-- "AI 탭"(ssc=tab.ait.all)은 서로 완전히 다른 별개 서비스임이 실측 확인됨(오렌지 제보).
-- migration-100의 has_ai_briefing/exposed/source_index/source_total/matched_title은
-- AI 브리핑(통합검색 인라인 위젯) 전용 필드로 유지하고, 여기서는 AI 탭 전용 필드를 별도로 추가한다.
-- 두 세트는 서로 완전히 독립적으로 채워진다(같은 키워드라도 "브리핑 없음+탭 있음" 등 어떤 조합도 가능).

ALTER TABLE ai_briefing_exposures
  ADD COLUMN IF NOT EXISTS has_ai_tab      BOOLEAN NULL,  -- 해당 키워드로 AI 탭 진입 시 콘텐츠 자체가 생성되는지
  ADD COLUMN IF NOT EXISTS tab_exposed     BOOLEAN NULL,  -- AI 탭 출처 중 내 포스팅이 포함되는지
  ADD COLUMN IF NOT EXISTS tab_source_index INT    NULL,  -- AI 탭 출처 목록 내 순번 (1부터, 미노출 시 NULL)
  ADD COLUMN IF NOT EXISTS tab_source_total INT    NULL,  -- AI 탭 출처 목록 총 개수
  ADD COLUMN IF NOT EXISTS tab_matched_title TEXT   NULL; -- 매칭된 AI 탭 출처에 표시된 제목(디버그/확인용)
