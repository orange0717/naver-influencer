'use client';

import Link from 'next/link';

type Size = 'sm' | 'md';
type Variant = 'gradient' | 'surface';

const SIZE: Record<Size, string> = {
  sm: 'px-4 py-2.5 text-xs',
  md: 'px-5 py-3 text-sm',
};

/** 그라디언트 패널 — 성장후기·좌측 상단 CTA (Figma ghost) */
const GRADIENT_GHOST =
  'border-white/20 text-white/80 hover:border-white/60 hover:text-white hover:bg-white/5';

/** 화이트 패널 우측 상단 — 동일 리듬, 밝은 배경용 로즈 아웃라인 */
const SURFACE_GHOST =
  'border-accent/25 text-accent/80 hover:border-accent/55 hover:text-accent hover:bg-accent/5';

const BASE =
  'group inline-flex items-center justify-center gap-2 rounded-full bg-transparent font-semibold tracking-tight border backdrop-blur-sm transition-all duration-300 ease-in-out cursor-pointer';

function GhostArrow() {
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

type CommonProps = {
  children: React.ReactNode;
  size?: Size;
  variant?: Variant;
  className?: string;
};

type ButtonProps = CommonProps & {
  onClick: () => void;
  href?: never;
};

type LinkProps = CommonProps & {
  href: string;
  onClick?: never;
};

export function LandingGhostCta({
  children,
  size = 'md',
  variant = 'gradient',
  className = '',
  ...props
}: ButtonProps | LinkProps) {
  const variantCls = variant === 'gradient' ? GRADIENT_GHOST : SURFACE_GHOST;
  const cls = `${BASE} ${SIZE[size]} ${variantCls} ${className}`.trim();

  const content = (
    <>
      <span>{children}</span>
      <GhostArrow />
    </>
  );

  if ('href' in props && props.href) {
    return (
      <Link href={props.href} className={cls}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={props.onClick} className={cls}>
      {content}
    </button>
  );
}
