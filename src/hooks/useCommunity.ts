'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CommunityPost {
  id: string;
  category: string;
  title: string;
  author_id: string;
  author_name: string;
  author_type: string;
  view_count: number;
  comment_count: number;
  like_count: number;
  created_at: string;
  is_pinned: boolean;
}

interface CommunityResponse {
  posts: CommunityPost[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UseCommunityOptions {
  category: string;
  page: number;
  limit?: number;
}

async function fetchCommunity(opts: UseCommunityOptions): Promise<CommunityResponse> {
  const params = new URLSearchParams({
    page: String(opts.page),
    limit: String(opts.limit || 20),
  });

  if (opts.category) params.set('category', opts.category);

  const res = await fetch(`/api/community?${params}`);
  if (!res.ok) throw new Error('커뮤니티 로드 실패');
  return res.json();
}

export function useCommunity(opts: UseCommunityOptions) {
  return useQuery({
    queryKey: ['community', opts.category, opts.page],
    queryFn: () => fetchCommunity(opts),
    placeholderData: (prev) => prev,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { category: string; title: string; content: string; author_name?: string }) => {
      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '글 작성에 실패했습니다.');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community'] });
    },
  });
}
