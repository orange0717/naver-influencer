'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCountK, formatDateDot } from '@/lib/format';

interface TopicDetail {
  id: string;
  name: string;
  postCount: number;
  totalViewCount: number;
  thumbnailUrl: string | null;
  lastPostAt: string | null;
}

interface TopicPost {
  post_id: string;
  title: string | null;
  thumbnail_url: string | null;
  view_count: number | null;
  published_at: string | null;
  category: string | null;
  url: string;
  publishedAtMs: number;
}

type SortKey = 'latest' | 'views';

const SORT_TABS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: '최신순' },
  { key: 'views', label: '조회순' },
];

export default function TopicDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [posts, setPosts] = useState<TopicPost[]>([]);
  const [sort, setSort] = useState<SortKey>('latest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace(`/auth/login?redirect=${encodeURIComponent(`/topics/${params.id}`)}`);
          return;
        }
        const headers = { authorization: `Bearer ${session.access_token}` };
        const res = await fetch(`/api/blog/topics/${params.id}?sort=${sort}`, { headers });
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
  }, [params.id, sort, router]);

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
              {topic.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={topic.thumbnailUrl}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover border border-border flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-surface border border-border flex items-center justify-center text-dim text-xl flex-shrink-0">
                  🏷️
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-text">{topic.name}</h1>
                <div className="flex items-center gap-3 mt-2 text-xs text-dim">
                  <span>글 {topic.postCount}개</span>
                  <span>·</span>
                  <span>조회 {formatCountK(topic.totalViewCount)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-1 mb-4 border-b border-border">
              {SORT_TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setSort(t.key)}
                  className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
                    sort === t.key ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-text'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {posts.length === 0 ? (
              <div className="p-12 text-center text-dim text-sm">이 카테고리에 연결된 글이 없습니다.</div>
            ) : (
              <ul className="space-y-2">
                {posts.map(p => (
                  <li key={p.post_id}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-surface border border-border hover:border-accent/40 transition flex items-center gap-3"
                    >
                      {p.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumbnail_url}
                          alt=""
                          className="w-14 h-14 rounded-lg object-cover border border-border flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-bg border border-border flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text truncate">{p.title || '(제목 없음)'}</p>
                        <p className="text-[11px] text-dim mt-1">
                          <span>조회 {formatCountK(p.view_count)}</span>
                          {p.publishedAtMs > 0 && (
                            <>
                              <span className="mx-1">·</span>
                              <span>{formatDateDot(new Date(p.publishedAtMs))}</span>
                            </>
                          )}
                        </p>
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
