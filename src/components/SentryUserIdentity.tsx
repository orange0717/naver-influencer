'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { useAuth } from '@/hooks/useAuth';

/**
 * useAuth 의 사용자 상태를 Sentry 와 동기화한다.
 * 에러 로그에 user.id 와 세그먼트(demo / 구독 플랜) 가 함께 잡혀
 * 사용자별 추적·세그먼트별 필터링이 가능해진다.
 *
 * PII 최소화: 이메일·닉네임은 포함하지 않고 식별자와 세그먼트만 전송.
 */
export default function SentryUserIdentity() {
  const { user } = useAuth();

  useEffect(() => {
    const identifier = user.authId || user.id;
    if (identifier) {
      Sentry.setUser({
        id: identifier,
        segment: user.subscriptionPlan || 'free',
      });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

  return null;
}
