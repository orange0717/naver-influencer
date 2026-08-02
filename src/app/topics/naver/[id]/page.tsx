'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCountK, formatDate, formatDateDot } from '@/lib/format';

interface NaverTopicDetail {
  id: string;
  blog_id: string;
  topic_id: string;
  title: string | null;
  thumbnail_url: string | null;
  content_count: number;
  introduction: string | null;
  topic_subject: string | null;
  topic_subject_category: string | null;
  naver_created_at: string | null;
  naver_modified_at: string | null;
}

interface NaverTopicPost {
  content_id: string;
  title: string | null;
  intro_body: string | null;
  tags: string[];
  url: string;
}

interface TopicStats {
  postCount: number;
  totalViewCount: number;
  avgViewCount: number;
  latestPublishedAt: string | null;
  topPost: { content_id: string; title: string | null; view_count: number; url: string } | null;
  relatedKeywords: string[];
  nextRecommendation: {
    id: string;
    suggested_name: string;
    topic_subject_category: string | null;
    representative_keywords: string[];
    estimated_post_count: number;
  } | null;
}

export default function NaverTopicDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [topic, setTopic] = useState<NaverTopicDetail | null>(null);
  const [posts, setPosts] = useState<NaverTopicPost[]>([]);
  const [stats, setStats] = useState<TopicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace(`/auth/login?redirect=${encodeURIComponent(`/topics/naver/${params.id}`)}`);
          return;
        }
        const headers = { authorization: `Bearer ${session.access_token}` };
        const res = await fetch(`/api/naver-topics/${params.id}`, { headers });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        setTopic(json.topic);
        setPosts(json.posts || []);
        setStats(json.stats || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.id, router]);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/topics" className="text-xs text-dim hover:text-accent transition">← 토픽 목록</Link>

        {loading && <div className="p-12 text-center text-dim">불러오는 중…</div>}
        {error && !loading && (
          <div className="mt-4 p-6 rounded-xl bg-down/10 border border-down/30 text-down text-sm">{error}</div>
        )}

        {!loading && !error && topic && (
          <>
            <div className="mt-3 mb-6 flex items-start gap-4">
              {topic.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={topic.thumbnail_url}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover border border-border flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-surface border border-border flex items-center justify-center text-dim text-xl flex-shrink-0">
                  📚
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-text">{topic.title || '(제목 없음)'}</h1>
                {topic.topic_subject_category && (
                  <p className="text-xs text-dim mt-1">
                    {topic.topic_subject_category}
                    {topic.topic_subject ? ` · ${topic.topic_subject}` : ''}
                  </p>
                )}
                {topic.introduction && <p className="text-sm text-text mt-2">{topic.introduction}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs text-dim">
                  <span>글 {formatCountK(topic.content_count)}개</span>
                  {topic.naver_modified_at && (
                    <>
                      <span>·</span>
                      <span>{formatDateDot(topic.naver_modified_at)} 업데이트</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-4 rounded-2xl bg-surface border border-border">
                  <p className="text-xs text-dim">게시글 수</p>
                  <p className="text-xl font-bold text-text mt-1">{stats.postCount}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-border">
                  <p className="text-xs text-dim">총 조회수</p>
                  <p className="text-xl font-bold text-text mt-1">{formatCountK(stats.totalViewCount)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-border">
                  <p className="text-xs text-dim">평균 조회수</p>
                  <p className="text-xl font-bold text-text mt-1">{formatCountK(stats.avgViewCount)}</p>
                </div>
                <div className="p-4 rounded-2xl bg-surface border border-border">
                  <p className="text-xs text-dim">최근 발행일</p>
                  <p className="text-sm font-bold text-text mt-1">{stats.latestPublishedAt ? formatDate(stats.latestPublishedAt) : '-'}</p>
                </div>
              </div>
            )}

            {stats && stats.relatedKeywords.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {stats.relatedKeywords.slice(0, 8).map(k => (
                  <span key={k} className="text-xs px-2 py-1 rounded-full bg-bg border border-border text-dim">{k}</span>
                ))}
              </div>
            )}

            {stats?.nextRecommendation && (
              <Link
                href="/topics"
                className="block mb-6 p-4 rounded-xl bg-accent/5 border border-accent/20 text-sm text-text hover:border-accent/40 transition"
              >
                ✨ 이 주제와 비슷한 미발행 토픽이 있어요: <span className="font-semibold">{stats.nextRecommendation.suggested_name}</span>
                <span className="text-xs text-dim ml-1">(예상 글 {stats.nextRecommendation.estimated_post_count}개)</span>
              </Link>
            )}

            {posts.length === 0 ? (
              <div className="p-12 text-center text-dim text-sm">이 토픽에 연결된 글이 없습니다.</div>
            ) : (
              <ul className="space-y-2">
                {posts.map(p => {
                  const isTopPost = stats?.topPost?.content_id === p.content_id;
                  return (
                    <li key={p.content_id}>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-3 rounded-xl bg-surface border transition flex items-center gap-3 ${isTopPost ? 'border-accent/50' : 'border-border hover:border-accent/40'}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text truncate">
                            {isTopPost && <span className="text-accent mr-1">⭐ 인기글</span>}
                            {p.title || '(제목 없음)'}
                          </p>
                          {p.intro_body && <p className="text-xs text-dim mt-1 line-clamp-2">{p.intro_body}</p>}
                          {p.tags.length > 0 && (
                            <p className="text-[11px] text-dim mt-1">{p.tags.slice(0, 5).join(' · ')}</p>
                          )}
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
