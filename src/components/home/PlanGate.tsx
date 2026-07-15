import Link from 'next/link';
import type { ReactNode } from 'react';
import { canAccess, planHighlight } from '@/lib/plan-access';
import type { PlanTier } from '@/lib/dashboard-catalog';
import GlassCard from '@/components/dashboard/GlassCard';

const PLAN_LABEL: Record<PlanTier, string> = {
  free: '무료',
  blogger: '예비 인플루언서',
  influencer: '인플루언서',
};

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

export default function PlanGate({
  requiredPlan,
  currentPlan,
  sectionLabel,
  children,
}: {
  requiredPlan: PlanTier;
  currentPlan: PlanTier;
  sectionLabel: string;
  children: ReactNode;
}) {
  if (canAccess(requiredPlan, currentPlan)) {
    return <>{children}</>;
  }

  return (
    <GlassCard padding="lg" className="max-w-2xl mx-auto text-center space-y-4">
      <div className="w-12 h-12 mx-auto rounded-full bg-accent/10 flex items-center justify-center text-accent">
        <LockIcon />
      </div>
      <h2 className="text-lg font-bold">
        {sectionLabel}은(는) {PLAN_LABEL[requiredPlan]} 플랜부터 이용할 수 있어요
      </h2>
      <p className="text-sm text-dim">플랜을 업그레이드하면 바로 확인할 수 있습니다.</p>
      <Link
        href={`/subscribe?highlight=${planHighlight(requiredPlan)}`}
        className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition-colors"
      >
        플랜 업그레이드
      </Link>
    </GlassCard>
  );
}
