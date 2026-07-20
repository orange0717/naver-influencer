import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const OPTIONAL_SELECT_COLUMNS = ['demo_naver_id', 'duration_seconds', 'user_agent', 'user_id', 'utm_source', 'utm_medium', 'utm_campaign', 'device_type', 'country'] as const;

type VisitLogRow = {
  id?: string | number | null;
  user_id?: string | null;
  demo_naver_id?: string | null;
  page_path?: string | null;
  referrer?: string | null;
  user_agent?: string | null;
  visited_at?: string | null;
  duration_seconds?: number | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  device_type?: string | null;
  country?: string | null;
};

function getMissingColumn(error: { message?: string } | null) {
  if (!error) return null;
  const message = error.message || '';
  const raw =
    message.match(/'([^']+)' column/)?.[1] ||
    message.match(/column "([^"]+)"/)?.[1] ||
    message.match(/column ([a-zA-Z_][a-zA-Z0-9_.]*) does not exist/)?.[1];
  const col = raw?.includes('.') ? raw.split('.').pop() : raw;
  if (col && OPTIONAL_SELECT_COLUMNS.includes(col as typeof OPTIONAL_SELECT_COLUMNS[number])) {
    return col;
  }
  return null;
}

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

  const selectColumns = ['id', 'user_id', 'demo_naver_id', 'page_path', 'referrer', 'user_agent', 'visited_at', 'duration_seconds', 'utm_source', 'utm_medium', 'utm_campaign', 'device_type', 'country'];
  let logs: VisitLogRow[] = [];
  let error: { message?: string } | null = null;

  for (let attempt = 0; attempt <= OPTIONAL_SELECT_COLUMNS.length; attempt += 1) {
    const res = await supabase
      .from('visit_logs')
      .select(selectColumns.join(', '))
      .gte('visited_at', todayKstMid.toISOString())
      .order('visited_at', { ascending: false })
      .limit(500);

    logs = (res.data || []) as VisitLogRow[];
    error = res.error;
    if (!error) break;

    const missingColumn = getMissingColumn(error);
    if (!missingColumn || !selectColumns.includes(missingColumn)) break;

    console.warn('[today-logs] retrying select without missing column', missingColumn);
    selectColumns.splice(selectColumns.indexOf(missingColumn), 1);
  }

  if (error) {
    console.error('[today-logs] error', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  // 정식 회원 닉네임 맵
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

  // 데모 체험자 라벨 맵 (naver_id → display_name + email, verified 세션 우선)
  const demoNaverIds = Array.from(
    new Set((logs || []).map(l => l.demo_naver_id).filter(Boolean)),
  ) as string[];
  const demoMap = new Map<string, { displayName: string; email: string | null }>();
  if (demoNaverIds.length > 0) {
    const { data: demos } = await supabase
      .from('demo_sessions')
      .select('naver_id, display_name, email, verified_at')
      .in('naver_id', demoNaverIds)
      .not('verified_at', 'is', null)
      .order('verified_at', { ascending: false });
    for (const d of demos || []) {
      if (!demoMap.has(d.naver_id)) {
        demoMap.set(d.naver_id, {
          displayName: d.display_name || d.naver_id,
          email: d.email || null,
        });
      }
    }
  }

  // 고유 방문자 집계 — 정식 회원/데모 회원/익명 별도 키로 카운트
  const uniqueVisitors = new Set<string>();
  for (const log of logs || []) {
    if (log.user_id) {
      uniqueVisitors.add(`u:${log.user_id}`);
    } else if (log.demo_naver_id) {
      uniqueVisitors.add(`d:${log.demo_naver_id}`);
    } else {
      uniqueVisitors.add(`a:${log.user_agent || 'unknown'}`);
    }
  }

  const result = (logs || []).map(log => {
    const ua = String(log.user_agent || '');
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

    const refer = String(log.referrer || '');
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
    const demoInfo = !log.user_id && log.demo_naver_id ? demoMap.get(log.demo_naver_id) : null;

    // visitor_type: member(정식 회원) / demo(데모 체험자) / guest(비로그인 허용 페이지 조회) / anonymous(그 외 비로그인)
    // /my, /my/blogger는 로그인 없이도 보이도록 설계된 게스트 빈 상태·공개 도구라
    // "권한 없는 접근"이 아니라 정상 조회임을 로그에서 바로 구분할 수 있도록 별도 태그를 붙인다.
    const path = log.page_path || '';
    const isGuestAllowedPage = path === '/my' || path === '/my/blogger' || path.startsWith('/my/blogger?') || path.startsWith('/my?');
    const visitorType: 'member' | 'demo' | 'guest' | 'anonymous' = log.user_id
      ? 'member'
      : log.demo_naver_id
        ? 'demo'
        : isGuestAllowedPage
          ? 'guest'
          : 'anonymous';

    return {
      id: log.id,
      visited_at: log.visited_at,
      user_id: log.user_id,
      visitor_type: visitorType,
      nickname: userInfo?.nickname || demoInfo?.displayName || null,
      email: userInfo?.email || demoInfo?.email || null,
      demo_naver_id: log.demo_naver_id ?? null,
      page_path: log.page_path,
      referrer_domain: referrerDomain,
      referrer: log.referrer || null,
      utm_source: log.utm_source ?? null,
      utm_medium: log.utm_medium ?? null,
      utm_campaign: log.utm_campaign ?? null,
      device_type: log.device_type ?? null,
      country: log.country ?? null,
      browser,
      os,
      duration_seconds: log.duration_seconds ?? null,
    };
  });

  return NextResponse.json({
    total: result.length,
    uniqueVisitors: uniqueVisitors.size,
    logs: result,
  });
}
