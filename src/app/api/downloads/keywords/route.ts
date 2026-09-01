import { NextRequest } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { createServiceClient } from '@/lib/supabase-server';
import { rowsToCsv, csvResponse, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireFeature(request, 'keywords.challenge');
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category')?.slice(0, 50) || undefined;
  const search = searchParams.get('search')?.slice(0, 100) || undefined;

  const supabase = createServiceClient();
  let query = supabase
    .from('keyword_challenges')
    .select('keyword, category, participant_count, content_count, search_volume_monthly, search_volume_pc, search_volume_mobile, competition_level, recommendation_score')
    .order('participant_count', { ascending: false })
    .limit(DOWNLOAD_ROW_LIMIT);

  if (category && category !== '전체') {
    query = query.eq('category', category);
  }
  if (search) {
    query = query.ilike('keyword', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const headers = ['키워드', '카테고리', '참여자수', '게시글수', '월간검색량', 'PC검색량', '모바일검색량', '경쟁도', '추천점수'];
  const rows = (data || []).map((r) => [
    r.keyword,
    r.category,
    r.participant_count ?? '',
    r.content_count ?? '',
    r.search_volume_monthly ?? '',
    r.search_volume_pc ?? '',
    r.search_volume_mobile ?? '',
    r.competition_level ?? '',
    r.recommendation_score ?? '',
  ]);
  const csv = rowsToCsv(headers, rows);
  const fileSuffix = category && category !== '전체' ? `_${category}` : '';
  return csvResponse(`keywords${fileSuffix}_${todayStamp()}.csv`, csv);
}
