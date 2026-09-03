'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { FEATURES, type FeatureKey } from '@/lib/plans';
import FeatureLocked from './FeatureLocked';

interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  /** 잠겼을 때 기본 안내 카드 대신 보여줄 내용. */
  fallback?: ReactNode;
}

/**
 * 등급이 부족하면 children 대신 안내를 보여준다.
 *
 * 화면 자체는 열어두고 잠긴 영역만 안내로 바꾼다 — 사용자가 무엇을 얻는지 보고
 * 결정할 수 있게 하려는 것이고, 이용권 페이지로 곧장 튕기지 않는 이유다.
 *
 * 안내일 뿐 차단이 아니다. 같은 기능의 API 에는 requireFeature 를 반드시 건다.
 */
export default function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { allowed, requiredPlan, isLoggedIn, isLoading } = useFeatureAccess(feature);
  const pathname = usePathname();

  // 판정 전에 잠금 화면을 띄우면 이용권 보유자에게도 잠깐 잘못 보인다.
  if (isLoading) return null;
  if (allowed) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  const def = FEATURES[feature];

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto my-10 rounded-2xl border border-border bg-surface px-7 py-9 text-center shadow-sm">
        <h2 className="text-lg font-extrabold text-text mb-2">로그인이 필요합니다</h2>
        <p className="text-sm text-dim leading-relaxed">
          {def?.label ?? '이 기능'}은(는) 로그인 후 이용하실 수 있습니다.
        </p>
        <Link
          href={`/auth/login?redirect=${encodeURIComponent(pathname)}`}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover transition-colors"
        >
          로그인하기
        </Link>
      </div>
    );
  }

  // 등급을 여기서 짓지 않는다 — 'pro' 로 폴백하면 Max 기능에 "Pro 이용권" 이라는
  // 틀린 안내가 나간다. 조회가 비면 선언을 직접 읽고, 그것도 없어야 최저 등급이다.
  return <FeatureLocked required={requiredPlan ?? def?.minPlan ?? 'free'} />;
}
