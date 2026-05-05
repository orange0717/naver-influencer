import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';

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
  const auth = await getAuthUser(request);
  if (!auth) {
    return withCors(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

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
