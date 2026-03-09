'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import RankBadge from '@/components/RankBadge';

interface KeywordDetail {
  id: string;
  keyword: string;
  category: string;
  participant_count: number;
  competition_level: string;
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
  rank_change: number;
}

export default function KeywordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [keyword, setKeyword] = useState<KeywordDetail | null>(null);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
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
        <Link href="/keywords" className="text-accent text-sm hover:underline mt-2 inline-block">← 키워드 목록</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/keywords" className="text-xs text-accent font-bold hover:underline">← 키워드 목록</Link>

      {/* 헤더 */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold mb-1">{keyword.keyword}</h1>
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

      {/* 실시간 인플루언서 순위 */}
      <div className="bg-surface rounded-xl border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="text-sm font-bold">
            실시간 인플루언서 순위
            <span className="ml-2 text-xs font-normal text-up bg-up/12 px-2 py-0.5 rounded">LIVE</span>
          </div>
          <span className="text-xs text-dim">네이버 검색 기반</span>
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
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-dim">인플루언서</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-dim">카테고리</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-dim">팬 수</th>
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-dim hidden lg:table-cell">최근 포스트</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map(r => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-4"><RankBadge rank={r.rank_position} size="sm" /></td>
                    <td className="py-3 px-4">
                      {r.influencer_url ? (
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
                    <td className="py-3 px-4 text-xs text-dim truncate max-w-[200px] hidden lg:table-cell">{r.post_title || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-border/50">
              {rankings.map(r => (
                <div key={r.id} className="p-4 flex items-center gap-3">
                  <RankBadge rank={r.rank_position} size="sm" />
                  <div className="flex-1 min-w-0">
                    {r.influencer_url ? (
                      <a href={r.influencer_url} target="_blank" rel="noopener noreferrer"
                        className="font-semibold text-sm truncate block hover:text-accent">
                        {r.influencer_name}
                      </a>
                    ) : (
                      <p className="font-semibold text-sm truncate">{r.influencer_name}</p>
                    )}
                    <p className="text-xs text-dim">{r.influencer_category} · {r.fan_count || '팬 정보 없음'}</p>
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
