'use client';

import { useEffect, useState } from 'react';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed right-4 bottom-44 z-40 w-12 h-12 rounded-full bg-surface border border-border shadow-md flex flex-col items-center justify-center text-dim hover:text-accent hover:border-accent/40 transition cursor-pointer"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 11V3M3 7l4-4 4 4" />
      </svg>
      <span className="text-[9px] font-bold mt-0.5 leading-none">TOP</span>
    </button>
  );
}
