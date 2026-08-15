'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TopicDetail {
  id: string;
  topicType: string;
  name: string;
  description: string | null;
  representativeKeywords: string[];
  postCount: number;
  totalViewCount: number;
  lastPostAt: string | null;
  avgIntegratedRank: number | null;
  avgBlogRank: number | null;
  aiBriefingCount: number;
  aiTabCount: number;
  challengeTop3Count: number;
  newPosts30d: number;
  isRepresentative: boolean;
  representativeScore: number;
}

interface TopicChallengeLink {
  keyword: string;
  rankPosition: number | null;
  isTop3: boolean;
}

interface TopicPostItem {
  postId: string;
  title: string | null;
  url: string;
  viewCount: number;
  publishedAt: string | null;
}

function formatRank(rank: number | null): string {
  return rank === null ? '-' : `${rank.toFixed(1)}위`;
}

export default function TopicDetailSection({ topicId }: { topicId: string }) {
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [challenges, setChallenges] = useState<TopicChallengeLink[]>([]);
  const [posts, setPosts] = useState<TopicPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/my/topics/${topicId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setErrorMessage(body.error || '토픽을 불러오지 못했습니다.');
          return;
        }
        const data = await res.json();
        setTopic(data.topic);
        setChallenges(data.challenges || []);
        setPosts(data.posts || []);
      } catch {
        setErrorMessage('토픽을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    })();
  }, [topicId]);

  if (loading) return <div className="text-center py-16 text-sm text-dim">불러오는 중...</div>;
  if (errorMessage || !topic) return <div className="text-center py-16 text-sm text-down">{errorMessage || '토픽을 찾을 수 없습니다.'}</div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/my" className="text-xs text-dim hover:text-text">← 대시보드로</Link>
        <div className="flex items-center gap-2 mt-2">
          {topic.isRepresentative && <span className="text-gold text-lg" title="대표 토픽">★</span>}
          <h1 className="type-page-title">{topic.name}</h1>
        </div>
        {topic.representativeKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {topic.representativeKeywords.map(k => (
              <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">{k}</span>
            ))}
          </div>
        )}
      </div>

      {/* 성과 요약 */}
      <div className="rounded-lg border border-border bg-surface shadow-xs p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="포스팅 수" value={`${topic.postCount}개`} />
        <StatBox label="누적 조회수" value={topic.totalViewCount.toLocaleString()} />
        <StatBox label="통합검색 평균" value={formatRank(topic.avgIntegratedRank)} />
        <StatBox label="블로그탭 평균" value={formatRank(topic.avgBlogRank)} />
        <StatBox label="AI 브리핑" value={`${topic.aiBriefingCount}건`} />
        <StatBox label="AI 탭" value={`${topic.aiTabCount}건`} />
        <StatBox label="키워드챌린지 TOP3" value={`${topic.challengeTop3Count}개`} />
        <StatBox label="최근 30일 신규글" value={`${topic.newPosts30d}건`} />
      </div>

      {/* 관련 키워드챌린지 */}
      <div className="rounded-lg border border-border bg-surface shadow-xs p-5">
        <h3 className="font-bold text-sm mb-3">관련 키워드챌린지</h3>
        {challenges.length === 0 ? (
          <p className="text-sm text-dim">연결된 키워드챌린지가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {challenges.map(c => (
              <span
                key={c.keyword}
                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${c.isTop3 ? 'bg-gold/15 text-gold' : 'bg-bg text-dim border border-border'}`}
              >
                {c.keyword} {c.rankPosition ? `· ${c.rankPosition}위` : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 관련 포스팅 */}
      <div className="rounded-lg border border-border bg-surface shadow-xs p-5">
        <h3 className="font-bold text-sm mb-3">관련 포스팅 ({posts.length}개)</h3>
        {posts.length === 0 ? (
          <p className="text-sm text-dim">연결된 포스팅이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {posts.map(p => (
              <li key={p.postId}>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-text hover:text-accent hover:underline">
                  {p.title || '(제목 없음)'}
                </a>
                <span className="text-[11px] text-dim ml-2">조회 {p.viewCount.toLocaleString()} · {p.publishedAt || '-'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg rounded-xl p-3">
      <p className="text-[11px] text-dim font-medium mb-1">{label}</p>
      <p className="text-base font-bold font-rank">{value}</p>
    </div>
  );
}
