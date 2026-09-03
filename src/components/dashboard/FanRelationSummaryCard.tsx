'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { RELATIONSHIP_LABEL, RELATIONSHIP_DOT } from '@/lib/fan-relationship';

interface Summary { total: number; mutual: number; onlyIFollow: number; onlyFollowsMe: number }
interface FansResponse { summary: Summary; syncState: 'never' | 'ok' | 'failed' }

/**
 * /my 대시보드용 팬 관계 요약 카드(스펙 15).
 * - Max 등급이 아니거나 오류면 렌더하지 않음(대시보드를 어지럽히지 않음).
 * - '확인 중/확인 실패'는 데이터셋 수준 상태로 정직하게 표시.
 */
export default function FanRelationSummaryCard() {
  const [data, setData] = useState<FansResponse | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setHidden(true); return; }
        const res = await fetch('/api/my/fans', { headers: { authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) { setHidden(true); return; }
        setData(await res.json());
      } catch {
        setHidden(true);
      }
    })();
  }, []);

  if (hidden || !data) return null;

  const { summary, syncState } = data;
  const rows: Array<{ key: 'mutual' | 'onlyIFollow' | 'onlyFollowsMe'; count: number }> = [
    { key: 'mutual', count: summary.mutual },
    { key: 'onlyIFollow', count: summary.onlyIFollow },
    { key: 'onlyFollowsMe', count: summary.onlyFollowsMe },
  ];

  return (
    <div className="bg-surface border border-border rounded-lg shadow-xs p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text">팬 관계</h3>
        <Link href="/my/fans" className="text-xs font-semibold text-accent hover:opacity-80">팬 관계 관리 →</Link>
      </div>

      {syncState === 'never' ? (
        <p className="text-xs text-dim">
          아직 동기화하지 않아 전체 <b className="text-text">확인 중</b>입니다.{' '}
          <Link href="/my/fans" className="text-accent font-medium">동기화 시작</Link>
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold text-text">{summary.total.toLocaleString()}</span>
            <span className="text-xs text-dim">명과 관계</span>
            {syncState === 'failed' && <span className="text-[11px] text-down font-medium ml-1">· 마지막 확인 실패</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {rows.map(r => (
              <Link
                key={r.key}
                href="/my/fans"
                className="flex flex-col gap-1 rounded-lg border border-border bg-bg px-3 py-2 hover:border-accent/50 transition"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-dim">
                  <span className={`w-2 h-2 rounded-full ${RELATIONSHIP_DOT[r.key]}`} />
                  {RELATIONSHIP_LABEL[r.key]}
                </span>
                <span className="text-lg font-bold text-text">{r.count.toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
