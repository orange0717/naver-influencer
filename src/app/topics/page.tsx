'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCountK } from '@/lib/format';
import { computeTopicFit } from '@/lib/topic-fit';

/** 관련 글이 이 수 미만이면 "조금 더 작성하면 좋은 토픽"으로 분리한다(스펙 20항) */
const MIN_GOOD_POSTS = 4;

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
  /** 매칭 글들의 대표 썸네일(최대 4장, null 제외) — 서버 보강 */
  thumbnails: string[];
  /** 적합도(%) = 대표 키워드를 담은 글 비율. 측정 불가 시 null — 서버 보강 */
  fitScore: number | null;
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
  thumbnail_url: string | null;
  tags: string[];
}

/** 대표 썸네일 가로 스택 — [사진][사진][사진][+N] (스펙 18항) */
function ThumbnailStack({ thumbnails, total }: { thumbnails: string[]; total: number }) {
  const shown = thumbnails.slice(0, 3);
  const extra = Math.max(0, total - shown.length);
  if (shown.length === 0) {
    return (
      <div className="w-14 h-14 rounded-lg bg-bg border border-border flex items-center justify-center text-dim text-xl shrink-0">
        📚
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {shown.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />
      ))}
      {extra > 0 && (
        <div className="w-14 h-14 rounded-lg bg-bg border border-border flex items-center justify-center text-dim text-xs font-bold shrink-0">
          +{extra}
        </div>
      )}
    </div>
  );
}

function FitBadge({ fit }: { fit: number | null }) {
  if (fit === null) return null;
  const tone = fit >= 70 ? 'text-up' : fit >= 40 ? 'text-accent' : 'text-dim';
  return (
    <span className={`font-bold ${tone}`}>적합도 {fit}%</span>
  );
}

/**
 * AI 추천 토픽 카드 — 자체적으로 매칭 글을 지연 로드하고, 사용자가 글을 직접 선택/제외하면
 * 적합도를 즉시 재계산한다(스펙 18·19항). variant='insufficient'는 관련 글이 부족한 후보(스펙 20항).
 */
function RecCard({
  rec,
  authHeaders,
  variant,
}: {
  rec: Recommendation;
  authHeaders: Record<string, string> | null;
  variant: 'good' | 'insufficient';
}) {
  const [expanded, setExpanded] = useState(false);
  const [posts, setPosts] = useState<MatchedPost[] | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadPosts = async () => {
    if (posts || !authHeaders) return;
    setLoadingPosts(true);
    try {
      const res = await fetch(`/api/blog/topics/${rec.id}`, { headers: authHeaders });
      if (res.ok) {
        const json = await res.json();
        const loaded: MatchedPost[] = json.posts || [];
        setPosts(loaded);
        setSelectedIds(new Set(loaded.map((p) => p.post_id))); // 기본은 전체 선택
      } else {
        setPosts([]);
      }
    } catch {
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadPosts();
  };

  const togglePost = (postId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  // 선택된 글 기준으로 적합도 실시간 재계산(스펙 19항). 아직 안 펼쳤으면 서버 계산값 사용.
  const liveFit = useMemo(() => {
    if (!posts) return rec.fitScore;
    const selected = posts.filter((p) => selectedIds.has(p.post_id));
    return computeTopicFit(rec.representative_keywords, selected.map((p) => ({ title: p.title, tags: p.tags })));
  }, [posts, selectedIds, rec.fitScore, rec.representative_keywords]);

  const selectedCount = posts ? posts.filter((p) => selectedIds.has(p.post_id)).length : rec.estimated_post_count;

  return (
    <div className="p-4 rounded-xl bg-surface border border-border hover:border-accent/40 transition-colors">
      <div className="flex gap-4">
        <ThumbnailStack thumbnails={rec.thumbnails} total={rec.estimated_post_count} />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-text truncate">{rec.suggested_name}</h3>
          {rec.topic_subject_category && (
            <p className="text-xs text-dim mt-0.5">{rec.topic_subject_category}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-dim flex-wrap">
            <span>관련 포스팅 <b className="text-text">{rec.estimated_post_count}</b>개</span>
            {variant === 'good' && rec.fitScore !== null && (
              <>
                <span className="text-border">·</span>
                <FitBadge fit={rec.fitScore} />
              </>
            )}
          </div>
          {rec.representative_keywords.length > 0 && (
            <p className="text-[11px] text-dim mt-1 truncate">{rec.representative_keywords.slice(0, 5).join(' · ')}</p>
          )}
        </div>
      </div>

      {/* 카드 하단 버튼 */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={toggleExpand}
          className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border text-text hover:border-accent hover:text-accent transition"
        >
          {variant === 'good' ? '포스팅 확인' : '관련 포스팅 보기'}
        </button>
        {variant === 'good' ? (
          <a
            href="https://in.naver.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent text-white hover:bg-accent/90 transition"
          >
            토픽 만들기
          </a>
        ) : (
          <Link
            href="/dashboard/writing/content-angles"
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition"
          >
            추가하면 좋은 글 보기
          </Link>
        )}
      </div>

      {/* 펼침: 매칭 글 직접 선택 + 적합도 재계산 (스펙 19항) */}
      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          {rec.reasoning && <p className="text-xs text-dim mb-2">{rec.reasoning}</p>}
          {loadingPosts ? (
            <p className="text-xs text-dim">글 목록 불러오는 중…</p>
          ) : posts && posts.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-dim">
                  넣을 글을 직접 고르세요 · 선택 <b className="text-text">{selectedCount}</b>개
                </p>
                {liveFit !== null && <span className="text-xs"><FitBadge fit={liveFit} /></span>}
              </div>
              <ul className="space-y-1.5">
                {posts.map((p) => {
                  const checked = selectedIds.has(p.post_id);
                  return (
                    <li key={p.post_id}>
                      <label className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePost(p.post_id)}
                          className="w-4 h-4 rounded border-border text-accent focus:ring-accent shrink-0"
                        />
                        {p.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.thumbnail_url} alt="" className="w-8 h-8 rounded object-cover border border-border shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-bg border border-border flex items-center justify-center text-dim text-xs shrink-0">📄</div>
                        )}
                        <span className={`flex-1 min-w-0 text-xs truncate ${checked ? 'text-text' : 'text-dim line-through'}`}>
                          {p.title || p.url}
                        </span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-accent hover:underline shrink-0"
                        >
                          열기
                        </a>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-dim">
                  고른 글들을 네이버 인플루언서에서 하나의 토픽으로 묶어 발행하세요.
                </p>
                <a
                  href="https://in.naver.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-accent hover:underline shrink-0"
                >
                  네이버에서 토픽 만들기 →
                </a>
              </div>
            </>
          ) : (
            <p className="text-xs text-dim">매칭된 글을 찾지 못했습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TopicsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [naverTopics, setNaverTopics] = useState<NaverTopicItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authHeaders, setAuthHeaders] = useState<Record<string, string> | null>(null);

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

  // 관련 글 수 기준으로 추천 토픽 / 부족한 후보 분리 (스펙 20항)
  const goodRecs = useMemo(
    () => (summary?.recommendations || []).filter((r) => r.estimated_post_count >= MIN_GOOD_POSTS),
    [summary],
  );
  const insufficientRecs = useMemo(
    () => (summary?.recommendations || []).filter((r) => r.estimated_post_count < MIN_GOOD_POSTS),
    [summary],
  );

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text">토픽</h1>
          <p className="text-sm text-dim mt-1">
            내 포스팅에서 토픽으로 묶기 좋은 글을 AI가 찾아드립니다. 매일 자동으로 수집·분석해 반영합니다.
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
              <div className="p-4 rounded-lg bg-surface border border-border">
                <p className="text-xs text-dim">전체 토픽</p>
                <p className="text-xl font-bold text-text mt-1">{summary.publishedCount}</p>
              </div>
              <div className="p-4 rounded-lg bg-surface border border-border">
                <p className="text-xs text-dim">AI 토픽</p>
                <p className="text-xl font-bold text-text mt-1">{summary.aiPossibleCount}</p>
              </div>
              <div className="p-4 rounded-lg bg-surface border border-border">
                <p className="text-xs text-dim">토픽 활용률</p>
                <p className="text-xl font-bold text-accent mt-1">{utilizationPercent}%</p>
              </div>
              <div className="p-4 rounded-lg bg-surface border border-border">
                <p className="text-xs text-dim">AI 추천 토픽</p>
                <p className="text-xl font-bold text-text mt-1">{summary.recommendations.length}</p>
              </div>
              <div className="p-4 rounded-lg bg-surface border border-border">
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
                    className="group p-4 rounded-lg bg-surface border border-border hover:border-accent/40 hover:shadow-sm transition-all flex gap-4"
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
              <h2 className="text-sm font-bold text-dim mb-3">추천 토픽 — 토픽으로 묶기 좋은 글</h2>
              {goodRecs.length === 0 && insufficientRecs.length === 0 ? (
                <div className="p-8 text-center text-dim text-sm rounded-xl bg-surface border border-border">
                  아직 추천할 토픽이 없습니다. 매일 자동으로 분석하니 하루 정도 기다려 주세요.
                </div>
              ) : (
                <>
                  {goodRecs.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {goodRecs.map((rec) => (
                        <RecCard key={rec.id} rec={rec} authHeaders={authHeaders} variant="good" />
                      ))}
                    </div>
                  )}

                  {/* 조금 더 작성하면 좋은 토픽 (스펙 20항) */}
                  {insufficientRecs.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-sm font-bold text-dim mb-1">조금 더 작성하면 좋은 토픽</h3>
                      <p className="text-xs text-dim mb-3">
                        관련 글이 조금 부족하지만 좋은 후보예요. 글을 몇 개 더 쓰면 토픽으로 발행하기 좋아집니다.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {insufficientRecs.map((rec) => (
                          <RecCard key={rec.id} rec={rec} authHeaders={authHeaders} variant="insufficient" />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
