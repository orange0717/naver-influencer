'use client';

import { useEffect, useState } from 'react';

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="맨 위로"
      title="맨 위로"
      className="fixed right-6 z-50 flex flex-col items-center justify-center cursor-pointer transition-all"
      style={{
        bottom: '84px',
        width: '48px',
        height: '48px',
        backgroundColor: '#FFFFFF',
        color: '#BF877A',
        border: '1px solid #F2E2DC',
        borderRadius: '999px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '2px' }}>
        <path d="M18 15l-6-6-6 6" />
      </svg>
      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', lineHeight: 1, marginTop: '2px' }}>TOP</span>
    </button>
  );
}
