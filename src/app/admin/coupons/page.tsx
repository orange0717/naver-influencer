'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDateTimeShort as formatDate } from '@/lib/format';

type Plan = 'INFLUENCER' | 'BLOGGER';

interface Coupon {
  id: string;
  code: string;
  name: string;
  target_email: string;
  plan: Plan;
  duration_days: number;
  used: boolean;
  used_at: string | null;
  created_at: string;
  created_by: string | null;
}

/** 미사용 / 사용중(만료 전) / 만료 3단계 상태 */
function couponStatus(c: Coupon): { label: string; className: string } {
  if (!c.used) return { label: '미사용', className: 'bg-up/10 text-up' };
  const expiresAt = c.used_at ? new Date(c.used_at).getTime() + c.duration_days * 86400000 : 0;
  if (expiresAt > Date.now()) return { label: '사용중', className: 'bg-accent/10 text-accent' };
  return { label: '만료', className: 'bg-dim/10 text-dim' };
}

export default function AdminCouponsPage() {
  const [targetEmail, setTargetEmail] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [plan, setPlan] = useState<Plan>('INFLUENCER');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/coupons/list');
    if (res.ok) {
      const data = await res.json();
      setCoupons(data.items || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const issueCoupon = async () => {
    if (issuing) return;
    setIssueError(null);
    setIssuedCode(null);

    const email = targetEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setIssueError('올바른 대상 회원 이메일을 입력하세요.');
      return;
    }

    setIssuing(true);
    try {
      const res = await fetch('/api/admin/coupons/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEmail: email, durationDays, plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIssueError(data.error || '발급 실패');
        return;
      }
      setIssuedCode(data.coupon.code);
      setTargetEmail('');
      fetchCoupons();
    } catch {
      setIssueError('네트워크 오류');
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-page-title">쿠폰 관리</h1>
        <p className="text-sm text-dim mt-1">
          특정 회원 1인 전용 무료 체험 쿠폰을 발급합니다. 대상 이메일로 로그인한 회원만 1회 등록할 수 있습니다.
        </p>
      </div>

      {/* 발급 폼 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-5 max-w-2xl">
        <div>
          <p className="text-xs font-bold text-dim mb-2">대상 회원 이메일</p>
          <input
            type="email"
            value={targetEmail}
            onChange={e => setTargetEmail(e.target.value)}
            placeholder="member@example.com"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm outline-none focus:border-accent/40 transition-colors"
          />
        </div>

        <div>
          <p className="text-xs font-bold text-dim mb-2">플랜</p>
          <div className="flex gap-2">
            {(['INFLUENCER', 'BLOGGER'] as Plan[]).map(p => (
              <button
                key={p}
                onClick={() => setPlan(p)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                  plan === p ? 'bg-accent text-white' : 'bg-bg text-dim border border-border hover:text-text'
                }`}
              >
                {p === 'INFLUENCER' ? '인플루언서' : '블로거'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-dim mb-2">기간 (일)</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={365}
              value={durationDays}
              onChange={e => setDurationDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
              className="w-28 px-3 py-2 bg-bg border border-border rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-1.5 mt-2">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDurationDays(d)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-bg border border-border text-dim hover:text-accent hover:border-accent/40 transition cursor-pointer"
              >
                {d}일
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={issueCoupon}
          disabled={issuing}
          className="w-full px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
        >
          {issuing ? '발급 중...' : '쿠폰 발급'}
        </button>

        {issueError && (
          <div className="bg-down/10 border border-down/30 rounded-xl p-3">
            <p className="text-xs text-down font-semibold">{issueError}</p>
          </div>
        )}
        {issuedCode && (
          <div className="bg-up/10 border border-up/30 rounded-xl p-3">
            <p className="text-xs font-semibold">
              발급 완료: <span className="font-mono text-sm">{issuedCode}</span>
            </p>
          </div>
        )}
      </div>

      {/* 발급 내역 */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center py-10 text-dim text-sm">로딩 중...</div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">발급된 쿠폰이 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/30 text-[11px] text-dim">
                <th className="text-left px-4 py-2.5 font-semibold">코드</th>
                <th className="text-left px-3 py-2.5 font-semibold">쿠폰명</th>
                <th className="text-left px-3 py-2.5 font-semibold">대상 회원</th>
                <th className="text-left px-3 py-2.5 font-semibold">플랜</th>
                <th className="text-center px-3 py-2.5 font-semibold">기간</th>
                <th className="text-center px-3 py-2.5 font-semibold">상태</th>
                <th className="text-left px-3 py-2.5 font-semibold">사용일시</th>
                <th className="text-left px-3 py-2.5 font-semibold">발급일시</th>
                <th className="text-left px-4 py-2.5 font-semibold">지급 관리자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {coupons.map(c => {
                const status = couponStatus(c);
                return (
                <tr key={c.id} className="hover:bg-bg/40">
                  <td className="px-4 py-2.5 font-mono font-semibold">{c.code}</td>
                  <td className="px-3 py-2.5">{c.name}</td>
                  <td className="px-3 py-2.5 text-dim">{c.target_email}</td>
                  <td className="px-3 py-2.5 text-dim">{c.plan === 'INFLUENCER' ? '인플루언서' : '블로거'}</td>
                  <td className="px-3 py-2.5 text-center font-rank">{c.duration_days}일</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-dim text-xs">{formatDate(c.used_at)}</td>
                  <td className="px-3 py-2.5 text-dim text-xs">{formatDate(c.created_at)}</td>
                  <td className="px-4 py-2.5 text-dim text-xs">{c.created_by || '-'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
