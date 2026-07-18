import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchCategories } from '@/lib/naver-api';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * 광고주용 인플루언서 검색 API
 * GET /api/ad/search?category=부동산&minRank=50&activityLevel=active&sort=integrated_top3_count&order=desc
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await searchLimiter.check(ip)) return rateLimitResponse();

  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') || '';
  const search = searchParams.get('search') || '';
  const minRank = parseInt(searchParams.get('minRank') || '0') || 0;
  const minFans = parseInt(searchParams.get('minFans') || '0') || 0;
  const maxFans = parseInt(searchParams.get('maxFans') || '0') || 0;
  const minTop3Ratio = parseInt(searchParams.get('minTop3Ratio') || '0') || 0;
  const minTotalKeywords = parseInt(searchParams.get('minTotalKeywords') || '0') || 0;
  const activityLevel = searchParams.get('activityLevel') || 'all';
  const hasAdProfile = searchParams.get('hasAdProfile') === 'true';
  const sortBy = searchParams.get('sort') || 'integrated_top3_count';
  const order = searchParams.get('order') || 'desc';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));
  const offset = (page - 1) * limit;

  try {
    const supabase = createServiceClient();

    // 카테고리 목록
    const apiCategories = await fetchCategories();
    const categories = ['전체', ...apiCategories.map(c => c.name)];

    // 쿼리 구성
    let query = supabase
      .from('influencers')
      .select('*', { count: 'exact' })
      .gt('subscriber_count', 0);

    // 카테고리 필터
    if (category && category !== '전체') {
      const safe = category.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s·/&.]/g, '');
      if (safe) {
        query = query.or(`my_keyword_category.eq.${safe},category.eq.${safe}`);
      }
    }

    // 텍스트 검색
    if (search.trim()) {
      const q = search.trim().replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s._-]/g, '');
      if (q) {
        query = query.or(
          `display_name.ilike.%${q}%,naver_id.ilike.%${q}%,my_keyword_category.ilike.%${q}%,my_keyword.ilike.%${q}%,category_my_type.ilike.%${q}%,introduction.ilike.%${q}%`,
        );
      }
    }

    // 최고순위 필터 (best_rank <= minRank)
    if (minRank > 0) {
      query = query.lte('best_rank', minRank).not('best_rank', 'is', null);
    }

    // 팬수 범위
    if (minFans > 0) {
      query = query.gte('subscriber_count', minFans);
    }
    if (maxFans > 0) {
      query = query.lte('subscriber_count', maxFans);
    }

    // TOP3 비율 (0~100 → 0~1)
    if (minTop3Ratio > 0) {
      query = query.gte('top3_ratio', minTop3Ratio / 100).gt('total_keywords', 0);
    }

    // 최소 챌린지(키워드) 수
    if (minTotalKeywords > 0) {
      query = query.gte('total_keywords', minTotalKeywords);
    }

    // 활동 수준
    if (activityLevel === 'active') {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      query = query.gte('last_challenged_at', d30.toISOString());
    } else if (activityLevel === 'recent') {
      const d90 = new Date();
      d90.setDate(d90.getDate() - 90);
      query = query.gte('last_challenged_at', d90.toISOString());
    }

    // 원고료 등록자만
    if (hasAdProfile) {
      query = query.not('ad_fee_amount', 'is', null).gt('ad_fee_amount', 0);
    }

    // 정렬
    const allowedSorts: Record<string, string> = {
      integrated_top3_count: 'integrated_top3_count',
      top3_ratio: 'top3_ratio',
      subscriber_count: 'subscriber_count',
      total_keywords: 'total_keywords',
      best_rank: 'best_rank',
      ad_fee_amount: 'ad_fee_amount',
      ninfl_score: 'ninfl_score',
    };
    const sortColumn = allowedSorts[sortBy] || 'integrated_top3_count';
    const ascending = sortColumn === 'best_rank' ? order !== 'desc' : order === 'asc';

    query = query
      .order(sortColumn, { ascending, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data: influencers, count, error } = await query;

    if (error) throw new Error(error.message);

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    // 응답 데이터 가공
    const now = Date.now();
    const results = (influencers || []).map(inf => {
      const lastActive = inf.last_challenged_at ? new Date(inf.last_challenged_at).getTime() : 0;
      const daysSinceActive = lastActive > 0 ? Math.floor((now - lastActive) / 86400000) : 999;

      const totalKw = inf.total_keywords || 0;
      const t3 = (inf.top1_count || 0) + (inf.top2_count || 0) + (inf.top3_count || 0);
      const ratio = totalKw > 0 ? Math.min(t3 / totalKw, 1) : 0;

      return {
        naverId: inf.naver_id,
        displayName: inf.display_name,
        imageUrl: inf.image_url,
        introduction: inf.introduction || '',
        category: inf.my_keyword_category || inf.category || '',
        categoryType: inf.category_my_type || '',
        myKeyword: inf.my_keyword || '',
        subscriberCount: inf.subscriber_count || inf.total_follower_count || 0,
        totalKeywords: totalKw,
        integratedTop3Count: inf.integrated_top3_count || 0,
        top3Ratio: Math.round(ratio * 1000) / 10,
        top1Count: inf.top1_count || 0,
        top2Count: inf.top2_count || 0,
        top3Count: inf.top3_count || 0,
        avgRank: inf.avg_rank ? Number(inf.avg_rank) : null,
        bestRank: inf.best_rank || null,
        adFeeAmount: inf.ad_fee_amount || null,
        adFeeText: inf.ad_fee_text || null,
        adProcess: inf.ad_process || null,
        lastChallengedAt: inf.last_challenged_at || null,
        ninflScore: Number(inf.ninfl_score) || 0,
        activityLevel: daysSinceActive <= 30 ? 'active' : daysSinceActive <= 90 ? 'recent' : 'inactive',
      };
    });

    return NextResponse.json({
      influencers: results,
      categories,
      total,
      page,
      totalPages,
    });
  } catch {
    return NextResponse.json(
      { error: '검색 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
