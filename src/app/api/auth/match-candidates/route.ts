/**
 * POST /api/auth/match-candidates
 *
 * Google 온보딩 중 "기존 회원과 동일 인물인지" 후보를 찾는다. 여기서 찾은
 * 후보는 아직 아무것도 연결하지 않는다 — blog_id 매칭이든 nickname 매칭이든,
 * 최종 연결은 반드시 /api/auth/match-link 에서 blog_verifications 소유권
 * 증명을 통과해야 이뤄진다 (계정 탈취 방지).
 *
 * Body: { blogId?, nickname? } (blogId 있으면 우선, 없으면 nickname 으로 검색)
 * Returns: { method: 'blog_id' | 'nickname' | null, candidates: [{ id, nickname, blogId, createdAt }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { validateBody, blogIdSchema } from '@/lib/validations';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  blogId: blogIdSchema.optional(),
  nickname: z.string().min(1).max(20).transform((v) => v.trim()).optional(),
});

const DAILY_ATTEMPT_LIMIT = 5;

export async function POST(request: NextRequest) {
  try {
    const supaAuth = await createRouteHandlerClient();
    const { data: { user } } = await supaAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const v = validateBody(requestSchema, body);
    if (!v.success) return v.response;
    const { blogId, nickname } = v.data;

    const supabase = createServiceClient();

    // 이미 이 auth로 연결된 users 행이 있으면 매칭 대상이 아니다 (온보딩 완료 상태).
    const { data: alreadyLinked } = await supabase
      .from('users')
      .select('id')
      .or(`auth_id.eq.${user.id},google_auth_id.eq.${user.id}`)
      .maybeSingle();
    if (alreadyLinked) {
      return NextResponse.json({ error: '이미 연결된 계정입니다.' }, { status: 400 });
    }

    // link_attempts 재사용 — 하루 5회까지 (link-blog 라우트와 동일 정책)
    const today = new Date().toISOString().slice(0, 10);
    const { count: attemptCount } = await supabase
      .from('link_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('auth_id', user.id)
      .gte('created_at', `${today}T00:00:00Z`);

    if ((attemptCount ?? 0) >= DAILY_ATTEMPT_LIMIT) {
      return NextResponse.json({ error: '일일 조회 횟수를 초과했습니다.' }, { status: 429 });
    }

    await supabase
      .from('link_attempts')
      .insert({ auth_id: user.id })
      .then(() => {}, () => {});

    if (blogId) {
      const { data: byBlog } = await supabase
        .from('users')
        .select('id, nickname, blog_id, created_at')
        .ilike('blog_id', blogId)
        .is('google_auth_id', null)
        .limit(1);

      if (byBlog && byBlog.length > 0) {
        return NextResponse.json({
          method: 'blog_id',
          candidates: byBlog.map((u) => ({
            id: u.id,
            nickname: u.nickname,
            blogId: u.blog_id,
            createdAt: u.created_at,
          })),
        });
      }
    }

    if (nickname) {
      const { data: byNickname } = await supabase
        .from('users')
        .select('id, nickname, blog_id, created_at')
        .ilike('nickname', nickname)
        .is('google_auth_id', null)
        .not('blog_id', 'is', null)
        .limit(5);

      if (byNickname && byNickname.length > 0) {
        return NextResponse.json({
          method: 'nickname',
          candidates: byNickname.map((u) => ({
            id: u.id,
            nickname: u.nickname,
            blogId: u.blog_id,
            createdAt: u.created_at,
          })),
        });
      }
    }

    return NextResponse.json({ method: null, candidates: [] });
  } catch (err) {
    console.error('[auth/match-candidates] error:', err);
    return NextResponse.json({ error: '조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
