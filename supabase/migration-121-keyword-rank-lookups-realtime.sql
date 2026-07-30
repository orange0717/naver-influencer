-- /my/keyword-ranking 백그라운드 큐(refresh-personal-keyword-ranks)가 DB를 갱신하면
-- 클라이언트가 폴링 없이 즉시 반영받을 수 있도록 keyword_rank_lookups를 Realtime publication에 추가

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'keyword_rank_lookups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE keyword_rank_lookups;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime publication 설정 스킵 (supabase_realtime 미존재): %', SQLERRM;
END $$;
