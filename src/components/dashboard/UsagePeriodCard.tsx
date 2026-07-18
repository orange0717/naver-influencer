interface Props {
  /** users.created_at — N인플 가입일 */
  userCreatedAt?: string | null;
  /** users.subscription_expires_at — 유료 구독 만료일 */
  subscriptionExpiresAt?: string | null;
  /** trial_started 쿠키 (timestamp ms 문자열) */
  trialStartedTs?: string | null;
}

function formatDate(d: Date) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

export default function UsagePeriodCard({
  userCreatedAt,
  subscriptionExpiresAt,
  trialStartedTs,
}: Props) {
  const now = new Date();

  // A) 가입 후 며칠
  let usageInfo: { days: number; since: string } | null = null;
  if (userCreatedAt) {
    const start = new Date(userCreatedAt);
    if (!isNaN(start.getTime())) {
      const days = Math.max(1, daysBetween(start, now) + 1);
      usageInfo = { days, since: formatDate(start) };
    }
  }

  // B) 구독 만료까지 남은 일수
  let subInfo: { left: number; until: string } | null = null;
  if (subscriptionExpiresAt) {
    const exp = new Date(subscriptionExpiresAt);
    if (!isNaN(exp.getTime()) && exp.getTime() > now.getTime()) {
      const left = Math.max(0, daysBetween(now, exp) + 1);
      subInfo = { left, until: formatDate(exp) };
    }
  }

  // C) 체험 종료까지
  let trialInfo: { left: number; until: string } | null = null;
  if (trialStartedTs) {
    const startedMs = Number(trialStartedTs);
    if (!isNaN(startedMs) && startedMs > 0) {
      const durationDays = 7;
      const endMs = startedMs + durationDays * 24 * 60 * 60 * 1000;
      const end = new Date(endMs);
      const left = Math.max(0, daysBetween(now, end) + 1);
      if (left > 0) trialInfo = { left, until: formatDate(end) };
    }
  }

  // 표시할 카드가 하나도 없으면 렌더링 안 함
  if (!usageInfo && !subInfo && !trialInfo) return null;

  const cards: { label: string; value: string; sub: string; tone: 'accent' | 'gold' | 'gray' }[] = [];
  if (usageInfo) {
    cards.push({
      label: 'N인플 사용 기간',
      value: `${usageInfo.days}일째`,
      sub: `${usageInfo.since} 가입`,
      tone: 'accent',
    });
  }
  if (subInfo) {
    cards.push({
      label: '구독 만료까지',
      value: `${subInfo.left}일 남음`,
      sub: `~ ${subInfo.until}`,
      tone: 'gold',
    });
  }
  if (trialInfo) {
    cards.push({
      label: '체험 종료까지',
      value: `${trialInfo.left}일 남음`,
      sub: `~ ${trialInfo.until}`,
      tone: 'gray',
    });
  }

  const toneClass = (t: 'accent' | 'gold' | 'gray') =>
    t === 'accent' ? 'text-accent' : t === 'gold' ? 'text-[#D4A04E]' : 'text-text';

  const gridClass =
    cards.length === 1 ? 'grid grid-cols-1 gap-3' :
    cards.length === 2 ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' :
    'grid grid-cols-1 sm:grid-cols-3 gap-3';

  return (
    <div className={gridClass}>
      {cards.map((c) => (
        <div key={c.label} className="bg-surface rounded-xl border border-border p-4">
          <p className="text-[11px] text-dim mb-1">{c.label}</p>
          <p className={`text-xl font-extrabold ${toneClass(c.tone)} font-rank`}>{c.value}</p>
          <p className="text-[10px] text-dim mt-1">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}
