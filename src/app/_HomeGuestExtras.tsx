'use client';

import { useState, useEffect } from 'react';

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

  return (
    <div className="-mx-4 mt-10 mb-[-2.5rem]">
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
