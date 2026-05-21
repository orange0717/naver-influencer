'use client';

type Size = 'sm' | 'md';

const SIZE: Record<Size, string> = {
  sm: 'px-4 py-2.5 text-xs',
  md: 'px-5 py-3 text-sm',
};

const BASE =
  'group inline-flex items-center justify-center gap-2 rounded-full bg-white/15 font-bold tracking-tight text-white border border-white/30 backdrop-blur-sm transition-all duration-300 ease-in-out hover:bg-white/25 hover:border-white/50 cursor-pointer';

function TrialArrow() {
  return (
    <svg
      className="h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-in-out group-hover:translate-x-0.5"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 8h10M9 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LandingTrialCta({
  onClick,
  size = 'md',
  className = '',
}: {
  onClick: () => void;
  size?: Size;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${BASE} ${SIZE[size]} ${className}`.trim()}
    >
      <span>가입 없이 3일 무료체험 시작</span>
      <TrialArrow />
    </button>
  );
}
