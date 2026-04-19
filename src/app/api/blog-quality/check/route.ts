/**
 * POST /api/blog-quality/check
 *
 * Body: { blogId: string }
 *
 * 블로그 품질지수 산출.
 * - 24시간 내 같은 blog_id 결과가 있으면 재사용 (API 쿼터 절약)
 * - Rate limit: 비로그인 IP 1/일, 로그인 3/일, 유료 무제한
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { computeBlogQuality } from '@/lib/blog-quality';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_HOURS = 24;
const CACHE_MS = CACHE_HOURS * 3600 * 1000;

function normalizeBlogId(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(?:m\.)?blog\.naver\.com\//i, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .toLowerCase();
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req: NextRequest) {
  let body: { blogId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const blogId = normalizeBlogId(body.blogId || '');
  if (!blogId || blogId.length < 2 || blogId.length > 64) {
    return NextResponse.json({ error: '블로그 ID 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const authUser = await getAuthUser(req).catch(() => null);
  const now = Date.now();

  // 24시간 캐시 우선 (쿼터 소비 없이 반환)
  const { data: cached } = await supabase
    .from('blog_quality_checks')
    .select('*')
    .eq('blog_id', blogId)
    .gte('checked_at', new Date(now - CACHE_MS).toISOString())
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      cached: true,
      blogId,
      score: cached.score,
      grade: cached.grade,
      exposureScore: cached.exposure_score,
      activityScore: cached.activity_score,
      topicScore: cached.topic_score,
      details: cached.details,
      checkedAt: cached.checked_at,
    });
  }

  // Rate limit (새로 측정하는 경우에만 적용)
  const dayAgo = new Date(now - 86400000).toISOString();
  let limit = 1; // 비로그인 IP 기본
  let scope: 'ip' | 'user' = 'ip';
  let rateKey = getClientIp(req);

  if (authUser) {
    scope = 'user';
    rateKey = authUser.userId;
    // 유료 회원 체크
    const { data: userRow } = await supabase
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', authUser.userId)
      .single();
    const isPaid =
      userRow?.subscription_plan &&
      (!userRow.subscription_expires_at || new Date(userRow.subscription_expires_at).getTime() > now);
    limit = isPaid ? Number.POSITIVE_INFINITY : 3;
  }

  if (Number.isFinite(limit)) {
    const { count: usedCount } = await supabase
      .from('blog_quality_rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('ip_or_user', rateKey)
      .eq('scope', scope)
      .gte('checked_at', dayAgo);

    if ((usedCount || 0) >= limit) {
      return NextResponse.json(
        {
          error: scope === 'user'
            ? '일일 검사 한도를 초과했습니다. 유료 플랜에서는 무제한 이용 가능합니다.'
            : '비로그인 체험은 하루 1회로 제한됩니다. 로그인하시면 3회 가능합니다.',
          remaining: 0,
          limit,
        },
        { status: 429 }
      );
    }
  }

  // 실제 계산
  const result = await computeBlogQuality(blogId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  // 저장
  const { data: saved, error: saveError } = await supabase
    .from('blog_quality_checks')
    .insert({
      blog_id: blogId,
      user_id: authUser?.userId ?? null,
      score: result.score,
      grade: result.grade,
      exposure_score: result.exposureScore,
      activity_score: result.activityScore,
      topic_score: result.topicScore,
      details: result.details,
    })
    .select('checked_at')
    .single();

  if (saveError) {
    console.error('[blog-quality] save error:', saveError);
  }

  // Rate limit 기록
  await supabase.from('blog_quality_rate_limits').insert({
    ip_or_user: rateKey,
    scope,
  });

  return NextResponse.json({
    cached: false,
    blogId,
    score: result.score,
    grade: result.grade,
    gradeLabel: result.gradeLabel,
    exposureScore: result.exposureScore,
    activityScore: result.activityScore,
    topicScore: result.topicScore,
    details: result.details,
    checkedAt: saved?.checked_at || new Date().toISOString(),
  });
}
