'use client';

import { useEffect } from 'react';

/**
 * /admin/* 에 진입하면 localStorage 에 관리자 플래그를 심는다.
 * VisitTracker 가 이 플래그를 보고 집계에서 제외한다.
 * - 서버 사이드에서 이미 관리자 인증을 통과한 뒤에만 이 컴포넌트가 렌더링됨
 * - 30일간 유효 (그 뒤엔 다시 /admin 들러야 갱신)
 * - 로그아웃 / 시크릿 창에서도 같은 브라우저라면 동작
 */
export default function AdminVisitFlag() {
  useEffect(() => {
    try {
      const payload = JSON.stringify({ t: Date.now() });
      localStorage.setItem('or_admin_visit', payload);
    } catch {
      // ignore
    }
  }, []);
  return null;
}
