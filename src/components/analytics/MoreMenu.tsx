'use client';

import { ReactNode, useState } from 'react';

// 항목 클래스 — 호출측이 button/a 를 직접 렌더하되 생김새는 여기로 통일한다.
export const menuItemClass =
  'w-full text-left px-3 py-2 hover:bg-bg text-dim cursor-pointer disabled:opacity-50';
export const menuLinkClass = 'block px-3 py-2 hover:bg-bg text-dim';
export const menuItemDangerClass = 'w-full text-left px-3 py-2 hover:bg-bg text-down/70 cursor-pointer';

// 헤더 우측 더보기(⋯) 드롭다운. 바깥 클릭으로 닫히도록 전체화면 backdrop 을 깐다.
export default function MoreMenu({
  menuWidth = 'w-40',
  children,
}: {
  menuWidth?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="px-2.5 py-2 rounded-xl border border-border text-dim hover:text-accent hover:border-accent/40 transition cursor-pointer text-sm"
        title="더보기"
        aria-label="더보기"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div
            role="menu"
            className={`absolute right-0 mt-1 z-50 ${menuWidth} bg-surface border border-border rounded-xl shadow-lg py-1 text-sm`}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}
