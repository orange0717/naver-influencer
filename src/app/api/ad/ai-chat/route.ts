import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import { parseQueryToFilters, matchPowerContentKeyword } from '@/lib/ai-search';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * AI 챗 API — 광고주가 자연어로 질문하면 인플루언서를 찾아 추천
 * POST /api/ad/ai-chat
 * body: { question: string }
 * response: SSE 스트리밍 (type: influencers | text | done)
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await searchLimiter.check(ip)) return rateLimitResponse();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  let body: { question?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return Response.json({ error: '질문을 입력해주세요.' }, { status: 400 });
  }

  try {
    // 1) 자연어 파싱 (규칙 기반 + 파워콘텐츠 95K 키워드)
    const pcMatch = matchPowerContentKeyword(question);
    const filters = parseQueryToFilters(question);
    if (pcMatch && !filters.category) {
      filters.category = pcMatch.category;
    }
    if (filters.keyword_text && filters.category) {
      delete filters.category;
    }

    // 2) DB 검색
    const supabase = createServiceClient();
    let query = supabase
      .from('influencers')
      .select('naver_id, display_name, image_url, introduction, category, my_keyword_category, category_my_type, my_keyword, subscriber_count, total_keywords, integrated_top3_count, top1_count, top2_count, top3_count, top3_ratio, avg_rank, best_rank, ad_fee_amount, ad_fee_text, last_challenged_at, ninfl_score')
      .gt('subscriber_count', 0);

    if (filters.category) {
      const safe = filters.category.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s·/&.]/g, '');
      if (safe) query = query.or(`my_keyword_category.eq.${safe},category.eq.${safe}`);
    }
    if (filters.keyword_text) {
      const kw = filters.keyword_text.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s._-]/g, '');
      if (kw) {
        query = query.or(
          `display_name.ilike.%${kw}%,naver_id.ilike.%${kw}%,my_keyword_category.ilike.%${kw}%,my_keyword.ilike.%${kw}%,category_my_type.ilike.%${kw}%,introduction.ilike.%${kw}%`,
        );
      }
    }
    if (filters.min_fan_count || filters.min_subscriber_count) {
      query = query.gte('subscriber_count', filters.min_fan_count || filters.min_subscriber_count || 0);
    }
    if (filters.min_total_keywords) {
      query = query.gte('total_keywords', filters.min_total_keywords);
    }
    if (filters.ranking_top_n) {
      query = query.lte('best_rank', filters.ranking_top_n).not('best_rank', 'is', null);
    }
    if (filters.recency_days) {
      const since = new Date();
      since.setDate(since.getDate() - filters.recency_days);
      query = query.gte('last_challenged_at', since.toISOString());
    }

    const sortMap: Record<string, string> = { fan_count: 'subscriber_count' };
    const sortColumn = sortMap[filters.sort_by || ''] || filters.sort_by || 'integrated_top3_count';
    const ascending = sortColumn === 'best_rank' ? filters.sort_order !== 'desc' : filters.sort_order === 'asc';
    query = query.order(sortColumn, { ascending, nullsFirst: false }).limit(filters.limit || 10);

    const { data: influencers } = await query;

    if (!influencers || influencers.length === 0) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'influencers', data: [] })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', data: '조건에 맞는 인플루언서를 찾지 못했습니다. 다른 조건으로 질문해보세요.' })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        },
      });
      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    // 3) 인플루언서 데이터를 Claude 프롬프트용으로 정리
    const influencerContext = influencers.map((inf, i) => {
      const totalKw = inf.total_keywords || 0;
      const t3 = (inf.top1_count || 0) + (inf.top2_count || 0) + (inf.top3_count || 0);
      const ratio = totalKw > 0 ? Math.round(Math.min(t3 / totalKw, 1) * 1000) / 10 : 0;
      return `${i + 1}. ${inf.display_name} (@${inf.naver_id})
   카테고리: ${inf.my_keyword_category || inf.category || '미분류'}${inf.category_my_type ? ` (${inf.category_my_type})` : ''}
   팬수: ${(inf.subscriber_count || 0).toLocaleString()}명
   키워드챌린지: ${totalKw}건, TOP3 ${inf.integrated_top3_count || 0}회 (${ratio}%)
   최고순위: ${inf.best_rank ? `${inf.best_rank}위` : '-'}
   N인플 점수: ${inf.ninfl_score || 0}점${inf.ad_fee_amount ? `\n   원고료: ${inf.ad_fee_amount.toLocaleString()}원` : ''}${inf.my_keyword ? `\n   대표키워드: ${inf.my_keyword}` : ''}${inf.introduction ? `\n   소개: ${inf.introduction.slice(0, 80)}` : ''}`;
    }).join('\n\n');

    // 4) Claude API 스트리밍 호출
    const anthropic = new Anthropic({ apiKey });

    const stream = await anthropic.messages.stream({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      system: `당신은 N인플(네이버 인플루언서 분석 플랫폼)의 AI 어시스턴트입니다.
광고주가 인플루언서를 찾으면 검색된 데이터를 기반으로 추천합니다.

답변 형식:
1. 먼저 검색 조건을 한 줄로 요약 (예: "뷰티 분야에서 팬수 1만명 이상 인플루언서 N명을 찾았습니다.")
2. 각 인플루언서별로 광고주 관점의 강점을 1~2줄로 설명
   - TOP3 비율이 높으면 → 키워드 노출 경쟁력이 높다
   - 팬수가 많으면 → 도달 범위가 넓다
   - 최근 활동이 활발하면 → 즉시 협업 가능
   - 원고료가 등록되어 있으면 → 광고 단가 안내
3. 마지막에 추천 요약 한 줄

규칙:
- 한국어, "~입니다/~합니다" 체
- 데이터에 있는 인플루언서만 언급 (없는 정보 만들지 않기)
- 이모지 사용 금지
- 간결하게 답변 (600자 이내)`,
      messages: [{ role: 'user', content: `질문: ${question}\n\n검색된 인플루언서 데이터:\n${influencerContext}\n\n위 데이터를 기반으로 광고주에게 추천해주세요.` }],
    });

    // 5) 가입 회원 여부 조회
    const infIds = influencers.map(inf => inf.naver_id);
    const { data: memberUsers } = await supabase
      .from('users')
      .select('naver_influencer_id')
      .in('naver_influencer_id', infIds);
    const memberNaverIds = new Set((memberUsers || []).map(u => u.naver_influencer_id));

    // 6) SSE 스트리밍 응답
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // 인플루언서 카드 데이터 먼저 전송
          const cardData = influencers.map(inf => {
            const totalKw = inf.total_keywords || 0;
            const t3 = (inf.top1_count || 0) + (inf.top2_count || 0) + (inf.top3_count || 0);
            const ratio = totalKw > 0 ? Math.round(Math.min(t3 / totalKw, 1) * 1000) / 10 : 0;
            const lastActive = inf.last_challenged_at ? new Date(inf.last_challenged_at).getTime() : 0;
            const daysSince = lastActive > 0 ? Math.floor((Date.now() - lastActive) / 86400000) : 999;
            return {
              naverId: inf.naver_id,
              displayName: inf.display_name,
              imageUrl: inf.image_url,
              introduction: inf.introduction || '',
              category: inf.my_keyword_category || inf.category || '',
              categoryType: inf.category_my_type || '',
              myKeyword: inf.my_keyword || '',
              subscriberCount: inf.subscriber_count || 0,
              totalKeywords: totalKw,
              integratedTop3Count: inf.integrated_top3_count || 0,
              top3Ratio: ratio,
              top1Count: inf.top1_count || 0,
              top2Count: inf.top2_count || 0,
              top3Count: inf.top3_count || 0,
              bestRank: inf.best_rank || null,
              adFeeAmount: inf.ad_fee_amount || null,
              adFeeText: inf.ad_fee_text || null,
              lastChallengedAt: inf.last_challenged_at || null,
              ninflScore: Number(inf.ninfl_score) || 0,
              activityLevel: daysSince <= 30 ? 'active' : daysSince <= 90 ? 'recent' : 'inactive',
              isMember: memberNaverIds.has(inf.naver_id),
            };
          });

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'influencers', data: cardData })}\n\n`));

          // AI 텍스트 스트리밍
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', data: event.delta.text })}\n\n`));
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch (err) {
          console.error('AI stream error:', err);
          const errMsg = err instanceof Error && err.message?.includes('timeout')
            ? 'AI 응답 시간이 초과되었습니다. 다시 시도해주세요.'
            : 'AI 응답 생성 중 오류가 발생했습니다. 다시 시도해주세요.';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: errMsg })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('AI chat error:', err);
    return Response.json({ error: 'AI 응답 생성에 실패했습니다.' }, { status: 500 });
  }
}
