'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

// 관리자 이메일 (방문자 카운트 제외)
const ADMIN_EMAILS = ['orange@orangelibrary.co.kr'];

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

/** 쿠키 세션(데모/블로거 로그인)이 있는지 브라우저에서 확인 */
function hasCookieSession(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)user_type=/.test(document.cookie);
}

/** 관리자 여부 + 로그인 여부를 한 번에 확인 (Supabase Auth + 쿠키 세션 모두 인식) */
async function getVisitorStatus(): Promise<{ isAdmin: boolean; isLoggedIn: boolean }> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email?.toLowerCase();
    return {
      isAdmin: email ? ADMIN_EMAILS.includes(email) : false,
      isLoggedIn: !!data?.user || hasCookieSession(),
    };
  } catch {
    return { isAdmin: false, isLoggedIn: hasCookieSession() };
  }
}

export default function VisitTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // KST 기준 오늘 날짜
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 날짜 변경 시 이전 기록 정리
    const lastDate = localStorage.getItem('visit_date');
    if (lastDate && lastDate !== kstDate) {
      // 이전 날짜 페이지 기록 정리
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('visited_')) localStorage.removeItem(key);
      }
      localStorage.setItem('visit_date', kstDate);
    } else if (!lastDate) {
      localStorage.setItem('visit_date', kstDate);
    }

    // 페이지별 방문 기록 (visit_logs용) — localStorage로 하루 1회
    const pageKey = `visited_${pathname}`;
    const alreadyVisitedPage = localStorage.getItem(pageKey);
    localStorage.setItem(pageKey, '1');

    // 일별 방문 카운트는 하루 1회만 (순 방문자) — 브라우저당 1회
    const dailyKey = `visited_daily_${kstDate}`;
    const isFirstVisit = !localStorage.getItem(dailyKey);
    localStorage.setItem(dailyKey, '1');

    const referrer = document.referrer || '';
    const referrerDomain = extractDomain(referrer);

    // 같은 도메인에서의 내부 이동은 referrer로 기록하지 않음
    const isSameSite = referrerDomain === window.location.hostname.replace(/^www\./, '');

    // 로그인 사용자는 페이지뷰마다 카운트 증가를 위해 매번 호출,
    // 비로그인 사용자는 세션 첫 방문만 (site_visits/visit_logs 집계용).
    getVisitorStatus().then(({ isAdmin, isLoggedIn }) => {
      if (isAdmin) return;
      if (!isLoggedIn && !isFirstVisit) return;

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
    });
  }, [pathname, searchParams]);

  return null;
}
