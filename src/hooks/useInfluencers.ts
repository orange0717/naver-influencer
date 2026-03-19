'use client';

import { useQuery } from '@tanstack/react-query';
import { Influencer } from '@/lib/types';

interface InfluencersResponse {
  influencers: Influencer[];
  total: number;
  page: number;
  totalPages: number;
}

interface UseInfluencersOptions {
  category: string;
  search: string;
  page: number;
  limit?: number;
}

async function fetchInfluencers(opts: UseInfluencersOptions): Promise<InfluencersResponse> {
  const params = new URLSearchParams({
    page: String(opts.page),
    limit: String(opts.limit || 20),
  });

  if (opts.category && opts.category !== '전체') params.set('category', opts.category);
  if (opts.search.trim()) params.set('search', opts.search.trim());

  const res = await fetch(`/api/influencers?${params}`);
  if (!res.ok) throw new Error('인플루언서 로드 실패');
  return res.json();
}

export function useInfluencers(opts: UseInfluencersOptions) {
  return useQuery({
    queryKey: ['influencers', opts.category, opts.search, opts.page],
    queryFn: () => fetchInfluencers(opts),
    placeholderData: (prev) => prev,
  });
}
