import Link from 'next/link';
import { TOPIC_TYPE_LABEL } from '@/lib/topic-labels';
import DashboardCard, { DashboardCardIcon } from './DashboardCard';

export interface TopicPerformanceRow {
  id: string;
  topicType: string;
  name: string;
  postCount: number;
  lastPostAt: string | null;
  avgIntegratedRank: number | null;
  avgBlogRank: number | null;
  aiBriefingCount: number;
  aiTabCount: number;
  challengeTop3Count: number;
  newPosts30d: number;
  isRepresentative: boolean;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '-';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '-';
  const diffDay = Math.floor(Math.max(0, Date.now() - then) / (24 * 60 * 60 * 1000));
  if (diffDay === 0) return '오늘';
  if (diffDay < 30) return `${diffDay}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

function formatRank(rank: number | null): string {
  return rank === null ? '-' : `${rank.toFixed(1)}위`;
}

export default function TopicPerformanceSection({ topics }: { topics: TopicPerformanceRow[] }) {
  return (
    <DashboardCard
      id="topic-performance"
      title="토픽 현황 · 성과"
      icon={
        <DashboardCardIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
            <path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82z" />
            <circle cx="7.5" cy="7.5" r="1.5" />
          </svg>
        </DashboardCardIcon>
      }
    >
      <p className="text-xs text-dim mb-3 leading-snug">
        게시글 분석으로 분류된 토픽의 성과입니다. 인플루언서 홈의 전체 토픽 수와 다를 수 있습니다.
      </p>
      {topics.length === 0 ? (
        <p className="text-center text-sm text-dim py-8">
          아직 분류된 토픽이 없습니다. 매일 새벽 자동 분류가 실행되면 여기에 표시됩니다.
        </p>
      ) : (
        <>
          {/* 데스크톱 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-dim">
                  <th className="text-left py-2.5 px-3 font-semibold">토픽</th>
                  <th className="text-right py-2.5 px-3 font-semibold">포스팅</th>
                  <th className="text-right py-2.5 px-3 font-semibold">통합검색 평균</th>
                  <th className="text-right py-2.5 px-3 font-semibold">블로그탭 평균</th>
                  <th className="text-right py-2.5 px-3 font-semibold">AI 브리핑</th>
                  <th className="text-right py-2.5 px-3 font-semibold">AI 탭</th>
                  <th className="text-right py-2.5 px-3 font-semibold">챌린지 TOP3</th>
                  <th className="text-center py-2.5 px-3 font-semibold">최근 발행</th>
                  <th className="text-center py-2.5 px-3 font-semibold">보기</th>
                </tr>
              </thead>
              <tbody>
                {topics.map(t => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        {t.isRepresentative && <span className="text-gold" title="대표 토픽">★</span>}
                        <span className="font-semibold">{t.name}</span>
                        <span className="text-[10px] text-dim">{TOPIC_TYPE_LABEL[t.topicType] || t.topicType}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-rank">{t.postCount}</td>
                    <td className="py-3 px-3 text-right font-rank text-dim">{formatRank(t.avgIntegratedRank)}</td>
                    <td className="py-3 px-3 text-right font-rank text-dim">{formatRank(t.avgBlogRank)}</td>
                    <td className="py-3 px-3 text-right font-rank">{t.aiBriefingCount}</td>
                    <td className="py-3 px-3 text-right font-rank">{t.aiTabCount}</td>
                    <td className="py-3 px-3 text-right font-rank">{t.challengeTop3Count}</td>
                    <td className="py-3 px-3 text-center text-xs text-dim">{formatRelativeTime(t.lastPostAt)}</td>
                    <td className="py-3 px-3 text-center">
                      <Link href={`/my/topics/${t.id}`} className="text-xs font-semibold text-accent hover:underline">
                        보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden space-y-2">
            {topics.map(t => (
              <Link
                key={t.id}
                href={`/my/topics/${t.id}`}
                className="block bg-bg rounded-xl p-3.5 space-y-2 hover:bg-bg/70 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {t.isRepresentative && <span className="text-gold">★</span>}
                    <span className="font-semibold text-sm">{t.name}</span>
                    <span className="text-[10px] text-dim">{TOPIC_TYPE_LABEL[t.topicType] || t.topicType}</span>
                  </div>
                  <span className="text-xs font-bold">{t.postCount}건</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-dim">
                  <span>통합검색 {formatRank(t.avgIntegratedRank)}</span>
                  <span>블로그탭 {formatRank(t.avgBlogRank)}</span>
                  <span>AI브리핑 {t.aiBriefingCount}건</span>
                  <span>AI탭 {t.aiTabCount}건</span>
                  <span>챌린지TOP3 {t.challengeTop3Count}개</span>
                  <span>최근 {formatRelativeTime(t.lastPostAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </DashboardCard>
  );
}
