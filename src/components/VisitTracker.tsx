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

/** localhost / 사설망 / mDNS 도메인 여부 — 본인 dev 트래픽 허수 차단용 */
function isLocalDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase();
  if (d === 'localhost' || d === '127.0.0.1' || d === '0.0.0.0' || d === '::1') return true;
  if (/^10\./.test(d)) return true;
  if (/^192\.168\./.test(d)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(d)) return true;
  if (d.endsWith('.local')) return true;
  return false;
}

/** 쿠키 세션(데모/블로거 로그인)이 있는지 브라우저에서 확인 */
function hasCookieSession(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)user_type=/.test(document.cookie);
}

/**
 * 관리자가 /admin 에 진입한 적이 있으면 localStorage 에 플래그가 심어져 있다.
 * 로그아웃 / 시크릿창 / 다른 이메일로 로그인해도 같은 브라우저면 집계에서 제외.
 * 30일 경과 시 만료.
 */
function isAdminByLocalFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('or_admin_visit');
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { t?: number };
    if (!parsed?.t) return false;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.t > thirtyDays) {
      localStorage.removeItem('or_admin_visit');
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
    // 로컬/사설망 호스트에서의 접속은 dev 환경 → 운영 분석 집계에서 제외
    if (typeof window !== 'undefined' && isLocalDomain(window.location.hostname)) {
      return;
    }

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

    // referrer 가 localhost / 사설망 → 본인 dev 트래픽으로 판단, 집계 자체에서 제외
    if (isLocalDomain(referrerDomain)) {
      return;
    }

    // 모든 페이지뷰(PV)마다 track 호출.
    // 서버에서 PV는 항상 집계하고, UV(순방문자)는 first_visit=true일 때만 카운트한다.
    // (로그인/비로그인 무관, 관리자만 제외)
    // 1차: localStorage 플래그(로그아웃·시크릿창에서도 동작)로 즉시 차단
    if (isAdminByLocalFlag()) return;

    // 2차: Supabase Auth 이메일 기반 차단
    getVisitorStatus().then(({ isAdmin }) => {
      if (isAdmin) return;

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
