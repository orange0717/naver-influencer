'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { withTimeout } from '@/lib/with-timeout';

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

/**
 * 관리자 여부 + 로그인 여부 + 액세스 토큰까지 한 번에 확인.
 * 토큰을 직접 Authorization 헤더로 보내야 fetch 호출에서 회원이 안전하게 식별된다.
 * (쿠키 인증만 의존하면 일부 환경에서 supabase 쿠키가 제대로 읽히지 않아 익명으로 잡힘)
 */
async function getVisitorStatus(): Promise<{
  isAdmin: boolean;
  isLoggedIn: boolean;
  accessToken: string | null;
}> {
  try {
    const supabase = createSupabaseBrowserClient();
    // Supabase Auth 클라이언트 호출이 응답 없이 멈추면(모바일/불안정 네트워크에서
    // 실제 발생 — 로그인 무한 대기 버그와 동일 패턴) 이 await가 영원히 끝나지 않아
    // 방문 추적 fetch 자체가 호출되지 않는다. 타임아웃으로 감싸 실패 시 즉시
    // 폴백(쿠키 기반 로그인 판정)으로 넘어가 트래킹이 유실되지 않게 한다.
    const [{ data: userData }, { data: sessionData }] = await withTimeout(
      Promise.all([supabase.auth.getUser(), supabase.auth.getSession()]),
      3000,
      'VisitTracker 방문자 상태 조회',
    );
    const email = userData?.user?.email?.toLowerCase();
    return {
      isAdmin: email ? ADMIN_EMAILS.includes(email) : false,
      isLoggedIn: !!userData?.user || hasCookieSession(),
      accessToken: sessionData?.session?.access_token ?? null,
    };
  } catch {
    return { isAdmin: false, isLoggedIn: hasCookieSession(), accessToken: null };
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

    // 2차: Supabase Auth 이메일 기반 차단 + 액세스 토큰 첨부로 회원 식별 보장
    let visitLogId: number | null = null;
    const startedAt = Date.now();
    let sentDuration = false;

    getVisitorStatus().then(({ isAdmin, accessToken }) => {
      if (isAdmin) return;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      fetch('/api/analytics/track', {
        method: 'POST',
        credentials: 'include',
        headers,
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
      })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data && typeof data.id === 'number') visitLogId = data.id;
        })
        .catch(() => {});
    });

    /** 페이지를 떠날 때 체류시간을 sendBeacon 으로 보고 (관리자 분석 표시용) */
    const reportDuration = () => {
      if (sentDuration || visitLogId == null) return;
      sentDuration = true;
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      // 비정상 장기 체류는 1시간으로 캡
      const capped = Math.min(elapsed, 3600);
      try {
        const blob = new Blob(
          [JSON.stringify({ id: visitLogId, duration: capped })],
          { type: 'application/json' },
        );
        navigator.sendBeacon('/api/analytics/duration', blob);
      } catch {
        /* sendBeacon 미지원 환경은 무시 */
      }
    };

    const onPageHide = () => reportDuration();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') reportDuration();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      // pathname 이 바뀌어 effect 가 정리될 때도 체류시간 보고
      reportDuration();
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pathname, searchParams]);

  return null;
}
