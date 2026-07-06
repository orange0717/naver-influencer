import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isAdminFromProfile } from '@/lib/admin';
import { noticeViewLimiter, getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notices/[id] — 공지 상세 + 댓글 + 투표(선택적)
 *
 * 투표 응답 정책:
 * - 일반 사용자: poll.question, options[label], my_vote(자신의 선택) 만 표시
 *                vote_count, total_votes, voters 는 숨김 (결과는 관리자만)
 * - 관리자: 모든 정보 + voters(이메일/익명 표시) 포함
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const supabase = createServiceClient();

    const { data: notice, error } = await supabase
      .from('notices')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !notice) {
      return NextResponse.json({ error: '공지를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 조회수 증가: 클라이언트가 X-Count-View 헤더를 보낸 경우만 (첫 조회)
    // + 동일 IP 의 반복 호출로 조회수 부풀리기를 막기 위해 30분 rate limit 적용.
    let viewCount = notice.view_count;
    const shouldCount = _req.headers.get('x-count-view') === '1';

    if (shouldCount) {
      const ua = _req.headers.get('user-agent') || '';
      const isBot = /bot|crawl|spider|preview|headless|phantom|puppeteer|playwright/i.test(ua);
      if (!isBot) {
        const ip = getClientIp(_req);
        const limited = await noticeViewLimiter.check(`view:${id}:${ip}`);
        if (!limited) {
          const { data: newViewCount } = await supabase.rpc('increment_notice_view_count', { notice_id: id });
          viewCount = newViewCount ?? notice.view_count + 1;
        }
      }
    }

    // 댓글 조회
    const { data: comments } = await supabase
      .from('notice_comments')
      .select('id, content, author_id, author_name, author_type, created_at')
      .eq('notice_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    // 투표 조회 (있으면)
    const authUser = await getAuthUser(_req).catch(() => null);
    const isAdminUser = authUser ? isAdminFromProfile(authUser.user) : false;
    const voterFingerprint = _req.headers.get('x-voter-fp') || '';

    let pollPayload: unknown = null;
    const { data: poll } = await supabase
      .from('notice_polls')
      .select('id, question, is_multiple, created_at')
      .eq('notice_id', id)
      .maybeSingle();

    if (poll) {
      const { data: options } = await supabase
        .from('notice_poll_options')
        .select('id, label, sort_order, vote_count')
        .eq('poll_id', poll.id)
        .order('sort_order', { ascending: true });

      // 사용자 투표 내역 조회
      let myVote: string[] = [];
      if (authUser) {
        const { data: myVotes } = await supabase
          .from('notice_poll_votes')
          .select('option_id')
          .eq('poll_id', poll.id)
          .eq('user_id', authUser.userId);
        myVote = (myVotes || []).map(v => v.option_id);
      } else if (voterFingerprint) {
        const { data: myVotes } = await supabase
          .from('notice_poll_votes')
          .select('option_id')
          .eq('poll_id', poll.id)
          .is('user_id', null)
          .eq('voter_fingerprint', voterFingerprint);
        myVote = (myVotes || []).map(v => v.option_id);
      }

      // 관리자 전용: 투표자 목록 (선택지별)
      let voters: Record<string, Array<{ user_email?: string; anon_label?: string }>> | null = null;
      let totalVotes = 0;
      if (isAdminUser) {
        const { data: allVotes } = await supabase
          .from('notice_poll_votes')
          .select('option_id, user_id, voter_fingerprint, created_at')
          .eq('poll_id', poll.id)
          .order('created_at', { ascending: true });

        const userIds = Array.from(new Set((allVotes || []).filter(v => v.user_id).map(v => v.user_id)));
        const emailsById = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from('users')
            .select('id, email, nickname')
            .in('id', userIds);
          (users || []).forEach(u => emailsById.set(u.id, u.nickname || u.email || u.id));
        }

        voters = {};
        (allVotes || []).forEach(v => {
          const arr = voters![v.option_id] || [];
          if (v.user_id) {
            arr.push({ user_email: emailsById.get(v.user_id) || v.user_id });
          } else {
            const tail = (v.voter_fingerprint || '').slice(-4);
            arr.push({ anon_label: `익명-${tail}` });
          }
          voters![v.option_id] = arr;
          totalVotes++;
        });
      }

      pollPayload = {
        id: poll.id,
        question: poll.question,
        is_multiple: poll.is_multiple,
        options: (options || []).map(o => ({
          id: o.id,
          label: o.label,
          sort_order: o.sort_order,
          // 관리자만 실시간 집계 수 확인
          vote_count: isAdminUser ? o.vote_count : null,
        })),
        my_vote: myVote,
        results_hidden: !isAdminUser,
        ...(isAdminUser ? { voters, total_votes: totalVotes } : {}),
      };
    }

    return NextResponse.json({
      notice: { ...notice, view_count: viewCount },
      comments: comments || [],
      poll: pollPayload,
    });
  } catch (err) {
    console.error('[notices] GET detail error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * PATCH /api/notices/[id] — 공지 수정 (관리자만)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isAdminFromProfile(authUser.user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (title.length < 2 || title.length > 100) {
        return NextResponse.json({ error: '제목은 2~100자로 입력해주세요.' }, { status: 400 });
      }
      updates.title = title;
    }
    if (body.content !== undefined) {
      const content = String(body.content).trim();
      if (content.length < 5 || content.length > 5000) {
        return NextResponse.json({ error: '내용은 5~5000자로 입력해주세요.' }, { status: 400 });
      }
      updates.content = content;
    }
    if (body.tag !== undefined) {
      if (!['notice', 'update', 'event'].includes(body.tag)) {
        return NextResponse.json({ error: '유효하지 않은 태그입니다.' }, { status: 400 });
      }
      updates.tag = body.tag;
    }
    if (body.showOnBanner !== undefined) {
      updates.show_on_banner = !!body.showOnBanner;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const supabase = createServiceClient();

    const { error } = await supabase
      .from('notices')
      .update(updates)
      .eq('id', id)
      .eq('is_deleted', false);

    if (error) {
      console.error('[notices] PATCH error:', error);
      return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notices] PATCH error:', err);
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/notices/[id] — 공지 삭제 (관리자만)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isAdminFromProfile(authUser.user)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const supabase = createServiceClient();
    await supabase
      .from('notices')
      .update({ is_deleted: true })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notices] DELETE error:', err);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
