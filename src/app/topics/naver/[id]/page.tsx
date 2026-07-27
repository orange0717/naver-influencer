'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCountK, formatDateDot } from '@/lib/format';

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

export default function NaverTopicDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [topic, setTopic] = useState<NaverTopicDetail | null>(null);
  const [posts, setPosts] = useState<NaverTopicPost[]>([]);
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

            {posts.length === 0 ? (
              <div className="p-12 text-center text-dim text-sm">이 토픽에 연결된 글이 없습니다.</div>
            ) : (
              <ul className="space-y-2">
                {posts.map(p => (
                  <li key={p.content_id}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-surface border border-border hover:border-accent/40 transition flex items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text truncate">{p.title || '(제목 없음)'}</p>
                        {p.intro_body && <p className="text-xs text-dim mt-1 line-clamp-2">{p.intro_body}</p>}
                        {p.tags.length > 0 && (
                          <p className="text-[11px] text-dim mt-1">{p.tags.slice(0, 5).join(' · ')}</p>
                        )}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
