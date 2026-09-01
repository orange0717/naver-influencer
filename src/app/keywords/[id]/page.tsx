import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase-server';
import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import Client from './Client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const url = `https://ninfle.kr/keywords/${id}`;

  const fallback: Metadata = {
    title: '키워드 상세',
    description: '네이버 키워드의 월 검색량·경쟁도·참여 인플루언서 순위를 한 페이지에서 확인하세요.',
    alternates: { canonical: url },
    openGraph: {
      title: '키워드 상세 — N인플',
      description: '네이버 키워드 순위와 경쟁도 분석',
      url,
      siteName: 'N인플',
      type: 'article',
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary_large_image',
      title: '키워드 상세 — N인플',
      description: '네이버 키워드 순위와 경쟁도 분석',
    },
  };

  try {
    const supabase = createServiceClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
    const { data } = await supabase
      .from('keyword_challenges')
      .select('keyword, category, participant_count, search_volume_monthly')
      .eq(isUuid ? 'id' : 'keyword', decodeURIComponent(id))
      .single();

    if (!data?.keyword) return fallback;

    const parts: string[] = [];
    if (data.participant_count) parts.push(`참여자 ${Number(data.participant_count).toLocaleString()}명`);
    if (data.search_volume_monthly) parts.push(`월 검색량 ${Number(data.search_volume_monthly).toLocaleString()}회`);
    if (data.category) parts.push(`${data.category} 카테고리`);

    const title = `${data.keyword} 키워드 분석`;
    const description = `네이버 인플루언서 키워드챌린지 "${data.keyword}" 분석${parts.length ? ` — ${parts.join(', ')}` : ''}.`;

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: `${title} — N인플`,
        description,
        url,
        siteName: 'N인플',
        type: 'article',
        locale: 'ko_KR',
      },
      twitter: {
        card: 'summary_large_image',
        title: `${title} — N인플`,
        description,
      },
    };
  } catch {
    return fallback;
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gate = await checkFeaturePage('keywords.challenge', `/keywords/${id}`);
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  const supabase = createServiceClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
  const { data } = await supabase
    .from('keyword_challenges')
    .select('id')
    .eq(isUuid ? 'id' : 'keyword', decodeURIComponent(id))
    .single();
  if (!data) notFound();

  return <Client />;
}
