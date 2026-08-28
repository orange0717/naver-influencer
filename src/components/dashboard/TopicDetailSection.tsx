'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { aiCheckState, aiCheckTitle, formatAiCount } from '@/lib/topic-ai-check';
import { UNRANKED_STATUS_TITLE } from '@/lib/keyword/aggregate';

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
  /** null = 아직 측정한 적 없음(성과 집계 미실행). 0 과 구분해야 한다. */
  challengeTop3Count: number | null;
  newPosts30d: number | null;
  isRepresentative: boolean;
  representativeScore: number | null;
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

/** 미측정 지표는 0 이 아니라 '-'. 0 으로 적으면 "해봤는데 하나도 없다"로 읽힌다. */
const NOT_MEASURED_TITLE = '아직 이 지표를 계산한 적이 없습니다. 0 이라는 뜻이 아닙니다.';
const formatCount = (value: number | null, unit: string): string => (value === null ? '-' : `${value}${unit}`);

const UNCHECKED_TITLE = '아직 이 토픽의 글에서 AI 인용 여부를 확인하지 않았습니다. AI 브리핑 메뉴에서 확인하면 건수가 표시됩니다.';

/**
 * 판정·표기는 lib/topic-ai-check 한 곳에만 둔다.
 * 예전에는 여기에 같은 이름의 함수가 따로 있었고, 그 함수는 '일부만 확인'을 몰랐다 —
 * 글 50개 중 3개만 확인해서 나온 0건과 50개를 다 확인해서 나온 0건이 똑같이 '0건'이었다.
 * 목록(TopicPerformanceSection)은 고쳤는데 상세만 옛 규칙으로 남아 있었다.
 */

export default function TopicDetailSection({ topicId }: { topicId: string }) {
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [challenges, setChallenges] = useState<TopicChallengeLink[]>([]);
  const [posts, setPosts] = useState<TopicPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  /** 오류 화면에서 사용자가 실제로 할 수 있는 행동. 무엇을 하라고 말해주지 않으면 막다른 길이다. */
  const [errorAction, setErrorAction] = useState<'retry' | 'login' | 'dashboard' | null>(null);
  const [challengeRankLookup, setChallengeRankLookup] = useState<'ok' | 'no_influencer'>('ok');
  /** 성과 지표 컬럼을 읽을 수 있었는지. false 면 화면의 '-'는 0 이 아니라 미측정이다. */
  const [metricsAvailable, setMetricsAvailable] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    setErrorAction(null);
    try {
      const res = await fetch(`/api/my/topics/${topicId}`);
      if (!res.ok) {
        // ⚠️ 서버 메시지를 그대로 뿌리면 화면에 'Unauthorized' · 'Forbidden' 이 그대로 나온다.
        //    상태 코드가 1차 기준이다 — 문구로 상태를 판정하지 않는다.
        if (res.status === 401) {
          setErrorMessage('로그인이 풀렸습니다. 다시 로그인하면 이어서 볼 수 있습니다.');
          setErrorAction('login');
        } else if (res.status === 403) {
          setErrorMessage('다른 계정의 토픽입니다. 이 토픽은 열람할 수 없습니다.');
          setErrorAction('dashboard');
        } else if (res.status === 404) {
          setErrorMessage('토픽을 찾을 수 없습니다. 삭제되었거나 주소가 잘못됐을 수 있습니다.');
          setErrorAction('dashboard');
        } else if (res.status === 429) {
          setErrorMessage('요청이 많아 잠시 뒤에 다시 시도해 주세요.');
          setErrorAction('retry');
        } else {
          setErrorMessage('토픽을 불러오지 못했습니다.');
          setErrorAction('retry');
        }
        return;
      }
      const data = await res.json();
      setTopic(data.topic);
      setChallenges(data.challenges || []);
      setChallengeRankLookup(data.challengeRankLookup === 'no_influencer' ? 'no_influencer' : 'ok');
      setMetricsAvailable(data.metricsAvailable !== false);
      setPosts(data.posts || []);
    } catch {
      setErrorMessage('연결에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
      setErrorAction('retry');
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-16 text-sm text-dim">불러오는 중...</div>;
  // 예전에는 여기서 빨간 글씨 한 줄만 띄우고 끝이었다 — 사용자가 빠져나갈 방법이 없었다.
  if (errorMessage || !topic) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-sm text-down font-semibold">{errorMessage || '토픽을 찾을 수 없습니다.'}</p>
        <div className="flex items-center justify-center gap-3">
          {errorAction === 'retry' && (
            <button onClick={() => load()} className="text-xs font-semibold text-accent hover:underline cursor-pointer">
              다시 시도
            </button>
          )}
          {errorAction === 'login' && (
            <Link href="/auth/login" className="text-xs font-semibold text-accent hover:underline">로그인하러 가기</Link>
          )}
          <Link href="/my" className="text-xs font-semibold text-dim hover:text-text">대시보드로 돌아가기</Link>
        </div>
      </div>
    );
  }

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
            value={formatAiCount(topic.aiBriefingCount, topic.aiCheckedCount, topic.postCount, '건')}
            hint={aiCheckTitle(topic.aiCheckedCount, topic.postCount, UNCHECKED_TITLE)}
          />
          <StatBox
            label="AI 탭"
            value={formatAiCount(topic.aiTabCount, topic.aiCheckedCount, topic.postCount, '건')}
            hint={aiCheckTitle(topic.aiCheckedCount, topic.postCount, UNCHECKED_TITLE)}
          />
          <StatBox
            label="키워드챌린지 TOP3"
            value={formatCount(topic.challengeTop3Count, '개')}
            hint={topic.challengeTop3Count === null ? NOT_MEASURED_TITLE : undefined}
          />
          <StatBox
            label="최근 30일 신규글"
            value={formatCount(topic.newPosts30d, '건')}
            hint={topic.newPosts30d === null ? NOT_MEASURED_TITLE : undefined}
          />
        </div>
        {/* 성과 지표를 아예 읽지 못한 경우 — '-'가 0 으로 오해되지 않게 먼저 말해준다. */}
        {!metricsAvailable && (
          <p className="text-[11px] text-down mt-3 leading-snug">
            평균 순위 · 챌린지 TOP3 · 신규글 등 성과 지표를 아직 집계하지 못해 ‘-’로 표시됩니다. 값이 0 이라는 뜻이 아닙니다.
          </p>
        )}
        {/* 인용 0건과 미확인을 눈으로 구분할 수 있어야 한다 — 숫자만 보면 둘 다 '성과 없음'으로 읽힌다. */}
        <p className="text-[11px] text-dim mt-3 leading-snug">
          {aiCheckState(topic.aiCheckedCount, topic.postCount) === 'none'
            ? 'AI 브리핑 · AI 탭의 ‘-’는 인용 0건이 아니라 아직 확인하지 않았다는 뜻입니다. AI 브리핑 메뉴에서 확인할 수 있습니다.'
            : `AI 브리핑 · AI 탭은 이 토픽의 글 ${topic.postCount}개 중 ${topic.aiCheckedCount}개를 확인한 결과입니다.`}
        </p>
      </div>

      {/* 관련 키워드챌린지 */}
      <div className="rounded-lg border border-border bg-surface shadow-xs p-5">
        <h3 className="font-bold text-sm mb-3">관련 키워드챌린지</h3>
        {challenges.length === 0 ? (
          <p className="text-sm text-dim">연결된 키워드챌린지가 없습니다.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {challenges.map(c => (
                <span
                  key={c.keyword}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold ${c.isTop3 ? 'bg-gold/15 text-gold' : 'bg-bg text-dim border border-border'}`}
                  title={c.rankPosition === null
                    ? (challengeRankLookup === 'no_influencer'
                      ? '블로그(인플루언서) 연결이 없어 순위를 조회하지 못했습니다. 순위가 없다는 뜻이 아닙니다.'
                      : UNRANKED_STATUS_TITLE)
                    : undefined}
                >
                  {/* 순위 자리를 그냥 비워두면 '순위가 없다'로 읽힌다. 우리가 모르는 것이면
                      모른다고 적는다 — 조회조차 못 한 경우와 조회했는데 없는 경우도 구분한다. */}
                  {c.keyword} · {c.rankPosition !== null
                    ? `${c.rankPosition}위`
                    : challengeRankLookup === 'no_influencer' ? '순위 확인 불가' : '순위 없음'}
                </span>
              ))}
            </div>
            {challengeRankLookup === 'no_influencer' && (
              <p className="text-[11px] text-dim mt-2.5 leading-snug">
                블로그(인플루언서) 연결이 없어 챌린지 순위를 조회하지 못했습니다.{' '}
                <Link href="/my" className="text-accent font-semibold hover:underline">대시보드에서 블로그를 연결</Link>하면 순위가 표시됩니다.
              </p>
            )}
          </>
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
