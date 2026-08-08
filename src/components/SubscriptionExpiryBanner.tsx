import Link from 'next/link';

interface Props {
  subscriptionPlan: string | null;
  subscriptionExpiresAt: string | null;
}

export default function SubscriptionExpiryBanner({
  subscriptionPlan,
  subscriptionExpiresAt,
}: Props) {
  if (!subscriptionPlan || !subscriptionExpiresAt) return null;

  const expiresMs = new Date(subscriptionExpiresAt).getTime();
  if (Number.isNaN(expiresMs)) return null;

  const now = Date.now();
  const diffMs = expiresMs - now;
  const dayMs = 24 * 60 * 60 * 1000;

  // 만료 후
  if (diffMs <= 0) {
    const expiredDays = Math.ceil(-diffMs / dayMs);
    return (
      <div className="bg-gradient-to-r from-down/10 to-down/5 rounded-xl border border-down/30 px-5 py-3 flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-down/15 rounded-lg flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-down" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          </div>
          <div>
            <p className="text-sm font-bold text-text">
              PRO 이용권이 <span className="text-down">{expiredDays}일 전 만료</span>되었습니다
            </p>
            <p className="text-[11px] text-dim">현재 무료 이용 중. 이용권을 구매하면 PRO 기능을 다시 사용할 수 있습니다.</p>
          </div>
        </div>
        <Link
          href="/subscribe"
          className="px-4 py-2 bg-down text-white text-xs font-bold rounded-lg hover:opacity-90 transition shrink-0"
        >
          이용권 구매
        </Link>
      </div>
    );
  }

  // 만료 7일 이내
  const daysLeft = Math.ceil(diffMs / dayMs);
  if (daysLeft > 7) return null;

  return (
    <div className="bg-gradient-to-r from-accent/10 to-accent/5 rounded-xl border border-accent/30 px-5 py-3 flex items-center justify-between mb-4 gap-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-accent/15 rounded-lg flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
        </div>
        <div>
          <p className="text-sm font-bold text-text">
            PRO 이용권 만료 <span className="text-accent">{daysLeft}일 남음</span>
          </p>
          <p className="text-[11px] text-dim">미리 연장하면 끊김 없이 계속 이용할 수 있습니다.</p>
        </div>
      </div>
      <Link
        href="/subscribe"
        className="px-4 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition shrink-0"
      >
        연장하기
      </Link>
    </div>
  );
}
