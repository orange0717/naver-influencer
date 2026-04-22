import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/chat?tab=messages|reports&status=pending&page=1
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const sp = new URL(req.url).searchParams;
  const tab = sp.get('tab') || 'reports';
  const status = sp.get('status') || 'pending';
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
  const limit = 30;
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  if (tab === 'messages') {
    const { data, count } = await supabase
      .from('chat_messages')
      .select('id, author_id, author_type, author_name, content, has_profanity, is_deleted, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    return NextResponse.json({ items: data || [], total: count || 0, page, limit });
  }

  // tab === 'reports'
  const { data: reports, count } = await supabase
    .from('chat_reports')
    .select('id, message_id, reporter_id, reason, description, status, created_at', { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const messageIds = Array.from(new Set((reports || []).map(r => r.message_id)));
  let messageMap: Record<string, { content: string; author_name: string; is_deleted: boolean }> = {};
  if (messageIds.length > 0) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('id, content, author_name, is_deleted')
      .in('id', messageIds);
    messageMap = Object.fromEntries(
      (msgs || []).map(m => [m.id, { content: m.content, author_name: m.author_name, is_deleted: m.is_deleted }]),
    );
  }

  return NextResponse.json({
    items: (reports || []).map(r => ({ ...r, message: messageMap[r.message_id] || null })),
    total: count || 0,
    page,
    limit,
  });
}

/**
 * PATCH /api/admin/chat
 * 신고 처리, 메시지 강제 삭제, 사용자 제재
 * body:
 *   { action: 'update_report', report_id, status }
 *   { action: 'delete_message', message_id }
 *   { action: 'restore_message', message_id }
 *   { action: 'sanction', user_id, type: 'mute'|'ban', hours?, reason? }
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('error' in auth) return auth.error;

  const body = await req.json();
  const supabase = createServiceClient();

  if (body.action === 'update_report' && body.report_id && body.status) {
    const { error } = await supabase
      .from('chat_reports')
      .update({ status: body.status })
      .eq('id', body.report_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === 'delete_message' && body.message_id) {
    const { error } = await supabase
      .from('chat_messages')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', body.message_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === 'restore_message' && body.message_id) {
    const { error } = await supabase
      .from('chat_messages')
      .update({ is_deleted: false, updated_at: new Date().toISOString() })
      .eq('id', body.message_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === 'sanction' && body.user_id && body.type) {
    const expires = body.hours
      ? new Date(Date.now() + Number(body.hours) * 60 * 60 * 1000).toISOString()
      : null;
    const { error } = await supabase.from('chat_user_sanctions').insert({
      user_id: body.user_id,
      type: body.type,
      reason: body.reason || null,
      expires_at: expires,
      created_by: auth.authUser.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
