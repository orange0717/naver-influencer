'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCountK, formatDate } from '@/lib/format';

interface NaverTopicItem {
  id: string;
  blog_id: string;
  title: string | null;
  thumbnail_url: string | null;
  content_count: number;
  topic_subject: string | null;
  topic_subject_category: string | null;
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

type TopicType = 'genre' | 'author' | 'publisher' | 'brand' | 'business' | 'region' | 'keyword';

const TOPIC_TYPE_TABS: { value: TopicType | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'genre', label: '장르' },
  { value: 'author', label: '작가/인물' },
  { value: 'publisher', label: '출판사' },
  { value: 'brand', label: '브랜드' },
  { value: 'business', label: '업체' },
  { value: 'region', label: '지역' },
  { value: 'keyword', label: '키워드' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'posts', label: '게시글 많은순' },
  { value: 'views', label: '조회수순' },
  { value: 'name', label: '이름순' },
];

interface AiTopicItem {
  id: string;
  topicType: TopicType;
  name: string;
  representativeKeywords: string[];
  thumbnailUrl: string | null;
  postCount: number;
  totalViewCount: number;
  lastPostAt: string | null;
  expertiseScore?: number | null;
  childCount?: number;
}

export default function TopicsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [naverTopics, setNaverTopics] = useState<NaverTopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRecId, setExpandedRecId] = useState<string | null>(null);
  const [authHeaders, setAuthHeaders] = useState<Record<string, string> | null>(null);

  const [aiTopics, setAiTopics] = useState<AiTopicItem[]>([]);
  const [aiTopicsLoading, setAiTopicsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TopicType | 'all'>('all');
  const [sort, setSort] = useState('latest');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

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

  // 검색어 입력 디바운스
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    if (!authHeaders) return;
    const load = async () => {
      setAiTopicsLoading(true);
      try {
        const params = new URLSearchParams({ sort });
        if (typeFilter !== 'all') params.set('type', typeFilter);
        if (q) params.set('q', q);
        const res = await fetch(`/api/blog/topics?${params.toString()}`, { headers: authHeaders });
        if (res.ok) {
          const json = await res.json();
          setAiTopics(json.topics || []);
        }
      } catch {
        // 목록 갱신 실패는 조용히 무시(요약/발행 토픽 섹션은 이미 표시됨)
      } finally {
        setAiTopicsLoading(false);
      }
    };
    load();
  }, [authHeaders, typeFilter, sort, q]);

  const utilizationPercent = useMemo(() => {
    if (!summary) return 0;
    return Math.round(summary.utilizationRate * 100);
  }, [summary]);

  const unusedCount = useMemo(() => {
    if (!summary) return 0;
    return Math.max(0, summary.aiPossibleCount - summary.publishedCount);
  }, [summary]);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text">토픽</h1>
          <p className="text-sm text-dim mt-1">
            네이버에 발행한 토픽과 AI 분석 결과를 함께 보여줘요. 매일 자동으로 수집·분석해 반영합니다.
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

            {/* AI 자동 생성 토픽 — 장르/작가/출판사/브랜드/업체/지역/키워드 다차원 클러스터링 */}
            <div className="mb-8">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-sm font-bold text-dim">AI가 자동 생성한 토픽</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="flex flex-wrap gap-1.5">
                  {TOPIC_TYPE_TABS.map(tab => (
                    <button
                      key={tab.value}
                      onClick={() => setTypeFilter(tab.value)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                        typeFilter === tab.value
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface border-border text-dim hover:border-accent/40'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <input
                  type="text"
                  value={qInput}
                  onChange={e => setQInput(e.target.value)}
                  placeholder="토픽 검색"
                  className="text-sm px-3 py-1.5 rounded-full border border-border bg-surface text-text placeholder:text-dim focus:outline-none focus:border-accent/50 w-40"
                />
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-full border border-border bg-surface text-text focus:outline-none focus:border-accent/50"
                >
                  {SORT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {aiTopicsLoading ? (
                <div className="p-8 text-center text-dim text-sm rounded-xl bg-surface border border-border">불러오는 중…</div>
              ) : aiTopics.length === 0 ? (
                <div className="p-8 text-center text-dim text-sm rounded-xl bg-surface border border-border">
                  아직 생성된 토픽이 없습니다. 매일 자동으로 분석하니 하루 정도 기다려 주세요.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {aiTopics.map(t => (
                    <Link
                      key={t.id}
                      href={`/topics/${t.id}`}
                      className="group p-4 rounded-2xl bg-surface border border-border hover:border-accent/40 hover:shadow-sm transition-all flex gap-4"
                    >
                      {t.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.thumbnailUrl}
                          alt=""
                          className="w-20 h-20 rounded-xl object-cover border border-border flex-shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-bg border border-border flex items-center justify-center text-dim text-2xl flex-shrink-0">
                          🏷️
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-text group-hover:text-accent transition truncate">{t.name}</h3>
                          {typeof t.expertiseScore === 'number' && (
                            <span className="flex-shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-accent/10 text-accent">
                              전문성 {t.expertiseScore}점
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-dim mt-1">
                          {TOPIC_TYPE_TABS.find(tab => tab.value === t.topicType)?.label || t.topicType}
                          {t.childCount ? ` · 소분류 ${t.childCount}개` : ''}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-dim">
                          <span>게시글 {formatCountK(t.postCount)}개</span>
                          {t.lastPostAt && <span>최근 발행 {formatDate(t.lastPostAt)}</span>}
                        </div>
                        {t.representativeKeywords.length > 0 && (
                          <p className="text-xs text-dim mt-1.5 truncate">{t.representativeKeywords.slice(0, 4).join(' · ')}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* 네이버에 실제 발행된 토픽 */}
            <h2 className="text-sm font-bold text-dim mb-3">네이버에 실제 발행된 토픽</h2>
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
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* AI 추천 토픽 */}
            {summary.recommendations.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-dim mb-3">AI 추천 토픽 (아직 발행하지 않음)</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {summary.recommendations.map(rec => (
                    <button
                      key={rec.id}
                      onClick={() => setExpandedRecId(expandedRecId === rec.id ? null : rec.id)}
                      className="text-left p-4 rounded-xl bg-accent/5 border border-accent/20 text-sm text-text hover:border-accent/40 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          ✨ <span className="font-semibold">{rec.suggested_name}</span>
                          {rec.topic_subject_category && <span className="text-xs text-dim ml-1">({rec.topic_subject_category})</span>}
                        </span>
                        <span className="text-xs text-dim flex-shrink-0">글 {rec.estimated_post_count}개</span>
                      </div>
                      {rec.representative_keywords.length > 0 && (
                        <p className="text-xs text-dim mt-1">{rec.representative_keywords.slice(0, 5).join(' · ')}</p>
                      )}
                      {expandedRecId === rec.id && rec.reasoning && (
                        <p className="text-xs text-dim mt-2 border-t border-accent/20 pt-2">{rec.reasoning}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
