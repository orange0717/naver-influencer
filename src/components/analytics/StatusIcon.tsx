'use client';

import type { StatusTone } from './types';

// 지표 카드·배지 앞에 붙는 상태 아이콘. tone 하나로 글리프와 색이 함께 결정된다.
// (화면마다 ✔/⚠/✕ 이모지를 제각각 쓰던 것을 한 벌로 고정한다)

const paths: Record<StatusTone, React.ReactNode> = {
  success: <path d="M20 6 9 17l-5-5" />,
  warning: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  danger: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </>
  ),
  neutral: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M11 12h1v4h1" />
    </>
  ),
  accent: (
    <>
      <path d="M3 17V7" />
      <path d="M9 17V4" />
      <path d="M15 17v-8" />
      <path d="M21 17v-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </>
  ),
};

export default function StatusIcon({
  tone = 'neutral',
  size = 14,
  className = '',
}: {
  tone?: StatusTone;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[tone]}
    </svg>
  );
}
