'use client';

import { usePathname } from 'next/navigation';

/** /ad/* 경로에서 children을 숨기는 조건부 래퍼 */
export default function HideOnAd({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/ad')) return null;
  return <>{children}</>;
}
