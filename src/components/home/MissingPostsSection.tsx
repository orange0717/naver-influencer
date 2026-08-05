'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import { filterMissing, countMissing, countMissingInArea, countIndexingWait, INDEXING_GRACE_HOURS, type MissingResultsMap, type MissingState, type MissingArea } from '@/lib/missing-rate';
import type { BloggerProfile, BlogPost } from './BlogAnalysisSection.helpers';
import { fetchWithTimeout, getProfileFromApi, CHECK_FRESH_MS } from './BlogAnalysisSection.helpers';

const PERIOD_OPTIONS = [7, 15, 30, 90, 120, 0] as const; // 0 = 전체(일수 기준 아님)
type Period = typeof PERIOD_OPTIONS[number];
const PER_PAGE = 30;
const MAX_PAGES_ALL = 20; // 안전장치: 최대 600개까지만 조회
const DAY_MS = 24 * 60 * 60 * 1000;

type SortKey = 'latest' | 'oldest' | 'title' | 'missingRate';
type AreaFilter = 'all' | MissingArea;

type PostMissingEntry = MissingState;

/** "2026. 8. 1." 또는 "2026. 8. 1. 14:23" 형식(비표준) + ISO 문자열까지 최대한 파싱 */
function parsePostDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function formatCheckedAt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function missingAreaCount(mr?: PostMissingEntry): number {
  if (!mr) return 0;
  let n = 0;
  if (mr.viewTab.exposed === false) n++;
  if (mr.blogTab.exposed === false) n++;
  if (mr.influencerTab?.exposed === false) n++;
  return n;
}

function ExposureBadge({ exposed }: { exposed: boolean | null | undefined }) {
  if (exposed === true) return <span className="text-[11px] font-bold text-up bg-up/10 px-2 py-0.5 rounded-full whitespace-nowrap">🟢 노출</span>;
  if (exposed === false) return <span className="text-[11px] font-bold text-down bg-down/10 px-2 py-0.5 rounded-full whitespace-nowrap">🔴 미노출</span>;
  return <span className="text-[11px] font-semibold text-dim bg-border/30 px-2 py-0.5 rounded-full whitespace-nowrap">미확인</span>;
}

function StatusBadge({ mr, isChecking }: { mr?: PostMissingEntry; isChecking: boolean }) {
  if (isChecking) return <span className="text-[11px] font-bold text-blue bg-blue/10 px-2 py-0.5 rounded-full whitespace-nowrap">🔵 검사중</span>;
  if (mr?.status === 'failed') return <span className="text-[11px] font-bold text-amber-600 bg-amber-500/15 px-2 py-0.5 rounded-full whitespace-nowrap">🟡 재검사 필요</span>;
  if (!mr) return <span className="text-[11px] font-semibold text-dim bg-border/30 px-2 py-0.5 rounded-full whitespace-nowrap">미확인</span>;
  if (missingAreaCount(mr) > 0) return <span className="text-[11px] font-bold text-down bg-down/10 px-2 py-0.5 rounded-full whitespace-nowrap">🔴 미노출</span>;
  const allChecked = mr.viewTab.exposed !== null && mr.blogTab.exposed !== null;
  if (allChecked) return <span className="text-[11px] font-bold text-up bg-up/10 px-2 py-0.5 rounded-full whitespace-nowrap">🟢 노출</span>;
  return <span className="text-[11px] font-semibold text-dim bg-border/30 px-2 py-0.5 rounded-full whitespace-nowrap">미확인</span>;
}

export default function MissingPostsSection() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [period, setPeriod] = useState<Period>(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [missingResults, setMissingResults] = useState<MissingResultsMap>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  const [checkingPostId, setCheckingPostId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('latest');
  const abortRef = useRef(false);

  useEffect(() => () => { abortRef.current = true; }, []);

  useEffect(() => {
    (async () => {
      const p = await getProfileFromApi();
      setProfile(p);
    })();
  }, []);

  const usingCustomRange = Boolean(customFrom || customTo);

  // 선택 기간의 시작일 (직접 선택 우선) — 최근 30일 통계 카드를 위해 최소 30일치는 항상 로드
  const rangeFrom = useMemo(() => {
    if (customFrom) return new Date(`${customFrom}T00:00:00`);
    if (period > 0) return new Date(Date.now() - period * DAY_MS);
    return null;
  }, [customFrom, period]);
  const rangeTo = useMemo(() => (customTo ? new Date(`${customTo}T23:59:59`) : null), [customTo]);
  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * DAY_MS), []);
  const fetchCutoff = useMemo(() => {
    if (usingCustomRange) return rangeFrom; // 직접 선택 시엔 정확히 그 범위만
    if (rangeFrom) return rangeFrom < thirtyDaysAgo ? rangeFrom : thirtyDaysAgo;
    return null; // 전체
  }, [usingCustomRange, rangeFrom, thirtyDaysAgo]);

  const fetchPosts = useCallback(async (blogId: string, cutoff: Date | null) => {
    setPostsLoading(true);
    try {
      const all: BlogPost[] = [];
      for (let page = 1; page <= MAX_PAGES_ALL; page++) {
        const res = await fetchWithTimeout(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${PER_PAGE}`);
        if (!res.ok) break;
        const data = await res.json();
        const pagePosts: BlogPost[] = data.posts || [];
        all.push(...pagePosts);
        if (pagePosts.length < PER_PAGE) break; // 마지막 페이지
        if (cutoff) {
          const lastDate = parsePostDate(pagePosts[pagePosts.length - 1].date);
          if (lastDate && lastDate < cutoff) break;
        }
      }
      setPosts(all);
    } catch {
      setErrorMessage('포스트 목록을 불러오지 못했습니다.');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const fetchMissingState = useCallback(async (blogId: string) => {
    try {
      const res = await fetchWithTimeout(`/api/my/post-missing-state?blogId=${encodeURIComponent(blogId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setMissingResults(data.results || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!profile) return;
    fetchPosts(profile.blogId, fetchCutoff);
    fetchMissingState(profile.blogId);
  }, [profile, fetchCutoff, fetchPosts, fetchMissingState]);

  const checkOne = useCallback(async (post: BlogPost): Promise<'ok' | 'failed'> => {
    if (!profile) return 'failed';
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch('/api/blog/check-missing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogId: profile.blogId, postTitle: post.title, postId: post.id, checkInfluencer: true }),
        });
        if (res.ok) {
          const data = await res.json();
          setMissingResults(prev => ({ ...prev, [post.id]: { ...data, status: 'ok', checkedAt: new Date().toISOString() } }));
          return 'ok';
        }
      } catch { /* 재시도 */ }
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 800 * attempt));
    }
    return 'failed';
  }, [profile]);

  const checkAll = async () => {
    if (!profile || posts.length === 0) return;
    setCheckingAll(true);
    abortRef.current = false;
    setCheckProgress({ current: 0, total: posts.length });
    const now = Date.now();
    for (let i = 0; i < posts.length; i++) {
      if (abortRef.current) break;
      const post = posts[i];
      const existing = missingResults[post.id];
      const isFresh = existing?.status === 'ok' && !!existing.checkedAt
        && (now - new Date(existing.checkedAt).getTime()) < CHECK_FRESH_MS;
      if (!isFresh) {
        setCheckingPostId(post.id);
        await checkOne(post);
        if (i < posts.length - 1) await new Promise(r => setTimeout(r, 2000));
      }
      setCheckProgress({ current: i + 1, total: posts.length });
    }
    setCheckingPostId(null);
    setCheckingAll(false);
  };

  // 선택한 기간(직접 선택 포함)으로 정확히 트리밍 — fetchPosts는 안전을 위해 30일치를 항상 더 넉넉히 불러오므로 여기서 최종 필터링
  const periodPosts = useMemo(() => posts.filter(p => {
    const d = parsePostDate(p.date);
    if (!d) return true; // 날짜 파싱 불가 시 보수적으로 포함
    if (rangeFrom && d < rangeFrom) return false;
    if (rangeTo && d > rangeTo) return false;
    return true;
  }), [posts, rangeFrom, rangeTo]);

  const recent30Posts = useMemo(() => posts.filter(p => {
    const d = parsePostDate(p.date);
    return d ? d >= thirtyDaysAgo : false;
  }), [posts, thirtyDaysAgo]);

  // 발행 시각(publishedAt)을 붙인 버전 — 색인 지연 유예 판정(missing-rate.ts)에 사용
  const periodPostsDated = useMemo(() => periodPosts.map(p => ({ ...p, publishedAt: parsePostDate(p.date) })), [periodPosts]);
  const recent30PostsDated = useMemo(() => recent30Posts.map(p => ({ ...p, publishedAt: parsePostDate(p.date) })), [recent30Posts]);

  const totalMissing = useMemo(() => countMissing(periodPostsDated, missingResults), [periodPostsDated, missingResults]);
  const viewMissing = useMemo(() => countMissingInArea(periodPostsDated, missingResults, 'view'), [periodPostsDated, missingResults]);
  const blogMissing = useMemo(() => countMissingInArea(periodPostsDated, missingResults, 'blog'), [periodPostsDated, missingResults]);
  const influencerMissing = useMemo(() => countMissingInArea(periodPostsDated, missingResults, 'influencer'), [periodPostsDated, missingResults]);
  const recent30Missing = useMemo(() => countMissing(recent30PostsDated, missingResults), [recent30PostsDated, missingResults]);
  // 발행 후 유예 기간 내라 미노출 집계에서 제외된 게시글 수(투명성 안내용)
  const indexingWaitCount = useMemo(() => countIndexingWait(periodPostsDated, missingResults), [periodPostsDated, missingResults]);

  const pct = (n: number) => periodPosts.length === 0 ? 0 : Math.round((n / periodPosts.length) * 100);

  const missingList = useMemo(() => {
    let list = filterMissing(periodPostsDated, missingResults);
    if (areaFilter !== 'all') {
      list = list.filter(p => {
        const mr = missingResults[p.id];
        if (!mr) return false;
        const exp = areaFilter === 'view' ? mr.viewTab.exposed : areaFilter === 'blog' ? mr.blogTab.exposed : (mr.influencerTab?.exposed ?? null);
        return exp === false;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || (missingResults[p.id]?.query || '').toLowerCase().includes(q));
    }
    const arr = [...list];
    if (sortBy === 'latest') arr.sort((a, b) => (parsePostDate(b.date)?.getTime() || 0) - (parsePostDate(a.date)?.getTime() || 0));
    else if (sortBy === 'oldest') arr.sort((a, b) => (parsePostDate(a.date)?.getTime() || 0) - (parsePostDate(b.date)?.getTime() || 0));
    else if (sortBy === 'title') arr.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    else if (sortBy === 'missingRate') arr.sort((a, b) => missingAreaCount(missingResults[b.id]) - missingAreaCount(missingResults[a.id]));
    return arr;
  }, [periodPostsDated, missingResults, areaFilter, searchQuery, sortBy]);

  const uncheckedCount = useMemo(() => periodPosts.filter(p => !missingResults[p.id]).length, [periodPosts, missingResults]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">미노출</h2>
          <p className="text-xs text-dim mt-1">선택한 기간 내 포스팅 중 통합검색·블로그·인플루언서에서 미노출된 글만 표시합니다.</p>
        </div>
        <button onClick={checkAll} disabled={checkingAll || periodPosts.length === 0}
          className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0">
          {checkingAll ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {checkProgress.current}/{checkProgress.total} 검사 완료
            </span>
          ) : uncheckedCount > 0 ? `미확인 ${uncheckedCount}개 검사` : '미노출 재검사'}
        </button>
      </div>

      {/* 1. 미노출 정의 안내 */}
      <GlassCard padding="sm" className="text-xs text-dim leading-relaxed">
        <p className="font-bold text-text mb-1">미노출 정의</p>
        <p>선택한 기간에 발행한 게시글 중 <b className="text-text">네이버 통합검색 · 네이버 블로그 · 네이버 인플루언서</b> 검색 결과에서 확인되지 않는 게시글입니다.</p>
        <p className="mt-1">※ 제목 검색 · 대표 키워드 검색 · 본문 핵심 키워드 검색 기준 · 정상 수집된 게시글만 검사합니다.</p>
        <p className="mt-1">※ 발행 후 {INDEXING_GRACE_HOURS}시간 이내 게시글은 네이버 색인 지연으로 인한 오탐을 막기 위해 미노출 집계·목록에서 제외합니다.
          {indexingWaitCount > 0 && <span className="text-accent font-semibold"> (현재 인덱싱 대기 중 {indexingWaitCount}개)</span>}
        </p>
      </GlassCard>

      {/* 2. 요약 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <AnimatedStatCard label="전체 미노출" value={totalMissing} color="down" size="kpi" placeholder="0"
          description={`전체 ${periodPosts.length}개 중 ${pct(totalMissing)}%`} />
        <AnimatedStatCard label="통합검색 미노출" value={viewMissing} color="down" size="kpi" placeholder="0"
          description={`${pct(viewMissing)}%`} />
        <AnimatedStatCard label="블로그 미노출" value={blogMissing} color="down" size="kpi" placeholder="0"
          description={`${pct(blogMissing)}%`} />
        <AnimatedStatCard label="인플루언서 미노출" value={influencerMissing} color="down" size="kpi" placeholder="0"
          description={`${pct(influencerMissing)}%`} />
        <AnimatedStatCard label="최근 30일 미노출" value={recent30Missing} color="accent" size="kpi" placeholder="0"
          description={`발행 ${recent30Posts.length}개 중`} />
      </div>

      {/* 3. 필터 · 검색 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
            {PERIOD_OPTIONS.map(n => (
              <button key={n} onClick={() => { setPeriod(n); setCustomFrom(''); setCustomTo(''); }}
                className={`px-3 py-1.5 font-semibold transition cursor-pointer ${!usingCustomRange && period === n ? 'bg-accent text-white' : 'text-dim hover:bg-surface-hover'}`}>
                {n === 0 ? '전체' : `${n}일`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-border bg-surface text-dim" />
            <span className="text-dim">~</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-border bg-surface text-dim" />
            {usingCustomRange && (
              <button onClick={() => { setCustomFrom(''); setCustomTo(''); }} className="text-accent hover:underline font-semibold cursor-pointer">초기화</button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="게시글 또는 대표 키워드 검색"
            className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs w-56" />
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value as AreaFilter)}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-dim cursor-pointer">
            <option value="all">노출 영역: 전체</option>
            <option value="view">통합검색 미노출만</option>
            <option value="blog">블로그 미노출만</option>
            <option value="influencer">인플루언서 미노출만</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-dim cursor-pointer">
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="title">제목순</option>
            <option value="missingRate">미노출률순</option>
          </select>
        </div>
      </div>

      {errorMessage && <p className="text-xs text-down">{errorMessage}</p>}

      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <h3 className="font-bold text-[15px]">미노출 포스팅</h3>
          <span className="text-xs text-dim">{postsLoading ? '불러오는 중...' : `${missingList.length}개`}</span>
        </div>

        {postsLoading ? (
          <div className="flex items-center justify-center py-10 text-dim text-sm">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
            포스트를 불러오는 중...
          </div>
        ) : periodPosts.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">선택한 기간에 발행된 포스트가 없습니다.</div>
        ) : missingList.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">
            {uncheckedCount > 0 ? '아직 검사하지 않은 포스팅이 있습니다. "미확인 검사"를 눌러 확인하세요.' : '미노출된 포스팅이 없습니다.'}
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1080px]">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-left px-5 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-20">카테고리</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">발행일</th>
                    <th className="text-left px-3 py-3 font-semibold w-28">대표 키워드</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">통합검색</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">블로그</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">인플루언서</th>
                    <th className="text-right px-2 py-3 font-semibold w-20">검색량</th>
                    <th className="text-left px-3 py-3 font-semibold w-28">상태</th>
                    <th className="text-center px-5 py-3 font-semibold w-16">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {missingList.map(post => {
                    const mr = missingResults[post.id];
                    const isChecking = checkingAll && checkingPostId === post.id;
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition">
                        <td className="px-5 py-3.5">
                          <span className="font-semibold truncate block max-w-[280px]" title={post.title}>{post.title}</span>
                          {mr?.checkedAt && <span className="text-[10px] text-dim">최근 검사 {formatCheckedAt(mr.checkedAt)}</span>}
                        </td>
                        <td className="px-3 py-3.5 text-dim text-xs">{post.category || '—'}</td>
                        <td className="px-3 py-3.5 text-right text-dim text-xs">{post.date}</td>
                        <td className="px-3 py-3.5 text-dim text-xs truncate max-w-[120px]" title={mr?.query || ''}>{mr?.query || '—'}</td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.viewTab.exposed} /></td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.blogTab.exposed} /></td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.influencerTab?.exposed} /></td>
                        <td className="px-2 py-3.5 text-right text-dim text-xs">{mr?.searchVolume != null ? mr.searchVolume.toLocaleString() : '—'}</td>
                        <td className="px-3 py-3.5"><StatusBadge mr={mr} isChecking={isChecking} /></td>
                        <td className="px-5 py-3.5 text-center">
                          <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {missingList.map(post => {
                const mr = missingResults[post.id];
                const isChecking = checkingAll && checkingPostId === post.id;
                return (
                  <div key={post.id} className="p-4 space-y-2">
                    <p className="font-semibold text-sm truncate" title={post.title}>{post.title}</p>
                    <div className="flex items-center justify-between text-xs text-dim">
                      <span>{post.category || '—'} · {mr?.query || '대표 키워드 —'}</span>
                      <span>{post.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <ExposureBadge exposed={mr?.viewTab.exposed} />
                      <ExposureBadge exposed={mr?.blogTab.exposed} />
                      <ExposureBadge exposed={mr?.influencerTab?.exposed} />
                    </div>
                    <div className="flex items-center justify-between">
                      <StatusBadge mr={mr} isChecking={isChecking} />
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                    </div>
                    {mr?.checkedAt && <p className="text-[10px] text-dim">최근 검사 {formatCheckedAt(mr.checkedAt)}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}
