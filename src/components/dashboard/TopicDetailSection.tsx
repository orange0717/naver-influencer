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
  /**
   * 이 토픽의 글 중 AI 인용 여부를 실제로 확인한 글 수.
   * 0/null 이면 위 두 카운트의 0 은 '인용 0건'이 아니라 '아직 확인 안 함'이다.
   * (null 은 DB에 ai_checked_count 컬럼이 아직 없다는 뜻 — 미확인과 동일 취급)
   */
  aiCheckedCount: number | null;
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

const UNCHECKED_TITLE = '아직 이 토픽의 글에서 AI 인용 여부를 확인하지 않았습니다. AI 브리핑 메뉴에서 확인하면 건수가 표시됩니다.';

/**
 * AI 인용 건수 표기. 확인한 글이 한 건도 없으면 숫자 0 이 아니라 '-'(미확인)로 쓴다.
 * "확인해봤더니 0건"과 "아직 확인 안 함"은 사용자에게 전혀 다른 정보인데,
 * 예전에는 둘 다 0건으로 나가서 "내 글은 AI에 하나도 안 걸렸다"로 잘못 읽혔다.
 */
function formatAiCount(count: number, checked: number | null): string {
  return checked ? `${count}건` : '-';
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
      <div className="rounded-lg border border-border bg-surface shadow-xs p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="포스팅 수" value={`${topic.postCount}개`} />
          <StatBox label="누적 조회수" value={topic.totalViewCount.toLocaleString()} />
          <StatBox label="통합검색 평균" value={formatRank(topic.avgIntegratedRank)} />
          <StatBox label="블로그탭 평균" value={formatRank(topic.avgBlogRank)} />
          <StatBox
            label="AI 브리핑"
            value={formatAiCount(topic.aiBriefingCount, topic.aiCheckedCount)}
            hint={topic.aiCheckedCount ? undefined : UNCHECKED_TITLE}
          />
          <StatBox
            label="AI 탭"
            value={formatAiCount(topic.aiTabCount, topic.aiCheckedCount)}
            hint={topic.aiCheckedCount ? undefined : UNCHECKED_TITLE}
          />
          <StatBox label="키워드챌린지 TOP3" value={`${topic.challengeTop3Count}개`} />
          <StatBox label="최근 30일 신규글" value={`${topic.newPosts30d}건`} />
        </div>
        {/* 인용 0건과 미확인을 눈으로 구분할 수 있어야 한다 — 숫자만 보면 둘 다 '성과 없음'으로 읽힌다. */}
        <p className="text-[11px] text-dim mt-3 leading-snug">
          {topic.aiCheckedCount
            ? `AI 브리핑 · AI 탭은 이 토픽의 글 ${topic.postCount}개 중 ${topic.aiCheckedCount}개를 확인한 결과입니다.`
            : 'AI 브리핑 · AI 탭의 ‘-’는 인용 0건이 아니라 아직 확인하지 않았다는 뜻입니다. AI 브리핑 메뉴에서 확인할 수 있습니다.'}
        </p>
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

function StatBox({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-bg rounded-xl p-3" title={hint}>
      <p className="text-[11px] text-dim font-medium mb-1">{label}</p>
      <p className={`text-base font-bold font-rank${hint ? ' text-dim' : ''}`}>{value}</p>
    </div>
  );
}
