'use client';

import { useState, useEffect, useCallback } from 'react';
import CompetitorDashboard from '@/components/dashboard/CompetitorDashboard';

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
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  // ─── 블로그 비교 ───
  const compareBlog = useCallback(async () => {
    if (!blogCompetitorId.trim() || !authInfo) return;
    setBlogLoading(true);
    setBlogCompareData(null);
    try {
      const [myRes, compRes] = await Promise.all([
        fetch(`/api/blog/stats?blogId=${encodeURIComponent(authInfo.blogId)}`),
        fetch(`/api/blog/stats?blogId=${encodeURIComponent(blogCompetitorId.trim())}`),
      ]);
      if (myRes.ok && compRes.ok) {
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
            blogName: compData.blogName || blogCompetitorId.trim(),
          },
        });
      }
    } catch { /* ignore */ }
    finally { setBlogLoading(false); }
  }, [blogCompetitorId, authInfo]);

  // ─── 포스팅 비교 ───
  const loadCompetitorPosts = useCallback(async () => {
    if (!postCompetitorId.trim()) return;
    setPostLoading(true);
    setCompetitorPosts([]);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(postCompetitorId.trim())}&page=1&count=10`);
      if (res.ok) {
        const data = await res.json();
        setCompetitorPosts((data.posts || []).map((p: { logNo?: string; id?: string; title: string; url?: string; date: string; commentCount?: number }) => ({
          id: p.logNo || p.id || '',
          title: p.title,
          url: p.url || `https://blog.naver.com/${postCompetitorId.trim()}/${p.logNo || p.id}`,
          date: p.date,
          commentCount: p.commentCount || 0,
        })));
      }
    } catch { /* ignore */ }
    finally { setPostLoading(false); }
  }, [postCompetitorId]);

  const checkPostRank = async (post: CompetitorPost) => {
    setCheckingPostId(post.id);
    try {
      const res = await fetch('/api/blog/check-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: postCompetitorId.trim(), postTitle: post.title, postId: post.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompetitorPosts(prev => prev.map(p =>
          p.id === post.id ? { ...p, blogTab: data.blogTab, viewTab: data.viewTab } : p
        ));
      }
    } catch { /* ignore */ }
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
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="font-bold text-sm mb-3">경쟁자 블로그 ID 입력</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={blogCompetitorId}
                onChange={e => setBlogCompetitorId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && compareBlog()}
                placeholder="네이버 블로그 ID"
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

          {blogCompareData && (
            <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
              <h3 className="font-bold text-sm">내 블로그 vs {blogCompareData.competitor.blogName}</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* 내 블로그 */}
                <div className="space-y-3">
                  <p className="text-xs text-dim font-semibold text-center">내 블로그</p>
                  <StatRow label="TODAY 방문자" value={blogCompareData.mine.todayVisitor} />
                  <StatRow label="전체 방문자" value={blogCompareData.mine.totalVisitor} />
                  <StatRow label="이웃수" value={blogCompareData.mine.subscriberCount} />
                  <StatRow label="전체 포스팅" value={blogCompareData.mine.postCount} />
                </div>
                {/* 경쟁자 */}
                <div className="space-y-3">
                  <p className="text-xs text-dim font-semibold text-center">{blogCompareData.competitor.blogName}</p>
                  <StatRow label="TODAY 방문자" value={blogCompareData.competitor.todayVisitor} compare={blogCompareData.mine.todayVisitor} />
                  <StatRow label="전체 방문자" value={blogCompareData.competitor.totalVisitor} compare={blogCompareData.mine.totalVisitor} />
                  <StatRow label="이웃수" value={blogCompareData.competitor.subscriberCount} compare={blogCompareData.mine.subscriberCount} />
                  <StatRow label="전체 포스팅" value={blogCompareData.competitor.postCount} compare={blogCompareData.mine.postCount} />
                </div>
              </div>
            </div>
          )}
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
                placeholder="네이버 블로그 ID"
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
                <h3 className="font-bold text-sm">{postCompetitorId}의 최근 포스팅</h3>
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

// ─── 통계 비교 행 컴포넌트 ───
function StatRow({ label, value, compare }: { label: string; value: number; compare?: number }) {
  const formatted = value.toLocaleString();
  const isHigher = compare !== undefined && value > compare;
  const isLower = compare !== undefined && value < compare;

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-bg/50 rounded-lg">
      <span className="text-xs text-dim">{label}</span>
      <span className={`text-sm font-bold font-rank ${isHigher ? 'text-up' : isLower ? 'text-down' : 'text-text'}`}>
        {formatted}
        {isHigher && <span className="text-[10px] ml-1">▲</span>}
        {isLower && <span className="text-[10px] ml-1">▼</span>}
      </span>
    </div>
  );
}
