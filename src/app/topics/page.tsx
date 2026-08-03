'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCountK } from '@/lib/format';

interface NaverTopicItem {
  id: string;
  blog_id: string;
  title: string | null;
  thumbnail_url: string | null;
  content_count: number;
  topic_subject: string | null;
  topic_subject_category: string | null;
  total_view_count: number;
}

interface Recommendation {
  id: string;
  suggested_name: string;
  topic_subject_category: string | null;
  representative_keywords: string[];
  estimated_post_count: number;
  reasoning: string | null;
}

interface SummaryResponse {
  myTopicCount: number;
  publishedCount: number;
  aiPossibleCount: number;
  utilizationRate: number;
  generatedAt: string | null;
  competitor: { count: number; avg: number | null; top: number | null };
  recommendations: Recommendation[];
}

interface MatchedPost {
  post_id: string;
  title: string | null;
  url: string;
  view_count: number | null;
  published_at: string | null;
}

export default function TopicsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [naverTopics, setNaverTopics] = useState<NaverTopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authHeaders, setAuthHeaders] = useState<Record<string, string> | null>(null);

  const [expandedRecId, setExpandedRecId] = useState<string | null>(null);
  const [loadingRecId, setLoadingRecId] = useState<string | null>(null);
  const [matchedPostsByRecId, setMatchedPostsByRecId] = useState<Record<string, MatchedPost[]>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace(`/auth/login?redirect=${encodeURIComponent('/topics')}`);
          return;
        }
        const headers = { authorization: `Bearer ${session.access_token}` };
        setAuthHeaders(headers);
        const [summaryRes, naverRes] = await Promise.all([
          fetch('/api/blog/topics/summary', { headers }),
          fetch('/api/naver-topics', { headers }),
        ]);
        if (summaryRes.status === 401 || naverRes.status === 401) {
          router.replace(`/auth/login?redirect=${encodeURIComponent('/topics')}`);
          return;
        }
        if (!summaryRes.ok) {
          const j = await summaryRes.json().catch(() => ({}));
          throw new Error(j.error || `요약 정보를 불러오지 못했습니다. (HTTP ${summaryRes.status})`);
        }
        if (!naverRes.ok) {
          const j = await naverRes.json().catch(() => ({}));
          throw new Error(j.error || `발행 토픽을 불러오지 못했습니다. (HTTP ${naverRes.status})`);
        }
        setSummary(await summaryRes.json());
        const naverJson = await naverRes.json();
        setNaverTopics(naverJson.topics || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const utilizationPercent = useMemo(() => {
    if (!summary) return 0;
    return Math.round(summary.utilizationRate * 100);
  }, [summary]);

  const unusedCount = useMemo(() => {
    if (!summary) return 0;
    return Math.max(0, summary.aiPossibleCount - summary.publishedCount);
  }, [summary]);

  const handleToggleRec = async (recId: string) => {
    if (expandedRecId === recId) {
      setExpandedRecId(null);
      return;
    }
    setExpandedRecId(recId);
    if (matchedPostsByRecId[recId] || !authHeaders) return;
    setLoadingRecId(recId);
    try {
      const res = await fetch(`/api/blog/topics/${recId}`, { headers: authHeaders });
      if (res.ok) {
        const json = await res.json();
        setMatchedPostsByRecId(prev => ({ ...prev, [recId]: json.posts || [] }));
      }
    } catch {
      // 매칭 글 목록 조회 실패는 조용히 무시 — 카드 자체(이름/개수)는 이미 표시돼 있음
    } finally {
      setLoadingRecId(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text">토픽</h1>
          <p className="text-sm text-dim mt-1">
            네이버에 실제 발행한 토픽과, 아직 토픽으로 묶이지 않은 글을 AI가 찾아 추천해드려요. 매일 자동으로 수집·분석해 반영합니다.
          </p>
        </div>

        {loading && <div className="p-12 text-center text-dim">불러오는 중…</div>}
        {error && !loading && (
          <div className="p-6 rounded-xl bg-down/10 border border-down/30 text-down text-sm">{error}</div>
        )}

        {!loading && !error && summary && (
          <>
            {/* 요약 섹션 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
              <div className="p-4 rounded-2xl bg-surface border border-border">
                <p className="text-xs text-dim">전체 토픽</p>
                <p className="text-xl font-bold text-text mt-1">{summary.publishedCount}</p>
              </div>
              <div className="p-4 rounded-2xl bg-surface border border-border">
                <p className="text-xs text-dim">AI 토픽</p>
                <p className="text-xl font-bold text-text mt-1">{summary.aiPossibleCount}</p>
              </div>
              <div className="p-4 rounded-2xl bg-surface border border-border">
                <p className="text-xs text-dim">토픽 활용률</p>
                <p className="text-xl font-bold text-accent mt-1">{utilizationPercent}%</p>
              </div>
              <div className="p-4 rounded-2xl bg-surface border border-border">
                <p className="text-xs text-dim">AI 추천 토픽</p>
                <p className="text-xl font-bold text-text mt-1">{summary.recommendations.length}</p>
              </div>
              <div className="p-4 rounded-2xl bg-surface border border-border">
                <p className="text-xs text-dim">경쟁 비교</p>
                {summary.competitor.count > 0 ? (
                  <p className="text-sm font-semibold text-text mt-1">
                    나 {summary.myTopicCount} · 평균 {summary.competitor.avg?.toFixed(1)} · 상위 {summary.competitor.top}
                  </p>
                ) : (
                  <p className="text-xs text-dim mt-1">등록된 경쟁자 없음</p>
                )}
              </div>
            </div>

            {summary.aiPossibleCount > 0 && (
              <div className="mb-8 p-4 rounded-xl bg-accent/5 border border-accent/20 text-sm text-text">
                💡 아직 활용하지 않은 토픽이 <span className="font-bold">{unusedCount}개</span> 있습니다.
              </div>
            )}

            {/* ① 내 토픽 — 네이버에 실제 발행됨 */}
            <h2 className="text-sm font-bold text-dim mb-3">내 토픽 — 네이버에 실제 발행됨</h2>
            {naverTopics.length === 0 ? (
              <div className="p-8 mb-8 text-center text-dim text-sm rounded-xl bg-surface border border-border">
                아직 수집된 발행 토픽이 없습니다. 매일 자동으로 수집하니 하루 정도 기다려 주세요.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                {naverTopics.map(topic => (
                  <Link
                    key={topic.id}
                    href={`/topics/naver/${topic.id}`}
                    className="group p-4 rounded-2xl bg-surface border border-border hover:border-accent/40 hover:shadow-sm transition-all flex gap-4"
                  >
                    {topic.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={topic.thumbnail_url}
                        alt=""
                        className="w-20 h-20 rounded-xl object-cover border border-border flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-bg border border-border flex items-center justify-center text-dim text-2xl flex-shrink-0">
                        📚
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-text group-hover:text-accent transition truncate">{topic.title || '(제목 없음)'}</h3>
                      {topic.topic_subject_category && (
                        <p className="text-xs text-dim mt-1">{topic.topic_subject_category}{topic.topic_subject ? ` · ${topic.topic_subject}` : ''}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-dim">
                        <span>글 {formatCountK(topic.content_count)}개</span>
                        <span>조회 {formatCountK(topic.total_view_count)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* ② AI 추천 토픽 — 아직 토픽으로 묶이지 않은 글 */}
            <div>
              <h2 className="text-sm font-bold text-dim mb-3">AI 추천 토픽 — 아직 토픽으로 묶이지 않은 글</h2>
              {summary.recommendations.length === 0 ? (
                <div className="p-8 text-center text-dim text-sm rounded-xl bg-surface border border-border">
                  아직 추천할 토픽이 없습니다. 매일 자동으로 분석하니 하루 정도 기다려 주세요.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {summary.recommendations.map(rec => {
                    const isExpanded = expandedRecId === rec.id;
                    const matchedPosts = matchedPostsByRecId[rec.id];
                    return (
                      <div
                        key={rec.id}
                        className="p-4 rounded-xl bg-accent/5 border border-accent/20 text-sm text-text"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            ✨ <span className="font-semibold">{rec.suggested_name}</span>
                            {rec.topic_subject_category && <span className="text-xs text-dim ml-1">({rec.topic_subject_category})</span>}
                          </span>
                          <span className="text-xs text-dim flex-shrink-0">예상 콘텐츠 {rec.estimated_post_count}개</span>
                        </div>
                        {rec.representative_keywords.length > 0 && (
                          <p className="text-xs text-dim mt-1">{rec.representative_keywords.slice(0, 5).join(' · ')}</p>
                        )}
                        <button
                          onClick={() => handleToggleRec(rec.id)}
                          className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-accent text-white hover:bg-accent/90 transition"
                        >
                          {isExpanded ? '접기' : '토픽 만들기'}
                        </button>
                        {isExpanded && (
                          <div className="mt-3 border-t border-accent/20 pt-3">
                            {rec.reasoning && <p className="text-xs text-dim mb-2">{rec.reasoning}</p>}
                            {loadingRecId === rec.id ? (
                              <p className="text-xs text-dim">글 목록 불러오는 중…</p>
                            ) : matchedPosts && matchedPosts.length > 0 ? (
                              <>
                                <p className="text-xs text-dim mb-1.5">아래 글들을 네이버에서 토픽으로 묶어 발행해보세요.</p>
                                <ul className="space-y-1">
                                  {matchedPosts.map(p => (
                                    <li key={p.post_id}>
                                      <a
                                        href={p.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-accent hover:underline truncate block"
                                      >
                                        {p.title || p.url}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p className="text-xs text-dim">매칭된 글을 찾지 못했습니다.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
