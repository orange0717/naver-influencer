'use client';

import { useState, useEffect, useCallback } from 'react';

interface InfluencerRank {
  name: string;
  naverId: string;
  profileUrl: string;
  imageUrl: string;
  myKeywordCategory: string;
  myKeyword: string;
  subscriberCount: number;
  keywordScore?: number;
  integratedTop3Count?: number;
  totalKeywords?: number;
  ninflRank?: number | null;
}

function formatScore(n?: number): string {
  if (typeof n !== 'number' || !isFinite(n)) return '0점';
  const v = Math.round(n);
  if (v >= 100_000_000) return (v / 100_000_000).toFixed(1) + '억점';
  if (v >= 10_000) return (v / 10_000).toFixed(1) + '만점';
  return v.toLocaleString() + '점';
}

const CATEGORIES = [
  '전체',
  '여행',
  '패션', '뷰티',
  '푸드',
  'IT테크', '자동차',
  '리빙', '육아', '생활건강',
  '게임',
  '동물/펫',
  '운동/레저', '프로스포츠',
  '방송/연예', '대중음악', '영화',
  '공연/전시/예술', '도서',
  '경제/비즈니스', '어학/교육',
];

export default function InfluencerRankingView() {
  const [category, setCategory] = useState('전체');
  const [influencers, setInfluencers] = useState<InfluencerRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (cat: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ninfl: 'true',
        sort: 'keyword_score',
        order: 'desc',
        limit: '2000',
        page: '1',
      });
      if (cat && cat !== '전체') params.set('category', cat);
      const res = await fetch(`/api/influencers?${params}`);
      const data = await res.json();
      setInfluencers(data.influencers || []);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(category);
  }, [category, load]);

  return (
    <>
      <p className="text-[11px] text-dim">
        N인플 자체 순위 — 키워드 참여수·순위·월간 검색량 기반 점수
        {total > 0 && ` · 총 ${total.toLocaleString()}명`}
      </p>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition cursor-pointer ${
              category === cat
                ? 'bg-accent text-white'
                : 'bg-surface text-dim border border-border hover:text-text'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold">
            {category === '전체' ? '전체 인플루언서 순위' : `${category} 전체`}
            {influencers.length > 0 && (
              <span className="ml-1.5 text-[11px] font-semibold text-dim">
                {influencers.length.toLocaleString()}명
              </span>
            )}
          </h2>
          {loading && (
            <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          )}
        </div>
        {loading && influencers.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : influencers.length === 0 ? (
          <p className="p-8 text-sm text-dim text-center">
            {category === '전체'
              ? '데이터가 없습니다.'
              : `${category} 카테고리에 해당하는 인플루언서가 없습니다.`}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-border">
            {influencers.map((inf, idx) => (
              <a
                key={inf.naverId}
                href={`/influencers/${encodeURIComponent(inf.naverId)}`}
                className="flex items-center gap-2.5 px-4 py-2 hover:bg-bg transition border-b border-border"
              >
                <span className="w-8 text-xs font-bold text-accent font-rank shrink-0 text-right tabular-nums">
                  {category === '전체' ? (inf.ninflRank ?? idx + 1) : idx + 1}
                </span>
                {inf.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={inf.imageUrl} alt="" loading="lazy" className="w-8 h-8 rounded-full shrink-0 object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate leading-tight">{inf.name}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-dim leading-tight mt-0.5">
                    {inf.myKeywordCategory && <span className="truncate">{inf.myKeywordCategory}</span>}
                    <span className="shrink-0">· 팬 {inf.subscriberCount?.toLocaleString() || 0}</span>
                    {typeof inf.integratedTop3Count === 'number' && (
                      <span className="shrink-0">· TOP3 {inf.integratedTop3Count}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-dim font-mono shrink-0 tabular-nums">
                  {formatScore(inf.keywordScore)}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
