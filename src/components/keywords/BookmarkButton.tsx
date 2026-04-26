'use client';

interface Props {
  isSaved: boolean;
  onClick: () => void;
  size?: number;
  className?: string;
}

/**
 * 키워드 행에서 사용하는 북마크 토글 버튼.
 * 저장됨: 채워진 북마크 + accent 색.
 * 미저장: 빈 북마크 + dim 색.
 */
export default function BookmarkButton({ isSaved, onClick, size = 16, className = '' }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      }}
      aria-label={isSaved ? '저장됨' : '저장'}
      title={isSaved ? '저장됨' : '저장'}
      className={`p-1.5 rounded hover:bg-accent/10 transition-colors cursor-pointer ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={isSaved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        className={isSaved ? 'text-accent' : 'text-dim hover:text-accent'}
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
