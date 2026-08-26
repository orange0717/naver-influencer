'use client';

import { useState } from 'react';
import Link from 'next/link';
import Pagination from '@/components/analytics/Pagination';
import {
  bucketIdForRank,
  UNRANKED_TOOLTIP,
  type BucketId,
  type KeywordBucket,
} from '@/lib/keyword/aggregate';

interface RankKeyword {
  keyword_id: string;
  keyword: string;
  /** null = 아직 순위가 확인되지 않음 */
  rank_position: number | null;
  rank_change: number;
  category: string;
}

interface Props {
  /** 버킷 정의·순서·개수는 전부 lib/keyword/aggregate.ts 에서 온다. 여기서 만들지 않는다. */
  buckets: KeywordBucket[];
  /** 타일을 눌렀을 때 펼칠 키워드 목록 (순위 없는 것 포함). */
  keywords: RankKeyword[];
}

const PAGE_SIZE = 5;

/** 표시 톤만 담당한다 — 경계값·라벨은 aggregate.ts 소관. */
const BUCKET_TONE: Record<BucketId, { color: string; bg: string }> = {
  r1: { color: 'text-gold', bg: 'bg-gold/10' },
  r2: { color: 'text-gold', bg: 'bg-gold/10' },
  r3: { color: 'text-gold', bg: 'bg-gold/10' },
  r4: { color: 'text-accent', bg: 'bg-accent/10' },
  r5: { color: 'text-accent', bg: 'bg-accent/10' },
  r6_10: { color: 'text-accent', bg: 'bg-accent/10' },
  r11_20: { color: 'text-dim', bg: 'bg-border/30' },
  r21_30: { color: 'text-dim', bg: 'bg-border/30' },
  r30plus: { color: 'text-dim', bg: 'bg-border/20' },
  // 순위 성과로 오해되면 안 되는 상태값 — 중립 회색 면.
  unranked: { color: 'text-text-2', bg: 'bg-surface-neutral' },
};

export default function RankDistribution({ buckets, keywords }: Props) {
  const [selected, setSelected] = useState<BucketId | null>(null);
  const [page, setPage] = useState(1);

  const selectedBucket = buckets.find(b => b.id === selected) ?? null;
  const selectedKeywords = selectedBucket
    ? keywords
        .filter(k => bucketIdForRank(k.rank_position) === selectedBucket.id)
        .sort((a, b) => (a.rank_position ?? Infinity) - (b.rank_position ?? Infinity))
    : [];
  const totalPages = Math.ceil(selectedKeywords.length / PAGE_SIZE);
  const displayList = selectedKeywords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-dim font-semibold">순위별 키워드 분포</p>
        {!selected && (
          <p className="text-xs text-accent font-semibold">순위를 눌러 키워드를 확인하세요</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {buckets.map(b => {
          const tone = BUCKET_TONE[b.id];
          const isUnranked = b.id === 'unranked';
          return (
            <button
              key={b.id}
              onClick={() => { setSelected(prev => prev === b.id ? null : b.id); setPage(1); }}
              title={isUnranked ? UNRANKED_TOOLTIP : undefined}
              className={`rounded-xl py-2.5 cursor-pointer transition-all ${tone.bg} ${
                selected === b.id ? 'ring-2 ring-accent scale-[1.02]' : 'hover:scale-[1.02]'
              }`}
            >
              {/* 숫자 타이포는 모든 타일이 같다 — 순위 없음만 작게 쓰면 "덜 중요한 값"으로
                  읽혀 합계가 안 맞는 것처럼 보인다. */}
              <p className={`text-lg font-black ${tone.color}`}>{b.count}</p>
              <p className="text-[10px] text-dim font-semibold mt-0.5">{b.label}</p>
            </button>
          );
        })}
      </div>

      {/* "순위를 눌러 키워드를 확인하세요"라고 안내해 놓고, 0건 구간을 누르면 테두리만 생기고
          아무것도 안 나왔다 — 사용자는 버튼이 고장난 것으로 읽는다. 눌렀으면 항상 답을 준다.
          (타일 숫자는 있는데 목록이 비면 집계와 목록이 어긋난 것이므로 그것도 드러나야 한다.) */}
      {selectedBucket && selectedKeywords.length === 0 && (
        <p className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-center text-[12px] text-dim">
          {selectedBucket.count === 0
            ? `${selectedBucket.label} 구간에 해당하는 키워드가 없습니다.`
            : `${selectedBucket.label} 구간의 키워드 목록을 불러오지 못했습니다. 새로고침해 주세요.`}
        </p>
      )}

      {selectedBucket && selectedKeywords.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2 bg-bg/30 border-b border-border/50 flex items-center justify-between">
            <span className="text-xs font-bold">{selectedBucket.label} 키워드 ({selectedKeywords.length}개)</span>
            {totalPages > 1 && (
              <span className="text-[10px] text-dim">{page}/{totalPages}</span>
            )}
          </div>
          {selectedBucket.id === 'unranked' && (
            <p className="px-4 py-2 text-[11px] text-text-2 bg-surface-neutral border-b border-border/50">
              {UNRANKED_TOOLTIP} 순위가 낮은 것이 아니라, 아직 수집되지 않았거나 네이버에 노출되지 않은 상태입니다.
            </p>
          )}
          <div className="divide-y divide-border/20">
            {displayList.map(kw => (
              <Link
                key={kw.keyword_id}
                href={`/keywords/${kw.keyword_id}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover transition"
              >
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{kw.keyword}</span>
                  <span className="text-[11px] text-dim ml-1.5">{kw.category}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-dim">
                    {kw.rank_position != null ? `${kw.rank_position}위` : '순위 없음'}
                  </span>
                  {kw.rank_change !== 0 && (
                    <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                      {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} numbers />
        </div>
      )}
    </div>
  );
}
