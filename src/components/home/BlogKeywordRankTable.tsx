'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import GlassCard from '@/components/dashboard/GlassCard';
import type { BlogDashboardSummary, PostKeywordRank } from '@/app/api/my/blog-dashboard-summary/route';
import type { RankingResult } from './KeywordRankingSection.helpers';
import { renderRankTab, computeDeltaDisplay, timeAgo } from './KeywordRankingSection.helpers';

async function fetchSummary(blogId: string): Promise<BlogDashboardSummary> {
  const res = await fetch(`/api/my/blog-dashboard-summary?blogId=${encodeURIComponent(blogId)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('요약 조회 실패');
  return res.json();
}

// PostKeywordRank의 통합/블로그 탭을 renderRankTab이 받는 RankingResult 형태로 변환(동일 5구분 표시).
function toResult(row: PostKeywordRank): RankingResult {
  return {
    query: row.keyword,
    viewTab: { exposed: row.integrated.exposed, rank: row.integrated.rank, scannedDepth: row.integrated.scannedDepth },
    blogTab: { exposed: row.blog.exposed, rank: row.blog.rank, scannedDepth: row.blog.scannedDepth },
    influencerTab: { exposed: null, rank: null },
    searchVolume: row.searchVolume ?? undefined,
    status: 'ok',
    checkedAt: row.checkedAt,
  };
}

/**
 * 블로그 대시보드 — 포스팅별 대표 키워드 최신순위(스펙 #20).
 * 키워드순위 화면과 "동일한 keyword_rank_lookups"를 재집계한 blog-dashboard-summary.postKeywordRanks를 표시한다.
 * (별도 순위 데이터를 만들지 않으므로 두 화면의 숫자가 항상 일치 — 스펙 #18·#19)
 */
export default function BlogKeywordRankTable({ blogId }: { blogId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['blog-dashboard-summary', blogId],
    queryFn: () => fetchSummary(blogId!),
    enabled: !!blogId,
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (!blogId) return null;

  const rows = data?.postKeywordRanks ?? [];

  return (
    <GlassCard padding="none">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div>
          <h3 className="font-bold text-[15px]">포스팅별 대표 키워드 순위</h3>
          <p className="text-[11px] text-dim mt-0.5">키워드순위 화면과 동일한 데이터 · 대표 키워드 기준 최신 순위</p>
        </div>
        <Link href="/my/keyword-ranking" className="text-xs text-accent hover:underline shrink-0">전체 보기 →</Link>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-dim text-sm">불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-dim text-sm">
          아직 확인된 대표 키워드 순위가 없습니다.{' '}
          <Link href="/my/keyword-ranking" className="text-accent hover:underline">키워드순위에서 확인</Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border/50 text-[11px] text-dim uppercase">
                <th className="text-left px-4 py-2.5 font-semibold">포스팅 / 대표 키워드</th>
                <th className="text-center px-3 py-2.5 font-semibold w-20">통합검색</th>
                <th className="text-center px-3 py-2.5 font-semibold w-20">블로그</th>
                <th className="text-center px-3 py-2.5 font-semibold w-16">전일대비</th>
                <th className="text-center px-3 py-2.5 font-semibold w-16">7일대비</th>
                <th className="text-center px-4 py-2.5 font-semibold w-20">최근 확인</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {rows.map(row => {
                const result = toResult(row);
                const prevDelta = computeDeltaDisplay(row.integrated.exposed, row.integrated.rank, row.prevRank, row.prevCheckedAt);
                const weekDelta = computeDeltaDisplay(row.integrated.exposed, row.integrated.rank, row.weekRank, row.weekCheckedAt);
                return (
                  <tr key={`${row.postId}::${row.keyword}`} className="hover:bg-surface-hover transition">
                    <td className="px-4 py-2.5">
                      {row.postUrl ? (
                        <a href={row.postUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-accent transition line-clamp-1 max-w-[280px]" title={row.title || row.keyword}>
                          {row.title || row.keyword}
                        </a>
                      ) : (
                        <span className="font-medium line-clamp-1 max-w-[280px]">{row.title || row.keyword}</span>
                      )}
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">대표</span>
                        <span className="text-[11px] text-dim truncate max-w-[240px]">{row.keyword}</span>
                      </div>
                    </td>
                    <td className="text-center px-3 py-2.5">{renderRankTab(result, result.viewTab)}</td>
                    <td className="text-center px-3 py-2.5">{renderRankTab(result, result.blogTab)}</td>
                    <td className="text-center px-3 py-2.5">
                      <span className={`text-xs font-bold ${prevDelta.colorClass}`} title={prevDelta.tooltip}>{prevDelta.label}</span>
                    </td>
                    <td className="text-center px-3 py-2.5">
                      <span className={`text-xs font-bold ${weekDelta.colorClass}`} title={weekDelta.tooltip}>{weekDelta.label}</span>
                    </td>
                    <td className="text-center px-4 py-2.5 text-[10px] text-dim" title={row.checkedAt ? new Date(row.checkedAt).toLocaleString('ko-KR') : ''}>
                      {row.checkedAt ? timeAgo(row.checkedAt) : '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
