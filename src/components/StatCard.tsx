interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  color?: string;
}

export default function StatCard({ label, value, sub, icon, color = 'accent' }: StatCardProps) {
  const colors: Record<string, string> = {
    accent: 'bg-accent/15 text-accent',
    green: 'bg-up/15 text-up',
    blue: 'bg-blue/15 text-blue',
    purple: 'bg-accent/15 text-accent',
    orange: 'bg-accent2/15 text-accent2',
    red: 'bg-down/15 text-down',
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 flex items-start gap-4 hover:border-accent/30 transition-colors">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${colors[color] || colors.accent}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs font-semibold text-dim mb-1">{label}</div>
        <div className="text-2xl font-extrabold text-text">{typeof value === 'number' ? value.toLocaleString() : value}</div>
        {sub && <div className="text-xs text-dim mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
