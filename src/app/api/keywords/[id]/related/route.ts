import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/keywords/[id]/related
 * 같은 카테고리 내에서 키워드명에 공통 단어가 포함된 관련 키워드 반환
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  // 1) 대상 키워드 조회 (UUID 또는 naver_keyword_id)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);
  const { data: keyword } = await supabase
    .from('keyword_challenges')
    .select('id, keyword, category')
    .eq(isUuid ? 'id' : 'naver_keyword_id', isUuid ? id : Number(id))
    .single();

  if (!keyword) {
    return NextResponse.json({ related: [] });
  }

  // 2) 키워드명에서 2글자 이상 토큰 추출
  // 한글은 2글자씩 슬라이딩 윈도우, 공백 구분도 활용
  const tokens = extractTokens(keyword.keyword);
  if (tokens.length === 0) {
    return NextResponse.json({ related: [] });
  }

  // 3) 같은 카테고리에서 토큰 매칭 (OR 조건)
  const orConditions = tokens.map(t => `keyword.ilike.%${t}%`).join(',');
  const { data: related } = await supabase
    .from('keyword_challenges')
    .select('id, keyword, participant_count, search_volume_monthly')
    .eq('category', keyword.category)
    .neq('id', keyword.id)
    .or(orConditions)
    .order('participant_count', { ascending: false })
    .limit(10);

  return NextResponse.json({ related: related || [] });
}

/**
 * 키워드에서 검색용 토큰 추출
 * - 공백으로 분리된 단어 중 2글자 이상
 * - 한글 키워드는 전체를 하나의 토큰으로 + 2글자 이상 서브스트링
 */
function extractTokens(keyword: string): string[] {
  const clean = keyword.replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim();
  const tokens = new Set<string>();

  // 공백 분리 토큰
  const words = clean.split(/\s+/).filter(w => w.length >= 2);
  for (const w of words) {
    tokens.add(w);
  }

  // 공백이 없는 한글 키워드: 2~3글자 서브스트링 추출
  const noSpace = clean.replace(/\s/g, '');
  if (noSpace.length >= 4 && words.length <= 1) {
    for (let len = Math.min(3, noSpace.length - 1); len >= 2; len--) {
      for (let i = 0; i <= noSpace.length - len; i++) {
        tokens.add(noSpace.slice(i, i + len));
      }
    }
  }

  // 너무 일반적인 토큰 제외
  const stopwords = new Set(['추천', '리뷰', '후기', '정보', '방법', '비교', '순위', '인기', 'best', 'top']);
  const filtered = [...tokens].filter(t => !stopwords.has(t.toLowerCase()));

  // 토큰이 너무 많으면 상위 5개로 제한
  return filtered.slice(0, 5);
}
