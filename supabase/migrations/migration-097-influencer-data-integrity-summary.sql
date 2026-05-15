-- migration-097: 인플루언서 표시 필드 정합성 요약 (관리자 /api/admin/crawler-stats 등에서 RPC 호출)
-- 적용: Supabase SQL Editor 또는 CLI로 본 파일 실행 후 배포된 앱에서 집계가 채워집니다.

CREATE OR REPLACE FUNCTION public.influencer_data_integrity_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'computed_at', to_jsonb(now() AT TIME ZONE 'utc'),

    'total_influencers',
      (SELECT COUNT(*)::int FROM public.influencers),

    -- 리스트 API는 subscriber_count 우선 — 과거 crawl-rankings 가 fan_count 만 넣던 잔재
    'subscriber_fan_both_positive_mismatch',
      (SELECT COUNT(*)::int FROM public.influencers
       WHERE COALESCE(subscriber_count, 0) > 0
         AND COALESCE(fan_count, 0) > 0
         AND subscriber_count IS DISTINCT FROM fan_count),

    'subscriber_zero_fan_positive',
      (SELECT COUNT(*)::int FROM public.influencers
       WHERE COALESCE(subscriber_count, 0) = 0 AND COALESCE(fan_count, 0) > 0),

    'fan_zero_subscriber_positive',
      (SELECT COUNT(*)::int FROM public.influencers
       WHERE COALESCE(fan_count, 0) = 0 AND COALESCE(subscriber_count, 0) > 0),

    -- Feed 상 total_follower 가 구독자보다 작은 비정상 행
    'subscriber_gt_total_follower',
      (SELECT COUNT(*)::int FROM public.influencers
       WHERE COALESCE(total_follower_count, 0) > 0
         AND COALESCE(subscriber_count, 0) > COALESCE(total_follower_count, 0)),

    -- TOP3 합과 integrated 컬럼 불일치 (둘 중 하나라도 양수일 때만)
    'top3_sum_vs_integrated_mismatch',
      (SELECT COUNT(*)::int FROM public.influencers
       WHERE (
         COALESCE(top1_count, 0) + COALESCE(top2_count, 0) + COALESCE(top3_count, 0)
       ) IS DISTINCT FROM COALESCE(integrated_top3_count, 0)
       AND (
         COALESCE(top1_count, 0) + COALESCE(top2_count, 0) + COALESCE(top3_count, 0) > 0
         OR COALESCE(integrated_top3_count, 0) > 0
       )),

    'total_keywords_positive_no_owner',
      (SELECT COUNT(*)::int FROM public.influencers
       WHERE COALESCE(total_keywords, 0) > 0 AND naver_owner_id IS NULL),

    'sample_subscriber_fan_mismatch',
      COALESCE((
        SELECT jsonb_agg(q.naver_id ORDER BY q.subscriber_count DESC)
        FROM (
          SELECT naver_id, subscriber_count
          FROM public.influencers
          WHERE COALESCE(subscriber_count, 0) > 0
            AND COALESCE(fan_count, 0) > 0
            AND subscriber_count IS DISTINCT FROM fan_count
          ORDER BY subscriber_count DESC
          LIMIT 10
        ) q
      ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.influencer_data_integrity_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.influencer_data_integrity_summary() TO service_role;
