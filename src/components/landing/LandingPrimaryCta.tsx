'use client';

import Link from 'next/link';

type Size = 'sm' | 'md';

const SIZE: Record<Size, string> = {
  sm: 'px-4 py-2.5 text-xs',
  md: 'px-5 py-3 text-sm',
};

export const LANDING_PRIMARY_CTA_BASE =
  'group inline-flex items-center justify-center gap-2 rounded-full bg-white/15 font-bold tracking-tight text-white border border-white/30 backdrop-blur-sm transition-all duration-300 ease-in-out hover:bg-white/25 hover:border-white/50 cursor-pointer';

function PrimaryArrow() {
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

export function LandingPrimaryCta({
  children,
  size = 'md',
  className = '',
  ...props
}: ButtonProps | LinkProps) {
  const cls = `${LANDING_PRIMARY_CTA_BASE} ${SIZE[size]} ${className}`.trim();
  const content = (
    <>
      <span>{children}</span>
      <PrimaryArrow />
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
