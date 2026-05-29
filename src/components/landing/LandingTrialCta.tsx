'use client';

import { LandingPrimaryCta } from '@/components/landing/LandingPrimaryCta';

type Size = 'sm' | 'md';

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
    <LandingPrimaryCta onClick={onClick} size={size} className={className}>
      가입 없이 3일 무료체험 시작
    </LandingPrimaryCta>
  );
}
