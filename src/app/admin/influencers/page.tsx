'use client';

import { useState, useEffect, useCallback } from 'react';
import { LastChallengeParticipationCell } from '@/components/LastChallengeParticipationCell';
import { formatCountK as formatCount } from '@/lib/format';
import { controlBoxClass } from '@/components/analytics/controls';

interface InfluencerRow {
  id: string;
  naver_id: string;
  display_name: string;
  image_url: string | null;
  my_keyword_category: string | null;
  subscriber_count: number | null;
  stopped_manual: boolean;
  last_challenged_at: string | null;
  last_crawled_at: string | null;
}

export default function AdminInfluencersPage() {
  const [list, setList] = useState<InfluencerRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<InfluencerRow[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');
  /** 목록 조회가 실패했는가. '중단자가 없다'와 반드시 구분해야 하는 상태다. */
  const [listError, setListError] = useState('');
  /** 검색 조회가 실패했는가. '검색 결과가 없다'와 반드시 구분해야 하는 상태다. */
  const [searchError, setSearchError] = useState('');

  // 실패를 삼키면 list 가 [] 로 남아 "등록된 활동중단 인플루언서가 없습니다"가 뜬다.
  // 명단이 비었다는 뜻으로 읽히지만 실제로는 못 불러온 것이다.
  const fetchList = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const res = await fetch('/api/admin/influencers/stopped?mode=list');
      if (!res.ok) {
        setListError(`목록을 불러오지 못했습니다. (오류 ${res.status})`);
        return;
      }
      const data = await res.json();
      setList(data.items || []);
    } catch {
      setListError('목록을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  // 검색 (debounce)
  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults([]); setSearchError(''); return; }

    // 검색이 실패해도 "검색 결과가 없습니다"가 떴다. 그러면 실재하는 인플루언서를
    // DB에 없는 사람으로 오판하게 된다(이 감사에서 이미 한 번 겪은 오판이다).
    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      setSearchError('');
      try {
        const res = await fetch(`/api/admin/influencers/stopped?mode=search&q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          setSearchError(`검색에 실패했습니다. (오류 ${res.status})`);
          return;
        }
        const data = await res.json();
        setSearchResults(data.items || []);
      } catch {
        setSearchError('검색에 실패했습니다. 네트워크 상태를 확인해 주세요.');
      } finally {
        setLoadingSearch(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const setStopped = async (row: InfluencerRow, stopped: boolean) => {
    setBusyId(row.id);
    setMessage('');
    try {
      const res = await fetch('/api/admin/influencers/stopped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, stopped }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '실패');

      // 목록·검색 결과 동기화
      setList(prev => {
        if (stopped) {
          // 이미 들어있지 않으면 추가
          if (prev.some(x => x.id === row.id)) {
            return prev.map(x => x.id === row.id ? { ...x, stopped_manual: true } : x);
          }
          return [...prev, { ...row, stopped_manual: true }].sort((a, b) => a.display_name.localeCompare(b.display_name, 'ko'));
        }
        return prev.filter(x => x.id !== row.id);
      });
      setSearchResults(prev => prev.map(x => x.id === row.id ? { ...x, stopped_manual: stopped } : x));
      setMessage(`${row.display_name} — ${stopped ? '활동중단 등록' : '활동중단 해제'} 완료`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '실패');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-page-title">인플루언서 활동중단 관리</h1>
        <p className="text-xs text-dim mt-1">
          관리자가 직접 지정한 인플루언서만 순위에서 &quot;활동 중단&quot; 그룹(최하위)으로 이동합니다.
          자동 분류는 사용하지 않습니다.
        </p>
      </div>

      {message && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl px-4 py-2.5 text-sm text-accent font-semibold">
          {message}
        </div>
      )}

      {/* 검색 */}
      <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-sm font-bold">인플루언서 검색</h2>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="네이버 ID 또는 이름으로 검색..."
          className={`${controlBoxClass} w-full`}
        />

        {loadingSearch && (
          <div className="py-4 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!loadingSearch && searchError && (
          <div className="py-4 text-center text-sm text-down">{searchError}</div>
        )}

        {!loadingSearch && !searchError && search.trim() && searchResults.length === 0 && (
          <div className="py-4 text-center text-dim text-sm">검색 결과가 없습니다.</div>
        )}

        {!loadingSearch && searchResults.length > 0 && (
          <div className="divide-y divide-border/40 border border-border rounded-lg overflow-hidden">
            {searchResults.map(row => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover">
                {row.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.image_url} alt={row.display_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                    {row.display_name.charAt(0)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm truncate">{row.display_name}</span>
                    {row.stopped_manual && (
                      <span className="text-[10px] font-medium text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded shrink-0">활동중단</span>
                    )}
                  </div>
                  <div className="text-[11px] text-dim">
                    @{row.naver_id}
                    {row.my_keyword_category && <span className="ml-2">· {row.my_keyword_category}</span>}
                    <span className="ml-2">· 팬 {formatCount(row.subscriber_count)}</span>
                    <span className="ml-2 text-dim">
                      · 마지막 챌린지{' '}
                      <LastChallengeParticipationCell
                        inf={{
                          lastChallengedAt: row.last_challenged_at,
                          lastCrawledAt: row.last_crawled_at,
                        }}
                      />
                    </span>
                  </div>
                </div>
                {row.stopped_manual ? (
                  <button
                    onClick={() => setStopped(row, false)}
                    disabled={busyId === row.id}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-border text-dim hover:border-accent/40 disabled:opacity-50 cursor-pointer"
                  >
                    {busyId === row.id ? '처리 중...' : '해제'}
                  </button>
                ) : (
                  <button
                    onClick={() => setStopped(row, true)}
                    disabled={busyId === row.id}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
                  >
                    {busyId === row.id ? '처리 중...' : '활동중단'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 활동중단 목록 */}
      <div className="bg-surface rounded-lg border border-border overflow-x-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold">활동중단 인플루언서 목록</h2>
          {/* 조회 실패 시 인원수를 단언하지 않는다(0명은 '없다'로 읽힌다). */}
          <span className="text-xs text-dim">{listError ? '—' : `${list.length}명`}</span>
        </div>

        {loadingList ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : listError ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-down">{listError}</p>
            <button type="button" onClick={fetchList} className="text-sm text-accent hover:underline cursor-pointer">
              다시 시도
            </button>
          </div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-dim text-sm">
            등록된 활동중단 인플루언서가 없습니다.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim bg-bg/40">
                <th className="text-left px-4 py-2.5 font-semibold">인플루언서</th>
                <th className="text-left px-4 py-2.5 font-semibold">분야</th>
                <th className="text-right px-4 py-2.5 font-semibold">팬수</th>
                <th className="text-left px-4 py-2.5 font-semibold">마지막 챌린지</th>
                <th className="text-center px-4 py-2.5 font-semibold">해제</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {list.map(row => (
                <tr key={row.id} className="hover:bg-surface-hover transition">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {row.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.image_url} alt={row.display_name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <span className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                          {row.display_name.charAt(0)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{row.display_name}</div>
                        <div className="text-[11px] text-dim">@{row.naver_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-dim">{row.my_keyword_category || '-'}</td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold">{formatCount(row.subscriber_count)}</td>
                  <td className="px-4 py-2.5 text-xs text-dim">
                    <LastChallengeParticipationCell
                      inf={{ lastChallengedAt: row.last_challenged_at, lastCrawledAt: row.last_crawled_at }}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => setStopped(row, false)}
                      disabled={busyId === row.id}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-border text-dim hover:border-accent/40 disabled:opacity-50 cursor-pointer"
                    >
                      {busyId === row.id ? '처리 중...' : '해제'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
