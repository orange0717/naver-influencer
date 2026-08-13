'use client';

import { useEffect, useState } from 'react';
import { formatCountK as formatCount } from '@/lib/format';
import { newViewToken, viewHeaders, readQuotaExceeded, type QuotaInfo } from '@/lib/analysis-view';
import AnalysisQuotaNotice from '@/components/AnalysisQuotaNotice';

interface Item {
  id: string;
  platform: 'blog' | 'cafe' | 'kin' | 'premium';
  category: string;
  displayName: string;
  profileImageUrl: string | null;
  homeUrl: string | null;
  aiBriefingCount: number;
  isNew: boolean;
  latestPostTitle: string | null;
  latestPostUrl: string | null;
  latestPostDate: string | null;
}

interface ApiResponse {
  year: number | null;
  month: number | null;
  categories: string[];
  items: Item[];
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'quota'; quota: QuotaInfo }
  | { kind: 'ok'; data: ApiResponse };

const PLATFORM_LABEL: Record<Item['platform'], string> = {
  blog: '블로그',
  cafe: '카페',
  kin: '지식iN',
  premium: '프리미엄콘텐츠',
};

export default function NaverMateRankingView() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [category, setCategory] = useState<string>('');
  // 이 화면 mount 당 조회 토큰 1개 — 카테고리 전환 재요청은 같은 조회로 dedup
  const [viewToken] = useState(() => newViewToken());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        params.set('limit', '200');
        const res = await fetch(`/api/rankings/naver-mate?${params.toString()}`, {
          headers: viewHeaders(viewToken),
        });
        if (cancelled) return;
        if (!res.ok) {
          const exceeded = await readQuotaExceeded(res);
          if (exceeded) {
            setState({ kind: 'quota', quota: exceeded });
            return;
          }
          const body = await res.json().catch(() => ({}));
          setState({ kind: 'error', message: body?.error || '데이터를 불러오지 못했습니다.' });
          return;
        }
        const data: ApiResponse = await res.json();
        if (!data.year || data.items.length === 0) {
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
  }, [category, viewToken]);

  if (state.kind === 'quota') {
    return <AnalysisQuotaNotice quota={state.quota} />;
  }

  if (state.kind === 'loading') {
    return <div className="text-center text-dim py-12">불러오는 중...</div>;
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
        <p className="text-sm text-dim">아직 수집된 네이버 메이트 데이터가 없습니다.</p>
      </div>
    );
  }

  const { year, month, categories, items } = state.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dim">
        <span>
          기준: <span className="font-bold text-text">{year}년 {month}월</span>
        </span>
        <span>총 {items.length.toLocaleString()}명</span>
      </div>

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

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <ul className="divide-y divide-border">
          {items.map((it, idx) => (
            <li key={it.id}>
              <a
                href={it.homeUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition"
              >
                <div className="w-8 text-center text-sm font-extrabold text-accent shrink-0">{idx + 1}</div>
                {it.profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.profileImageUrl}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover bg-bg shrink-0"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-bg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold truncate">{it.displayName}</p>
                    {it.isNew && (
                      <span className="text-[10px] font-bold text-white bg-accent px-1.5 py-0.5 rounded shrink-0">NEW</span>
                    )}
                  </div>
                  <p className="text-[11px] text-dim truncate">
                    {it.category} · {PLATFORM_LABEL[it.platform]}
                    {it.latestPostTitle ? ` · ${it.latestPostTitle}` : ''}
                  </p>
                </div>
                <div className="text-xs font-bold text-text shrink-0">
                  인용 {formatCount(it.aiBriefingCount)}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
