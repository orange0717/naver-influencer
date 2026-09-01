import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireFeature } from '@/lib/guards/requireFeature';

export const dynamic = 'force-dynamic';

// CORS — 확장 프로그램(chrome-extension://...) 및 ninfle.kr 페이지에서 호출 허용
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Ninfle-Source',
  'Access-Control-Max-Age': '86400',
};

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

interface NaverFanItem {
  urlId: string;
  spaceId?: number | null;
  ownerId?: number | null;
  nickname?: string;
  imageUrl?: string;
  category?: string;
  followerCount?: number;
}

interface UploadPayload {
  source?: 'bookmarklet' | 'manual' | 'extension';
  ownerUrlId?: string;        // 본인 네이버 인플루언서 URL ID
  ownerSpaceId?: number;      // 본인 spaceId (참고용)
  followers: NaverFanItem[];   // 나를 팬한 사람
  followings: NaverFanItem[];  // 내가 팬한 사람
}

function sanitize(item: NaverFanItem): NaverFanItem | null {
  if (!item || typeof item.urlId !== 'string' || !item.urlId.trim()) return null;
  return {
    urlId: item.urlId.trim(),
    spaceId: typeof item.spaceId === 'number' ? item.spaceId : null,
    ownerId: typeof item.ownerId === 'number' ? item.ownerId : null,
    nickname: item.nickname?.toString().slice(0, 200) || '',
    imageUrl: item.imageUrl?.toString().slice(0, 500) || '',
    category: item.category?.toString().slice(0, 100) || '',
    followerCount: typeof item.followerCount === 'number' ? item.followerCount : 0,
  };
}

export async function POST(request: NextRequest) {
  const gate = await requireFeature(request, 'my.fans');
  if ('error' in gate) {
    return withCors(gate.error as NextResponse);
  }
  const auth = gate.authUser;

  let body: UploadPayload;
  try {
    body = await request.json();
  } catch {
    return withCors(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  if (!body || !Array.isArray(body.followers) || !Array.isArray(body.followings)) {
    return withCors(
      NextResponse.json({ error: 'followers / followings 배열이 필요합니다.' }, { status: 400 }),
    );
  }

  const followers = body.followers.map(sanitize).filter((x): x is NaverFanItem => x !== null);
  const followings = body.followings.map(sanitize).filter((x): x is NaverFanItem => x !== null);

  // 너무 많이 들어오면 거부 (방어)
  if (followers.length > 50000 || followings.length > 50000) {
    return withCors(
      NextResponse.json({ error: '한 번에 업로드 가능한 양을 초과했습니다.' }, { status: 413 }),
    );
  }

  const supabase = createServiceClient();
  const ownerUserId = auth.userId;
  const now = new Date().toISOString();

  // 본인 네이버 URL ID 저장 (자동) — 이후 교차 매칭 등에 사용
  const ownerUrlId =
    typeof body.ownerUrlId === 'string' && /^[A-Za-z0-9_.-]{1,50}$/.test(body.ownerUrlId)
      ? body.ownerUrlId
      : null;
  if (ownerUrlId) {
    const { error: updErr } = await supabase
      .from('users')
      .update({ naver_url_id: ownerUrlId })
      .eq('id', ownerUserId)
      .is('naver_url_id', null); // 이미 다른 값이 있으면 덮어쓰지 않음
    if (updErr) {
      console.warn('[fans/upload] naver_url_id update skipped:', updErr.message);
    }
  }

  // 기존 active 관계 조회
  const { data: existing, error: fetchErr } = await supabase
    .from('follow_relations')
    .select('id, target_url_id, direction')
    .eq('owner_user_id', ownerUserId)
    .is('removed_at', null);

  if (fetchErr) {
    console.error('[fans/upload] fetch existing failed:', fetchErr);
    return withCors(NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 }));
  }

  const existingMap = new Map<string, string>(); // key: `${direction}:${url_id}` → row id
  for (const row of existing || []) {
    existingMap.set(`${row.direction}:${row.target_url_id}`, row.id);
  }

  // 이번에 들어온 데이터 준비 (upsert)
  const incomingRows: Array<Record<string, unknown>> = [];
  const incomingKeys = new Set<string>();

  const pushRows = (items: NaverFanItem[], direction: 'I_FOLLOW' | 'FOLLOWS_ME') => {
    for (const it of items) {
      const key = `${direction}:${it.urlId}`;
      if (incomingKeys.has(key)) continue; // 중복 방어
      incomingKeys.add(key);
      incomingRows.push({
        owner_user_id: ownerUserId,
        target_url_id: it.urlId,
        target_space_id: it.spaceId ?? null,
        target_owner_id: it.ownerId ?? null,
        target_nickname: it.nickname || null,
        target_image_url: it.imageUrl || null,
        target_category: it.category || null,
        target_follower_count: it.followerCount ?? null,
        direction,
        last_seen_at: now,
        removed_at: null,
        updated_at: now,
      });
    }
  };

  pushRows(followers, 'FOLLOWS_ME');
  pushRows(followings, 'I_FOLLOW');

  // upsert (UNIQUE: owner_user_id, target_url_id, direction)
  let addedCount = 0;
  if (incomingRows.length > 0) {
    // 신규(이번에 처음 들어온) 카운트 계산
    for (const key of incomingKeys) {
      if (!existingMap.has(key)) addedCount++;
    }

    const { error: upsertErr } = await supabase
      .from('follow_relations')
      .upsert(incomingRows, { onConflict: 'owner_user_id,target_url_id,direction' });

    if (upsertErr) {
      console.error('[fans/upload] upsert failed:', upsertErr);
      await supabase.from('follow_sync_log').insert({
        owner_user_id: ownerUserId,
        source: body.source || 'bookmarklet',
        followers_count: followers.length,
        followings_count: followings.length,
        status: 'failed',
        error_message: upsertErr.message.slice(0, 500),
      });
      return withCors(NextResponse.json({ error: 'DB 저장 실패' }, { status: 500 }));
    }
  }

  // 사라진 관계는 removed_at 처리 (기존엔 있었는데 이번엔 안 들어온 것)
  const removedIds: string[] = [];
  for (const [key, id] of existingMap.entries()) {
    if (!incomingKeys.has(key)) removedIds.push(id);
  }

  if (removedIds.length > 0) {
    const { error: removeErr } = await supabase
      .from('follow_relations')
      .update({ removed_at: now, updated_at: now })
      .in('id', removedIds);

    if (removeErr) {
      console.error('[fans/upload] mark removed failed:', removeErr);
      // 부분 실패: 로그는 partial로 남기고 계속 진행
    }
  }

  // 동기화 로그
  // NOTE: follow_sync_log.source CHECK 제약은 'cron' | 'bookmarklet' | 'manual' 만 허용
  // → 확장 프로그램('extension')도 'manual' 카테고리에 묶어 기록
  const logSource: 'bookmarklet' | 'manual' =
    body.source === 'extension' || body.source === 'manual' ? 'manual' : 'bookmarklet';

  // ── 관계 변화 이력 기록(스펙 11) ─────────────────────────────
  // 이번 스냅샷의 target별 상태를 직전 이력과 비교해 "바뀐 것만" 한 줄 남긴다.
  // 이력 기록 실패는 동기화 성공에 영향을 주지 않도록 완전히 격리한다(스펙 16-7·16-10).
  type RelStatus = 'mutual' | 'only_i_follow' | 'only_follows_me' | 'none';
  try {
    // 1) 이번 스냅샷의 target별 현재 상태
    const curByTarget = new Map<string, { i: boolean; f: boolean; nickname: string | null }>();
    for (const row of incomingRows) {
      const url = row.target_url_id as string;
      const slot = curByTarget.get(url) || { i: false, f: false, nickname: null };
      if (row.direction === 'I_FOLLOW') slot.i = true;
      else slot.f = true;
      if (!slot.nickname && row.target_nickname) slot.nickname = row.target_nickname as string;
      curByTarget.set(url, slot);
    }
    const toStatus = (s: { i: boolean; f: boolean }): RelStatus =>
      s.i && s.f ? 'mutual' : s.i ? 'only_i_follow' : 'only_follows_me';

    // 2) 직전 이력(target별 최신 상태) — owner 범위, 인덱스 사용
    const lastByTarget = new Map<string, { status: RelStatus; nickname: string | null }>();
    const { data: histRows } = await supabase
      .from('follow_relation_history')
      .select('target_url_id, relationship_status, target_nickname, observed_at')
      .eq('owner_user_id', ownerUserId)
      .order('observed_at', { ascending: false });
    for (const h of histRows || []) {
      if (!lastByTarget.has(h.target_url_id)) {
        lastByTarget.set(h.target_url_id, {
          status: h.relationship_status as RelStatus,
          nickname: h.target_nickname,
        });
      }
    }

    // 3) 변화 계산: 신규/변경 + 관계 소멸('none')
    const changes: Array<{ target_url_id: string; target_nickname: string | null; relationship_status: RelStatus }> = [];
    for (const [url, slot] of curByTarget) {
      const status = toStatus(slot);
      const prev = lastByTarget.get(url)?.status;
      if (prev !== status) {
        changes.push({ target_url_id: url, target_nickname: slot.nickname, relationship_status: status });
      }
    }
    for (const [url, prev] of lastByTarget) {
      if (prev.status !== 'none' && !curByTarget.has(url)) {
        changes.push({ target_url_id: url, target_nickname: prev.nickname, relationship_status: 'none' });
      }
    }

    // 4) 배치 삽입(1000행 단위)
    if (changes.length > 0) {
      const historySource = logSource;
      const rows = changes.map((c) => ({
        owner_user_id: ownerUserId,
        target_url_id: c.target_url_id,
        target_nickname: c.target_nickname,
        relationship_status: c.relationship_status,
        source: historySource,
        observed_at: now,
      }));
      for (let i = 0; i < rows.length; i += 1000) {
        const { error: histErr } = await supabase
          .from('follow_relation_history')
          .insert(rows.slice(i, i + 1000));
        if (histErr) {
          console.warn('[fans/upload] history insert skipped:', histErr.message);
          break;
        }
      }
    }
  } catch (e) {
    console.warn('[fans/upload] history recording failed (non-fatal):', e instanceof Error ? e.message : e);
  }

  await supabase.from('follow_sync_log').insert({
    owner_user_id: ownerUserId,
    source: logSource,
    followers_count: followers.length,
    followings_count: followings.length,
    added_count: addedCount,
    removed_count: removedIds.length,
    status: 'success',
  });

  return withCors(
    NextResponse.json({
      ok: true,
      counts: {
        followers: followers.length,
        followings: followings.length,
        added: addedCount,
        removed: removedIds.length,
      },
    }),
  );
}
