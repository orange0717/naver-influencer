'use client';

import { useRouter } from 'next/navigation';

interface LockOverlayProps {
  label?: string;
  onSubscribe?: () => void;
}

export default function LockOverlay({ label, onSubscribe }: LockOverlayProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onSubscribe) {
      onSubscribe();
    } else {
      router.push('/subscribe');
    }
  };

  return (
    <div className="absolute inset-0 backdrop-blur-sm bg-bg/60 rounded-xl flex flex-col items-center justify-center z-10">
      <div className="w-10 h-10 rounded-full bg-dim/20 flex items-center justify-center mb-2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-dim"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <div className="text-sm font-bold text-text mb-1">{label || '구독 전용 콘텐츠'}</div>
      <button
        onClick={handleClick}
        className="px-5 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer"
      >
        구독하고 무제한 이용
      </button>
    </div>
  );
}
