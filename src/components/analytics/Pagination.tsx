'use client';

// 목록 페이지네이션 공용 컴포넌트. 화면마다 이전/다음 버튼을 각자 그려서
// 모서리(rounded/rounded-lg)·높이(py-1/py-1.5/py-2)·배경(bg-border/30 vs bg-surface)이
// 제각각이었다. 숫자 버튼·양끝 이동은 옵션으로만 켠다.
import { ReactNode } from 'react';

const buttonClass =
  'px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-30 disabled:cursor-default';
const inactiveClass = 'bg-surface border-border text-dim hover:border-accent/40 hover:text-text';
const activeClass = 'bg-accent border-accent text-white';

/** 현재 페이지 주변 ±2 와 양끝만 남기고 사이는 '...' 으로 접는다. */
function pageWindow(page: number, totalPages: number): (number | 'dots')[] {
  const kept = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    p => p === 1 || p === totalPages || Math.abs(p - page) <= 2,
  );
  return kept.reduce<(number | 'dots')[]>((acc, p, i) => {
    if (i > 0 && p - (kept[i - 1]) > 1) acc.push('dots');
    acc.push(p);
    return acc;
  }, []);
}

export default function Pagination({
  page,
  totalPages,
  onChange,
  numbers,
  edges,
  note,
  variant = 'panel',
  className = '',
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** 숫자 페이지 버튼 표시 (목록이 길어 특정 페이지로 바로 가야 할 때) */
  numbers?: boolean;
  /** ≪ ≫ 첫/마지막 페이지 버튼 표시 */
  edges?: boolean;
  /** "n / m" 뒤에 붙는 보조 문구 (예: 총 12건) */
  note?: ReactNode;
  /** 'panel' = 표·카드 안쪽 푸터(윗선+패딩) · 'plain' = 카드 밖 목록 아래 · 'bare' = 여백을 감싸는 쪽이 이미 갖고 있을 때 */
  variant?: 'panel' | 'plain' | 'bare';
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const go = (p: number) => onChange(Math.min(totalPages, Math.max(1, p)));
  const wrapper =
    variant === 'panel' ? 'px-5 py-3 border-t border-border/50' : variant === 'plain' ? 'pt-4' : '';

  return (
    <div className={`${wrapper} flex flex-wrap items-center justify-center gap-1.5 ${className}`}>
      {edges && (
        <button
          onClick={() => go(1)}
          disabled={page <= 1}
          title="첫 페이지"
          className={`${buttonClass} ${inactiveClass}`}
        >
          ≪
        </button>
      )}
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className={`${buttonClass} ${inactiveClass}`}
      >
        이전
      </button>

      {numbers ? (
        pageWindow(page, totalPages).map((p, i) =>
          p === 'dots' ? (
            <span key={`dots-${i}`} className="px-1 text-xs text-dim">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => go(p)}
              className={`${buttonClass} ${p === page ? activeClass : inactiveClass}`}
            >
              {p}
            </button>
          ),
        )
      ) : (
        <span className="px-2 text-xs text-dim">
          {page} / {totalPages}
          {note && <span className="ml-1">{note}</span>}
        </span>
      )}

      <button
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
        className={`${buttonClass} ${inactiveClass}`}
      >
        다음
      </button>
      {edges && (
        <button
          onClick={() => go(totalPages)}
          disabled={page >= totalPages}
          title="마지막 페이지"
          className={`${buttonClass} ${inactiveClass}`}
        >
          ≫
        </button>
      )}
    </div>
  );
}
