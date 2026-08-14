'use client';

// 대량 조회 진행률 pill + 중단 버튼 — 노출 현황과 동일 UX. "47/90 순위 확인 중 52%".
export default function CheckProgress({
  current,
  total,
  label = '분석 중',
  onStop,
}: {
  current: number;
  total: number;
  label?: string;
  onStop?: () => void;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white font-bold rounded-xl text-xs">
        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        {current}/{total} {label} {pct}%
      </span>
      {onStop && (
        <button
          onClick={onStop}
          className="px-4 py-2 bg-down/10 text-down font-bold rounded-xl text-xs cursor-pointer hover:bg-down/20 transition"
        >
          중단
        </button>
      )}
    </div>
  );
}
