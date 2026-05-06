import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase-server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const url = `https://ninfle.kr/notice/${id}`;

  const fallback: Metadata = {
    title: '공지사항',
    description: 'N인플 공지사항·업데이트·뉴스레터를 확인하세요.',
    alternates: { canonical: url },
    openGraph: {
      title: '공지사항 — N인플',
      description: 'N인플 공지사항·업데이트·뉴스레터',
      url,
      siteName: 'N인플',
      type: 'article',
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary_large_image',
      title: '공지사항 — N인플',
      description: 'N인플 공지사항·업데이트·뉴스레터',
    },
  };

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('notices')
      .select('title, content, tag, created_at')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (!data?.title) return fallback;

    const stripped = String(data.content ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const description = stripped.length > 160 ? `${stripped.slice(0, 157)}...` : stripped || `N인플 공지사항: ${data.title}`;

    return {
      title: data.title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: `${data.title} — N인플 공지사항`,
        description,
        url,
        siteName: 'N인플',
        type: 'article',
        locale: 'ko_KR',
        publishedTime: data.created_at,
      },
      twitter: {
        card: 'summary_large_image',
        title: `${data.title} — N인플`,
        description,
      },
    };
  } catch {
    return fallback;
  }
}

export default function NoticeIdLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
