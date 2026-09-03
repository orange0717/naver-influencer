import MissingPostsSection from '@/components/home/MissingPostsSection';
import { checkFeaturePage } from '@/lib/plan-server-guards';

export default async function Page() {
  // 등급이 모자라도 화면을 막지 않는다 — 최근 7일·상위 5건까지는 실제 판정을 보여주고
  // 나머지를 잠근다(2026-09-03 오렌지 결정 "티저"). 전면 차단보다 전환이 높고 이탈이 적다.
  // 서버에서 판정해 내려보내야 클라이언트 상태만 고쳐 잠금을 푸는 우회가 성립하지 않는다.
  const { allowed, required } = await checkFeaturePage('my.missing-posts', '/my/missing-posts');
  return <MissingPostsSection teaser={!allowed} requiredPlan={required} />;
}
