import { PLANS, type PlanKey } from '@/lib/plans';

/** 메뉴가 어느 이용권부터 열리는지. 이름도 색도 PLANS 가 정본이라 화면에서 짓지 않는다. */
export default function PlanBadge({ tier }: { tier?: PlanKey }) {
  const plan = PLANS[tier ?? 'free'];
  return (
    <span className={`shrink-0 text-[9px] leading-none font-semibold px-1.5 py-[3px] rounded-sm whitespace-nowrap ${plan.tone}`}>
      {plan.label}
    </span>
  );
}
