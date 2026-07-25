'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCountK } from '@/lib/format';

interface TopicItem {
  id: string;
  name: string;
  representative_keywords: string[];
  thumbnail_url: string | null;
  post_count: number;
  total_view_count: number;
  score: number;
  last_post_at: string | null;
}

interface CandidateItem {
  id: string;
  post_id: string;
  suggested_topic_name: string;
  created_at: string;
}

interface TopicsResponse {
  topics: TopicItem[];
  candidates: CandidateItem[];
}

export default function TopicsPage() {
  const router = useRouter();
  const [data, setData] = useState<TopicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const res = await fetch('/api/blog/topics', { headers });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const candidateGroups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const c of data.candidates) {
      map.set(c.suggested_topic_name, (map.get(c.suggested_topic_name) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [data]);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text">토픽</h1>
          <p className="text-sm text-dim mt-1">
            AI가 블로그 글들을 의미 단위로 자동 그룹핑한 지식 라이브러리예요. 매일 새 글을 자동으로 분석해 반영합니다.
          </p>
        </div>

        {loading && <div className="p-12 text-center text-dim">불러오는 중…</div>}
        {error && !loading && (
          <div className="p-6 rounded-xl bg-down/10 border border-down/30 text-down text-sm">{error}</div>
        )}

        {!loading && !error && data && (
          <>
            {data.topics.length === 0 && candidateGroups.length === 0 && (
              <div className="p-12 text-center text-dim text-sm">
                아직 토픽이 없습니다. 매일 자동으로 새 글을 분석하니, 글을 쓰고 하루 정도 기다려 주세요.
              </div>
            )}

            {data.topics.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
                {data.topics.map(topic => (
                  <Link
                    key={topic.id}
                    href={`/topics/${topic.id}`}
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
                      <h2 className="font-bold text-text group-hover:text-accent transition truncate">{topic.name}</h2>
                      {topic.representative_keywords.length > 0 && (
                        <p className="text-xs text-dim mt-1 truncate">
                          {topic.representative_keywords.slice(0, 4).join(' · ')}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-dim">
                        <span>글 {topic.post_count}개</span>
                        <span>·</span>
                        <span>조회 {formatCountK(topic.total_view_count)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {candidateGroups.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-dim mb-3">토픽 후보</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {candidateGroups.map(([name]) => (
                    <div
                      key={name}
                      className="p-4 rounded-xl bg-accent/5 border border-accent/20 text-sm text-text"
                    >
                      💡 <span className="font-semibold">{name}</span> 관련 글을 1개 더 작성하면 토픽이 생성됩니다.
                    </div>
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
