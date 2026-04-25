-- migration-050: 스레드 SNS 링크 컬럼 추가
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS sns_threads TEXT DEFAULT NULL;

COMMENT ON COLUMN influencers.sns_threads IS '스레드(Threads) 아이디 또는 URL';
