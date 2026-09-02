-- 같은 인플루언서를 두 명 이상이 연결하고 있는지 확인한다.
-- migration-204(유니크 인덱스)를 적용하기 전에 이것부터 단독으로 실행할 것.
-- 결과가 0행이면 그대로 204를 적용하면 되고, 1행 이상이면 누구를 소유자로 남길지
-- 먼저 정한 뒤에 적용해야 한다(중복이 남아 있으면 204는 실패한다).

SELECT
  i.naver_id,
  i.display_name,
  count(*)                         AS linked_user_count,
  array_agg(u.email ORDER BY u.created_at) AS emails,
  array_agg(u.created_at ORDER BY u.created_at) AS user_created_at
FROM users u
JOIN influencers i ON i.id = u.linked_influencer_id
WHERE u.linked_influencer_id IS NOT NULL
GROUP BY i.naver_id, i.display_name
HAVING count(*) > 1
ORDER BY count(*) DESC;
