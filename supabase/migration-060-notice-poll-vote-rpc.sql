-- Migration 060: 공지사항 투표 제출을 RPC로 원자화 (race condition 방지)
-- 2026-04-19
--
-- 문제: 기존 구현은 DELETE → INSERT 두 단계로 수행하여
--        두 요청이 동시에 들어올 경우 둘 다 DELETE 후 INSERT 하여 중복 투표가 발생할 수 있었음.
-- 해결: 단일 함수 안에서 FOR UPDATE 로 poll 행 잠금을 건 뒤
--        DELETE + INSERT 를 수행해 서로 다른 트랜잭션이 순차 처리되도록 강제.

CREATE OR REPLACE FUNCTION submit_notice_poll_vote(
  p_notice_id UUID,
  p_option_ids UUID[],
  p_user_id UUID,
  p_voter_fingerprint TEXT,
  p_voter_ip TEXT
) RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_poll_id UUID;
  v_is_multiple BOOLEAN;
  v_valid_ids UUID[];
  v_final_ids UUID[];
  v_fp TEXT;
BEGIN
  -- 1) 해당 공지의 투표 조회 + 행 잠금 (다른 트랜잭션이 같은 poll 에 동시 접근 못 하도록)
  SELECT id, is_multiple INTO v_poll_id, v_is_multiple
  FROM notice_polls
  WHERE notice_id = p_notice_id
  FOR UPDATE;

  IF v_poll_id IS NULL THEN
    RAISE EXCEPTION 'poll not found';
  END IF;

  -- 2) 선택지가 실제로 이 poll 에 속하는지 검증
  SELECT array_agg(id) INTO v_valid_ids
  FROM notice_poll_options
  WHERE poll_id = v_poll_id AND id = ANY(p_option_ids);

  IF v_valid_ids IS NULL OR array_length(v_valid_ids, 1) = 0 THEN
    RAISE EXCEPTION 'no valid options';
  END IF;

  -- 3) 단일 선택이면 첫 1개만
  IF v_is_multiple THEN
    v_final_ids := v_valid_ids;
  ELSE
    v_final_ids := ARRAY[v_valid_ids[1]];
  END IF;

  -- 4) fingerprint 표준화 (회원이면 user:<id>, 아니면 전달된 값)
  IF p_user_id IS NOT NULL THEN
    v_fp := 'user:' || p_user_id::text;
  ELSE
    v_fp := p_voter_fingerprint;
  END IF;

  -- 5) 기존 투표 삭제 (회원/비회원 구분)
  IF p_user_id IS NOT NULL THEN
    DELETE FROM notice_poll_votes
      WHERE poll_id = v_poll_id AND user_id = p_user_id;
  ELSE
    DELETE FROM notice_poll_votes
      WHERE poll_id = v_poll_id
        AND user_id IS NULL
        AND voter_fingerprint = p_voter_fingerprint;
  END IF;

  -- 6) 새 투표 삽입
  INSERT INTO notice_poll_votes (poll_id, option_id, user_id, voter_fingerprint, voter_ip)
  SELECT v_poll_id, unnest(v_final_ids), p_user_id, v_fp, p_voter_ip;

  RETURN v_final_ids;
END;
$$;

-- RLS 우회하는 service_role 만 호출하도록 권한 제한
REVOKE ALL ON FUNCTION submit_notice_poll_vote(UUID, UUID[], UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION submit_notice_poll_vote(UUID, UUID[], UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION submit_notice_poll_vote(UUID, UUID[], UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION submit_notice_poll_vote(UUID, UUID[], UUID, TEXT, TEXT) TO service_role;
