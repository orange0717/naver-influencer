'use client';

import { use, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import RankBadge from '@/components/RankBadge';
import { TOPIC_TYPE_LABEL } from '@/lib/topic-labels';
import { CHALLENGE_TOP3_TOOLTIP } from '@/lib/keyword/aggregate';

interface InfluencerKeyword {
  keyword_id: string;
  id?: string;
  keyword: string;
  category: string;
  participant_count?: number;
  search_volume_monthly?: number;
  rank_position?: number;
  rank_change?: number;
  is_integrated_top3?: boolean;
}

interface InfluencerData {
  id: string;
  naver_id: string;
  display_name: string;
  category: string;
  sub_category?: string;
  image_url?: string;
  total_follower_count?: number;
  subscriber_count?: number;
  total_keywords?: number;
  avg_rank?: number;
  best_rank?: number;
  integrated_top3_count?: number;
  keyword_score?: number;
  ad_fee_amount?: number | null;
  ad_fee_text?: string | null;
  ad_process?: string | null;
  last_crawled_at?: string | null;
  last_challenged_at?: string | null;
  keywords: InfluencerKeyword[];
  recent_rankings: unknown[];
  is_member?: boolean;
  topic_profile?: {
    specialties: string[];
    representativeTopic: string | null;
    activeTopics: { name: string; topicType: string; postCount: number }[];
    representativeKeywords: string[];
    challengeTop3Count: number;
    avgIntegratedRank: number | null;
    avgBlogRank: number | null;
  } | null;
}

function formatRank(rank: number | null): string {
  return rank === null ? '-' : `${rank.toFixed(1)}위`;
}

function formatRelativeTime(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return '방금 전';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

export default function InfluencerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [influencer, setInfluencer] = useState<InfluencerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [kwSearch, setKwSearch] = useState('');
  const [kwCategory, setKwCategory] = useState('전체');

  useEffect(() => {
    const controller = new AbortController();
    async function loadInfluencer() {
      try {
        const res = await fetch(`/api/influencers/${encodeURIComponent(id)}`, { signal: controller.signal });
        if (!res.ok) {
          setError(true);
          return;
        }
        const data = await res.json();
        setInfluencer(data.influencer);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadInfluencer();
    return () => controller.abort();
  }, [id]);

  const keywords = influencer?.keywords || [];
  const totalKeywords = influencer?.total_keywords || keywords.length;

  // 카테고리 목록 추출 (Hooks는 조건부 return 전에 호출)
  const kwCategories = useMemo(() => {
    const cats = [...new Set(keywords.map(k => k.category).filter(Boolean))];
    return ['전체', ...cats.sort()];
  }, [keywords]);

  // 검색 + 카테고리 필터링
  const filteredKeywords = useMemo(() => {
    let list = [...keywords];
    if (kwCategory !== '전체') {
      list = list.filter(k => k.category === kwCategory);
    }
    if (kwSearch.trim()) {
      const q = kwSearch.trim().toLowerCase();
      list = list.filter(k => k.keyword.toLowerCase().includes(q));
    }
    return list;
  }, [keywords, kwCategory, kwSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-dim">인플루언서 정보를 가져오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !influencer) {
    return (
      <div className="text-center mt-12 space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-down/15 flex items-center justify-center text-down text-xl font-bold">?</div>
        <p className="font-bold">인플루언서를 찾을 수 없습니다</p>
        <Link href="/keywords" className="text-accent text-sm">← 키워드 목록으로</Link>
      </div>
    );
  }
  const avgRank = influencer.avg_rank || (keywords.length > 0
    ? Math.round(keywords.reduce((sum, k) => sum + (k.rank_position || 0), 0) / (keywords.filter(k => k.rank_position).length || 1))
    : '-');
  const bestRank = influencer.best_rank || (keywords.length > 0 && keywords.some(k => k.rank_position)
    ? Math.min(...keywords.filter(k => k.rank_position).map(k => k.rank_position!))
    : '-');
  const top3Count = influencer.integrated_top3_count || keywords.filter(k => k.is_integrated_top3).length;

  return (
    <div className="space-y-6">
      <Link href="/keywords" className="text-xs text-accent font-bold hover:underline">← 키워드 목록</Link>

      {/* 프로필 헤더 */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <div className="flex items-center gap-4">
          {influencer.image_url ? (
            <Image
              src={influencer.image_url}
              alt={influencer.display_name}
              width={64}
              height={64}
              className="w-16 h-16 rounded-full object-cover border-2 border-accent/30"
            />
          ) : (
            <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center text-2xl font-bold text-accent">
              {influencer.display_name?.[0] || '?'}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="type-page-title">{influencer.display_name}</h1>
              {influencer.is_member && (
                <span className="text-[10px] font-bold text-accent bg-accent/12 px-2 py-0.5 rounded" title="N인플 인증 회원">N인플 회원</span>
              )}
            </div>
            <p className="text-sm text-dim">{influencer.sub_category || influencer.category}</p>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-dim items-center">
              {((influencer.subscriber_count || influencer.total_follower_count || 0) > 0) && (
                <span>팬 {(influencer.subscriber_count || influencer.total_follower_count || 0).toLocaleString()}</span>
              )}
              <a
                href={`https://in.naver.com/${influencer.naver_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                @{influencer.naver_id}
              </a>
              {(() => {
                const primary = influencer.last_challenged_at || influencer.last_crawled_at;
                const rel = formatRelativeTime(primary);
                if (!rel) return null;
                const isChallenge = Boolean(influencer.last_challenged_at);
                // 깜빡이는 점은 "지금 살아 있다"는 신호로 읽힌다. 2년 전 기록 옆에서 깜빡이면
                // 사실이 아닌 최신성을 알려주는 것이다 — 최근 것일 때만 깜빡인다.
                const primaryMs = primary ? new Date(primary).getTime() : NaN;
                const isRecent = Number.isFinite(primaryMs)
                  && Date.now() - primaryMs < 7 * 24 * 60 * 60 * 1000;
                return (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      isChallenge ? 'text-accent bg-accent/10' : 'text-dim bg-surface-hover'
                    }`}
                    title={
                      isChallenge
                        ? `챌린지 참여 기준: ${new Date(influencer.last_challenged_at!).toLocaleString('ko-KR')}`
                        : `순위 수집 시각만 확인됨: ${influencer.last_crawled_at ? new Date(influencer.last_crawled_at).toLocaleString('ko-KR') : ''}`
                    }
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isChallenge ? 'bg-accent' : 'bg-dim/50'}${isRecent ? ' animate-pulse' : ''}`} />
                    {isChallenge ? '챌린지 ' : '수집 '}
                    {rel}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <p className="text-lg font-bold text-accent font-rank">
              {influencer.keyword_score && influencer.keyword_score > 0
                ? influencer.keyword_score >= 100_000_000
                  ? (influencer.keyword_score / 100_000_000).toFixed(1).replace(/\.0$/, '') + '억'
                  : influencer.keyword_score >= 10_000
                    ? (influencer.keyword_score / 10_000).toFixed(0) + '만'
                    : influencer.keyword_score.toLocaleString()
                : '-'}
            </p>
            <p className="text-xs text-dim">키워드 점수</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-accent font-rank">{totalKeywords}</p>
            <p className="text-xs text-dim">참여 키워드</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-rank">{avgRank}</p>
            <p className="text-xs text-dim">평균 순위</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-up font-rank">{bestRank}</p>
            <p className="text-xs text-dim">최고 순위</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gold font-rank">{top3Count}</p>
            {/* '통합 TOP3' 는 사실이 아니다 — is_integrated_top3 는 세 writer 전부 rank<=3 으로만
                쓴다(통합검색과 무관). 통합검색 노출로 읽히면 없는 성과를 알려주는 것이 된다. */}
            <p className="text-xs text-dim" title={CHALLENGE_TOP3_TOOLTIP}>챌린지 TOP3</p>
          </div>
          <div className="text-center">
            {(() => {
              const t3 = top3Count || 0;
              const total = totalKeywords || 0;
              if (t3 > 0 && total > 0) {
                const ratio = Math.min(t3 / total, 1);
                return (
                  <p className={`text-lg font-bold font-rank ${ratio >= 0.5 ? 'text-gold' : ratio >= 0.3 ? 'text-up' : 'text-dim'}`}>
                    {(ratio * 100).toFixed(1)}%
                  </p>
                );
              }
              return <p className="text-lg font-bold font-rank text-dim">-</p>;
            })()}
            <p className="text-xs text-dim">TOP3 비율</p>
          </div>
        </div>
      </div>

      {/* 광고 프로필 */}
      {(influencer.ad_fee_amount || influencer.ad_fee_text || influencer.ad_process) && (
        <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            <h3 className="font-bold text-sm">광고 문의</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(influencer.ad_fee_amount || influencer.ad_fee_text) && (
              <div className="space-y-1">
                <p className="text-xs text-dim font-semibold">원고료</p>
                {influencer.ad_fee_amount ? (
                  <p className="text-lg font-bold text-accent font-rank">
                    {influencer.ad_fee_amount.toLocaleString()}원
                  </p>
                ) : null}
                {influencer.ad_fee_text && (
                  <p className="text-sm text-text">{influencer.ad_fee_text}</p>
                )}
              </div>
            )}
            {influencer.ad_process && (
              <div className="space-y-1">
                <p className="text-xs text-dim font-semibold">진행방법</p>
                <p className="text-sm text-text whitespace-pre-line">{influencer.ad_process}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 전문 분야 · 대표 토픽 (광고주 공개 정보) */}
      {influencer.topic_profile && influencer.topic_profile.activeTopics.length > 0 && (
        <div className="bg-surface rounded-lg border border-border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
              <path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82z" />
              <circle cx="7.5" cy="7.5" r="1.5" />
            </svg>
            <h3 className="font-bold text-sm">전문 분야 · 대표 토픽</h3>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {influencer.topic_profile.specialties.map(s => (
              <span key={s} className="text-[11px] px-2.5 py-1 rounded-full bg-accent/10 text-accent font-semibold">
                {TOPIC_TYPE_LABEL[s] || s}
              </span>
            ))}
          </div>

          {influencer.topic_profile.representativeTopic && (
            <div className="flex items-center gap-2 py-1">
              <span className="text-gold text-lg">★</span>
              <div>
                <p className="text-[11px] text-dim">대표 토픽</p>
                <p className="text-sm font-bold">{influencer.topic_profile.representativeTopic}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-3 border-y border-border py-3">
            <div>
              <p className="text-[11px] text-dim font-medium mb-1">활동 토픽</p>
              <p className="text-base font-bold font-rank">{influencer.topic_profile.activeTopics.length}개</p>
            </div>
            <div>
              <p className="text-[11px] text-dim font-medium mb-1">챌린지 TOP3</p>
              <p className="text-base font-bold font-rank">{influencer.topic_profile.challengeTop3Count}개</p>
            </div>
            <div>
              <p className="text-[11px] text-dim font-medium mb-1">통합검색 평균</p>
              <p className="text-base font-bold font-rank">{formatRank(influencer.topic_profile.avgIntegratedRank)}</p>
            </div>
            <div>
              <p className="text-[11px] text-dim font-medium mb-1">블로그탭 평균</p>
              <p className="text-base font-bold font-rank">{formatRank(influencer.topic_profile.avgBlogRank)}</p>
            </div>
          </div>

          {influencer.topic_profile.representativeKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {influencer.topic_profile.representativeKeywords.map(k => (
                <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-bg text-dim border border-border">{k}</span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {influencer.topic_profile.activeTopics.map(t => (
              <span key={t.name} className="text-xs px-2.5 py-1 rounded-full bg-bg text-text border border-border font-medium">
                {t.name} <span className="text-dim">· {t.postCount}건</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 참여 키워드 */}
      <div className="relative">
        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          {/* 헤더 + 검색 + 카테고리 드롭다운 */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-sm">참여 키워드 목록</h2>
              <span className="text-xs text-dim font-rank">
                {filteredKeywords.length !== keywords.length
                  ? `${filteredKeywords.length} / ${keywords.length}개`
                  : `${keywords.length}개`}
              </span>
            </div>
            {keywords.length > 0 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="키워드 검색..."
                  value={kwSearch}
                  onChange={e => setKwSearch(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-1.5 bg-bg border border-border rounded-lg text-xs text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
                />
                <select
                  value={kwCategory}
                  onChange={e => setKwCategory(e.target.value)}
                  className="px-3 py-1.5 bg-bg border border-border rounded-lg text-xs font-medium text-text focus:outline-none focus:border-accent transition-colors shrink-0"
                >
                  {kwCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {keywords.length === 0 ? (
            <div className="text-center py-12 text-dim text-sm">
              참여 키워드 정보가 없습니다.
            </div>
          ) : filteredKeywords.length === 0 ? (
            <div className="text-center py-12 text-dim text-sm">
              검색 결과가 없습니다.
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="w-full text-sm hidden sm:table">
                <thead>
                  <tr className="border-b border-border bg-bg/50">
                    <th className="text-left p-3 font-semibold text-dim text-xs">키워드</th>
                    <th className="text-center p-3 font-semibold text-dim text-xs w-14">순위</th>
                    <th className="text-center p-3 font-semibold text-dim text-xs w-14">변동</th>
                    <th className="text-right p-3 font-semibold text-dim text-xs w-20">참여자</th>
                    <th className="text-right p-3 font-semibold text-dim text-xs w-24 hidden md:table-cell">검색량</th>
                    <th className="text-center p-3 font-semibold text-dim text-xs w-14" title={CHALLENGE_TOP3_TOOLTIP}>TOP3</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeywords.map((kw) => (
                    <tr key={kw.keyword_id || kw.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                      <td className="p-3">
                        <Link href={`/keywords/${kw.keyword_id || kw.id}`} className="font-medium hover:text-accent transition-colors">{kw.keyword}</Link>
                        <span className="text-xs text-dim ml-2">{kw.category}</span>
                      </td>
                      <td className="text-center p-3">
                        {kw.rank_position ? <RankBadge rank={kw.rank_position} size="sm" /> : <span className="text-dim">-</span>}
                      </td>
                      <td className="text-center p-3">
                        <RankChange change={kw.rank_change} />
                      </td>
                      <td className="text-right p-3 text-dim font-rank">{kw.participant_count ? `${kw.participant_count}명` : '-'}</td>
                      <td className="text-right p-3 font-medium hidden md:table-cell font-rank">
                        {kw.search_volume_monthly ? kw.search_volume_monthly.toLocaleString() : '-'}
                      </td>
                      <td className="text-center p-3">{kw.is_integrated_top3 && <span className="text-gold" title={CHALLENGE_TOP3_TOOLTIP}>T3</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border/50">
                {filteredKeywords.map((kw) => (
                  <Link key={kw.keyword_id || kw.id} href={`/keywords/${kw.keyword_id || kw.id}`} className="block p-4 hover:bg-surface-hover transition">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium text-sm">{kw.keyword}</span>
                        <span className="text-xs text-dim ml-2">{kw.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <RankChange change={kw.rank_change} />
                        {kw.is_integrated_top3 && <span className="text-gold text-sm" title={CHALLENGE_TOP3_TOOLTIP}>T3</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-center">
                      <div>
                        {kw.rank_position ? <RankBadge rank={kw.rank_position} size="sm" /> : <span className="text-dim">-</span>}
                        <p className="text-[10px] text-dim mt-1">순위</p>
                      </div>
                      <div>
                        <p className="font-rank text-dim">{kw.participant_count ? `${kw.participant_count}명` : '-'}</p>
                        <p className="text-[10px] text-dim">참여자</p>
                      </div>
                      <div>
                        <p className="font-rank font-medium">
                          {kw.search_volume_monthly ? `${(kw.search_volume_monthly / 1000).toFixed(0)}K` : '-'}
                        </p>
                        <p className="text-[10px] text-dim">검색량</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

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
