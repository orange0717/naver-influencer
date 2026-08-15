'use client';

import { useState, useEffect, useCallback } from 'react';
import { controlBoxClass, filterButtonClass } from '@/components/analytics/controls';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';
import Pagination from '@/components/analytics/Pagination';

interface Member {
  id: string;
  auth_id: string | null;
  email: string;
  nickname: string;
  blog_id: string | null;
  linked_influencer_id: string | null;
  influencer_name: string | null;
  point_balance: number;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
  created_at: string;
  session_count: number;         // 방문횟수 (세션)
  pageview_count: number;        // 페이지뷰 (PV)
  last_visited_at: string | null; // 마지막 방문
  is_admin: boolean;
  is_restricted?: boolean;        // 유료 기능 제한 대상
}

interface MemberDetail {
  user: Member & { total_charged: number; total_used: number; updated_at: string };
  influencer: { naver_id: string; display_name: string; category: string; fan_count: number } | null;
  payments: { id: string; order_id: string; amount: number; plan_name: string; status: string; created_at: string }[];
  visits?: {
    count: number;            // 하위 호환 (= pageview_count)
    pageview_count?: number;
    session_count?: number;
    last_visited_at: string | null;
    last_page: string | null;
  };
}

interface TodayVisitor {
  id: string;
  nickname: string;
  email: string;
  last_visited_at: string;
  last_page: string | null;
  session_count: number;
  pageview_count: number;
}

interface ActiveStats {
  dau: number;
  wau: number;
  mau: number;
  todayVisitors: TodayVisitor[];
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [pageLimit, setPageLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [planEditing, setPlanEditing] = useState(false);
  const [planChoice, setPlanChoice] = useState<'INFLUENCER' | 'BLOGGER' | 'FREE'>('INFLUENCER');
  const [planDuration, setPlanDuration] = useState(30);
  const [planSaving, setPlanSaving] = useState(false);
  const [grantingTrial, setGrantingTrial] = useState(false);
  const [stats, setStats] = useState<ActiveStats | null>(null);
  const [todayModalOpen, setTodayModalOpen] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);

    const res = await fetch(`/api/admin/members?${params}`);
    const data = await res.json();
    setMembers(data.members || []);
    setTotal(data.total || 0);
    setPageLimit(Math.min(50, Math.max(1, data.limit || 20)));
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // 활성 사용자 통계 (DAU/WAU/MAU + 오늘 방문자)
  useEffect(() => {
    fetch('/api/admin/stats/active-users')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    setPlanEditing(false);
    const res = await fetch(`/api/admin/members/${id}`);
    const data = await res.json();
    setDetail(data);
    // 편집 기본값: 현재 플랜 유지, 없으면 INFLUENCER
    const current = data?.user?.subscription_plan;
    setPlanChoice(current === 'BLOGGER' || current === 'INFLUENCER' ? current : 'INFLUENCER');
    setPlanDuration(30);
    setDetailLoading(false);
  };

  const savePlan = async () => {
    if (!detail || planSaving) return;
    const body: { plan: string | null; durationDays?: number } =
      planChoice === 'FREE'
        ? { plan: null }
        : { plan: planChoice, durationDays: planDuration };

    const label =
      planChoice === 'FREE'
        ? '무료(구독 해제)'
        : `${planChoice === 'INFLUENCER' ? '인플루언서' : '블로거'} · ${planDuration}일`;
    if (!window.confirm(`"${detail.user.nickname || detail.user.email}" 님을 ${label}로 변경하시겠습니까?`)) return;

    setPlanSaving(true);
    try {
      const res = await fetch(`/api/admin/members/${detail.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '변경 실패');
        return;
      }
      // 상세 갱신
      setDetail({
        ...detail,
        user: {
          ...detail.user,
          subscription_plan: data.plan,
          subscription_expires_at: data.expiresAt,
        },
      });
      setPlanEditing(false);
      fetchMembers();
    } catch {
      alert('네트워크 오류');
    } finally {
      setPlanSaving(false);
    }
  };

  const grantTrial = async () => {
    if (!detail || grantingTrial) return;
    const label = detail.user.nickname || detail.user.email;
    if (!window.confirm(`"${label}" 님에게 7일 무료 이용권을 지급하시겠습니까?`)) return;

    setGrantingTrial(true);
    try {
      const res = await fetch('/api/admin/coupons/grant-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: detail.user.email, durationDays: 7, plan: 'INFLUENCER' }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '지급 실패');
        return;
      }
      setDetail({
        ...detail,
        user: {
          ...detail.user,
          subscription_plan: data.plan,
          subscription_expires_at: data.expiresAt,
        },
      });
      fetchMembers();
      alert(`7일 무료 이용권이 지급되었습니다. (만료: ${new Date(data.expiresAt).toLocaleString('ko-KR')})`);
    } catch {
      alert('네트워크 오류');
    } finally {
      setGrantingTrial(false);
    }
  };

  const handleDelete = async (id: string, nickname: string) => {
    if (!confirm(`정말 "${nickname}" 회원을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    const res = await fetch(`/api/admin/members/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setDetail(null);
      fetchMembers();
    } else {
      const data = await res.json();
      alert(data.error || '삭제 실패');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="type-page-title">회원 관리</h1>
        <span className="text-sm text-dim">총 {total.toLocaleString()}명</span>
      </div>

      {/* 활성 사용자 카드 (DAU/WAU/MAU) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setTodayModalOpen(true)}
          disabled={!stats || stats.dau === 0}
          className="bg-surface border border-border rounded-lg px-4 py-3 text-left hover:border-accent/40 transition cursor-pointer disabled:cursor-default disabled:hover:border-border"
        >
          <p className="text-[11px] text-dim font-semibold">DAU · 오늘</p>
          <p className="font-rank font-extrabold text-2xl text-accent">
            {stats ? stats.dau.toLocaleString() : '-'}
            <span className="text-xs text-dim font-semibold ml-1">명</span>
          </p>
          {stats && stats.dau > 0 && (
            <p className="text-[10px] text-accent mt-0.5">클릭해서 목록 보기 →</p>
          )}
        </button>
        <div className="bg-surface border border-border rounded-lg px-4 py-3">
          <p className="text-[11px] text-dim font-semibold">WAU · 최근 7일</p>
          <p className="font-rank font-extrabold text-2xl">
            {stats ? stats.wau.toLocaleString() : '-'}
            <span className="text-xs text-dim font-semibold ml-1">명</span>
          </p>
        </div>
        <div className="bg-surface border border-border rounded-lg px-4 py-3">
          <p className="text-[11px] text-dim font-semibold">MAU · 최근 30일</p>
          <p className="font-rank font-extrabold text-2xl">
            {stats ? stats.mau.toLocaleString() : '-'}
            <span className="text-xs text-dim font-semibold ml-1">명</span>
          </p>
        </div>
      </div>

      {/* 검색 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="닉네임, 이메일, 블로그ID 검색"
          className={`${controlBoxClass} flex-1`}
        />
        <button type="submit" className={filterButtonClass}>
          검색
        </button>
      </form>

      {/* 테이블/카드 */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim">
                <th className="text-center px-2 py-2.5 font-semibold w-11 tabular-nums">No</th>
                <th className="text-left px-3 py-2.5 font-semibold">닉네임</th>
                <th className="text-left px-3 py-2.5 font-semibold">이메일</th>
                <th className="text-left px-3 py-2.5 font-semibold">블로그</th>
                <th className="text-left px-3 py-2.5 font-semibold">인플루언서</th>
                <th className="text-center px-3 py-2.5 font-semibold">플랜</th>
                <th className="text-right px-3 py-2.5 font-semibold">기간</th>
                <th className="text-right px-3 py-2.5 font-semibold">방문횟수</th>
                <th className="text-right px-3 py-2.5 font-semibold">반복방문</th>
                <th className="text-right px-3 py-2.5 font-semibold">페이지뷰</th>
                <th className="text-right px-3 py-2.5 font-semibold">마지막 방문</th>
                <th className="text-right px-3 py-2.5 font-semibold">가입일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {members.map((m, idx) => (
                <tr
                  key={m.id}
                  onClick={() => openDetail(m.id)}
                  className="hover:bg-surface-hover transition cursor-pointer"
                >
                  <td className="px-2 py-2.5 text-center text-xs text-dim font-rank tabular-nums">
                    {total > 0 ? total - ((page - 1) * pageLimit + idx) : '-'}
                  </td>
                  <td className="px-3 py-2.5 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      {m.nickname || '-'}
                      {m.is_admin && (
                        <span className="text-[9px] font-bold text-white bg-accent px-1.5 py-0.5 rounded-full leading-none">관리자</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-dim text-xs">{m.email}</td>
                  <td className="px-3 py-2.5 text-xs">{m.blog_id || '-'}</td>
                  <td className="px-3 py-2.5 text-xs">{m.influencer_name || '-'}</td>
                  <td className="px-3 py-2.5 text-center">
                    {m.subscription_plan ? (
                      <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                        {m.subscription_plan}
                      </span>
                    ) : <span className="text-[10px] text-dim">무료</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-dim">
                    {m.is_admin ? (
                      <span className="text-accent font-bold">관리자</span>
                    ) : m.subscription_plan && m.subscription_expires_at ? (() => {
                      const remainMs = new Date(m.subscription_expires_at).getTime() - Date.now();
                      const remainDays = Math.max(0, Math.ceil(remainMs / 86400000));
                      return remainDays > 0 ? `${remainDays}일 남음` : '만료';
                    })() : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-dim font-rank">
                    {(m.session_count ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-rank">
                    {(() => {
                      const repeat = Math.max(0, (m.session_count ?? 0) - 1);
                      return repeat > 0 ? (
                        <span className="text-accent font-bold">{repeat.toLocaleString()}</span>
                      ) : (
                        <span className="text-dim">0</span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-dim font-rank">
                    {(m.pageview_count ?? 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-rank">
                    {(() => {
                      if (!m.last_visited_at) return <span className="text-dim">-</span>;
                      const last = new Date(m.last_visited_at);
                      const now = new Date();
                      const sameDay = last.toDateString() === now.toDateString();
                      const label = sameDay
                        ? `오늘 ${last.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
                        : last.toLocaleDateString('ko-KR');
                      return (
                        <span className={sameDay ? 'text-accent font-bold' : 'text-dim'}>
                          {label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-dim">
                    {new Date(m.created_at).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-dim">결과 없음</td></tr>
              )}
            </tbody>
          </table>
          </div>

          {/* 카드 (모바일) */}
          <div className="md:hidden divide-y divide-border/20">
            {members.map((m, idx) => {
              const remainDays = m.subscription_plan && m.subscription_expires_at
                ? Math.max(0, Math.ceil((new Date(m.subscription_expires_at).getTime() - Date.now()) / 86400000))
                : null;
              const lastVisit = m.last_visited_at ? (() => {
                const last = new Date(m.last_visited_at);
                const sameDay = last.toDateString() === new Date().toDateString();
                return sameDay
                  ? `오늘 ${last.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
                  : last.toLocaleDateString('ko-KR');
              })() : null;
              const repeat = Math.max(0, (m.session_count ?? 0) - 1);
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => openDetail(m.id)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-hover transition cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[11px] text-dim font-rank tabular-nums shrink-0 w-6 text-right">
                        {total > 0 ? total - ((page - 1) * pageLimit + idx) : '-'}
                      </span>
                      <span className="font-semibold text-sm truncate">{m.nickname || '-'}</span>
                      {m.is_admin && (
                        <span className="text-[9px] font-bold text-white bg-accent px-1.5 py-0.5 rounded-full leading-none shrink-0">관리자</span>
                      )}
                    </div>
                    {m.subscription_plan ? (
                      <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full shrink-0">
                        {m.subscription_plan}{remainDays !== null ? ` · ${remainDays}일` : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] text-dim shrink-0">무료</span>
                    )}
                  </div>
                  <div className="text-[11px] text-dim truncate">{m.email}</div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-dim">
                    <span>방문 <span className="font-rank font-bold text-text">{(m.session_count ?? 0).toLocaleString()}</span></span>
                    {repeat > 0 && (
                      <span>반복 <span className="font-rank font-bold text-accent">{repeat.toLocaleString()}</span></span>
                    )}
                    <span>PV <span className="font-rank font-bold text-text">{(m.pageview_count ?? 0).toLocaleString()}</span></span>
                  </div>
                  {lastVisit && (
                    <div className="text-[10px] text-dim mt-0.5">최근 방문 · {lastVisit}</div>
                  )}
                </button>
              );
            })}
            {members.length === 0 && (
              <div className="px-4 py-8 text-center text-dim text-sm">결과 없음</div>
            )}
          </div>
          </>
        )}

        {/* 페이지네이션 */}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* 오늘 방문자 모달 */}
      {todayModalOpen && stats && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setTodayModalOpen(false)}>
          <div className="bg-surface rounded-lg border border-border w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold">
                  오늘 방문자 <span className="text-accent">{stats.dau}</span>명
                </h2>
                <button onClick={() => setTodayModalOpen(false)} className="text-dim hover:text-text text-lg cursor-pointer">x</button>
              </div>
              <p className="text-[11px] text-dim">
                KST 자정 이후 로그인한 유저만 집계됩니다. 익명 방문자는 포함되지 않습니다.
              </p>
              <div className="divide-y divide-border/20">
                {stats.todayVisitors.length === 0 ? (
                  <p className="py-8 text-center text-dim text-sm">방문자가 없습니다.</p>
                ) : stats.todayVisitors.map(v => {
                  const t = new Date(v.last_visited_at);
                  const timeLabel = t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <button
                      key={v.id}
                      onClick={() => { setTodayModalOpen(false); openDetail(v.id); }}
                      className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-bg rounded-lg px-2 transition cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{v.nickname || '(닉네임 없음)'}</p>
                        <p className="text-[11px] text-dim truncate">{v.email}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-dim">마지막 페이지</p>
                        <p className="text-xs font-mono truncate">{v.last_page || '-'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-rank text-sm font-bold text-accent">{timeLabel}</p>
                        <p className="text-[10px] text-dim">PV {v.pageview_count.toLocaleString()}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !detailLoading && setDetail(null)}>
          <div className="bg-surface rounded-lg border border-border w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <div className="p-12 text-center">
                <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
              </div>
            ) : detail && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-extrabold">{detail.user.nickname || '(닉네임 없음)'}</h2>
                  <button onClick={() => setDetail(null)} className="text-dim hover:text-text text-lg cursor-pointer">x</button>
                </div>

                {/* 기본 정보 */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[11px] text-dim">이메일</p>
                    <p className="font-semibold">{detail.user.email}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-dim">블로그 ID</p>
                    <p className="font-semibold">{detail.user.blog_id || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-dim">포인트</p>
                    <p className="font-semibold">{detail.user.point_balance.toLocaleString()}P</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-dim">구독</p>
                    <p className="font-semibold">
                      {detail.user.subscription_plan || '무료'}
                      {detail.user.subscription_expires_at && (
                        <span className="text-dim text-xs ml-1">
                          (~{new Date(detail.user.subscription_expires_at).toLocaleDateString('ko-KR')})
                        </span>
                      )}
                      <button
                        onClick={() => setPlanEditing(v => !v)}
                        className="ml-2 text-[10px] font-bold text-accent underline underline-offset-2 cursor-pointer"
                      >
                        {planEditing ? '닫기' : '변경'}
                      </button>
                    </p>
                  </div>
                  <div className="col-span-2">
                    <button
                      onClick={grantTrial}
                      disabled={grantingTrial}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent/10 text-accent hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
                    >
                      {grantingTrial ? '지급 중...' : '7일 무료 이용권 지급'}
                    </button>
                  </div>
                  <div>
                    <p className="text-[11px] text-dim">가입일</p>
                    <p className="font-semibold">{new Date(detail.user.created_at).toLocaleDateString('ko-KR')}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-dim">충전/사용</p>
                    <p className="font-semibold">{detail.user.total_charged.toLocaleString()} / {detail.user.total_used.toLocaleString()}</p>
                  </div>
                </div>

                {/* 인플루언서 */}
                {detail.influencer && (
                  <div className="bg-bg rounded-xl p-3">
                    <p className="text-[11px] text-dim mb-1">연결된 인플루언서</p>
                    <p className="text-sm font-semibold">
                      {detail.influencer.display_name} ({detail.influencer.naver_id})
                      <span className="text-dim text-xs ml-2">{detail.influencer.category} · 팬 {detail.influencer.fan_count.toLocaleString()}</span>
                    </p>
                  </div>
                )}

                {/* 플랜 변경 */}
                {planEditing && (
                  <div className="bg-bg rounded-xl p-3 border border-accent/30 space-y-3">
                    <p className="text-xs font-bold text-accent">플랜 변경</p>
                    <div className="flex gap-1.5">
                      <SegmentedFilter
                        options={[
                          { value: 'INFLUENCER' as const, label: '인플루언서' },
                          { value: 'BLOGGER' as const, label: '블로거' },
                          { value: 'FREE' as const, label: '무료(해제)' },
                        ]}
                        value={planChoice}
                        onChange={setPlanChoice}
                      />
                    </div>

                    {planChoice !== 'FREE' && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={3650}
                            value={planDuration}
                            onChange={e => setPlanDuration(Math.max(1, Math.min(3650, parseInt(e.target.value) || 1)))}
                            className="w-20 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs"
                          />
                          <span className="text-xs text-dim">일</span>
                          <span className="text-[11px] text-dim">
                            만료: {new Date(Date.now() + planDuration * 86400000).toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {[7, 30, 90, 365].map(d => (
                            <button
                              key={d}
                              onClick={() => setPlanDuration(d)}
                              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface border border-border text-dim hover:text-accent hover:border-accent/40 cursor-pointer"
                            >
                              {d}일
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={savePlan}
                      disabled={planSaving}
                      className="w-full px-3 py-2 bg-accent text-white font-bold rounded-lg text-xs hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
                    >
                      {planSaving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                )}

                {/* 방문 통계 — 방문횟수 + 반복방문 + 페이지뷰 */}
                {detail.visits && (
                  <div>
                    <p className="text-xs font-bold text-dim mb-2">방문 통계 <span className="font-normal text-dim/70">(누적)</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-bg rounded-lg px-3 py-2">
                        <p className="text-[11px] text-dim">방문횟수</p>
                        <p className="font-rank font-bold text-sm">{(detail.visits.session_count ?? 0).toLocaleString()}회</p>
                      </div>
                      <div className="bg-bg rounded-lg px-3 py-2">
                        <p className="text-[11px] text-dim">반복방문</p>
                        <p className="font-rank font-bold text-sm">
                          {(() => {
                            const repeat = Math.max(0, (detail.visits.session_count ?? 0) - 1);
                            return repeat > 0 ? <span className="text-accent">{repeat.toLocaleString()}회</span> : '0회';
                          })()}
                        </p>
                      </div>
                      <div className="bg-bg rounded-lg px-3 py-2">
                        <p className="text-[11px] text-dim">페이지뷰</p>
                        <p className="font-rank font-bold text-sm">{(detail.visits.pageview_count ?? detail.visits.count).toLocaleString()}회</p>
                      </div>
                      <div className="bg-bg rounded-lg px-3 py-2">
                        <p className="text-[11px] text-dim">마지막 방문</p>
                        <p className="font-rank font-bold text-sm">
                          {detail.visits.last_visited_at
                            ? new Date(detail.visits.last_visited_at).toLocaleString('ko-KR', {
                                year: 'numeric', month: '2-digit', day: '2-digit',
                                hour: '2-digit', minute: '2-digit',
                              })
                            : '-'}
                        </p>
                        {detail.visits.last_page && (
                          <p className="text-[10px] text-dim truncate mt-0.5">{detail.visits.last_page}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 결제 내역 */}
                {detail.payments.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-dim mb-2">결제 내역</p>
                    <div className="space-y-1">
                      {detail.payments.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-xs bg-bg rounded-lg px-3 py-2">
                          <span className="text-dim">{new Date(p.created_at).toLocaleDateString('ko-KR')}</span>
                          <span className="font-semibold">{p.plan_name}</span>
                          <span className="font-rank">{p.amount.toLocaleString()}원</span>
                          <span className={p.status === 'PAID' ? 'text-up' : 'text-down'}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 삭제 버튼 */}
                <div className="pt-2 border-t border-border">
                  <button
                    onClick={() => handleDelete(detail.user.id, detail.user.nickname)}
                    className="px-4 py-2 bg-red-500/10 text-red-500 font-bold rounded-lg text-sm hover:bg-red-500/20 transition cursor-pointer"
                  >
                    회원 삭제
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
