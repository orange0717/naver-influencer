import { PLAN_LABEL, type PlanKey } from '@/lib/plans';
import type { PlanTier } from '@/lib/dashboard-catalog';

const TIER_TO_KEY: Record<PlanTier, PlanKey> = {
  free: 'FREE',
  blogger: 'BLOGGER',
  influencer: 'INFLUENCER',
};

const TONE: Record<PlanKey, string> = {
  FREE: 'text-dim bg-sunken',
  BLOGGER: 'text-accent bg-accent/10',
  INFLUENCER: 'text-white bg-accent',
};

/** 메뉴가 어느 이용권부터 열리는지. 문구는 PLAN_LABEL 이 정본이라 화면에서 짓지 않는다. */
export default function PlanBadge({ tier }: { tier?: PlanTier }) {
  const key = TIER_TO_KEY[tier ?? 'free'];
  return (
    <span className={`shrink-0 text-[9px] leading-none font-semibold px-1.5 py-[3px] rounded-sm whitespace-nowrap ${TONE[key]}`}>
      {PLAN_LABEL[key]}
    </span>
  );
}
