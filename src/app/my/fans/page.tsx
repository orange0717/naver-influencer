'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatDateTimeShort as formatDate, formatCountK as formatCount } from '@/lib/format';
import {
  type Relationship,
  type HistoryStatus,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_BADGE,
  RELATIONSHIP_DOT,
  HISTORY_LABEL,
} from '@/lib/fan-relationship';

interface FanItem {
  urlId: string;
  nickname: string;
  imageUrl: string;
  category: string;
  followerCount: number;
  relationship: Relationship;
  myFollow: boolean;
  theirFollow: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface FansResponse {
  summary: { total: number; mutual: number; onlyIFollow: number; onlyFollowsMe: number };
  syncState: 'never' | 'ok' | 'failed';
  items: FanItem[];
  lastSync: {
    synced_at: string;
    source: string;
    status: string;
    followers_count: number | null;
    followings_count: number | null;
    added_count: number | null;
    removed_count: number | null;
  } | null;
}

interface CrossMatchUser {
  user_id: string;
  naver_url_id: string;
  target_nickname?: string | null;
  direction: 'I_FOLLOW' | 'FOLLOWS_ME' | 'BOTH';
}

interface CrossMatchResponse {
  ok: boolean;
  me: { user_id: string; naver_url_id: string | null };
  inMyFans: CrossMatchUser[];
  othersListedMe: CrossMatchUser[];
  counts: { inMyFans: number; othersListedMe: number };
}

interface HistoryItem {
  relationshipStatus: HistoryStatus;
  observedAt: string;
  source: string;
}

type StatusFilter = 'all' | Relationship;
type SortKey = 'mutualFirst' | 'fanDesc' | 'fanAsc' | 'recent' | 'oldest' | 'nickname';

const SORT_LABEL: Record<SortKey, string> = {
  mutualFirst: '맞팬 우선',
  fanDesc: '팬 수 많은 순',
  fanAsc: '팬 수 적은 순',
  recent: '최근 확인 순',
  oldest: '오래된 확인 순',
  nickname: '닉네임순',
};

const RELATIONSHIP_RANK: Record<Relationship, number> = { mutual: 0, onlyIFollow: 1, onlyFollowsMe: 2 };

function Badge({ relationship }: { relationship: Relationship }) {
  return (
    <span className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-bold ${RELATIONSHIP_BADGE[relationship]}`}>
      {RELATIONSHIP_LABEL[relationship]}
    </span>
  );
}

export default function MyFansPage() {
  const router = useRouter();
  const [data, setData] = useState<FansResponse | null>(null);
  const [crossMatch, setCrossMatch] = useState<CrossMatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('mutualFirst');

  // 상세 드로어
  const [selected, setSelected] = useState<FanItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    return { authorization: `Bearer ${session.access_token}` };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const headers = await authHeaders();
        if (!headers) {
          router.replace(`/auth/login?redirect=${encodeURIComponent('/my/fans')}`);
          return;
        }
        const [fansRes, crossRes] = await Promise.all([
          fetch('/api/my/fans', { headers }),
          fetch('/api/my/fans/cross-match', { headers }),
        ]);
        if (!fansRes.ok) {
          const j = await fansRes.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${fansRes.status}`);
        }
        setData(await fansRes.json());
        if (crossRes.ok) setCrossMatch(await crossRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router, authHeaders]);

  // 상세 드로어 열릴 때 타임라인 로드
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setHistory(null);
    setHistoryLoading(true);
    (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const res = await fetch(`/api/my/fans/history?urlId=${encodeURIComponent(selected.urlId)}`, { headers });
        if (res.ok && !cancelled) {
          const j = await res.json();
          setHistory(j.items || []);
        }
      } catch {
        /* 타임라인 실패는 조용히 무시 — 상세 나머지는 표시 */
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected, authHeaders]);

  const list = useMemo<FanItem[]>(() => {
    if (!data) return [];
    let src = data.items;
    if (statusFilter !== 'all') src = src.filter(it => it.relationship === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      src = src.filter(it =>
        it.nickname.toLowerCase().includes(q) ||
        it.urlId.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q));
    }
    const sorted = [...src];
    switch (sort) {
      case 'fanDesc': sorted.sort((a, b) => b.followerCount - a.followerCount); break;
      case 'fanAsc': sorted.sort((a, b) => a.followerCount - b.followerCount); break;
      case 'recent': sorted.sort((a, b) => +new Date(b.lastSeenAt) - +new Date(a.lastSeenAt)); break;
      case 'oldest': sorted.sort((a, b) => +new Date(a.lastSeenAt) - +new Date(b.lastSeenAt)); break;
      case 'nickname': sorted.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko')); break;
      default: sorted.sort((a, b) =>
        RELATIONSHIP_RANK[a.relationship] - RELATIONSHIP_RANK[b.relationship] || b.followerCount - a.followerCount);
    }
    return sorted;
  }, [data, statusFilter, search, sort]);

  const summary = data?.summary;
  const syncState = data?.syncState;

  // 요약 바 칩 정의
  const chips: Array<{ key: StatusFilter; label: string; count: number; dot?: string }> = summary ? [
    { key: 'all', label: '전체', count: summary.total },
    { key: 'mutual', label: RELATIONSHIP_LABEL.mutual, count: summary.mutual, dot: RELATIONSHIP_DOT.mutual },
    { key: 'onlyIFollow', label: RELATIONSHIP_LABEL.onlyIFollow, count: summary.onlyIFollow, dot: RELATIONSHIP_DOT.onlyIFollow },
    { key: 'onlyFollowsMe', label: RELATIONSHIP_LABEL.onlyFollowsMe, count: summary.onlyFollowsMe, dot: RELATIONSHIP_DOT.onlyFollowsMe },
  ] : [];

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text">맞팬 관리</h1>
          <p className="text-sm text-dim mt-1">
            네이버 인플루언서의 팬 관계를 분석합니다. 맞팬·일방팬을 한눈에 파악하세요.
          </p>
        </div>

        {/* 동기화 안내 박스 */}
        <div className="mb-5 p-4 bg-surface rounded-xl border border-border">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-text">데이터 동기화</p>
              <p className="text-xs text-dim mt-1">
                마지막 확인: <span className="font-medium text-text">{data?.lastSync ? formatDate(data.lastSync.synced_at) : '아직 없음'}</span>
                {data?.lastSync && (
                  <span className="ml-2">
                    · {data.lastSync.source === 'bookmarklet' ? '북마클릿' : data.lastSync.source}
                    {typeof data.lastSync.added_count === 'number' && data.lastSync.added_count > 0 && (
                      <span className="ml-2 text-up">+{data.lastSync.added_count} 추가</span>
                    )}
                    {typeof data.lastSync.removed_count === 'number' && data.lastSync.removed_count > 0 && (
                      <span className="ml-2 text-down">-{data.lastSync.removed_count} 사라짐</span>
                    )}
                  </span>
                )}
              </p>
              {syncState === 'failed' && (
                <p className="text-xs text-down mt-1 font-medium">⚠ 마지막 동기화에 실패했습니다(확인 실패). 이전 데이터를 그대로 보존 중입니다.</p>
              )}
            </div>
            <Link
              href="/my/fans/sync"
              className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition whitespace-nowrap"
            >
              동기화 방법 안내
            </Link>
          </div>
          <p className="text-[11px] text-dim mt-2 leading-snug">
            ※ 팬 관계는 내 네이버 계정에서 동기화한 목록의 집합연산으로 <b className="text-text">확정 계산</b>합니다(추정 없음).
            동기화한 목록에 없는 사람은 목록에 나타나지 않으며(“관계 없음”), 한 번도 동기화하지 않았다면 전체가 <b className="text-text">확인 중</b> 상태입니다.
          </p>
        </div>

        {/* 교차 매칭 — N인플 가입자 자동 발견 */}
        {crossMatch && (crossMatch.counts.inMyFans > 0 || crossMatch.counts.othersListedMe > 0) && (
          <div className="mb-5 p-4 bg-surface rounded-xl border border-accent/40">
            <p className="text-sm font-bold text-text">N인플 사용자 교차 매칭</p>
            <p className="text-xs text-dim mt-0.5 mb-3">
              내 명단 속 N인플 사용자 <span className="font-semibold text-accent">{crossMatch.counts.inMyFans}명</span>
              <span className="mx-2">·</span>
              나를 등록한 N인플 사용자 <span className="font-semibold text-accent">{crossMatch.counts.othersListedMe}명</span>
            </p>
            {crossMatch.othersListedMe.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-dim mb-2">다른 N인플 사용자가 나를 등록함 (동기화 없이도 감지)</p>
                <ul className="flex flex-wrap gap-2">
                  {crossMatch.othersListedMe.slice(0, 24).map(u => (
                    <li key={u.user_id} className="px-2.5 py-1 rounded-full bg-up/10 border border-up/30 text-xs">
                      <a href={`https://in.naver.com/${u.naver_url_id}`} target="_blank" rel="noopener noreferrer" className="text-text font-semibold hover:text-up">
                        @{u.naver_url_id}
                      </a>
                      <span className="ml-1 text-dim">{u.direction === 'BOTH' ? '맞팬' : u.direction === 'I_FOLLOW' ? '나를팬' : '내가팬'}</span>
                    </li>
                  ))}
                  {crossMatch.othersListedMe.length > 24 && (
                    <li className="px-2.5 py-1 text-xs text-dim">+{crossMatch.othersListedMe.length - 24}명 더</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 요약 바 (스펙 3) — 숫자 클릭 시 해당 상태만 필터 */}
        {summary && (
          <div className="flex flex-wrap gap-2 mb-4">
            {chips.map(c => (
              <button
                key={c.key}
                onClick={() => setStatusFilter(c.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-left transition ${
                  statusFilter === c.key ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-accent/50'
                }`}
              >
                {c.dot && <span className={`w-2 h-2 rounded-full ${c.dot}`} />}
                <span className="text-xs font-semibold text-dim">{c.label}</span>
                <span className="text-base font-bold text-text">{c.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}

        {/* 검색 + 정렬 */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="닉네임 / 분야 / ID 검색"
            className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent flex-1 min-w-[180px]"
          />
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text focus:outline-none focus:border-accent"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map(k => (
              <option key={k} value={k}>{SORT_LABEL[k]}</option>
            ))}
          </select>
        </div>

        {/* 리스트 */}
        {loading && <div className="p-12 text-center text-dim">불러오는 중…</div>}
        {error && !loading && (
          <div className="p-6 rounded-xl bg-down/10 border border-down/30 text-down text-sm">{error}</div>
        )}
        {!loading && !error && list.length === 0 && (
          <div className="p-12 text-center text-dim text-sm">
            {syncState === 'never'
              ? '아직 동기화된 데이터가 없습니다(전체 확인 중). 위 “동기화 방법 안내” 버튼으로 시작하세요.'
              : '조건에 맞는 인플루언서가 없습니다.'}
          </div>
        )}
        {!loading && !error && list.length > 0 && (
          <ul className="space-y-2">
            {list.map(it => (
              <li key={it.urlId}>
                <button
                  onClick={() => setSelected(it)}
                  className="w-full p-3 rounded-xl bg-surface border border-border flex items-center gap-3 text-left hover:border-accent/50 transition"
                >
                  {it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.imageUrl} alt="" className="w-11 h-11 rounded-full object-cover border border-border shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-bg border border-border flex items-center justify-center text-text font-bold text-sm shrink-0">
                      {it.nickname.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text truncate">{it.nickname}</p>
                    <p className="text-[11px] text-dim mt-0.5 truncate">
                      {it.category && <>{it.category}<span className="mx-1">·</span></>}
                      팬 {formatCount(it.followerCount)}
                      <span className="mx-1">·</span>@{it.urlId}
                    </p>
                  </div>
                  <Badge relationship={it.relationship} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 상세 드로어 (스펙 4) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md h-full bg-bg border-l border-border overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-bg/95 backdrop-blur border-b border-border px-5 py-3 flex items-center justify-between">
              <p className="text-sm font-bold text-text">팬 관계 상세</p>
              <button onClick={() => setSelected(null)} className="text-dim hover:text-text text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-5">
              {/* 프로필 */}
              <div className="flex items-center gap-3">
                {selected.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.imageUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-surface border border-border flex items-center justify-center text-text font-bold">
                    {selected.nickname.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-base font-bold text-text truncate">{selected.nickname}</p>
                  <p className="text-xs text-dim truncate">{selected.category || '분야 미상'} · 팬 {formatCount(selected.followerCount)}</p>
                </div>
                <Badge relationship={selected.relationship} />
              </div>

              {/* 관계 */}
              <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
                <p className="text-xs font-semibold text-dim">팬 관계</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-dim">내가 팬함</span>
                  <span className={`font-bold ${selected.myFollow ? 'text-up' : 'text-dim'}`}>{selected.myFollow ? 'YES' : 'NO'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-dim">상대가 나를 팬함</span>
                  <span className={`font-bold ${selected.theirFollow ? 'text-up' : 'text-dim'}`}>{selected.theirFollow ? 'YES' : 'NO'}</span>
                </div>
                <div className="flex items-center justify-between text-sm pt-1 border-t border-border">
                  <span className="text-dim">현재 상태</span>
                  <span className="font-bold text-text">{RELATIONSHIP_LABEL[selected.relationship]}</span>
                </div>
              </div>

              {/* 메타 */}
              <div className="text-xs text-dim space-y-1.5">
                <div className="flex justify-between"><span>마지막 확인</span><span className="text-text">{formatDate(selected.lastSeenAt)}</span></div>
                <div className="flex justify-between"><span>최초 관측</span><span className="text-text">{formatDate(selected.firstSeenAt)}</span></div>
                <div className="flex justify-between"><span>닉네임</span><span className="text-text">{selected.nickname}</span></div>
                <div className="flex justify-between gap-2">
                  <span>인플루언서 홈</span>
                  <a href={`https://in.naver.com/${selected.urlId}`} target="_blank" rel="noopener noreferrer" className="text-accent font-medium truncate">in.naver.com/{selected.urlId}</a>
                </div>
              </div>

              {/* 관계 변화 이력 (스펙 11) */}
              <div>
                <p className="text-xs font-semibold text-dim mb-2">관계 변화 이력</p>
                {historyLoading && <p className="text-xs text-dim">불러오는 중…</p>}
                {!historyLoading && history && history.length === 0 && (
                  <p className="text-xs text-dim">기록된 변화가 없습니다. 동기화를 반복하면 변화가 쌓입니다.</p>
                )}
                {!historyLoading && history && history.length > 0 && (
                  <ol className="space-y-1.5">
                    {[...history].reverse().map((h, i) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-dim">{formatDate(h.observedAt)}</span>
                        <span className="font-semibold text-text">{HISTORY_LABEL[h.relationshipStatus]}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
