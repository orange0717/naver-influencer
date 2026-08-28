'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import CompetitorDashboard from '@/components/dashboard/CompetitorDashboard';
import LoadingSpinner from '@/components/LoadingSpinner';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';
import { extractBlogId, isValidBlogId } from '@/lib/blog-utils';
import type { AnalysisTab, AuthInfo, BlogCompareData, CompetitorPost, QuotaInfo } from './page.helpers';
import { AI_THRESHOLD, getAiBadgeStyle, sentenceTypeLabel, extractPostInfo, StatRow } from './page.helpers';

export default function CompetitorPage() {
  const [tab, setTab] = useState<AnalysisTab>('challenge');
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  /** 내 정보를 **확인하지 못한** 상태. 비로그인(=확인했고 없음)과 구분해야 한다. */
  const [authFailed, setAuthFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  // 블로그 탭
  const [blogCompetitorId, setBlogCompetitorId] = useState('');
  const [blogCompareData, setBlogCompareData] = useState<BlogCompareData | null>(null);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogError, setBlogError] = useState('');

  // 포스팅 탭
  const [postCompetitorId, setPostCompetitorId] = useState('');
  const [postInputError, setPostInputError] = useState('');
  const [competitorPosts, setCompetitorPosts] = useState<CompetitorPost[]>([]);
  const [postLoading, setPostLoading] = useState(false);
  const [checkingPostId, setCheckingPostId] = useState('');
  const [aiAnalyzingId, setAiAnalyzingId] = useState('');
  const [aiBatchRunning, setAiBatchRunning] = useState(false);
  const [aiExpandedId, setAiExpandedId] = useState('');

  useEffect(() => {
    loadAuth();
    loadQuota();
  }, []);

  async function loadQuota() {
    try {
      const res = await fetch('/api/competitor/quota');
      if (res.ok) {
        const data = await res.json();
        setQuota(data);
      }
    } catch {
      // 무시: 배너 미표시
    }
  }

  async function loadAuth() {
    try {
      const res = await fetch('/api/auth/me');
      // ⚠️ res.ok 를 안 보면 503(auth_backend_unavailable) 응답의 { error } 가 그대로 data 가 되고,
      //    data.id 가 없으니 **로그인해 둔 사람을 회원 전용 모달로 쫓아낸다**. 서버가 잠깐 흔들린
      //    것을 "당신은 회원이 아니다"로 단정하는 셈이다. 확인 실패는 비로그인이 아니다.
      //    (/api/auth/me 는 비로그인일 때 200 { id: null } 을, 장애일 때만 503 을 준다.)
      if (!res.ok) throw new Error(`auth_check_failed_${res.status}`);
      const data = await res.json();
      // 목적지를 붙여야 로그인 후 여기로 돌아온다(안 붙이면 홈에 남는다).
      // 회원 전용 모달(가입/로그인 둘 다)로 통일(2026-08-28 오렌지 승인 "C를 B로 합치기").
      if (!data.id) { window.location.href = `/?memberOnly=1&redirect=${encodeURIComponent(window.location.pathname)}`; return; }

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
    } catch (e) {
      // 실패를 삼키면 아래 `!authInfo` 분기가 "로그인이 필요합니다"로 둔갑한다 —
      // 로그인해 둔 사람에게 로그인하라고 하는 거짓 안내다. 실패는 실패로 남긴다.
      console.error('[competitor] loadAuth failed', e);
      setAuthFailed(true);
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
    setBlogError('');

    const compId = extractBlogId(blogCompetitorId);

    if (!myBlogIdValid) {
      setBlogError(`내 블로그 ID(${myBlogId})가 유효하지 않습니다. 프로필 설정에서 블로그 ID를 확인해주세요.`);
    }

    try {
      const [myRes, compRes, compVisitorsRes] = await Promise.all([
        fetch(`/api/blog/stats?blogId=${encodeURIComponent(myBlogId)}`),
        fetch(`/api/blog/stats?blogId=${encodeURIComponent(compId)}`),
        fetch(`/api/blog/visitors?blogId=${encodeURIComponent(compId)}&days=7`),
      ]);

      if (!myRes.ok || !compRes.ok) {
        setBlogError('블로그 통계를 가져오지 못했습니다. 블로그 ID를 확인해주세요.');
        return;
      }

      const myData = await myRes.json();
      const compData = await compRes.json();

      // 일주일 평균 방문자수 + 일별 추이 (DB에 데이터가 없으면 빈 배열)
      let weeklyAvgVisitor: number | null = null;
      let weeklyVisitors: { date: string; count: number }[] = [];
      if (compVisitorsRes.ok) {
        const v = await compVisitorsRes.json();
        const items: { date: string; count: number }[] = v.visitors || [];
        if (items.length > 0) {
          const sum = items.reduce((s, it) => s + (it.count || 0), 0);
          weeklyAvgVisitor = Math.round(sum / items.length);
          // 날짜 오름차순으로 정렬 (차트용)
          weeklyVisitors = [...items].sort((a, b) => a.date.localeCompare(b.date));
        }
      }

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
          weeklyAvgVisitor,
          weeklyVisitors,
          blogName: compData.blogName || compId,
          isInfluencer: !!compData.isInfluencer,
          influencerCategory: compData.influencerCategory || null,
          influencerSubCategory: compData.influencerSubCategory || null,
        },
      });
    } catch (err) {
      console.error('[competitor] compareBlog error:', err);
      setBlogError('블로그 통계 조회 중 오류가 발생했습니다.');
    }
    finally { setBlogLoading(false); }
  }, [blogCompetitorId, authInfo, myBlogId, myBlogIdValid]);

  // ─── 포스팅 분석 (포스팅 URL만) ───
  const loadCompetitorPosts = useCallback(async () => {
    if (!postCompetitorId.trim()) return;
    const { blogId, logNo } = extractPostInfo(postCompetitorId);
    setPostLoading(true);
    setPostInputError('');
    setCompetitorPosts([]);

    if (!logNo) {
      setPostInputError(
        '블로그 ID만으로는 분석할 수 없습니다. 네이버 포스팅 전체 URL을 입력해 주세요. (예: https://blog.naver.com/orangelibrary/1234567890)',
      );
      setPostLoading(false);
      return;
    }

    if (!blogId) {
      setPostInputError('URL에서 블로그 정보를 찾을 수 없습니다. 주소를 다시 확인해 주세요.');
      setPostLoading(false);
      return;
    }

    const tempPost: CompetitorPost = {
      id: logNo,
      title: `포스팅 #${logNo}`,
      url: `https://blog.naver.com/${blogId}/${logNo}`,
      date: '',
      commentCount: 0,
    };
    setCompetitorPosts([tempPost]);
    setPostLoading(false);
    void checkPostRank(tempPost);
    void runAiAnalysis(tempPost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postCompetitorId]);

  const checkPostRank = async (post: CompetitorPost) => {
    setCheckingPostId(post.id);
    try {
      const { blogId } = extractPostInfo(postCompetitorId);
      const res = await fetch('/api/blog/check-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId, postTitle: post.title, postId: post.id }),
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

  // ─── AI 의심도 분석 (포스팅 분석과 동일 SSE) ───
  const runAiAnalysis = useCallback(async (post: CompetitorPost): Promise<void> => {
    const { blogId } = extractPostInfo(postCompetitorId);
    if (!blogId || !post.id) return;
    setAiAnalyzingId(post.id);
    try {
      const res = await fetch('/api/blog/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId, logNo: post.id }),
      });
      if (!res.ok || !res.body) {
        setCompetitorPosts(prev => prev.map(p =>
          p.id === post.id ? { ...p, aiError: '분석 실패' } : p
        ));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'result') {
              setCompetitorPosts(prev => prev.map(p =>
                p.id === post.id ? { ...p, ai: event.data, aiError: undefined } : p
              ));
            } else if (event.type === 'error') {
              setCompetitorPosts(prev => prev.map(p =>
                p.id === post.id ? { ...p, aiError: typeof event.data === 'string' ? event.data : '분석 실패' } : p
              ));
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error('[competitor] runAiAnalysis error:', err);
      setCompetitorPosts(prev => prev.map(p =>
        p.id === post.id ? { ...p, aiError: '네트워크 오류' } : p
      ));
    } finally {
      setAiAnalyzingId('');
    }
  }, [postCompetitorId]);

  // ─── 전체 AI 검사 (순차) ───
  const runAllAiAnalysis = useCallback(async () => {
    if (aiBatchRunning) return;
    setAiBatchRunning(true);
    try {
      const targets = competitorPosts.filter(p => !p.ai && !p.aiError);
      for (const post of targets) {
        await runAiAnalysis(post);
      }
    } finally {
      setAiBatchRunning(false);
    }
  }, [competitorPosts, aiBatchRunning, runAiAnalysis]);

  // 새로 조회할 때 AI 결과 초기화는 loadCompetitorPosts 가 이미 setCompetitorPosts([]) 로 처리

  // 포스팅 AI 통계
  const aiCheckedCount = competitorPosts.filter(p => p.ai).length;
  const aiSuspiciousCount = competitorPosts.filter(p => p.ai && p.ai.aiProbability >= AI_THRESHOLD).length;

  if (loading) {
    return <div className="max-w-4xl mx-auto py-20 text-center text-dim">로딩 중...</div>;
  }

  if (!authInfo && authFailed) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center space-y-2">
        <p className="text-text font-semibold">내 정보를 불러오지 못했습니다.</p>
        <p className="text-dim text-sm">로그아웃되었다는 뜻이 아닙니다. 잠시 후 다시 시도해 주세요.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2.5 bg-accent text-white rounded-xl font-bold hover:bg-accent-hover transition"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!authInfo) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <p className="text-dim mb-4">로그인이 필요합니다.</p>
        {/* 목적지를 붙여야 로그인 후 이 화면으로 돌아온다. */}
        <a href={`/?memberOnly=1&redirect=${encodeURIComponent('/competitor')}`} className="text-accent font-semibold">로그인하기</a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="type-page-title">경쟁자 분석</h1>

      {/* ─── 일일 사용 현황 배너 ─── */}
      {quota && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs flex items-center justify-between gap-3 flex-wrap ${
            quota.remaining === 0 && !quota.unlimited
              ? 'bg-down/10 border-down/30 text-down'
              : 'bg-surface border-border text-text'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold">
              경쟁자 분석 : 하루 {quota.limit ?? 3}회 무료(다른 기능과 합산), 이용권 보유 시 무제한
            </span>
            {!quota.unlimited && (
              <span className="text-dim">
                (오늘 {quota.used} / {quota.limit}회 사용)
              </span>
            )}
          </div>
          {!quota.unlimited && quota.plan !== 'influencer' && (
            <a
              href="/subscribe"
              className="text-accent font-bold hover:underline whitespace-nowrap"
            >
              업그레이드 →
            </a>
          )}
        </div>
      )}

      {/* ─── 탭 선택 ─── */}
      <SegmentedFilter
        size="lg"
        fullWidth
        options={[
          { value: 'challenge', label: '키워드챌린지' },
          { value: 'blog', label: '블로그' },
          { value: 'posting', label: '포스팅' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* ─── 키워드챌린지 탭 ─── */}
      {tab === 'challenge' && (
        <CompetitorDashboard naverId={authInfo.naverId} />
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

          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-bold text-sm mb-3">경쟁자 블로그 ID 입력</h3>
            <p className="text-[11px] text-dim mb-2">블로그 ID 또는 URL을 입력하세요 (예: orangelibrary 또는 https://blog.naver.com/orangelibrary)</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={blogCompetitorId}
                onChange={e => setBlogCompetitorId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && compareBlog()}
                placeholder="네이버 블로그 ID 또는 URL"
                className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition"
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

          {blogCompareData && (
            <>
              {/* blogId 경고 */}
              {blogError && (
                <div className="bg-down/10 border border-down/30 rounded-xl px-4 py-3 text-xs text-down">
                  {blogError}
                </div>
              )}

              {/* 경쟁자 블로그 기본 통계 */}
              <div className="bg-surface rounded-lg border border-border p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-sm">
                    {blogCompareData.competitor.blogName} 블로그 정보
                  </h3>
                  {blogCompareData.competitor.isInfluencer ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent">
                      ⭐ 네이버 인플루언서{blogCompareData.competitor.influencerCategory ? ` · ${blogCompareData.competitor.influencerCategory}` : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-dim/15 text-dim">
                      일반 블로거
                    </span>
                  )}
                  {(() => {
                    const avgPerPost = blogCompareData.competitor.postCount > 0
                      ? blogCompareData.competitor.totalVisitor / blogCompareData.competitor.postCount
                      : 0;
                    const activityRate = blogCompareData.competitor.subscriberCount > 0
                      ? (blogCompareData.competitor.todayVisitor / blogCompareData.competitor.subscriberCount) * 100
                      : 0;
                    const lowActivity = blogCompareData.competitor.subscriberCount >= 1000
                      && (activityRate < 0.5 || avgPerPost < 200);
                    return lowActivity ? (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-down/15 text-down"
                        title="이웃 수 대비 실제 활성도가 낮습니다. 이웃 광고성 수집 블로그일 가능성이 있어요."
                      >
                        ⚠ 활성도 낮음
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="space-y-3 max-w-sm mx-auto">
                  <StatRow label="TODAY 방문자" value={blogCompareData.competitor.todayVisitor} suffix="명" />
                  {blogCompareData.competitor.weeklyAvgVisitor !== null ? (
                    <StatRow
                      label="일주일 평균 방문자"
                      value={blogCompareData.competitor.weeklyAvgVisitor}
                      suffix="명"
                    />
                  ) : (
                    <div className="flex items-center justify-between py-2 px-3 bg-bg/50 rounded-lg">
                      <span className="text-xs text-dim">일주일 평균 방문자</span>
                      <span className="text-[11px] text-dim">데이터 수집 중</span>
                    </div>
                  )}
                  <StatRow label="전체 방문자" value={blogCompareData.competitor.totalVisitor} />
                  <StatRow label="이웃수" value={blogCompareData.competitor.subscriberCount} />
                  <StatRow label="전체 포스팅" value={blogCompareData.competitor.postCount} />
                  {blogCompareData.competitor.postCount > 0 && (
                    <StatRow
                      label="포스팅당 평균 방문"
                      value={Math.round(blogCompareData.competitor.totalVisitor / blogCompareData.competitor.postCount)}
                      suffix="명"
                    />
                  )}
                </div>

                {blogCompareData.competitor.weeklyVisitors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-dim font-semibold mb-2">최근 7일 방문자 추이</p>
                    <div className="bg-bg/50 rounded-lg p-3 h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={blogCompareData.competitor.weeklyVisitors} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="visitorFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#BF877A" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="#BF877A" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="date"
                            tick={{ fill: '#83817A', fontSize: 11 }}
                            tickFormatter={(d: string) => d.slice(5).replace('-', '/')}
                            axisLine={{ stroke: '#E7E6E2' }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: '#83817A', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={36}
                            tickFormatter={(v: number) => v.toLocaleString()}
                          />
                          <Tooltip
                            contentStyle={{ background: '#FCFCFB', border: '1px solid #E7E6E2', borderRadius: 8, fontSize: 12 }}
                            labelFormatter={(d) => String(d)}
                            formatter={(v) => [`${Number(v ?? 0).toLocaleString()}명`, '방문자']}
                          />
                          <Area
                            type="monotone"
                            dataKey="count"
                            stroke="#BF877A"
                            strokeWidth={2}
                            fill="url(#visitorFill)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── 포스팅 탭 ─── */}
      {tab === 'posting' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-lg border border-border p-5">
            <h3 className="font-bold text-sm mb-3">포스팅 분석</h3>
            <p className="text-[11px] font-semibold text-text mb-1">포스팅 URL 입력</p>
            <p className="text-[11px] text-dim mb-2">
              브라우저 주소창에 보이는 네이버 블로그 글 전체 주소를 붙여 넣어 주세요.<br />
              예: <code className="text-text/90">https://blog.naver.com/orangelibrary/1234567890</code> → 해당 글 노출·AI 분석
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={postCompetitorId}
                onChange={e => {
                  setPostCompetitorId(e.target.value);
                  setPostInputError('');
                }}
                onKeyDown={e => e.key === 'Enter' && loadCompetitorPosts()}
                placeholder="https://blog.naver.com/orangelibrary/글번호"
                className="flex-1 px-4 py-2.5 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition"
              />
              <button
                onClick={loadCompetitorPosts}
                disabled={postLoading || !postCompetitorId.trim()}
                className="px-5 py-2.5 bg-accent text-white font-bold rounded-xl text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
              >
                {postLoading ? '조회 중...' : '분석'}
              </button>
            </div>
            {postInputError && (
              <p className="text-[11px] text-down mt-2">{postInputError}</p>
            )}
          </div>

          {competitorPosts.length > 0 && (
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-bg/30 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-dim mt-0.5">
                    AI 검사 {aiCheckedCount}/{competitorPosts.length}
                    {aiCheckedCount > 0 && (
                      <>
                        {' · '}
                        <span className={aiSuspiciousCount > 0 ? 'text-down font-bold' : 'text-up font-bold'}>
                          AI 추정 {aiSuspiciousCount}개
                        </span>
                        {' / 전체 '}{competitorPosts.length}개
                      </>
                    )}
                    <span className="ml-1 text-dim/70">(임계값 {AI_THRESHOLD}%)</span>
                  </p>
                </div>
                {competitorPosts.length > 1 && (
                <button
                  onClick={runAllAiAnalysis}
                  disabled={aiBatchRunning || aiAnalyzingId !== '' || competitorPosts.every(p => p.ai)}
                  className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-accent text-white hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-default whitespace-nowrap"
                >
                  {aiBatchRunning ? (
                    <span className="flex items-center gap-1.5">
                      <LoadingSpinner size="xs" color="border-white/40 border-t-white" />
                      검사 중 ({aiCheckedCount}/{competitorPosts.length})
                    </span>
                  ) : '전체 AI 검사'}
                </button>
                )}
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
                      <th className="text-center px-3 py-3 font-semibold w-24">AI 의심도</th>
                      <th className="text-left px-3 py-3 font-semibold w-24">작성일</th>
                      <th className="text-center px-5 py-3 font-semibold w-28">확인</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {competitorPosts.map((post, i) => {
                      const aiBadge = post.ai ? getAiBadgeStyle(post.ai.aiProbability) : null;
                      const isAiAnalyzing = aiAnalyzingId === post.id;
                      const isAiExpanded = aiExpandedId === post.id;
                      return (
                      <Fragment key={post.id}>
                      <tr className="hover:bg-surface-hover transition">
                        <td className="px-5 py-3.5 text-dim text-xs">{i + 1}</td>
                        <td className="px-3 py-3.5">
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold hover:text-accent transition truncate block max-w-[380px]" title={post.title}>
                            {post.title}
                          </a>
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {post.viewTab ? (
                            post.viewTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">{post.viewTab.rank}위</span>
                            ) : <span className="text-xs text-dim" title="검색 결과에 없음">—</span>
                          ) : <span className="text-[10px] text-dim/50">&mdash;</span>}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {post.blogTab ? (
                            post.blogTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">{post.blogTab.rank}위</span>
                            ) : <span className="text-xs text-dim" title="검색 결과에 없음">—</span>
                          ) : <span className="text-[10px] text-dim/50">&mdash;</span>}
                        </td>
                        <td className="text-center px-3 py-3.5">
                          {post.ai && aiBadge ? (
                            <button
                              onClick={() => setAiExpandedId(isAiExpanded ? '' : post.id)}
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full cursor-pointer ${aiBadge.bg} ${aiBadge.text} hover:opacity-80`}
                              title={`${aiBadge.label} · 클릭하여 상세 보기`}
                            >
                              {post.ai.aiProbability}%
                            </button>
                          ) : post.aiError ? (
                            <span className="text-[10px] text-down" title={post.aiError}>오류</span>
                          ) : isAiAnalyzing ? (
                            <LoadingSpinner size="xs" />
                          ) : <span className="text-[10px] text-dim/50">&mdash;</span>}
                        </td>
                        <td className="text-right px-3 py-3.5 text-xs text-dim">{post.date}</td>
                        <td className="text-center px-5 py-3.5">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => checkPostRank(post)}
                              disabled={checkingPostId === post.id}
                              className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                            >
                              {checkingPostId === post.id ? (
                                <LoadingSpinner size="xs" />
                              ) : post.blogTab ? '재확인' : '순위'}
                            </button>
                            {!post.ai && !isAiAnalyzing && (
                              <button
                                onClick={() => runAiAnalysis(post)}
                                disabled={aiBatchRunning || aiAnalyzingId !== ''}
                                className="text-[11px] text-down hover:underline cursor-pointer disabled:opacity-50"
                              >
                                AI
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isAiExpanded && post.ai && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <div className="px-5 pb-4 pt-3 space-y-3 bg-bg/30 border-t border-border/30">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold">AI 확률</span>
                                <span className={`text-base font-black font-rank ${
                                  post.ai.aiProbability < 30 ? 'text-up' : post.ai.aiProbability < AI_THRESHOLD ? 'text-dim' : 'text-down'
                                }`}>
                                  {post.ai.aiProbability}%
                                </span>
                                <div className="flex-1 max-w-md h-2 bg-border/30 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      post.ai.aiProbability < 30 ? 'bg-up' : post.ai.aiProbability < AI_THRESHOLD ? 'bg-dim' : 'bg-down'
                                    }`}
                                    style={{ width: `${post.ai.aiProbability}%` }}
                                  />
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${aiBadge!.bg} ${aiBadge!.text}`}>
                                  {aiBadge!.label}
                                </span>
                              </div>
                              <div className="bg-bg rounded-xl p-3">
                                <p className="text-[11px] text-dim font-semibold mb-1">판단 근거</p>
                                <p className="text-xs leading-relaxed">{post.ai.aiReasoning}</p>
                              </div>
                              {post.ai.keywords?.length > 0 && (
                                <div>
                                  <p className="text-[11px] text-dim font-semibold mb-1.5">핵심 키워드</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {post.ai.keywords.map((kw, k) => (
                                      <span key={k} className={`text-[11px] px-2 py-0.5 rounded-lg border ${
                                        kw.relevance === 'high' ? 'bg-accent/10 text-accent border-accent/20 font-bold'
                                        : kw.relevance === 'medium' ? 'bg-border/30 text-text border-border/40'
                                        : 'bg-border/20 text-dim border-border/30'
                                      }`}>{kw.keyword}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {post.ai.keySentences?.length > 0 && (
                                <div>
                                  <p className="text-[11px] text-dim font-semibold mb-1.5">핵심 문장</p>
                                  <div className="space-y-1.5">
                                    {post.ai.keySentences.map((s, k) => (
                                      <div key={k} className="flex items-start gap-2 text-xs">
                                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                          s.type === 'topic' ? 'bg-accent/10 text-accent'
                                          : s.type === 'evidence' ? 'bg-text/10 text-text'
                                          : s.type === 'conclusion' ? 'bg-down/10 text-down'
                                          : 'bg-text/15 text-text'
                                        }`}>{sentenceTypeLabel[s.type] || s.type}</span>
                                        <span className="leading-relaxed">{s.sentence}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {post.ai.writingStyle && (
                                <div className="flex flex-wrap gap-2 text-[11px]">
                                  <span className="px-2 py-0.5 rounded-lg bg-border/20 text-dim">
                                    스타일 <strong className="text-text">{post.ai.writingStyle.tone}</strong>
                                  </span>
                                  <span className="px-2 py-0.5 rounded-lg bg-border/20 text-dim">
                                    가독성 <strong className="text-text">{post.ai.writingStyle.readability === 'easy' ? '쉬움' : post.ai.writingStyle.readability === 'medium' ? '보통' : '어려움'}</strong>
                                  </span>
                                  <span className="px-2 py-0.5 rounded-lg bg-border/20 text-dim">
                                    독창성 <strong className="text-text">{post.ai.writingStyle.originality}/10</strong>
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 모바일 */}
              <div className="md:hidden divide-y divide-border/20">
                {competitorPosts.map((post, i) => {
                  const aiBadge = post.ai ? getAiBadgeStyle(post.ai.aiProbability) : null;
                  const isAiAnalyzing = aiAnalyzingId === post.id;
                  const isAiExpanded = aiExpandedId === post.id;
                  return (
                  <div key={post.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold text-sm hover:text-accent transition line-clamp-2 flex-1">{post.title}</a>
                          {post.ai && aiBadge && (
                            <button
                              onClick={() => setAiExpandedId(isAiExpanded ? '' : post.id)}
                              className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-lg ${aiBadge.bg} ${aiBadge.text} cursor-pointer`}
                            >
                              AI {post.ai.aiProbability}%
                            </button>
                          )}
                        </div>
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
                              <LoadingSpinner size="xs" />
                            ) : post.blogTab ? '재확인' : '순위확인'}
                          </button>
                          {!post.ai && (
                            <button
                              onClick={() => runAiAnalysis(post)}
                              disabled={aiBatchRunning || aiAnalyzingId !== ''}
                              className="text-[10px] text-down cursor-pointer disabled:opacity-50"
                            >
                              {isAiAnalyzing ? (
                                <LoadingSpinner size="xs" color="border-down/30 border-t-down" />
                              ) : 'AI 검사'}
                            </button>
                          )}
                          {post.aiError && (
                            <span className="text-[10px] text-down" title={post.aiError}>AI 오류</span>
                          )}
                        </div>
                        {isAiExpanded && post.ai && (
                          <div className="mt-2.5 space-y-2 pt-2 border-t border-border/30">
                            <p className="text-[11px] leading-relaxed bg-bg rounded-lg p-2">{post.ai.aiReasoning}</p>
                            {post.ai.keywords?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {post.ai.keywords.map((kw, k) => (
                                  <span key={k} className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    kw.relevance === 'high' ? 'bg-accent/10 text-accent font-bold' : 'bg-border/30 text-dim'
                                  }`}>{kw.keyword}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
