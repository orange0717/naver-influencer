import { ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  badge?: { text: string; color?: string };
  action?: ReactNode;
}

export default function SectionHeader({ title, subtitle, badge, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-[15px]">{title}</h3>
          {badge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              badge.color || 'text-accent bg-accent/10'
            }`}>
              {badge.text}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[11px] text-dim mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
