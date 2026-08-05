'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ActivityEvent } from '@/lib/activity-events';
import DashboardCard from './DashboardCard';

interface ActivityFeedProps {
  events: ActivityEvent[];
}

const typeConfig = {
  rank_up: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    ),
    color: 'bg-up text-white',
    border: 'border-l-up',
  },
  rank_down: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
    ),
    color: 'bg-down text-white',
    border: 'border-l-down',
  },
  new_top3: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    ),
    color: 'bg-gold text-white',
    border: 'border-l-gold',
  },
  new_keyword: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
    ),
    color: 'bg-accent text-white',
    border: 'border-l-accent',
  },
  milestone: {
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
    ),
    color: 'bg-accent text-white',
    border: 'border-l-accent',
  },
};

const PAGE_SIZE = 5;

function EventCard({ event, index }: { event: ActivityEvent; index: number }) {
  const config = typeConfig[event.type];
  const baseClassName = `
    flex items-start gap-3 p-3 rounded-xl
    border-l-[3px] ${config.border}
    bg-bg/50 hover:bg-bg transition-colors
    animate-fade-in-up stagger-${Math.min(index + 1, 6)}
  `.trim();

  const content = (
    <>
      <div className={`w-7 h-7 rounded-full ${config.color} flex items-center justify-center shrink-0 mt-0.5`}>
        {config.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed">
          <span className="font-bold">{event.keyword}</span>
          {event.type === 'rank_up' && (
            <span className="text-up"> {event.change}단계 상승</span>
          )}
          {event.type === 'rank_down' && (
            <span className="text-down"> {Math.abs(event.change || 0)}단계 하락</span>
          )}
          {event.type === 'new_top3' && (
            <span className="text-gold"> TOP 3 진입!</span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {event.from_rank && event.to_rank && (
            <span className="text-[11px] text-dim font-rank">
              {event.from_rank}위 → {event.to_rank}위
            </span>
          )}
        </div>
      </div>
      {event.change && (
        <div className={`shrink-0 text-sm font-black font-rank ${
          event.type === 'rank_down' ? 'text-down' : 'text-up'
        }`}>
          {event.type === 'rank_down' ? '▼' : '▲'}{Math.abs(event.change)}
        </div>
      )}
    </>
  );

  if (event.keyword_id) {
    return (
      <Link href={`/keywords/${event.keyword_id}`} className={`${baseClassName} cursor-pointer`}>
        {content}
      </Link>
    );
  }

  return <div className={baseClassName}>{content}</div>;
}

function PaginatedList({ events, label, icon, emptyText }: {
  events: ActivityEvent[];
  label: string;
  icon: string;
  emptyText: string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const visible = events.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className={`text-xs font-bold ${label === '상승' ? 'text-up' : 'text-down'}`}>{icon} {label}</span>
        <span className="text-[11px] text-dim">{events.length}건</span>
      </div>
      <div className="space-y-2">
        {visible.length > 0 ? (
          visible.map((event, i) => (
            <EventCard key={event.id} event={event} index={i} />
          ))
        ) : (
          <div className="text-center py-6 text-dim text-xs bg-bg/30 rounded-xl">
            {emptyText}
          </div>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-3">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-7 h-7 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                page === p
                  ? 'bg-accent text-white'
                  : 'bg-border/30 text-dim hover:bg-border/50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActivityFeed({ events }: ActivityFeedProps) {
  const liveBadge = (
    <span className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full font-bold">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
      LIVE
    </span>
  );

  if (events.length === 0) {
    return (
      <DashboardCard title={<span className="inline-flex items-center gap-2">순위 변동 {liveBadge}</span>}>
        <div className="text-center py-8 text-dim text-sm">
          <p>아직 순위 변동 데이터가 없습니다.</p>
          <p className="text-xs mt-1">데이터가 수집되면 자동으로 표시됩니다.</p>
        </div>
      </DashboardCard>
    );
  }

  const upEvents = events.filter(e => e.type === 'rank_up' || e.type === 'new_top3' || e.type === 'new_keyword' || e.type === 'milestone');
  const downEvents = events.filter(e => e.type === 'rank_down');

  return (
    <DashboardCard
      title={<span className="inline-flex items-center gap-2">순위 변동 {liveBadge}</span>}
      headerRight={<span className="text-[11px] text-dim">{events.length}건</span>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 왼쪽: 상승 */}
        <PaginatedList
          events={upEvents}
          label="상승"
          icon="▲"
          emptyText="상승 키워드 없음"
        />

        {/* 오른쪽: 하락 */}
        <PaginatedList
          events={downEvents}
          label="하락"
          icon="▼"
          emptyText="하락 키워드 없음"
        />
      </div>
    </DashboardCard>
  );
}
