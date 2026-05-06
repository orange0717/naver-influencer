'use client';

import { useEffect, useState } from 'react';

interface TopKeyword {
  keyword: string;
  participantCount: number;
  isNew: boolean;
}

interface TopicSummary {
  topic: string;
  slug: string;
  totalKeywords: number;
  newCount: number;
  topKeywords: TopKeyword[];
}

export default function TrendingTopicsClient() {
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/trending-topics');
        const data = await res.json();
        if (data.error) setError(data.error);
        setTopics(data.topics || []);
      } catch (err) {
        console.error('실시간 상승 키워드 로드 실패:', err);
        setError('데이터를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold mb-1">실시간 상승 키워드</h1>
        <p className="text-sm text-dim">
          네이버 인플루언서 20개 주제별 인기 키워드. 주제 카드를 클릭하면 해당 주제의 TOP 50 키워드를 볼 수 있어요.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : error && topics.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-dim">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {topics.map(t => (
            <a
              key={t.slug}
              href={`/keywords/hot/topic/${t.slug}`}
              className="bg-surface rounded-xl border border-border p-4 hover:border-accent hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold group-hover:text-accent transition-colors">
                  {t.topic}
                </h3>
                <div className="flex items-center gap-1.5">
                  {t.newCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-up bg-up/12">
                      NEW {t.newCount}
                    </span>
                  )}
                  <span className="text-[11px] text-dim font-rank">
                    {t.totalKeywords.toLocaleString()}개
                  </span>
                </div>
              </div>
              {t.topKeywords.length === 0 ? (
                <p className="text-xs text-dim">수집된 키워드가 없어요.</p>
              ) : (
                <ul className="space-y-1">
                  {t.topKeywords.slice(0, 3).map((k, i) => (
                    <li key={k.keyword} className="flex items-center gap-2 text-xs">
                      <span className="w-4 text-dim font-rank">{i + 1}</span>
                      <span className="font-semibold truncate flex-1">{k.keyword}</span>
                      {k.isNew && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded text-up bg-up/12">
                          NEW
                        </span>
                      )}
                      <span className="text-[10px] text-dim font-rank">
                        {k.participantCount.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 text-[11px] text-dim text-right group-hover:text-accent transition-colors">
                전체 보기 →
              </div>
            </a>
          ))}
        </div>
      )}

      <p className="text-[11px] text-dim">
        * 네이버 인플루언서 키워드챌린지 기준. 숫자는 참여자 수(도전 중인 인플루언서 수)입니다.
      </p>
    </div>
  );
}
