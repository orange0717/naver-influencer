'use client';

import { useEffect, useState } from 'react';
import { formatCountK as formatCount } from '@/lib/format';
import { newViewToken, viewHeaders, readQuotaExceeded, type QuotaInfo } from '@/lib/analysis-view';
import AnalysisQuotaNotice from '@/components/AnalysisQuotaNotice';
import FilterPills from '@/components/analytics/FilterPills';

interface Item {
  id: string;
  platform: 'blog' | 'cafe' | 'kin' | 'premium';
  category: string;
  /** 이 메이트가 선정된 분야 전체 — 여러 분야에 동시 선정될 수 있음 */
  categories: string[];
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
  platformCounts: Partial<Record<Item['platform'], number>>;
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
  const [platform, setPlatform] = useState<'' | Item['platform']>('');
  // 이 화면 mount 당 조회 토큰 1개 — 카테고리 전환 재요청은 같은 조회로 dedup
  const [viewToken] = useState(() => newViewToken());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (platform) params.set('platform', platform);
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
        // 아직 아무 분야도 수집되지 않은 경우에만 전체 빈 화면. 특정 분야만 비어 있으면
        // 분야 칩은 유지하고 인라인 안내만 보여준다(전체 25개 분야 노출 목적).
        if (!data.year) {
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
  }, [category, platform, viewToken]);

  if (state.kind === 'quota') {
    return <AnalysisQuotaNotice quota={state.quota} />;
  }

  if (state.kind === 'loading') {
    return <div className="text-center text-dim py-12">불러오는 중...</div>;
  }

  if (state.kind === 'error') {
    return (
      <div className="bg-surface rounded-lg border border-border p-6 text-center">
        <p className="text-sm text-down">{state.message}</p>
      </div>
    );
  }

  if (state.kind === 'empty') {
    return (
      <div className="bg-surface rounded-lg border border-border p-8 text-center">
        <p className="text-sm text-dim">아직 수집된 네이버 메이트 데이터가 없습니다.</p>
      </div>
    );
  }

  const { year, month, categories, platformCounts, items } = state.data;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dim">
          <span>
            기준: <span className="font-bold text-text">{year}년 {month}월</span>
          </span>
          <span>총 {items.length.toLocaleString()}명</span>
        </div>
        {/* 네이버 API는 선정자 명단을 매 호출 무작위 순서로 내려준다(순위 미공개).
            아래 번호는 누적 인용수로 우리가 매긴 것이라 메이트 홈과 노출 순서가 다르다. */}
        <p className="text-[11px] text-dim leading-relaxed">
          네이버 메이트 공식 홈은 선정자 중 일부를 무작위로 보여줍니다. 이 표는 선정자 전원을 누적 AI 브리핑 인용수 순으로 정렬한 것이라
          공식 홈과 노출 순서·인원이 다를 수 있습니다. 인용수 규모는 서비스마다 달라 서비스를 골라 비교하는 편이 정확합니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setPlatform('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
            platform === '' ? 'bg-text text-white' : 'bg-surface border border-border text-dim hover:text-text'
          }`}
        >
          전체 서비스
        </button>
        {(Object.keys(PLATFORM_LABEL) as Item['platform'][]).map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            disabled={!platformCounts[p]}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              platform === p
                ? 'bg-text text-white cursor-pointer'
                : platformCounts[p]
                  ? 'bg-surface border border-border text-dim hover:text-text cursor-pointer'
                  : 'bg-surface border border-border text-dim/40 cursor-not-allowed'
            }`}
          >
            {PLATFORM_LABEL[p]} {(platformCounts[p] || 0).toLocaleString()}
          </button>
        ))}
      </div>

      <FilterPills
        options={[{ value: '', label: '전체' }, ...categories.map(cat => ({ value: cat, label: cat }))]}
        value={category}
        onChange={setCategory}
      />

      {items.length === 0 ? (
        <div className="bg-surface rounded-lg border border-border p-8 text-center">
          <p className="text-sm text-dim">
            {platform
              ? `‘${category || '전체'}’ 분야에는 ${PLATFORM_LABEL[platform]} 메이트가 없습니다.`
              : category
                ? `‘${category}’ 분야는 아직 수집된 데이터가 없습니다.`
                : '아직 수집된 네이버 메이트 데이터가 없습니다.'}
          </p>
        </div>
      ) : (
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
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
                <div className="w-40 md:w-56 shrink-0 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold truncate">{it.displayName}</p>
                    {it.isNew && (
                      <span className="text-[10px] font-bold text-white bg-accent px-1.5 py-0.5 rounded shrink-0">NEW</span>
                    )}
                  </div>
                  <p className="text-[11px] text-dim truncate">
                    {PLATFORM_LABEL[it.platform]}
                    <span className="sm:hidden">
                      {(it.categories.length > 0 ? it.categories : [it.category]).map((cat) => ` · ${cat}`).join('')}
                    </span>
                  </p>
                </div>
                <div className="hidden sm:flex flex-wrap gap-1 w-32 md:w-48 shrink-0">
                  {(it.categories.length > 0 ? it.categories : [it.category]).map((cat) => (
                    <span
                      key={cat}
                      className="text-[10px] font-semibold text-accent bg-bg border border-border rounded px-1.5 py-0.5"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                <p className="hidden md:block flex-1 min-w-0 truncate text-[12px] text-dim">
                  {it.latestPostTitle || ''}
                </p>
                <div className="text-xs font-bold text-text shrink-0 ml-auto md:ml-0">
                  인용 {formatCount(it.aiBriefingCount)}
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
      )}
    </div>
  );
}
