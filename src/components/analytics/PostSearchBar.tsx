'use client';

import { ReactNode } from 'react';

// 제목/키워드 검색 input + 드롭다운 슬롯(순위 기준·정렬 등) — 노출 현황과 동일 위치/스타일.
// 드롭다운은 children으로 넘긴다. select엔 selectClass를 그대로 쓰면 노출현황과 동일해진다.
export const selectClass =
  'px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-dim cursor-pointer';

export default function PostSearchBar({
  value,
  onChange,
  placeholder = '게시글 제목·키워드 검색',
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs w-56"
      />
      {children}
    </div>
  );
}
