'use client';

import { useState, useEffect } from 'react';

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

export default function InfluencerRankingView() {
  const [influencers, setInfluencers] = useState<InfluencerRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch('/api/influencers?ninfl=true&sort=keyword_score&order=desc&limit=50&page=1')
      .then((r) => r.json())
      .then((d) => {
        setInfluencers(d.influencers || []);
        setTotal(d.total || 0);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <p className="text-[11px] text-dim">
        N인플 자체 순위 — 키워드 참여수·순위·월간 검색량 기반 점수
        {total > 0 && ` · 총 ${total.toLocaleString()}명`}
      </p>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold">Top 50 인플루언서 순위</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : influencers.length === 0 ? (
          <p className="p-8 text-sm text-dim text-center">데이터가 없습니다.</p>
        ) : (
          <div className="divide-y divide-border">
            {influencers.map((inf, idx) => (
              <a
                key={inf.naverId}
                href={`/influencers/${encodeURIComponent(inf.naverId)}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-bg transition"
              >
                <span className="w-10 text-sm font-bold text-accent font-rank shrink-0">
                  {inf.ninflRank ?? idx + 1}
                </span>
                {inf.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={inf.imageUrl} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-bg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{inf.name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-dim">
                    {inf.myKeywordCategory && <span>{inf.myKeywordCategory}</span>}
                    <span>· 팬 {inf.subscriberCount?.toLocaleString() || 0}</span>
                    {typeof inf.integratedTop3Count === 'number' && (
                      <span>· TOP3 {inf.integratedTop3Count}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-dim font-mono shrink-0">
                  {typeof inf.keywordScore === 'number' ? Math.round(inf.keywordScore) : 0}점
                </span>
              </a>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-dim text-center">
        전체 인플루언서 리스트는 <a href="/influencers" className="underline">인플루언서 리스트</a>에서 카테고리·정렬·검색으로 조회하세요.
      </p>
    </>
  );
}
