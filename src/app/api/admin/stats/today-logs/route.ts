import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * 오늘(KST) visit_logs 전체 — 로그인/익명 모두 포함
 * - page_path, referrer, user_agent, visited_at
 * - user_id 있으면 users에서 nickname/email 조회
 * - 간단한 UA 파싱으로 브라우저/OS 추출
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  // KST 오늘 자정
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const todayKstMid = new Date(Math.floor(kstMs / 86400000) * 86400000 - 9 * 60 * 60 * 1000);

  const { data: logs, error } = await supabase
    .from('visit_logs')
    .select('id, user_id, page_path, referrer, user_agent, visited_at')
    .gte('visited_at', todayKstMid.toISOString())
    .order('visited_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('[today-logs] error', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  // 로그인 유저 닉네임 맵
  const userIds = Array.from(new Set((logs || []).map(l => l.user_id).filter(Boolean))) as string[];
  const userMap = new Map<string, { nickname: string; email: string }>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, nickname, email')
      .in('id', userIds);
    for (const u of users || []) {
      userMap.set(u.id, { nickname: u.nickname, email: u.email });
    }
  }

  // 고유 방문자 집계 (user_id 있으면 user_id, 없으면 UA+IP 해시 대신 UA 기반)
  const uniqueVisitors = new Set<string>();
  for (const log of logs || []) {
    if (log.user_id) {
      uniqueVisitors.add(`u:${log.user_id}`);
    } else {
      uniqueVisitors.add(`a:${log.user_agent || 'unknown'}`);
    }
  }

  const result = (logs || []).map(log => {
    const ua = log.user_agent || '';
    const browser = /Edg\//.test(ua) ? 'Edge'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari'
      : /Firefox\//.test(ua) ? 'Firefox'
      : 'Unknown';
    const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
      : /Android/.test(ua) ? 'Android'
      : /Mac OS X/.test(ua) ? 'macOS'
      : /Windows/.test(ua) ? 'Windows'
      : /Linux/.test(ua) ? 'Linux'
      : 'Unknown';

    const refer = log.referrer || '';
    let referrerDomain = '직접 방문';
    if (refer) {
      try {
        const u = new URL(refer);
        referrerDomain = u.hostname;
      } catch {
        referrerDomain = refer.slice(0, 40);
      }
    }

    const userInfo = log.user_id ? userMap.get(log.user_id) : null;

    return {
      id: log.id,
      visited_at: log.visited_at,
      user_id: log.user_id,
      nickname: userInfo?.nickname || null,
      email: userInfo?.email || null,
      page_path: log.page_path,
      referrer_domain: referrerDomain,
      browser,
      os,
    };
  });

  return NextResponse.json({
    total: result.length,
    uniqueVisitors: uniqueVisitors.size,
    logs: result,
  });
}
