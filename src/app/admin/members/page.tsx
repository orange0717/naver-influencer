'use client';

import { useState, useEffect, useCallback } from 'react';

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
}

interface MemberDetail {
  user: Member & { total_charged: number; total_used: number; updated_at: string };
  influencer: { naver_id: string; display_name: string; category: string; fan_count: number } | null;
  payments: { id: string; order_id: string; amount: number; plan_name: string; status: string; created_at: string }[];
}

export default function AdminMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);

    const res = await fetch(`/api/admin/members?${params}`);
    const data = await res.json();
    setMembers(data.members || []);
    setTotal(data.total || 0);
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    const res = await fetch(`/api/admin/members/${id}`);
    const data = await res.json();
    setDetail(data);
    setDetailLoading(false);
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
        <h1 className="text-xl font-extrabold">회원 관리</h1>
        <span className="text-sm text-dim">총 {total.toLocaleString()}명</span>
      </div>

      {/* 검색 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="닉네임, 이메일, 블로그ID 검색"
          className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm"
        />
        <button type="submit" className="px-5 py-2.5 bg-accent text-white font-bold rounded-xl text-sm cursor-pointer">
          검색
        </button>
      </form>

      {/* 테이블 */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim">
                <th className="text-left px-3 py-2.5 font-semibold">닉네임</th>
                <th className="text-left px-3 py-2.5 font-semibold">이메일</th>
                <th className="text-left px-3 py-2.5 font-semibold">블로그</th>
                <th className="text-left px-3 py-2.5 font-semibold">인플루언서</th>
                <th className="text-center px-3 py-2.5 font-semibold">플랜</th>
                <th className="text-right px-3 py-2.5 font-semibold">가입일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {members.map(m => (
                <tr
                  key={m.id}
                  onClick={() => openDetail(m.id)}
                  className="hover:bg-surface-hover transition cursor-pointer"
                >
                  <td className="px-3 py-2.5 font-semibold">{m.nickname || '-'}</td>
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
                    {new Date(m.created_at).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-dim">결과 없음</td></tr>
              )}
            </tbody>
          </table>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-border">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 rounded text-xs font-semibold border border-border disabled:opacity-30 cursor-pointer"
            >
              이전
            </button>
            <span className="text-xs text-dim">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 rounded text-xs font-semibold border border-border disabled:opacity-30 cursor-pointer"
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !detailLoading && setDetail(null)}>
          <div className="bg-surface rounded-2xl border border-border w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                    </p>
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
