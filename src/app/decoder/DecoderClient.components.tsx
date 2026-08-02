// ──────────────────────────────────────────────────────────
// 작은 표시 컴포넌트
// ──────────────────────────────────────────────────────────

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 space-y-2">
      <h3 className="text-[11px] font-bold text-dim uppercase tracking-wider">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function Field({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-sm">
      <span className="text-xs text-dim shrink-0 sm:min-w-[100px]">{label}</span>
      <span
        className={`break-all ${mono ? 'font-mono text-xs' : ''} ${
          highlight ? 'text-accent font-bold' : 'text-text'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function DistroCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; left: React.ReactNode; count: number; ratio: number }>;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.ratio), 0.0001);
  return (
    <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
      <h3 className="text-sm font-bold text-text">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">{item.left}</div>
              <span className="text-xs text-dim shrink-0 font-mono">
                {item.count}건 · {(item.ratio * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 bg-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${(item.ratio / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
