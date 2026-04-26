'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Item {
  id: string;
  snapshot_date: string;
  category: string;
  rank_position: number;
  naver_id: string | null;
  display_name: string;
  profile_url: string | null;
  image_url: string | null;
  subscriber_count: number | null;
  linked_influencer_id: string | null;
}

interface ApiResponse {
  snapshotDate: string | null;
  categories: string[];
  items: Item[];
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'paywall'; message: string; currentPlan?: string }
  | { kind: 'login' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: ApiResponse };

export default function OfficialRankingView() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [category, setCategory] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        params.set('limit', '500');
        const res = await fetch(`/api/rankings/official?${params.toString()}`, {
          credentials: 'include',
        });
        if (cancelled) return;
        if (res.status === 401) {
          setState({ kind: 'login' });
          return;
        }
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          setState({
            kind: 'paywall',
            message: body?.error || '인플루언서 플랜 이상에서 이용 가능합니다.',
            currentPlan: body?.currentPlan,
          });
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setState({ kind: 'error', message: body?.error || '데이터를 불러오지 못했습니다.' });
          return;
        }
        const data: ApiResponse = await res.json();
        if (!data.snapshotDate || data.items.length === 0) {
          setState({ kind: 'empty' });
          return;
        }
        setState({ kind: 'ok', data });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: '네트워크 오류' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (state.kind === 'loading') {
    return <div className="text-center text-dim py-12">불러오는 중...</div>;
  }

  if (state.kind === 'login') {
    return (
      <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-3">
        <p className="text-sm text-dim">로그인 후 이용 가능합니다.</p>
        <Link
          href="/login"
          className="inline-block px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold"
        >
          로그인
        </Link>
      </div>
    );
  }

  if (state.kind === 'paywall') {
    return (
      <div className="bg-surface rounded-xl border border-border p-8 text-center space-y-4">
        <div>
          <p className="text-base font-bold">인플루언서 플랜 전용 기능</p>
          <p className="text-sm text-dim mt-2">{state.message}</p>
          {state.currentPlan === 'BLOGGER' && (
            <p className="text-xs text-dim mt-1">현재 플랜: 예비 인플루언서 — 인플루언서 플랜으로 업그레이드하면 이용 가능합니다.</p>
          )}
        </div>
        <Link
          href="/subscribe"
          className="inline-block px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-bold"
        >
          인플루언서 플랜 보기
        </Link>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="bg-surface rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-down">{state.message}</p>
      </div>
    );
  }

  if (state.kind === 'empty') {
    return (
      <div className="bg-surface rounded-xl border border-border p-8 text-center">
        <p className="text-sm text-dim">아직 업로드된 공식 순위 데이터가 없습니다.</p>
      </div>
    );
  }

  const { snapshotDate, categories, items } = state.data;

  // 카테고리별 그룹화 (현재 선택된 카테고리가 없으면 전체, 있으면 단일)
  const grouped = new Map<string, Item[]>();
  items.forEach((it) => {
    if (!grouped.has(it.category)) grouped.set(it.category, []);
    grouped.get(it.category)!.push(it);
  });

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dim">
        <span>
          기준일:{' '}
          <span className="font-bold text-text">{snapshotDate}</span>
        </span>
        <span>총 {items.length.toLocaleString()}명</span>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setCategory('')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
            category === '' ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:text-text'
          }`}
        >
          전체
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
              category === cat ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:text-text'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 순위 리스트 — 카테고리별 그룹 */}
      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([cat, list]) => (
          <section key={cat}>
            <h2 className="text-sm font-extrabold mb-2 px-1">{cat}</h2>
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <ul className="divide-y divide-border">
                {list.map((it) => {
                  const target = it.linked_influencer_id
                    ? `/influencers/${it.linked_influencer_id}`
                    : it.profile_url || null;
                  const Inner = (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 text-center text-sm font-extrabold text-accent">
                        {it.rank_position}
                      </div>
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.image_url}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover bg-bg shrink-0"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-bg shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{it.display_name}</p>
                        {it.naver_id && (
                          <p className="text-[11px] text-dim truncate">@{it.naver_id}</p>
                        )}
                      </div>
                      {it.subscriber_count != null && (
                        <div className="text-[11px] text-dim shrink-0">
                          팬 {it.subscriber_count.toLocaleString()}
                        </div>
                      )}
                    </div>
                  );
                  return (
                    <li key={it.id}>
                      {target ? (
                        target.startsWith('/') ? (
                          <Link href={target} className="block hover:bg-surface-hover transition">
                            {Inner}
                          </Link>
                        ) : (
                          <a
                            href={target}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block hover:bg-surface-hover transition"
                          >
                            {Inner}
                          </a>
                        )
                      ) : (
                        Inner
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
