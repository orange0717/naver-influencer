'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import InfluencersListClient from './InfluencersListClient';
import DiscoverInfluencersView from '@/components/DiscoverInfluencersView';

type Tab = 'all' | 'topic';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'topic', label: '토픽' },
];

function InfluencersTabsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'topic' ? 'topic' : 'all';

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `/influencers?${qs}` : '/influencers');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === t.key
                ? 'text-accent border-accent'
                : 'text-dim border-transparent hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'all' ? <InfluencersListClient /> : <DiscoverInfluencersView />}
    </div>
  );
}

export default function InfluencersTabs() {
  return (
    <Suspense fallback={null}>
      <InfluencersTabsInner />
    </Suspense>
  );
}
