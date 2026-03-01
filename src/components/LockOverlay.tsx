'use client';

interface LockOverlayProps {
  cost: number;
  label?: string;
  onUnlock?: () => void;
}

export default function LockOverlay({ cost, label, onUnlock }: LockOverlayProps) {
  return (
    <div className="absolute inset-0 backdrop-blur-sm bg-bg/60 rounded-xl flex flex-col items-center justify-center z-10">
      <div className="text-2xl mb-2">🔒</div>
      <div className="text-sm font-bold text-text mb-1">{label || `${cost}P로 열기`}</div>
      <button
        onClick={onUnlock}
        className="px-5 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer"
      >
        {cost}P 사용
      </button>
    </div>
  );
}
