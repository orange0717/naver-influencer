'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import RankBadge from '@/components/RankBadge';
import TrendAreaChart from '@/components/TrendAreaChart';

interface KeywordDetail {
  id: string;
  keyword: string;
  category: string;
  participant_count: number;
  competition_level: string;
  search_volume_monthly?: number;
}

interface RankingItem {
  id: string;
  rank_position: number;
  influencer_name: string;
  influencer_category: string;
  influencer_url: string;
  fan_count?: string;
  naver_id?: string;
  post_title?: string;
  post_url?: string;
  rank_change: number;
}

interface TrendPoint {
  week: string;
  volume: number;
}

interface TrendSummary {
  trend_direction: 'up' | 'down' | 'stable';
  trend_percentage: number;
  peak_volume: number;
  peak_date: string;
}

interface MonthlyVolume {
  pc: number | string;
  mobile: number | string;
  total: number | string;
  competition: string;
}

export default function KeywordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [keyword, setKeyword] = useState<KeywordDetail | null>(null);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendSummary, setTrendSummary] = useState<TrendSummary | null>(null);
  const [naverTrendData, setNaverTrendData] = useState<TrendPoint[]>([]);
  const [naverTrendSummary, setNaverTrendSummary] = useState<TrendSummary | null>(null);
  const [naverTrendLoading, setNaverTrendLoading] = useState(true);
  const [naverTrendError, setNaverTrendError] = useState<string | null>(null);
  const [monthlyVolume, setMonthlyVolume] = useState<MonthlyVolume | null>(null);
  const [monthlyVolumeLoading, setMonthlyVolumeLoading] = useState(false);
  const [monthlyVolumeError, setMonthlyVolumeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankLoading, setRankLoading] = useState(true);

  useEffect(() => {
    async function loadKeyword() {
      try {
        const res = await fetch(`/api/keywords/${id}`);
        const data = await res.json();
        setKeyword(data.keyword);
      } catch (err) {
        console.error('키워드 로드 실패:', err);
      } finally {
        setLoading(false);
      }
    }
    loadKeyword();
  }, [id]);

  useEffect(() => {
    async function loadRankings() {
      setRankLoading(true);
      try {
        const res = await fetch(`/api/keywords/${id}/rankings`);
        const data = await res.json();
        setRankings(data.rankings || []);
      } catch (err) {
        console.error('순위 로드 실패:', err);
      } finally {
        setRankLoading(false);
      }
    }
    loadRankings();
  }, [id]);

  // 트렌드 데이터 fetch
  useEffect(() => {
    async function loadTrend() {
      try {
        const res = await fetch(`/api/keywords/${id}/trend`);
        if (!res.ok) return;
        const data = await res.json();
        setTrendData(
          (data.trendData || []).map((d: { date: string; volume: number }) => ({
            week: d.date,
            volume: d.volume,
          }))
        );
        setTrendSummary(data.summary || null);
      } catch (err) {
        console.error('트렌드 로드 실패:', err);
      }
    }
    loadTrend();
  }, [id]);

  // 월간 검색수 fetch (네이버 광고 키워드 도구 API)
  useEffect(() => {
    if (!keyword?.keyword) return;
    async function loadMonthlyVolume() {
      setMonthlyVolumeLoading(true);
      setMonthlyVolumeError(null);
      try {
        const res = await fetch(`/api/search-volume?keyword=${encodeURIComponent(keyword!.keyword)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setMonthlyVolumeError(errData.error || '월간 검색수를 불러올 수 없습니다.');
          return;
        }
        const data = await res.json();
        const list = data.keywords || [];
        // 정확히 일치하는 키워드 우선, 없으면 첫 항목 사용
        const exact = list.find((k: { keyword: string }) => k.keyword === keyword!.keyword);
        const match = exact || list[0];
        if (match) {
          setMonthlyVolume({
            pc: match.monthlyPc,
            mobile: match.monthlyMobile,
            total: match.monthlyTotal,
            competition: match.competition,
          });
        }
      } catch (err) {
        console.error('월간 검색수 로드 실패:', err);
        setMonthlyVolumeError('월간 검색수를 불러올 수 없습니다.');
      } finally {
        setMonthlyVolumeLoading(false);
      }
    }
    loadMonthlyVolume();
  }, [keyword?.keyword]);

  // 네이버 검색어 트렌드 fetch (데이터랩 실시간)
  useEffect(() => {
    async function loadNaverTrend() {
      setNaverTrendLoading(true);
      setNaverTrendError(null);
      try {
        const res = await fetch(`/api/keywords/${id}/naver-trend`);
        if (!res.ok) {
          setNaverTrendError('네이버 트렌드를 불러올 수 없습니다.');
          return;
        }
        const data = await res.json();
        if (data.error) {
          setNaverTrendError(data.error);
        }
        setNaverTrendData(
          (data.trendData || []).map((d: { date: string; ratio: number }) => ({
            week: d.date,
            volume: d.ratio,
          }))
        );
        if (data.summary) {
          setNaverTrendSummary({
            trend_direction: data.summary.trend_direction,
            trend_percentage: data.summary.trend_percentage,
            peak_volume: data.summary.peak_value,
            peak_date: data.summary.peak_date,
          });
        }
      } catch (err) {
        console.error('네이버 트렌드 로드 실패:', err);
        setNaverTrendError('네이버 트렌드를 불러올 수 없습니다.');
      } finally {
        setNaverTrendLoading(false);
      }
    }
    loadNaverTrend();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-dim">키워드 정보를 가져오는 중...</p>
        </div>
      </div>
    );
  }

  if (!keyword) {
    return (
      <div className="text-center py-20">
        <p className="text-dim">키워드를 찾을 수 없습니다.</p>
        <Link href="/keywords" className="text-accent text-sm hover:underline mt-2 inline-block">키워드 목록</Link>
      </div>
    );
  }

  const top3Rankings = rankings.filter(r => r.rank_position <= 3);

  return (
    <div className="space-y-6">
      <Link href="/keywords" className="text-xs text-accent font-bold hover:underline">키워드 목록</Link>

      {/* 헤더 */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="type-page-title mb-1">{keyword.keyword}</h1>
            <div className="flex items-center gap-3 text-sm text-dim">
              <span>{keyword.category}</span>
              <span>참여자 {keyword.participant_count}명</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              keyword.competition_level === 'low' ? 'text-up bg-up/12' :
              keyword.competition_level === 'medium' ? 'text-gold bg-gold/12' :
              'text-down bg-down/12'
            }`}>
              경쟁도: {keyword.competition_level === 'low' ? '낮음' : keyword.competition_level === 'medium' ? '보통' : '높음'}
            </span>
          </div>
        </div>
      </div>

      {/* 블루오션 지표 */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="text-xs font-semibold text-dim mb-3">참여자 수</div>
          <div className="text-3xl font-extrabold text-accent mb-2 font-rank">{keyword.participant_count}명</div>
          <div className="text-xs text-dim">키워드챌린지에 참여 중인 인플루언서</div>
        </div>

        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="text-xs font-semibold text-dim mb-3">블루오션 지표</div>
          <div className={`text-3xl font-extrabold mb-2 font-rank ${keyword.participant_count < 30 ? 'text-up' : keyword.participant_count < 100 ? 'text-accent' : 'text-dim'}`}>
            {keyword.participant_count < 30 ? '블루오션' : keyword.participant_count < 100 ? '적정' : '레드오션'}
          </div>
          <div className="text-xs text-dim">
            {keyword.participant_count < 30
              ? '참여자 30명 미만 — 진입 적극 추천'
              : keyword.participant_count < 100
              ? '참여자 30~100명 — 검토 필요'
              : '참여자 100명 이상 — 경쟁 심함'}
          </div>
        </div>
      </div>

      {/* 검색량 트렌드 차트 */}
      {trendData.length > 0 && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-bold">검색량 트렌드</div>
            {trendSummary && (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  trendSummary.trend_direction === 'up' ? 'text-up bg-up/12' :
                  trendSummary.trend_direction === 'down' ? 'text-down bg-down/12' :
                  'text-dim bg-dim/12'
                }`}>
                  {trendSummary.trend_direction === 'up' ? '▲' : trendSummary.trend_direction === 'down' ? '▼' : '→'}
                  {' '}{Math.abs(trendSummary.trend_percentage)}%
                </span>
                {trendSummary.peak_volume > 0 && (
                  <span className="text-xs text-dim">최고 {trendSummary.peak_volume.toLocaleString()}</span>
                )}
              </div>
            )}
          </div>
          <TrendAreaChart data={trendData} direction={trendSummary?.trend_direction || 'stable'} />
        </div>
      )}

      {/* 월간 검색수 (네이버 광고 키워드 도구) */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-bold">
            월간 검색수
            <span className="ml-2 text-[11px] font-normal text-dim">네이버 광고 키워드 도구 기준</span>
          </div>
        </div>
        {monthlyVolumeLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        ) : monthlyVolume ? (
          <>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div>
                <div className="text-[11px] font-semibold text-dim mb-1">PC</div>
                <div className="text-lg sm:text-2xl font-extrabold font-rank">
                  {typeof monthlyVolume.pc === 'number' ? monthlyVolume.pc.toLocaleString() : monthlyVolume.pc}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-dim mb-1">Mobile</div>
                <div className="text-lg sm:text-2xl font-extrabold font-rank">
                  {typeof monthlyVolume.mobile === 'number' ? monthlyVolume.mobile.toLocaleString() : monthlyVolume.mobile}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-dim mb-1">합계</div>
                <div className="text-lg sm:text-2xl font-extrabold text-accent font-rank">
                  {typeof monthlyVolume.total === 'number' ? monthlyVolume.total.toLocaleString() : monthlyVolume.total}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-dim mt-3">
              최근 한 달간 실제 검색 건수 (PC / Mobile). 네이버 광고 키워드 도구 공식 집계 기준.
            </p>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-dim">
              {monthlyVolumeError || '월간 검색수 데이터가 없습니다.'}
            </p>
          </div>
        )}
      </div>

      {/* 네이버 검색어 트렌드 (데이터랩 실시간) */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-bold">
            검색 트렌드 지수
            <span className="ml-2 text-[11px] font-normal text-dim">최근 90일 · 데이터랩</span>
          </div>
          {naverTrendSummary && naverTrendData.length > 0 && (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                naverTrendSummary.trend_direction === 'up' ? 'text-up bg-up/12' :
                naverTrendSummary.trend_direction === 'down' ? 'text-down bg-down/12' :
                'text-dim bg-dim/12'
              }`}>
                {naverTrendSummary.trend_direction === 'up' ? '▲' : naverTrendSummary.trend_direction === 'down' ? '▼' : '→'}
                {' '}{Math.abs(naverTrendSummary.trend_percentage)}%
              </span>
              {naverTrendSummary.peak_volume > 0 && (
                <span className="text-xs text-dim">최고 지수 {naverTrendSummary.peak_volume}</span>
              )}
            </div>
          )}
        </div>

        {naverTrendLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        ) : naverTrendData.length > 0 ? (
          <>
            <TrendAreaChart data={naverTrendData} direction={naverTrendSummary?.trend_direction || 'stable'} />
            <p className="text-[11px] text-dim mt-3">
              기간 내 검색량의 <strong>상대적 추세</strong>를 0~100으로 정규화한 값(최고점=100). 실제 월간 검색 건수가 아니며, 트렌드 모양 비교용 지수입니다.
            </p>
          </>
        ) : (
          <div className="py-10 text-center">
            <p className="text-sm text-dim">
              {naverTrendError || '네이버 트렌드 데이터가 없습니다.'}
            </p>
          </div>
        )}
      </div>

      {/* TOP 3 인플루언서 카드 */}
      {!rankLoading && top3Rankings.length > 0 && (
        <div className="bg-surface rounded-xl border border-border">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div className="text-sm font-bold">
              TOP 3 인플루언서
              <span className="ml-2 text-xs font-normal text-up bg-up/12 px-2 py-0.5 rounded">LIVE</span>
            </div>
            <span className="text-xs text-dim">네이버 검색 기반</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/30">
            {top3Rankings.map(r => {
              const medalColors = [
                'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
                'text-dim bg-dim/10 border-dim/30',
                'text-amber-700 bg-amber-700/10 border-amber-700/30',
              ];
              const medalLabels = ['1st', '2nd', '3rd'];
              const idx = r.rank_position - 1;
              return (
                <div key={r.id} className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border ${medalColors[idx]}`}>
                      {medalLabels[idx]}
                    </span>
                    <div className="min-w-0 flex-1">
                      {r.naver_id ? (
                        <a href={`https://in.naver.com/${r.naver_id}`} target="_blank" rel="noopener noreferrer"
                          className="font-bold text-sm hover:text-accent transition-colors truncate block">
                          {r.influencer_name}
                        </a>
                      ) : (
                        <span className="font-bold text-sm truncate block">{r.influencer_name}</span>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-dim">
                        {r.naver_id && <span>@{r.naver_id}</span>}
                        {r.fan_count && <span>· {r.fan_count}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-dim mb-1">{r.influencer_category}</div>
                  {r.post_title && (
                    <div className="mt-2 p-2.5 rounded-lg bg-bg/50 border border-border/50">
                      <p className="text-[10px] text-dim font-semibold mb-1">최근 포스트</p>
                      {r.post_url ? (
                        <a href={r.post_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-text hover:text-accent transition-colors line-clamp-2 leading-relaxed">
                          {r.post_title}
                        </a>
                      ) : (
                        <p className="text-xs text-text line-clamp-2 leading-relaxed">{r.post_title}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 전체 인플루언서 순위 */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="text-sm font-bold">
            전체 인플루언서 순위
            <span className="ml-2 text-[11px] font-normal text-dim">{rankings.length}명</span>
          </div>
        </div>

        {rankLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-xs text-dim">순위를 가져오는 중...</p>
            </div>
          </div>
        ) : rankings.length === 0 ? (
          <div className="text-center py-12 text-dim text-sm">
            이 키워드에 대한 인플루언서 순위가 없습니다.
          </div>
        ) : (
          <div>
            {/* Desktop table */}
            <table className="w-full text-sm hidden sm:table">
              <thead>
                <tr className="bg-bg/50 border-b border-border">
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-dim">순위</th>
                  <th className="py-2.5 px-4 text-center text-xs font-semibold text-dim">변동</th>
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-dim">인플루언서</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-dim">카테고리</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-dim">팬 수</th>
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-dim hidden lg:table-cell">최근 포스트</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map(r => (
                  <tr key={r.id} className={`border-b border-border/50 hover:bg-surface-hover transition-colors ${
                    r.rank_position <= 3 ? 'bg-accent/[0.03]' : ''
                  }`}>
                    <td className="py-3 px-4"><RankBadge rank={r.rank_position} size="sm" /></td>
                    <td className="py-3 px-4 text-center">
                      <RankChange change={r.rank_change} />
                    </td>
                    <td className="py-3 px-4">
                      {r.naver_id ? (
                        <a href={`https://in.naver.com/${r.naver_id}`} target="_blank" rel="noopener noreferrer"
                          className="font-semibold hover:text-accent transition-colors">
                          {r.influencer_name}
                        </a>
                      ) : r.influencer_url ? (
                        <a href={r.influencer_url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold hover:text-accent transition-colors">
                          {r.influencer_name}
                        </a>
                      ) : (
                        <span className="font-semibold">{r.influencer_name}</span>
                      )}
                      {r.naver_id && <span className="block text-xs text-dim">@{r.naver_id}</span>}
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-dim">{r.influencer_category}</td>
                    <td className="py-3 px-4 text-right text-xs font-bold font-rank">{r.fan_count || '-'}</td>
                    <td className="py-3 px-4 text-xs text-dim truncate max-w-[200px] hidden lg:table-cell">
                      {r.post_url ? (
                        <a href={r.post_url} target="_blank" rel="noopener noreferrer"
                          className="hover:text-accent transition-colors">
                          {r.post_title || '-'}
                        </a>
                      ) : (
                        r.post_title || '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-border/50">
              {rankings.map(r => (
                <div key={r.id} className={`p-4 flex items-center gap-3 ${
                  r.rank_position <= 3 ? 'bg-accent/[0.03]' : ''
                }`}>
                  <RankBadge rank={r.rank_position} size="sm" />
                  <div className="flex-1 min-w-0">
                    {r.naver_id ? (
                      <a href={`https://in.naver.com/${r.naver_id}`} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-sm truncate block hover:text-accent">
                        {r.influencer_name}
                      </a>
                    ) : r.influencer_url ? (
                      <a href={r.influencer_url} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-sm truncate block hover:text-accent">
                        {r.influencer_name}
                      </a>
                    ) : (
                      <p className="font-semibold text-sm truncate">{r.influencer_name}</p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-dim">
                      <span>{r.influencer_category}</span>
                      <span>·</span>
                      <span>{r.fan_count || '팬 정보 없음'}</span>
                      <RankChange change={r.rank_change} />
                    </div>
                    {r.post_title && (
                      <p className="text-[11px] text-dim mt-1 truncate">
                        {r.post_url ? (
                          <a href={r.post_url} target="_blank" rel="noopener noreferrer"
                            className="hover:text-accent transition-colors">
                            {r.post_title}
                          </a>
                        ) : (
                          r.post_title
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RankChange({ change }: { change?: number }) {
  if (!change || change === 0) return <span className="text-dim text-xs">-</span>;
  if (change > 0) {
    return <span className="text-up text-xs font-bold">▲{change}</span>;
  }
  return <span className="text-down text-xs font-bold">▼{Math.abs(change)}</span>;
}
