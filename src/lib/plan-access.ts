import type { PlanTier } from './dashboard-catalog';

const PLAN_RANK: Record<PlanTier, number> = { free: 0, blogger: 1, influencer: 2 };

export function canAccess(required: PlanTier | undefined, current: PlanTier): boolean {
  if (!required || required === 'free') return true;
  return PLAN_RANK[current] >= PLAN_RANK[required];
}

export function planHighlight(plan: PlanTier): string {
  return plan === 'influencer' ? 'influencer' : 'blogger';
}
