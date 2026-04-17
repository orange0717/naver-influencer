'use client';

import { useEffect, useState, use } from 'react';

interface KeywordItem {
  rank: number;
  keyword: string;
  participantCount: number;
  contentCount: number;
  searchVolume: number | null;
  isNew: boolean;
  trendDirection: 'up' | 'down' | 'stable' | null;
  trendPercentage: number | null;
}

interface ApiResponse {
  topic?: string;
  slug?: string;
  totalKeywords?: number;
  keywords?: KeywordItem[];
  error?: string;
}

export default function TopicDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/trending-topics/${slug}`);
        const json = (await res.json()) as ApiResponse;
        if (json.error) setError(json.error);
        setData(json);
      } catch (err) {
        console.error('주제 상세 로드 실패:', err);
        setError('데이터를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  const keywords = data?.keywords || [];

  return (
    <div className="space-y-6">
      <div>
        <a
          href="/keywords/hot"
          className="inline-flex items-center gap-1 text-xs text-dim hover:text-fg mb-2"
        >
          ← 실시간 상승 키워드
        </a>
        <h1 className="text-2xl font-extrabold mb-1">
          {data?.topic || '주제'} 상승 키워드
        </h1>
        <p className="text-sm text-dim">
          네이버 인플루언서 키워드챌린지 기준 TOP {keywords.length}
          {data?.totalKeywords ? ` · 총 ${data.totalKeywords.toLocaleString()}개 수집` : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : error && keywords.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-dim">{error}</p>
        </div>
      ) : keywords.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-dim">이 주제에는 아직 수집된 키워드가 없어요.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-border bg-bg/50 text-xs font-semibold text-dim">
            <div className="col-span-1">순위</div>
            <div className="col-span-5">키워드</div>
            <div className="col-span-2 text-right">참여자</div>
            <div className="col-span-2 text-right">월 검색량</div>
            <div className="col-span-2 text-right">상태</div>
          </div>
          {keywords.map(k => {
            const rankColor =
              k.rank === 1
                ? 'text-yellow-500 bg-yellow-500/10'
                : k.rank === 2
                ? 'text-gray-400 bg-gray-400/10'
                : k.rank === 3
                ? 'text-amber-700 bg-amber-700/10'
                : 'text-dim bg-bg/50';

            return (
              <a
                key={`${k.rank}-${k.keyword}`}
                href={`/keywords/blogger?q=${encodeURIComponent(k.keyword)}`}
                className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-border/50 last:border-b-0 items-center hover:bg-bg/30 transition-colors"
              >
                <div className="col-span-1">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${rankColor}`}
                  >
                    {k.rank}
                  </span>
                </div>
                <div className="col-span-5">
                  <div className="text-sm font-bold">{k.keyword}</div>
                </div>
                <div className="col-span-2 text-right text-xs font-bold font-rank">
                  {k.participantCount.toLocaleString()}
                </div>
                <div className="col-span-2 text-right text-xs font-bold font-rank text-dim">
                  {k.searchVolume != null ? k.searchVolume.toLocaleString() : '-'}
                </div>
                <div className="col-span-2 text-right">
                  {k.isNew ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-up bg-up/12">
                      NEW
                    </span>
                  ) : k.trendDirection === 'up' ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-up bg-up/12">
                      ▲ {k.trendPercentage != null ? `${k.trendPercentage}%` : ''}
                    </span>
                  ) : k.trendDirection === 'down' ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-down bg-down/12">
                      ▼ {k.trendPercentage != null ? `${k.trendPercentage}%` : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-dim">-</span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-dim">
        * 키워드를 클릭하면 키워드 검색 페이지로 이동합니다. 참여자 수는 해당 키워드에 도전 중인 인플루언서 수예요.
      </p>
    </div>
  );
}
