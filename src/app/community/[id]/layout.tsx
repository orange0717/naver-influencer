import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase-server';

const SITE_URL = 'https://ninfle.kr';

const CATEGORY_LABELS: Record<string, string> = {
  free: '자유게시판',
  tip: '블로그 꿀팁',
  review: '체험단/협찬',
  qna: 'Q&A',
};

function buildDescription(content: string): string {
  const stripped = String(content ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 120 ? `${stripped.slice(0, 120)}…` : stripped;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const url = `${SITE_URL}/community/${id}`;

  const fallback: Metadata = {
    title: '커뮤니티',
    description: 'N인플 커뮤니티 — 블로거·인플루언서가 나누는 자유게시판, 블로그 꿀팁, 체험단/협찬, Q&A.',
    alternates: { canonical: url },
  };

  try {
    const supabase = createServiceClient();
    const { data: post } = await supabase
      .from('community_posts')
      .select('title, content, category')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (!post?.title) return fallback;

    const categoryLabel = CATEGORY_LABELS[post.category] || '커뮤니티';
    const description = buildDescription(post.content) || `N인플 ${categoryLabel} 게시글: ${post.title}`;

    return {
      title: post.title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: `${post.title} — N인플 ${categoryLabel}`,
        description,
        url,
        siteName: 'N인플',
        type: 'article',
        locale: 'ko_KR',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${post.title} — N인플`,
        description,
      },
    };
  } catch {
    return fallback;
  }
}

export default function CommunityPostLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
