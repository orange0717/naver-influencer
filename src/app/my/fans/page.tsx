'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface FanItem {
  urlId: string;
  nickname: string;
  imageUrl: string;
  category: string;
  followerCount: number;
  firstSeenAt: string;
}

interface FansResponse {
  counts: {
    mutual: number;
    onlyIFollow: number;
    onlyFollowsMe: number;
    totalIFollow: number;
    totalFollowsMe: number;
  };
  mutual: FanItem[];
  onlyIFollow: FanItem[];
  onlyFollowsMe: FanItem[];
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
  email?: string | null;
  target_nickname?: string | null;
  target_image_url?: string | null;
  direction: 'I_FOLLOW' | 'FOLLOWS_ME' | 'BOTH';
}

interface CrossMatchResponse {
  ok: boolean;
  me: { user_id: string; naver_url_id: string | null };
  inMyFans: CrossMatchUser[];
  othersListedMe: CrossMatchUser[];
  counts: { inMyFans: number; othersListedMe: number };
}

type TabKey = 'mutual' | 'onlyIFollow' | 'onlyFollowsMe';

const TAB_INFO: Record<TabKey, { label: string; description: string }> = {
  mutual: {
    label: '서로 맞팬',
    description: '나도 팬, 상대도 나를 팬한 인플루언서',
  },
  onlyIFollow: {
    label: '내가 팬 한',
    description: '내가 팬했지만 상대는 나를 팬하지 않은 인플루언서 (일방)',
  },
  onlyFollowsMe: {
    label: '나를 팬 한',
    description: '상대가 나를 팬했지만 내가 팬하지 않은 인플루언서 (일방)',
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

export default function MyFansPage() {
  const router = useRouter();
  const [data, setData] = useState<FansResponse | null>(null);
  const [crossMatch, setCrossMatch] = useState<CrossMatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('mutual');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace(`/auth/login?redirect=${encodeURIComponent('/my/fans')}`);
          return;
        }
        const headers = { authorization: `Bearer ${session.access_token}` };
        const [fansRes, crossRes] = await Promise.all([
          fetch('/api/my/fans', { headers }),
          fetch('/api/my/fans/cross-match', { headers }),
        ]);
        if (!fansRes.ok) {
          const j = await fansRes.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${fansRes.status}`);
        }
        const json: FansResponse = await fansRes.json();
        setData(json);
        if (crossRes.ok) {
          setCrossMatch(await crossRes.json());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  const list = useMemo<FanItem[]>(() => {
    if (!data) return [];
    const src = data[tab];
    if (!search.trim()) return src;
    const q = search.trim().toLowerCase();
    return src.filter(it =>
      it.nickname.toLowerCase().includes(q) ||
      it.urlId.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  }, [data, tab, search]);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text">내 팬 관리</h1>
          <p className="text-sm text-dim mt-1">
            네이버 인플루언서의 팔로우 관계를 분석합니다. 맞팬·일방팬을 한눈에 파악하세요.
          </p>
        </div>

        {/* 동기화 안내 박스 */}
        <div className="mb-6 p-4 bg-surface rounded-xl border border-border">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-text">데이터 동기화</p>
              <p className="text-xs text-dim mt-1">
                마지막 동기화: <span className="font-medium text-text">{data?.lastSync ? formatDate(data.lastSync.synced_at) : '아직 없음'}</span>
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
            </div>
            <Link
              href="/my/fans/sync"
              className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition"
            >
              동기화 방법 안내
            </Link>
          </div>
        </div>

        {/* 교차 매칭 — N인플 가입자 자동 발견 */}
        {crossMatch && (crossMatch.counts.inMyFans > 0 || crossMatch.counts.othersListedMe > 0) && (
          <div className="mb-6 p-4 bg-surface rounded-xl border border-accent/40">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-bold text-text">N인플 사용자 교차 매칭</p>
                <p className="text-xs text-dim mt-0.5">
                  내 명단에 있는 N인플 사용자: <span className="font-semibold text-accent">{crossMatch.counts.inMyFans}명</span>
                  <span className="mx-2">·</span>
                  나를 등록한 N인플 사용자: <span className="font-semibold text-accent">{crossMatch.counts.othersListedMe}명</span>
                </p>
              </div>
            </div>

            {crossMatch.inMyFans.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-dim mb-2">내 명단에서 발견 (내가 동기화한 데이터 기준)</p>
                <ul className="flex flex-wrap gap-2">
                  {crossMatch.inMyFans.slice(0, 24).map(u => (
                    <li key={u.user_id} className="px-2.5 py-1 rounded-full bg-accent/10 border border-accent/30 text-xs">
                      <a href={`https://in.naver.com/${u.naver_url_id}`} target="_blank" rel="noopener noreferrer" className="text-text font-semibold hover:text-accent">
                        {u.target_nickname || `@${u.naver_url_id}`}
                      </a>
                      <span className="ml-1 text-dim">
                        {u.direction === 'BOTH' ? '맞팬' : u.direction === 'I_FOLLOW' ? '내가팬' : '나를팬'}
                      </span>
                    </li>
                  ))}
                  {crossMatch.inMyFans.length > 24 && (
                    <li className="px-2.5 py-1 text-xs text-dim">+{crossMatch.inMyFans.length - 24}명 더</li>
                  )}
                </ul>
              </div>
            )}

            {crossMatch.othersListedMe.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-dim mb-2">다른 N인플 사용자가 나를 등록함 (자동 감지, 동기화 불필요)</p>
                <ul className="flex flex-wrap gap-2">
                  {crossMatch.othersListedMe.slice(0, 24).map(u => (
                    <li key={u.user_id} className="px-2.5 py-1 rounded-full bg-up/10 border border-up/30 text-xs">
                      <a href={`https://in.naver.com/${u.naver_url_id}`} target="_blank" rel="noopener noreferrer" className="text-text font-semibold hover:text-up">
                        @{u.naver_url_id}
                      </a>
                      <span className="ml-1 text-dim">
                        {u.direction === 'BOTH' ? '맞팬' : u.direction === 'I_FOLLOW' ? '나를팬' : '내가팬'}
                      </span>
                    </li>
                  ))}
                  {crossMatch.othersListedMe.length > 24 && (
                    <li className="px-2.5 py-1 text-xs text-dim">+{crossMatch.othersListedMe.length - 24}명 더</li>
                  )}
                </ul>
              </div>
            )}

            {!crossMatch.me.naver_url_id && (
              <p className="text-[11px] text-dim mt-3">
                💡 한 번이라도 동기화하면 본인 네이버 ID 가 등록되어 다른 사용자가 나를 자동으로 발견할 수 있습니다.
              </p>
            )}
          </div>
        )}

        {/* 통계 카드 */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <button
              onClick={() => setTab('mutual')}
              className={`p-4 rounded-xl border text-left transition ${tab === 'mutual' ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-accent/50'}`}
            >
              <p className="text-xs font-semibold text-dim">서로 맞팬</p>
              <p className="text-2xl font-bold text-text mt-1">{data.counts.mutual.toLocaleString()}</p>
              <p className="text-[11px] text-dim mt-1">양방향</p>
            </button>
            <button
              onClick={() => setTab('onlyIFollow')}
              className={`p-4 rounded-xl border text-left transition ${tab === 'onlyIFollow' ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-accent/50'}`}
            >
              <p className="text-xs font-semibold text-dim">내가 팬 한</p>
              <p className="text-2xl font-bold text-text mt-1">{data.counts.onlyIFollow.toLocaleString()}</p>
              <p className="text-[11px] text-dim mt-1">전체 {data.counts.totalIFollow.toLocaleString()}명 중 일방</p>
            </button>
            <button
              onClick={() => setTab('onlyFollowsMe')}
              className={`p-4 rounded-xl border text-left transition ${tab === 'onlyFollowsMe' ? 'border-accent bg-accent/5' : 'border-border bg-surface hover:border-accent/50'}`}
            >
              <p className="text-xs font-semibold text-dim">나를 팬 한</p>
              <p className="text-2xl font-bold text-text mt-1">{data.counts.onlyFollowsMe.toLocaleString()}</p>
              <p className="text-[11px] text-dim mt-1">전체 {data.counts.totalFollowsMe.toLocaleString()}명 중 일방</p>
            </button>
          </div>
        )}

        {/* 탭 헤더 + 검색 */}
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-text">{TAB_INFO[tab].label}</h2>
            <p className="text-xs text-dim mt-0.5">{TAB_INFO[tab].description}</p>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="닉네임/카테고리 검색"
            className="px-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent w-full sm:w-64"
          />
        </div>

        {/* 리스트 */}
        {loading && (
          <div className="p-12 text-center text-dim">불러오는 중…</div>
        )}
        {error && !loading && (
          <div className="p-6 rounded-xl bg-down/10 border border-down/30 text-down text-sm">{error}</div>
        )}
        {!loading && !error && list.length === 0 && (
          <div className="p-12 text-center text-dim text-sm">
            {data && data.counts.mutual + data.counts.onlyIFollow + data.counts.onlyFollowsMe === 0
              ? '아직 동기화된 데이터가 없습니다. 위의 "동기화 방법 안내" 버튼을 눌러 시작하세요.'
              : '조건에 맞는 인플루언서가 없습니다.'}
          </div>
        )}
        {!loading && !error && list.length > 0 && (
          <ul className="space-y-2">
            {list.map(it => (
              <li key={it.urlId} className="p-3 rounded-xl bg-surface border border-border flex items-center gap-3">
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="" className="w-11 h-11 rounded-full object-cover border border-border" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-bg border border-border flex items-center justify-center text-text font-bold text-sm">
                    {it.nickname.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <a
                    href={`https://in.naver.com/${it.urlId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-bold text-text hover:text-accent transition truncate block"
                  >
                    {it.nickname}
                  </a>
                  <p className="text-[11px] text-dim mt-0.5 truncate">
                    {it.category && <span>{it.category}</span>}
                    {it.category && <span className="mx-1">·</span>}
                    <span>팬 {formatCount(it.followerCount)}</span>
                    {it.urlId && <><span className="mx-1">·</span><span>@{it.urlId}</span></>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
