'use client';

import GlassCard from '@/components/dashboard/GlassCard';

interface Props {
  enabled: boolean;
  loading: boolean;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function AutoWatchToggle({ enabled, loading, disabled, onToggle }: Props) {
  return (
    <GlassCard padding="lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-text">새 글 자동 색인 요청</h3>
          <p className="text-xs text-dim mt-0.5">
            켜두면 새 블로그 글을 발행할 때마다 사용자가 직접 등록하지 않아도 자동으로 색인 요청이 접수돼요.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={disabled || loading}
          onClick={() => onToggle(!enabled)}
          className={`shrink-0 w-12 h-7 rounded-full transition-colors relative disabled:opacity-50 ${
            enabled ? 'bg-accent' : 'bg-border'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </GlassCard>
  );
}
