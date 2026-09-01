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
  const url = `https://ninfle.kr/influencers/${id}`;

  const fallback: Metadata = {
    title: '인플루언서 상세',
    description: '네이버 인플루언서의 키워드 포트폴리오·팬 수·통합 TOP3 실적을 분석합니다.',
    alternates: { canonical: url },
    openGraph: {
      title: '인플루언서 상세 — N인플',
      description: '네이버 인플루언서 키워드 포트폴리오 분석',
      url,
      siteName: 'N인플',
      type: 'profile',
      locale: 'ko_KR',
    },
    twitter: {
      card: 'summary_large_image',
      title: '인플루언서 상세 — N인플',
      description: '네이버 인플루언서 키워드 포트폴리오 분석',
    },
  };

  try {
    const supabase = createServiceClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
    const { data } = await supabase
      .from('influencers')
      .select('display_name, naver_id, my_keyword_category, total_keywords, integrated_top3_count, subscriber_count')
      .eq(isUuid ? 'id' : 'naver_id', decodeURIComponent(id))
      .single();

    if (!data?.display_name) return fallback;

    const parts: string[] = [];
    if (data.my_keyword_category) parts.push(data.my_keyword_category);
    if (data.total_keywords) parts.push(`참여 키워드 ${Number(data.total_keywords).toLocaleString()}개`);
    if (data.integrated_top3_count) parts.push(`TOP3 ${Number(data.integrated_top3_count).toLocaleString()}회`);
    if (data.subscriber_count) parts.push(`팬 ${Number(data.subscriber_count).toLocaleString()}명`);

    const title = `${data.display_name} 인플루언서 포트폴리오`;
    const description = `네이버 인플루언서 ${data.display_name}${data.naver_id ? `(@${data.naver_id})` : ''} 분석${parts.length ? ` — ${parts.join(', ')}` : ''}.`;

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: `${title} — N인플`,
        description,
        url,
        siteName: 'N인플',
        type: 'profile',
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

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await checkFeaturePage('influencers.detail', `/influencers/${id}`);
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  const supabase = createServiceClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id);
  const { data } = await supabase
    .from('influencers')
    .select('id')
    .eq(isUuid ? 'id' : 'naver_id', decodeURIComponent(id))
    .single();
  if (!data) notFound();

  return <Client params={params} />;
}
