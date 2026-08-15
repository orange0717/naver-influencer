'use client';

import { useState } from 'react';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';

type Plan = 'INFLUENCER' | 'BLOGGER';
type Scope = 'all' | 'inactive';

interface ResultData {
  dryRun: boolean;
  plan: string;
  durationDays: number;
  scope: string;
  expiresAt?: string;
  updated?: number;
  targetCount: number;
  excludedCount?: number;
}

export default function AdminBulkGrantPage() {
  const [plan, setPlan] = useState<Plan>('INFLUENCER');
  const [durationDays, setDurationDays] = useState(7);
  const [scope, setScope] = useState<Scope>('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (dryRun: boolean) => {
    if (loading) return;
    if (!dryRun) {
      const ok = window.confirm(
        `실제로 ${plan} 플랜을 ${durationDays}일간 일괄 부여합니다.\n제한 사용자는 자동 제외됩니다.\n계속하시겠습니까?`
      );
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    if (dryRun) setResult(null);

    try {
      const res = await fetch('/api/admin/bulk-grant-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, durationDays, dryRun, scope }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '요청 실패');
        return;
      }
      setResult(data);
    } catch {
      setError('네트워크 오류');
    } finally {
      setLoading(false);
    }
  };

  const expiresDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="type-page-title">플랜 일괄 부여</h1>
        <p className="text-sm text-dim mt-1">
          제한 사용자(RESTRICTED_USER_EMAILS + restricted_users 테이블)를 제외한 전체 회원에게 지정 플랜을 일괄 부여합니다.
        </p>
      </div>

      {/* 설정 카드 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-5">
        {/* 플랜 */}
        <div>
          <p className="text-xs font-bold text-dim mb-2">플랜</p>
          <SegmentedFilter
            options={[
              { value: 'INFLUENCER' as Plan, label: '인플루언서' },
              { value: 'BLOGGER' as Plan, label: '블로거' },
            ]}
            value={plan}
            onChange={setPlan}
          />
        </div>

        {/* 기간 */}
        <div>
          <p className="text-xs font-bold text-dim mb-2">기간 (일)</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={3650}
              value={durationDays}
              onChange={e => setDurationDays(Math.max(1, Math.min(3650, parseInt(e.target.value) || 1)))}
              className="w-28 px-3 py-2 bg-bg border border-border rounded-lg text-sm"
            />
            <span className="text-xs text-dim">
              만료: {expiresDate.toLocaleDateString('ko-KR')} {expiresDate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[7, 14, 30, 90, 365].map(d => (
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

        {/* 범위 */}
        <div>
          <p className="text-xs font-bold text-dim mb-2">대상 범위</p>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold">전체 (덮어쓰기)</p>
                <p className="text-xs text-dim">기존 플랜/만료일 무시하고 모두 갱신. 런칭 프로모션용.</p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="scope"
                checked={scope === 'inactive'}
                onChange={() => setScope('inactive')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold">미활성 유저만</p>
                <p className="text-xs text-dim">
                  subscription_plan이 null이거나 만료된 유저에게만 부여. 기존 결제자 보호.
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => call(true)}
          disabled={loading}
          className="flex-1 px-4 py-3 rounded-xl bg-bg border border-border text-text text-sm font-bold hover:border-accent/40 transition cursor-pointer disabled:opacity-50"
        >
          미리 확인 (dry run)
        </button>
        <button
          onClick={() => call(false)}
          disabled={loading}
          className="flex-1 px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
        >
          {loading ? '처리 중...' : '실제 부여 실행'}
        </button>
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4">
          <p className="text-sm text-down font-semibold">{error}</p>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className={`rounded-xl border p-5 space-y-2 ${result.dryRun ? 'bg-accent/5 border-accent/30' : 'bg-up/10 border-up/30'}`}>
          <p className="text-sm font-bold">
            {result.dryRun ? '[미리 확인 결과]' : '[부여 완료]'}
          </p>
          <div className="text-xs space-y-1">
            <p>플랜: <span className="font-bold">{result.plan}</span></p>
            <p>기간: <span className="font-bold">{result.durationDays}일</span></p>
            <p>범위: <span className="font-bold">{result.scope === 'inactive' ? '미활성 유저만' : '전체 덮어쓰기'}</span></p>
            <p>대상 수: <span className="font-bold">{result.targetCount.toLocaleString()}명</span></p>
            {!result.dryRun && (
              <>
                <p>업데이트 수: <span className="font-bold text-up">{(result.updated || 0).toLocaleString()}명</span></p>
                <p>만료일시: <span className="font-mono text-[11px]">{result.expiresAt}</span></p>
              </>
            )}
            {result.excludedCount !== undefined && (
              <p>제외된 제한 사용자 수: <span className="font-bold">{result.excludedCount}명</span></p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
