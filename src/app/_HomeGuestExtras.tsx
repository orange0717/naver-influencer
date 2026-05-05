'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DemoModal from '@/components/DemoModal';

function useSiteStats() {
  const [s, setS] = useState({ totalVisits: 0, todayVisits: 0, totalSignups: 0, todaySignups: 0 });
  useEffect(() => {
    fetch('/api/analytics/stats').then(r => r.json()).then(setS).catch(err => {
      console.warn('[home] analytics 로드 실패', err instanceof Error ? err.message : err);
    });
  }, []);
  return s;
}

export default function HomeGuestExtras() {
  const siteStats = useSiteStats();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="-mx-4 mt-10 mb-[-2.5rem]">
      {/* 데모체험 CTA */}
      <section className="bg-accent/[0.06] px-4 py-14 md:py-16 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">DEMO</p>
        <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-3">
          가입 없이 3일 데모체험
        </h2>
        <p className="text-sm text-dim mb-8 max-w-md mx-auto">
          인플루언서홈 또는 블로그 주소만 입력하면 모든 기능을 3일간 무료로 사용할 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={() => setDemoOpen(true)}
            className="px-8 py-3 bg-accent text-white text-sm font-bold rounded-full hover:bg-accent-hover transition-colors shadow-sm"
          >
            3일 데모체험 →
          </button>
          <Link
            href="/auth/login"
            className="px-8 py-3 bg-bg border border-border text-text text-sm font-bold rounded-full hover:border-accent/40 hover:text-accent transition-colors"
          >
            로그인 / 회원가입
          </Link>
        </div>
        <p className="text-[11px] text-dim/70 mt-5">
          서비스에 대한 자세한 안내는{' '}
          <Link href="/intro" className="text-accent font-semibold hover:underline">
            소개 페이지
          </Link>
          에서 확인하세요.
        </p>
        <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      </section>

      {/* 방문자/가입자 통계 */}
      <section className="bg-bg px-4 py-12 md:py-14">
        <div className="max-w-md mx-auto">
          <p className="text-center text-xs text-accent font-semibold tracking-widest mb-5">LIVE STATS</p>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-surface rounded-xl border border-border py-3 px-2 text-center">
              <p className="text-[11px] text-dim mb-0.5">오늘 방문</p>
              <p className="text-lg font-extrabold text-accent font-rank">{siteStats.todayVisits.toLocaleString()}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border py-3 px-2 text-center">
              <p className="text-[11px] text-dim mb-0.5">누적 방문</p>
              <p className="text-lg font-extrabold text-accent font-rank">{siteStats.totalVisits.toLocaleString()}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border py-3 px-2 text-center">
              <p className="text-[11px] text-dim mb-0.5">신규 가입</p>
              <p className="text-lg font-extrabold text-accent font-rank">{siteStats.todaySignups.toLocaleString()}</p>
            </div>
            <div className="bg-surface rounded-xl border border-border py-3 px-2 text-center">
              <p className="text-[11px] text-dim mb-0.5">누적 가입</p>
              <p className="text-lg font-extrabold text-accent font-rank">{siteStats.totalSignups.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
