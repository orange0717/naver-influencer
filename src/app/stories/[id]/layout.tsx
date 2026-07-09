import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase-server';

const SITE_URL = 'https://ninfle.kr';

function buildDescription(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const supabase = createServiceClient();
  const { data: story } = await supabase
    .from('growth_stories')
    .select('title, content, status, is_deleted')
    .eq('id', id)
    .eq('is_deleted', false)
    .eq('status', 'approved')
    .maybeSingle();

  if (!story) {
    return {
      title: '성장 후기',
      robots: { index: false, follow: false },
    };
  }

  const description = buildDescription(story.content || '') || 'N인플 이용자의 성장 후기입니다.';
  const url = `${SITE_URL}/stories/${id}`;

  return {
    title: story.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${story.title} — N인플 성장 후기`,
      description,
      url,
      siteName: 'N인플',
      locale: 'ko_KR',
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${story.title} — N인플 성장 후기`,
      description,
    },
  };
}

export default function StoryDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
