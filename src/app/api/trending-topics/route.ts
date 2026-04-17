import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { INFLUENCER_TOPICS, topicToSlug } from '@/lib/influencer-topics';

export const runtime = 'nodejs';
export const revalidate = 600; // 10분 캐시

interface TopicSummary {
  topic: string;
  slug: string;
  totalKeywords: number;
  newCount: number;
  topKeywords: { keyword: string; participantCount: number; isNew: boolean }[];
}

export async function GET() {
  try {
    const supabase = createServiceClient();

    // 모든 주제의 활성 키워드 중 참여자수 상위 + 신규 여부 집계
    const { data, error } = await supabase
      .from('keyword_challenges')
      .select('keyword, category, participant_count, is_new')
      .eq('is_active', true)
      .in('category', [...INFLUENCER_TOPICS])
      .order('participant_count', { ascending: false })
      .limit(2000);

    if (error) {
      console.error('[trending-topics] DB error:', error);
      return NextResponse.json({ topics: [], error: '데이터를 불러올 수 없습니다.' });
    }

    // 주제별 그룹화
    const grouped = new Map<string, { keyword: string; participantCount: number; isNew: boolean }[]>();
    for (const topic of INFLUENCER_TOPICS) {
      grouped.set(topic, []);
    }
    for (const row of data || []) {
      const arr = grouped.get(row.category);
      if (!arr) continue;
      arr.push({
        keyword: row.keyword,
        participantCount: row.participant_count ?? 0,
        isNew: row.is_new ?? false,
      });
    }

    const topics: TopicSummary[] = INFLUENCER_TOPICS.map(topic => {
      const all = grouped.get(topic) || [];
      return {
        topic,
        slug: topicToSlug(topic) || topic,
        totalKeywords: all.length,
        newCount: all.filter(k => k.isNew).length,
        topKeywords: all.slice(0, 5),
      };
    });

    return NextResponse.json({ topics });
  } catch (err) {
    console.error('[trending-topics] fatal:', err);
    return NextResponse.json(
      { topics: [], error: '트렌드 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
