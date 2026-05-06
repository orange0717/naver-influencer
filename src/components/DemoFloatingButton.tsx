'use client';

import { useState } from 'react';
import DemoModal from './DemoModal';

export default function DemoFloatingButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="3일 데모체험 시작"
        title="3일 데모체험 시작"
        className="fixed bottom-24 right-6 z-50 flex items-center justify-center font-bold cursor-pointer transition-all hover:scale-105"
        style={{
          backgroundColor: '#FFFFFF',
          color: '#BF8984',
          border: '2px solid #BF8984',
          height: '48px',
          padding: '0 22px',
          fontSize: '14px',
          letterSpacing: '-0.3px',
          borderRadius: '999px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
        }}
      >
        3일 데모체험
      </button>
      <DemoModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
