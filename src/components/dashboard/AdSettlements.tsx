'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatDateDot as formatDate } from '@/lib/format';

interface Settlement {
  id: string;
  order_date: string | null;
  settled_date: string;
  client_name: string;
  fee: number;
  commission: number;
  net_amount: number;
  posting_deadline: string | null;
}

interface CalendarEvent {
  date: string; // YYYY-MM-DD
  type: 'posting' | 'settlement';
  label: string;
  fee: number;
}

/** 캘린더 컴포넌트 */
function ScheduleCalendar({ events }: { events: CalendarEvent[] }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 해당 월의 이벤트 맵
  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      if (!ev.date) continue;
      const d = new Date(ev.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const key = String(d.getDate());
        if (!map[key]) map[key] = [];
        map[key].push(ev);
      }
    }
    return map;
  }, [events, year, month]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = Array(firstDay).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">원고료 정산 캘린더</h3>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="w-7 h-7 rounded-lg border border-border hover:bg-bg flex items-center justify-center text-dim hover:text-text transition cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-semibold min-w-[100px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="w-7 h-7 rounded-lg border border-border hover:bg-bg flex items-center justify-center text-dim hover:text-text transition cursor-pointer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 text-[11px] text-dim">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-accent inline-block" /> 포스팅 업로드
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-up inline-block" /> 정산
        </span>
      </div>

      {/* 달력 */}
      <div className="border border-border rounded-xl overflow-hidden">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 bg-bg/50">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <div key={d} className={`text-center py-2 text-[11px] font-semibold ${d === '일' ? 'text-down' : d === '토' ? 'text-accent' : 'text-dim'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 */}
        {weeks.map((w, wi) => (
          <div key={wi} className="grid grid-cols-7 border-t border-border/50">
            {w.map((day, di) => {
              if (day === null) {
                return <div key={di} className="min-h-[60px] md:min-h-[72px] p-1 bg-bg/30" />;
              }

              const dayEvents = eventMap[String(day)] || [];
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const isSunday = di === 0;
              const isSaturday = di === 6;

              return (
                <div key={di} className={`min-h-[60px] md:min-h-[72px] p-1 border-l border-border/30 first:border-l-0 ${isToday ? 'bg-accent/5' : 'hover:bg-bg/50'} transition-colors`}>
                  <span className={`text-[11px] font-semibold block mb-0.5 ${isToday ? 'text-accent' : isSunday ? 'text-down' : isSaturday ? 'text-accent/70' : 'text-text'}`}>
                    {day}
                  </span>
                  <div className="space-y-0.5">
                    {dayEvents.map((ev, ei) => (
                      <div
                        key={ei}
                        className={`text-[9px] md:text-[10px] font-semibold rounded px-1 py-0.5 truncate ${
                          ev.type === 'posting'
                            ? 'bg-accent/15 text-accent'
                            : 'bg-up/15 text-up'
                        }`}
                        title={`${ev.label} - ${ev.fee.toLocaleString()}원`}
                      >
                        {ev.label}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdSettlements() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/my/ad-settlements')
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then(data => setSettlements(data.settlements || []))
      .catch((err) => {
        console.warn('[AdSettlements] fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalFee = settlements.reduce((sum, s) => sum + s.fee, 0);
  const pendingCount = settlements.filter(s => !s.settled_date).length;
  const completedCount = settlements.filter(s => !!s.settled_date).length;

  // 캘린더 이벤트 생성
  const calendarEvents = useMemo(() => {
    const events: CalendarEvent[] = [];
    for (const s of settlements) {
      if (s.posting_deadline) {
        events.push({
          date: s.posting_deadline,
          type: 'posting',
          label: s.client_name || '포스팅',
          fee: s.fee,
        });
      }
      if (s.settled_date) {
        events.push({
          date: s.settled_date,
          type: 'settlement',
          label: s.client_name || '정산',
          fee: s.fee,
        });
      }
    }
    return events;
  }, [settlements]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-bg rounded-xl p-4 animate-pulse">
              <div className="h-3 bg-border/40 rounded w-16 mb-2" />
              <div className="h-5 bg-border/40 rounded w-20" />
            </div>
          ))}
        </div>
        <div className="h-32 bg-bg rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-bg rounded-xl p-4">
          <p className="text-[11px] text-dim font-medium mb-1">총 원고료</p>
          <p className="text-lg font-bold">{totalFee.toLocaleString()}<span className="text-xs text-dim font-normal ml-0.5">원</span></p>
        </div>
        <div className="bg-bg rounded-xl p-4">
          <p className="text-[11px] text-dim font-medium mb-1">완료</p>
          <p className="text-lg font-bold text-up">{completedCount}<span className="text-xs text-dim font-normal ml-0.5">건</span></p>
        </div>
        <div className="bg-bg rounded-xl p-4">
          <p className="text-[11px] text-dim font-medium mb-1">대기</p>
          <p className="text-lg font-bold text-gold">{pendingCount}<span className="text-xs text-dim font-normal ml-0.5">건</span></p>
        </div>
      </div>

      {/* 원고 일정 캘린더 */}
      <ScheduleCalendar events={calendarEvents} />

      {/* 데스크톱 테이블 */}
      <div className="hidden md:block overflow-x-auto">
        <h3 className="font-bold text-sm mb-3">정산 내역</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-dim">
              <th className="text-left py-2.5 px-3 font-semibold">일자</th>
              <th className="text-left py-2.5 px-3 font-semibold">거래처</th>
              <th className="text-right py-2.5 px-3 font-semibold">원고료</th>
              <th className="text-center py-2.5 px-3 font-semibold">포스팅 업로드 일자</th>
              <th className="text-center py-2.5 px-3 font-semibold">정산일자</th>
            </tr>
          </thead>
          <tbody>
            {settlements.length === 0 ? (
              <tr>
                <td className="py-3 px-3 text-xs text-dim">-</td>
                <td className="py-3 px-3 text-dim">-</td>
                <td className="py-3 px-3 text-right text-dim">-</td>
                <td className="py-3 px-3 text-center text-dim">-</td>
                <td className="py-3 px-3 text-center text-dim">-</td>
              </tr>
            ) : (
              settlements.map(s => {
                const isPastDeadline = s.posting_deadline && new Date(s.posting_deadline) < new Date();
                const isSettled = !!s.settled_date;
                return (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="py-3 px-3 text-xs text-dim">{formatDate(s.order_date || s.settled_date)}</td>
                    <td className="py-3 px-3 font-semibold">{s.client_name || '-'}</td>
                    <td className="py-3 px-3 text-right font-bold">{s.fee.toLocaleString()}<span className="text-xs text-dim font-normal ml-0.5">원</span></td>
                    <td className="py-3 px-3 text-center">
                      {s.posting_deadline ? (
                        <span className={`text-xs font-semibold ${isPastDeadline ? 'text-down' : 'text-text'}`}>
                          {formatDate(s.posting_deadline)}
                        </span>
                      ) : (
                        <span className="text-xs text-dim">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {isSettled ? (
                        <span className="text-xs font-semibold text-up">{formatDate(s.settled_date)}</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-gold/10 text-gold font-semibold">대기</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="md:hidden">
        <h3 className="font-bold text-sm mb-3">정산 내역</h3>
        {settlements.length === 0 ? (
          <div className="text-center py-8 text-sm text-dim">
            <p>아직 정산내역이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {settlements.map(s => {
              const isPastDeadline = s.posting_deadline && new Date(s.posting_deadline) < new Date();
              return (
                <div key={s.id} className="bg-bg rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{s.client_name || '-'}</span>
                    <span className="font-bold text-sm">{s.fee.toLocaleString()}원</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-dim">
                    <span>일자: {formatDate(s.order_date || s.settled_date)}</span>
                    {s.posting_deadline && (
                      <span className={isPastDeadline ? 'text-down' : ''}>
                        업로드: {formatDate(s.posting_deadline)}
                      </span>
                    )}
                    {s.settled_date ? (
                      <span className="text-up font-semibold">
                        정산: {formatDate(s.settled_date)}
                      </span>
                    ) : (
                      <span className="text-gold font-semibold">대기</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
