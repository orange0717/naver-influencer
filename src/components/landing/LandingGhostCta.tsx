'use client';

import Link from 'next/link';

type Size = 'sm' | 'md';
type Variant = 'gradient' | 'surface';

const SIZE: Record<Size, string> = {
  sm: 'px-4 py-2.5 text-xs',
  md: 'px-5 py-3 text-sm',
};

const VARIANT: Record<Variant, string> = {
  gradient:
    'border-white/30 text-white/90 hover:text-white hover:border-white/80 hover:bg-white/5',
  surface:
    'border-accent/30 text-accent hover:border-accent/80 hover:bg-accent/5',
};

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
  const cls = `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`.trim();

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
