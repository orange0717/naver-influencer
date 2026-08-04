import { NextRequest, NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { parseNaverBlogPostUrl } from '@/lib/naver-blog-url';
import { submitSitemapForUser } from '@/lib/sitemap-builder';
import { googleIndexingRegisterLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FIRST_CHECK_DELAY_MS = 30 * 60 * 1000;

/** POST /api/google-indexing/register — 네이버 블로그 URL 1건 등록 */
export async function POST(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  if (await googleIndexingRegisterLimiter.check(getClientIp(request))) return rateLimitResponse();

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: '블로그 주소를 입력해주세요.' }, { status: 400 });
  }

  const parsed = parseNaverBlogPostUrl(rawUrl);
  if (!parsed) {
    return NextResponse.json(
      { error: '네이버 블로그 글 주소 형식이 아닙니다. 예: https://blog.naver.com/아이디/포스트번호' },
      { status: 400 },
    );
  }

  const ownBlogId = (paid.authUser.user as { blog_id?: string | null }).blog_id;
  if (!ownBlogId || ownBlogId !== parsed.blogId) {
    return NextResponse.json(
      { error: '본인 블로그의 글만 등록할 수 있습니다. 프로필에 등록된 블로그 아이디를 확인해주세요.' },
      { status: 403 },
    );
  }

  const supabase = createServiceClient();
  const now = new Date();

  // 이미 등록된 URL이면 진행 중/완료 상태를 덮어써 초기화하지 않는다.
  // 재시도가 필요한 상태(error/not_indexed)일 때만 새로 제출한다.
  const { data: existing } = await supabase
    .from('indexed_urls')
    .select('*')
    .eq('user_id', paid.authUser.userId)
    .eq('url', parsed.url)
    .maybeSingle();

  if (existing && !['error', 'not_indexed'].includes(existing.status)) {
    return NextResponse.json({ success: true, alreadyRegistered: true, url: existing });
  }

  const { data: row, error } = await supabase
    .from('indexed_urls')
    .upsert(
      {
        user_id: paid.authUser.userId,
        blog_id: parsed.blogId,
        post_no: parsed.postNo,
        url: parsed.url,
        source: 'manual',
        status: 'submitted',
        progress_stage: 'requesting',
        registered_at: now.toISOString(),
        last_checked_at: null,
        next_check_at: new Date(now.getTime() + FIRST_CHECK_DELAY_MS).toISOString(),
        check_count: 0,
        indexed_at: null,
        google_verdict: null,
        google_coverage_state: null,
        failure_reason_code: null,
        error_message: null,
        error_code: null,
        http_status: null,
        retryable: null,
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id,url' },
    )
    .select()
    .single();

  if (error || !row) {
    console.error('[google-indexing/register] insert error:', error?.message);
    return NextResponse.json({ error: '등록 중 오류가 발생했습니다.' }, { status: 500 });
  }

  // 사이트맵 재생성/제출은 결과가 등록 자체를 막지 않도록 실패해도 무시한다.
  submitSitemapForUser(paid.authUser.userId).catch((err) => {
    console.warn('[google-indexing/register] sitemap submit 실패:', err instanceof Error ? err.message : err);
  });

  return NextResponse.json({ success: true, url: row });
}
