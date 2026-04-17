'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import CompetitorDashboard from '@/components/dashboard/CompetitorDashboard';
import { extractBlogId, isValidBlogId } from '@/lib/blog-utils';

type AnalysisTab = 'challenge' | 'blog' | 'posting';

interface AuthInfo {
  naverId: string;
  blogId: string;
  displayName: string;
  subscriberCount: number;
  totalKeywords: number;
  top3Count: number;
  avgRank: number;
}

interface BlogCompareData {
  mine: { todayVisitor: number; totalVisitor: number; subscriberCount: number; postCount: number };
  competitor: { todayVisitor: number; totalVisitor: number; subscriberCount: number; postCount: number; blogName: string };
}

interface MissingCheckResult {
  total: number;
  viewExposed: number;
  blogExposed: number;
  viewRate: number; // 누락율 %
  blogRate: number;
  keywords: { title: string; viewExposed: boolean; blogExposed: boolean; viewRank: number | null; blogRank: number | null }[];
}

interface CompetitorPost {
  id: string;
  title: string;
  url: string;
  date: string;
  commentCount: number;
  blogTab?: { exposed: boolean; rank: number | null };
  viewTab?: { exposed: boolean; rank: number | null };
}

export default function CompetitorPage() {
  const [tab, setTab] = useState<AnalysisTab>('challenge');
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // 블로그 탭
  const [blogCompetitorId, setBlogCompetitorId] = useState('');
  const [blogCompareData, setBlogCompareData] = useState<BlogCompareData | null>(null);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogError, setBlogError] = useState('');

  // 누락율 비교
  const [missingData, setMissingData] = useState<{ mine: MissingCheckResult | null; competitor: MissingCheckResult | null } | null>(null);
  const [missingLoading, setMissingLoading] = useState(false);
  const [missingProgress, setMissingProgress] = useState({ current: 0, total: 0 });
  const missingProgressRef = useRef(0);

  // 포스팅 탭
  const [postCompetitorId, setPostCompetitorId] = useState('');
  const [competitorPosts, setCompetitorPosts] = useState<CompetitorPost[]>([]);
  const [postLoading, setPostLoading] = useState(false);
  const [checkingPostId, setCheckingPostId] = useState('');

  useEffect(() => {
    loadAuth();
  }, []);

  async function loadAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (!data.id) { window.location.href = '/auth/login'; return; }

      const naverId = data.id;
      const blogId = data.blogId || data.id;

      // 인플루언서 통계 조회
      const statsRes = await fetch(`/api/influencers/${naverId}`);
      let stats = { totalKeywords: 0, top3Count: 0, avgRank: 0, subscriberCount: 0, displayName: naverId };
      if (statsRes.ok) {
        const s = await statsRes.json();
        stats = {
          totalKeywords: s.total_keywords || 0,
          top3Count: (s.top1_count || 0) + (s.top2_count || 0) + (s.top3_count || 0),
          avgRank: s.avg_rank || 0,
          subscriberCount: s.subscriber_count || 0,
          displayName: s.display_name || naverId,
        };
      }

      setAuthInfo({
        naverId,
        blogId,
        displayName: stats.displayName,
        subscriberCount: stats.subscriberCount,
        totalKeywords: stats.totalKeywords,
        top3Count: stats.top3Count,
        avgRank: stats.avgRank,
      });
    } catch {
      console.error('[competitor] loadAuth failed');
    }
    finally { setLoading(false); }
  }

  // blogId 유효성 확인
  const myBlogId = authInfo ? extractBlogId(authInfo.blogId) : '';
  const myBlogIdValid = isValidBlogId(myBlogId);

  // ─── 블로그 비교 ───
  const compareBlog = useCallback(async () => {
    if (!blogCompetitorId.trim() || !authInfo) return;
    setBlogLoading(true);
    setBlogCompareData(null);
    setMissingData(null);
    setBlogError('');

    const compId = extractBlogId(blogCompetitorId);

    if (!myBlogIdValid) {
      setBlogError(`내 블로그 ID(${myBlogId})가 유효하지 않습니다. 프로필 설정에서 블로그 ID를 확인해주세요.`);
    }

    try {
      const [myRes, compRes] = await Promise.all([
        fetch(`/api/blog/stats?blogId=${encodeURIComponent(myBlogId)}`),
        fetch(`/api/blog/stats?blogId=${encodeURIComponent(compId)}`),
      ]);

      if (!myRes.ok || !compRes.ok) {
        setBlogError('블로그 통계를 가져오지 못했습니다. 블로그 ID를 확인해주세요.');
        return;
      }

      const myData = await myRes.json();
      const compData = await compRes.json();
      setBlogCompareData({
        mine: {
          todayVisitor: myData.todayVisitor || 0,
          totalVisitor: myData.totalVisitor || 0,
          subscriberCount: myData.subscriberCount || 0,
          postCount: myData.postCount || 0,
        },
        competitor: {
          todayVisitor: compData.todayVisitor || 0,
          totalVisitor: compData.totalVisitor || 0,
          subscriberCount: compData.subscriberCount || 0,
          postCount: compData.postCount || 0,
          blogName: compData.blogName || compId,
        },
      });
    } catch (err) {
      console.error('[competitor] compareBlog error:', err);
      setBlogError('블로그 통계 조회 중 오류가 발생했습니다.');
    }
    finally { setBlogLoading(false); }
  }, [blogCompetitorId, authInfo, myBlogId, myBlogIdValid]);

  // ─── 누락율 비교 확인 (순차 실행으로 rate limit 방지) ───
  const checkMissingRate = useCallback(async () => {
    if (!authInfo || !blogCompetitorId.trim()) return;
    setMissingLoading(true);
    setMissingData(null);

    const compId = extractBlogId(blogCompetitorId);

    try {
      // 1. 양쪽 최근 포스팅 10개씩 가져오기
      const [myPostsRes, compPostsRes] = await Promise.all([
        fetch(`/api/blog/posts?blogId=${encodeURIComponent(myBlogId)}&page=1&count=10`),
        fetch(`/api/blog/posts?blogId=${encodeURIComponent(compId)}&page=1&count=10`),
      ]);

      const myPosts = myPostsRes.ok ? ((await myPostsRes.json()).posts || []) : [];
      const compPosts = compPostsRes.ok ? ((await compPostsRes.json()).posts || []) : [];

      const totalChecks = myPosts.length + compPosts.length;
      missingProgressRef.current = 0;
      setMissingProgress({ current: 0, total: totalChecks });

      // 포스팅별 누락 확인 (순차 실행)
      async function checkPosts(posts: { logNo?: string; id?: string; title: string }[], blogId: string): Promise<MissingCheckResult> {
        const keywords: MissingCheckResult['keywords'] = [];
        let viewExposed = 0, blogExposed = 0;

        for (const post of posts) {
          try {
            const res = await fetch('/api/blog/check-missing', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blogId, postTitle: post.title, postId: post.logNo || post.id || '' }),
            });
            if (res.ok) {
              const data = await res.json();
              keywords.push({
                title: post.title,
                viewExposed: data.viewTab?.exposed || false,
                blogExposed: data.blogTab?.exposed || false,
                viewRank: data.viewTab?.rank || null,
                blogRank: data.blogTab?.rank || null,
              });
              if (data.viewTab?.exposed) viewExposed++;
              if (data.blogTab?.exposed) blogExposed++;
            }
          } catch (err) {
            console.error(`[competitor] check-missing failed for "${post.title}":`, err);
          }
          // ref 기반 카운터로 race condition 방지
          missingProgressRef.current++;
          setMissingProgress({ current: missingProgressRef.current, total: totalChecks });
        }

        const total = posts.length;
        return {
          total,
          viewExposed,
          blogExposed,
          viewRate: total > 0 ? Math.round(((total - viewExposed) / total) * 100) : 0,
          blogRate: total > 0 ? Math.round(((total - blogExposed) / total) * 100) : 0,
          keywords,
        };
      }

      // 2. 순차 실행: 내 블로그 → 경쟁자 (rate limit 방지)
      const myResult = await checkPosts(myPosts, myBlogId);
      const compResult = await checkPosts(compPosts, compId);

      setMissingData({ mine: myResult, competitor: compResult });
    } catch (err) {
      console.error('[competitor] checkMissingRate error:', err);
    }
    finally { setMissingLoading(false); }
  }, [authInfo, blogCompetitorId, myBlogId]);

  // ─── 포스팅 비교 ───
  const loadCompetitorPosts = useCallback(async () => {
    if (!postCompetitorId.trim()) return;
    setPostLoading(true);
    setCompetitorPosts([]);
    const postCompId = extractBlogId(postCompetitorId);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(postCompId)}&page=1&count=10`);
      if (res.ok) {
        const data = await res.json();
        setCompetitorPosts((data.posts || []).map((p: { logNo?: string; id?: string; title: string; url?: string; date: string; commentCount?: number }) => ({
          id: p.logNo || p.id || '',
          title: p.title,
          url: p.url || `https://blog.naver.com/${postCompId}/${p.logNo || p.id}`,
          date: p.date,
          commentCount: p.commentCount || 0,
        })));
      }
    } catch (err) {
      console.error('[competitor] loadCompetitorPosts error:', err);
    }
    finally { setPostLoading(false); }
  }, [postCompetitorId]);

  const checkPostRank = async (post: CompetitorPost) => {
    setCheckingPostId(post.id);
    try {
      const res = await fetch('/api/blog/check-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: extractBlogId(postCompetitorId), postTitle: post.title, postId: post.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompetitorPosts(prev => prev.map(p =>
          p.id === post.id ? { ...p, blogTab: data.blogTab, viewTab: data.viewTab } : p
        ));
      }
    } catch (err) {
      console.error('[competitor] checkPostRank error:', err);
    }
    finally { setCheckingPostId(''); }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto py-20 text-center text-dim">로딩 중...</div>;
  }

  if (!authInfo) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <p className="text-dim mb-4">로그인이 필요합니다.</p>
        <a href="/auth/login" className="text-accent font-semibold">로그인하기</a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">경쟁자 분석</h1>

      {/* ─── 탭 선택 ─── */}
      <div className="flex rounded-xl border border-border overflow-hidden">
        {([
          { key: 'challenge' as const, label: '키워드챌린지' },
          { key: 'blog' as const, label: '블로그' },
          { key: 'posting' as const, label: '포스팅' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-sm font-bold transition cursor-pointer ${
              tab === t.key
                ? 'bg-accent text-white'
                : 'bg-surface text-dim hover:bg-surface-hover'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── 키워드챌린지 탭 ─── */}
      {tab === 'challenge' && (
        <CompetitorDashboard
          naverId={authInfo.naverId}
          myStats={{
            avgRank: authInfo.avgRank > 0 ? Math.round(authInfo.avgRank * 10) / 10 : 0,
            totalKeywords: authInfo.totalKeywords,
            top3Count: authInfo.top3Count,
          }}
          mySubscribers={authInfo.subscriberCount}
          myDisplayName={authInfo.displayName}
        />
      )}

      {/* ─── 블로그 탭 ─── */}
      {tab === 'blog' && (
        <div className="space-y-4">
          {/* blogId 경고 */}
          {!myBlogIdValid && (
            <div className="bg-down/10 border border-down/30 rounded-xl px-4 py-3 text-xs text-down">
              내 블로그 ID({myBlogId || '없음'})가 유효하지 않습니다.
              <a href="/profile" className="underline font-semibold ml-1">프로필 설정</a>에서 네이버 블로그 ID를 확인해주세요.
            </div>
          )}

          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="font-bold text-sm mb-3">경쟁자 블로그 ID 입력</h3>
            <p className="text-[11px] text-dim mb-2">블로그 ID 또는 URL을 입력하세요 (예: akzkfltm2 또는 https://blog.naver.com/akzkfltm2)</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={blogCompetitorId}
                onChange={e => setBlogCompetitorId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && compareBlog()}
                placeholder="네이버 블로그 ID 또는 URL"
                className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition"
              />
              <button
                onClick={compareBlog}
                disabled={blogLoading || !blogCompetitorId.trim()}
                className="px-5 py-2.5 bg-accent text-white font-bold rounded-xl text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
              >
                {blogLoading ? '분석 중...' : '분석'}
              </button>
            </div>
          </div>

          {/* 에러 메시지 */}
          {blogError && !blogCompareData && (
            <div className="bg-down/10 border border-down/30 rounded-xl px-4 py-3 text-xs text-down">
              {blogError}
            </div>
          )}

          {blogCompareData && (() => {
            const hasMine = blogCompareData.mine.totalVisitor > 0 || blogCompareData.mine.postCount > 0;
            return (
            <>
              {/* blogId 경고 (비교 결과와 함께) */}
              {blogError && (
                <div className="bg-down/10 border border-down/30 rounded-xl px-4 py-3 text-xs text-down">
                  {blogError}
                </div>
              )}

              {/* 기본 통계 */}
              <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
                <h3 className="font-bold text-sm">
                  {hasMine ? (
                    <>
                      내 블로그 <span className="text-[11px] text-dim font-normal">({myBlogId})</span>
                      {' '}vs{' '}
                      {blogCompareData.competitor.blogName}
                    </>
                  ) : (
                    <>{blogCompareData.competitor.blogName} 블로그 정보</>
                  )}
                </h3>
                <div className={hasMine ? 'grid grid-cols-2 gap-4' : 'space-y-3 max-w-sm mx-auto'}>
                  {/* 내 블로그 (데이터 있을 때만) */}
                  {hasMine && (
                    <div className="space-y-3">
                      <p className="text-xs text-dim font-semibold text-center">내 블로그</p>
                      <StatRow label="TODAY 방문자" value={blogCompareData.mine.todayVisitor} />
                      <StatRow label="전체 방문자" value={blogCompareData.mine.totalVisitor} />
                      <StatRow label="이웃수" value={blogCompareData.mine.subscriberCount} />
                      <StatRow label="전체 포스팅" value={blogCompareData.mine.postCount} />
                    </div>
                  )}
                  {/* 경쟁자 */}
                  <div className="space-y-3">
                    {hasMine && <p className="text-xs text-dim font-semibold text-center">{blogCompareData.competitor.blogName}</p>}
                    <StatRow label="TODAY 방문자" value={blogCompareData.competitor.todayVisitor} compare={hasMine ? blogCompareData.mine.todayVisitor : undefined} />
                    <StatRow label="전체 방문자" value={blogCompareData.competitor.totalVisitor} compare={hasMine ? blogCompareData.mine.totalVisitor : undefined} />
                    <StatRow label="이웃수" value={blogCompareData.competitor.subscriberCount} compare={hasMine ? blogCompareData.mine.subscriberCount : undefined} />
                    <StatRow label="전체 포스팅" value={blogCompareData.competitor.postCount} compare={hasMine ? blogCompareData.mine.postCount : undefined} />
                  </div>
                </div>
                {!hasMine && (
                  <p className="text-[11px] text-dim text-center pt-2 border-t border-border/50">
                    내 블로그({myBlogId})는 포스팅/방문자가 없어 비교가 생략되었습니다.
                  </p>
                )}
              </div>

              {/* 검색 노출 비교 */}
              <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm">검색 노출 비교</h3>
                    <p className="text-[11px] text-dim mt-0.5">
                      최근 10개 포스팅이 네이버 검색에서 노출되는 개수를 비교합니다.
                    </p>
                  </div>
                  {!missingData && !missingLoading && (
                    <button
                      onClick={checkMissingRate}
                      className="px-4 py-2 bg-accent text-white font-bold rounded-lg text-xs hover:bg-accent-hover transition cursor-pointer whitespace-nowrap"
                    >
                      노출 확인
                    </button>
                  )}
                </div>

                {missingLoading && (
                  <div className="text-center py-6">
                    <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block mb-2" />
                    <p className="text-xs text-dim">
                      포스팅 누락 확인 중... ({missingProgress.current}/{missingProgress.total})
                    </p>
                  </div>
                )}

                {missingData && (
                  <>
                    <div className={hasMine ? 'grid grid-cols-2 gap-4' : 'space-y-3 max-w-sm mx-auto'}>
                      {/* 내 블로그 노출 (데이터 있을 때만) */}
                      {hasMine && (
                        <div className="space-y-3">
                          <p className="text-xs text-dim font-semibold text-center">내 블로그</p>
                          {missingData.mine && missingData.mine.total > 0 ? (
                            <>
                              <StatRow label="통합검색 노출" value={missingData.mine.viewExposed} suffix={`/${missingData.mine.total}개`} />
                              <StatRow label="블로그탭 노출" value={missingData.mine.blogExposed} suffix={`/${missingData.mine.total}개`} />
                              <StatRow label="유효 포스팅" value={Math.max(missingData.mine.viewExposed, missingData.mine.blogExposed)} suffix={`/${missingData.mine.total}개`} />
                              <StatRow label="무효 포스팅" value={missingData.mine.total - Math.max(missingData.mine.viewExposed, missingData.mine.blogExposed)} suffix={`/${missingData.mine.total}개`} />
                            </>
                          ) : (
                            <p className="text-xs text-dim text-center py-4">포스팅이 없습니다</p>
                          )}
                        </div>
                      )}
                      {/* 경쟁자 노출 */}
                      <div className="space-y-3">
                        {hasMine && <p className="text-xs text-dim font-semibold text-center">{blogCompareData.competitor.blogName}</p>}
                        {missingData.competitor && missingData.competitor.total > 0 ? (
                          <>
                            <StatRow
                              label="통합검색 노출"
                              value={missingData.competitor.viewExposed}
                              suffix={`/${missingData.competitor.total}개`}
                              compare={hasMine ? missingData.mine?.viewExposed : undefined}
                            />
                            <StatRow
                              label="블로그탭 노출"
                              value={missingData.competitor.blogExposed}
                              suffix={`/${missingData.competitor.total}개`}
                              compare={hasMine ? missingData.mine?.blogExposed : undefined}
                            />
                            <StatRow
                              label="유효 포스팅"
                              value={Math.max(missingData.competitor.viewExposed, missingData.competitor.blogExposed)}
                              suffix={`/${missingData.competitor.total}개`}
                              compare={hasMine && missingData.mine ? Math.max(missingData.mine.viewExposed, missingData.mine.blogExposed) : undefined}
                            />
                            <StatRow
                              label="무효 포스팅"
                              value={missingData.competitor.total - Math.max(missingData.competitor.viewExposed, missingData.competitor.blogExposed)}
                              suffix={`/${missingData.competitor.total}개`}
                              compare={hasMine && missingData.mine ? missingData.mine.total - Math.max(missingData.mine.viewExposed, missingData.mine.blogExposed) : undefined}
                              invertCompare
                            />
                          </>
                        ) : (
                          <p className="text-xs text-dim text-center py-4">포스팅이 없습니다</p>
                        )}
                      </div>
                    </div>

                    {/* 키워드 상세 */}
                    {hasMine && missingData.mine && missingData.mine.keywords.length > 0 && (
                      <KeywordDetail label="내 포스팅 키워드 상세" keywords={missingData.mine.keywords} />
                    )}

                    {missingData.competitor && missingData.competitor.keywords.length > 0 && (
                      <KeywordDetail label={`${blogCompareData.competitor.blogName} 포스팅 키워드 상세`} keywords={missingData.competitor.keywords} />
                    )}
                  </>
                )}

                {!missingData && !missingLoading && (
                  <p className="text-[11px] text-dim">최근 10개 포스팅의 검색 노출 여부를 확인합니다.</p>
                )}
              </div>
            </>
            );
          })()}
        </div>
      )}

      {/* ─── 포스팅 탭 ─── */}
      {tab === 'posting' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="font-bold text-sm mb-3">경쟁자 블로그 ID 입력</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={postCompetitorId}
                onChange={e => setPostCompetitorId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadCompetitorPosts()}
                placeholder="네이버 블로그 ID 또는 URL"
                className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition"
              />
              <button
                onClick={loadCompetitorPosts}
                disabled={postLoading || !postCompetitorId.trim()}
                className="px-5 py-2.5 bg-accent text-white font-bold rounded-xl text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
              >
                {postLoading ? '조회 중...' : '조회'}
              </button>
            </div>
          </div>

          {competitorPosts.length > 0 && (
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-bg/30">
                <h3 className="font-bold text-sm">{extractBlogId(postCompetitorId)}의 최근 포스팅</h3>
              </div>

              {/* 데스크톱 */}
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-[11px] text-dim">
                      <th className="text-left px-5 py-3 font-semibold w-10">#</th>
                      <th className="text-left px-3 py-3 font-semibold">제목</th>
                      <th className="text-center px-3 py-3 font-semibold w-20">통합검색</th>
                      <th className="text-center px-3 py-3 font-semibold w-20">블로그탭</th>
                      <th className="text-right px-3 py-3 font-semibold w-24">작성일</th>
                      <th className="text-center px-5 py-3 font-semibold w-16">확인</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {competitorPosts.map((post, i) => (
                      <tr key={post.id} className="hover:bg-surface-hover transition">
                        <td className="px-5 py-3.5 text-dim text-xs">{i + 1}</td>
                        <td className="px-3 py-3.5">
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold hover:text-accent transition truncate block max-w-[400px]" title={post.title}>
                            {post.title}
                          </a>
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {post.viewTab ? (
                            post.viewTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">{post.viewTab.rank}위</span>
                            ) : <span className="text-xs text-dim">-</span>
                          ) : <span className="text-[10px] text-dim/50">&mdash;</span>}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {post.blogTab ? (
                            post.blogTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">{post.blogTab.rank}위</span>
                            ) : <span className="text-xs text-dim">-</span>
                          ) : <span className="text-[10px] text-dim/50">&mdash;</span>}
                        </td>
                        <td className="text-right px-3 py-3.5 text-xs text-dim">{post.date}</td>
                        <td className="text-center px-5 py-3.5">
                          <button
                            onClick={() => checkPostRank(post)}
                            disabled={checkingPostId === post.id}
                            className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                          >
                            {checkingPostId === post.id ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : post.blogTab ? '재확인' : '확인'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 모바일 */}
              <div className="md:hidden divide-y divide-border/20">
                {competitorPosts.map((post, i) => (
                  <div key={post.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition line-clamp-2">{post.title}</a>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {post.blogTab && (
                            <>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                post.viewTab?.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                              }`}>
                                통합 {post.viewTab?.exposed ? `${post.viewTab.rank}위` : '-'}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                post.blogTab.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                              }`}>
                                블로그 {post.blogTab.exposed ? `${post.blogTab.rank}위` : '-'}
                              </span>
                            </>
                          )}
                          <span className="text-[11px] text-dim">{post.date}</span>
                          <button
                            onClick={() => checkPostRank(post)}
                            disabled={checkingPostId === post.id}
                            className="text-[10px] text-accent cursor-pointer disabled:opacity-50"
                          >
                            {checkingPostId === post.id ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : post.blogTab ? '재확인' : '순위확인'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 키워드 상세 컴포넌트 ───
function KeywordDetail({ label, keywords }: {
  label: string;
  keywords: { title: string; viewExposed: boolean; blogExposed: boolean; viewRank: number | null; blogRank: number | null }[];
}) {
  return (
    <div className="mt-4 pt-4 border-t border-border">
      <p className="text-xs text-dim font-semibold mb-2">{label}</p>
      <div className="space-y-1.5">
        {keywords.map((kw, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className={`w-12 text-center font-bold px-1 py-0.5 rounded-full ${
              (kw.viewExposed || kw.blogExposed) ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
            }`}>
              {(kw.viewExposed || kw.blogExposed) ? '유효' : '무효'}
            </span>
            <span className="text-text truncate flex-1">{kw.title}</span>
            {kw.viewExposed && <span className="text-up text-[10px] shrink-0">통합 {kw.viewRank}위</span>}
            {kw.blogExposed && <span className="text-up text-[10px] shrink-0">블로그 {kw.blogRank}위</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 통계 비교 행 컴포넌트 ───
function StatRow({ label, value, compare, suffix, invertCompare }: {
  label: string;
  value: number;
  compare?: number;
  suffix?: string;
  invertCompare?: boolean; // true면 낮을수록 좋음 (누락율)
}) {
  const formatted = value.toLocaleString();
  const isHigher = compare !== undefined && value > compare;
  const isLower = compare !== undefined && value < compare;

  // invertCompare: 누락율은 낮을수록 좋으므로 색상 반전
  const colorClass = invertCompare
    ? (isHigher ? 'text-down' : isLower ? 'text-up' : 'text-text')
    : (isHigher ? 'text-up' : isLower ? 'text-down' : 'text-text');

  const showUp = invertCompare ? isLower : isHigher;
  const showDown = invertCompare ? isHigher : isLower;

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-bg/50 rounded-lg">
      <span className="text-xs text-dim">{label}</span>
      <span className={`text-sm font-bold font-rank ${colorClass}`}>
        {formatted}{suffix || ''}
        {showUp && <span className="text-[10px] ml-1">▲</span>}
        {showDown && <span className="text-[10px] ml-1">▼</span>}
      </span>
    </div>
  );
}
