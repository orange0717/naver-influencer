'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function getDeviceType(): string {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) return 'mobile';
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export default function VisitTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // 페이지별 방문 기록 (visit_logs용)
    const pageKey = `visited_${pathname}`;
    const alreadyVisitedPage = sessionStorage.getItem(pageKey);
    sessionStorage.setItem(pageKey, '1');

    // 일별 방문 카운트는 세션당 1회만 (순 방문자)
    const dailyKey = 'visited_today';
    const isFirstVisit = !sessionStorage.getItem(dailyKey);
    sessionStorage.setItem(dailyKey, '1');

    const referrer = document.referrer || '';
    const referrerDomain = extractDomain(referrer);

    // 같은 도메인에서의 내부 이동은 referrer로 기록하지 않음
    const isSameSite = referrerDomain === window.location.hostname.replace(/^www\./, '');

    // visit_logs: 페이지별 1회 기록 (유입경로 추적)
    if (!alreadyVisitedPage) {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: pathname,
          referrer: isSameSite ? '' : referrer,
          referrer_domain: isSameSite ? null : referrerDomain,
          utm_source: searchParams.get('utm_source') || null,
          utm_medium: searchParams.get('utm_medium') || null,
          utm_campaign: searchParams.get('utm_campaign') || null,
          device_type: getDeviceType(),
          first_visit: isFirstVisit,
        }),
      }).catch(() => {});
    }
  }, [pathname, searchParams]);

  return null;
}
