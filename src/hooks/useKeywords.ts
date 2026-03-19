'use client';

import { useQuery } from '@tanstack/react-query';
import { Keyword } from '@/lib/types';

interface CategoryGroup {
  category: string;
  total: number;
  keywords: Keyword[];
}

interface KeywordsResponse {
  keywords: Keyword[];
  grouped: CategoryGroup[];
  categories: string[];
  total: number;
  nextCursor: string | null;
}

interface UseKeywordsOptions {
  category: string;
  search: string;
  page: number;
  cursor?: string | null;
  limit?: number;
}

async function fetchKeywords(opts: UseKeywordsOptions): Promise<KeywordsResponse> {
  const params = new URLSearchParams({ limit: String(opts.limit || 50) });

  if (opts.category !== '전체') {
    params.set('category', opts.category);
    if (opts.cursor) params.set('cursor', opts.cursor);
  } else {
    params.set('page', String(opts.page));
  }

  if (opts.search.trim()) params.set('search', opts.search.trim());

  const res = await fetch(`/api/keywords?${params}`);
  if (!res.ok) throw new Error('키워드 로드 실패');
  return res.json();
}

export function useKeywords(opts: UseKeywordsOptions) {
  return useQuery({
    queryKey: ['keywords', opts.category, opts.search, opts.page, opts.cursor],
    queryFn: () => fetchKeywords(opts),
    placeholderData: (prev) => prev,
  });
}
