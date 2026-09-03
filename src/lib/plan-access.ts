import { planAtLeast, type PlanKey } from './plans';

export function canAccess(required: PlanKey | undefined, current: PlanKey): boolean {
  if (!required) return true;
  return planAtLeast(current, required);
}

export function planHighlight(plan: PlanKey): string {
  return plan === 'max' ? 'max' : 'pro';
}
