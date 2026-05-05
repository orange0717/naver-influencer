import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 교차 매칭 결과
//   - inMyFans:        N인플 사용자 중 "내 팬 명단" 또는 "내가 팔로우 중"에 있는 사람
//   - othersListedMe:  내가 동기화 안 했더라도, 다른 N인플 사용자가 동기화한 명단에서 나를 발견한 케이스
//
// 양쪽 모두 N인플 사용자만 (users.naver_url_id 가 채워진 계정만) 포함된다.

interface CrossMatchUser {
  user_id: string;
  naver_url_id: string;
  display_name?: string | null;
  email?: string | null;
}

interface InMyFansItem extends CrossMatchUser {
  direction: 'I_FOLLOW' | 'FOLLOWS_ME' | 'BOTH';
  target_nickname?: string | null;
  target_image_url?: string | null;
}

interface OthersListedMeItem extends CrossMatchUser {
  direction: 'I_FOLLOW' | 'FOLLOWS_ME' | 'BOTH';
  // direction 의 의미:
  //   I_FOLLOW    = 그 사람이 나를 팔로우 (나를 "팬"으로 등록)
  //   FOLLOWS_ME  = 그 사람의 명단에서 내가 그 사람의 팬으로 등록됨
  //   → 즉, 상대방 입장에서의 direction
}

export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 본인 정보
  const { data: meRow } = await supabase
    .from('users')
    .select('id, naver_url_id, email')
    .eq('id', auth.userId)
    .maybeSingle();

  const myNaverUrlId = meRow?.naver_url_id || null;

  // ============================================================
  // 1) inMyFans: 내 팬/팔로잉 명단 중 N인플 가입자
  //    follow_relations(owner=me) JOIN users ON target_url_id = users.naver_url_id
  // ============================================================
  const { data: myRelations, error: myRelErr } = await supabase
    .from('follow_relations')
    .select('target_url_id, target_nickname, target_image_url, direction')
    .eq('owner_user_id', auth.userId)
    .is('removed_at', null);

  if (myRelErr) {
    console.error('[fans/cross-match] my relations failed:', myRelErr);
    return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 });
  }

  const myTargetUrlIds = Array.from(
    new Set((myRelations || []).map((r) => r.target_url_id).filter(Boolean) as string[]),
  );

  let usersByUrlId = new Map<string, { id: string; email: string | null; naver_url_id: string }>();
  if (myTargetUrlIds.length > 0) {
    const { data: matchedUsers, error: usersErr } = await supabase
      .from('users')
      .select('id, email, naver_url_id')
      .in('naver_url_id', myTargetUrlIds);
    if (usersErr) {
      console.error('[fans/cross-match] users lookup failed:', usersErr);
    } else {
      for (const u of matchedUsers || []) {
        if (u.naver_url_id) usersByUrlId.set(u.naver_url_id, u as never);
      }
    }
  }

  // 같은 사람이 양쪽 direction 으로 두 줄 있을 수 있음 → BOTH 로 통합
  const inMyFansMap = new Map<string, InMyFansItem>();
  for (const r of myRelations || []) {
    const matched = usersByUrlId.get(r.target_url_id);
    if (!matched) continue;
    if (matched.id === auth.userId) continue; // 본인 제외
    const existing = inMyFansMap.get(matched.naver_url_id);
    if (existing) {
      if (existing.direction !== r.direction) existing.direction = 'BOTH';
    } else {
      inMyFansMap.set(matched.naver_url_id, {
        user_id: matched.id,
        naver_url_id: matched.naver_url_id,
        email: matched.email,
        target_nickname: r.target_nickname,
        target_image_url: r.target_image_url,
        direction: r.direction as 'I_FOLLOW' | 'FOLLOWS_ME',
      });
    }
  }
  const inMyFans = Array.from(inMyFansMap.values());

  // ============================================================
  // 2) othersListedMe: 다른 사용자가 나를 자기 명단에 등록한 케이스
  //    내 naver_url_id 가 있어야만 가능
  // ============================================================
  let othersListedMe: OthersListedMeItem[] = [];
  if (myNaverUrlId) {
    const { data: othersRows, error: othersErr } = await supabase
      .from('follow_relations')
      .select('owner_user_id, direction')
      .eq('target_url_id', myNaverUrlId)
      .is('removed_at', null);

    if (othersErr) {
      console.error('[fans/cross-match] others lookup failed:', othersErr);
    } else if (othersRows && othersRows.length > 0) {
      const ownerIds = Array.from(
        new Set(othersRows.map((r) => r.owner_user_id).filter((x) => x && x !== auth.userId)),
      ) as string[];

      let ownerMap = new Map<string, { id: string; email: string | null; naver_url_id: string | null }>();
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('users')
          .select('id, email, naver_url_id')
          .in('id', ownerIds);
        for (const u of owners || []) ownerMap.set(u.id, u as never);
      }

      const grouped = new Map<string, OthersListedMeItem>();
      for (const r of othersRows) {
        if (r.owner_user_id === auth.userId) continue;
        const owner = ownerMap.get(r.owner_user_id);
        if (!owner || !owner.naver_url_id) continue;
        const existing = grouped.get(owner.id);
        if (existing) {
          if (existing.direction !== r.direction) existing.direction = 'BOTH';
        } else {
          grouped.set(owner.id, {
            user_id: owner.id,
            naver_url_id: owner.naver_url_id,
            email: owner.email,
            direction: r.direction as 'I_FOLLOW' | 'FOLLOWS_ME',
          });
        }
      }
      othersListedMe = Array.from(grouped.values());
    }
  }

  return NextResponse.json({
    ok: true,
    me: {
      user_id: auth.userId,
      naver_url_id: myNaverUrlId,
    },
    inMyFans,           // 내 명단에서 발견한 N인플 사용자 (내가 동기화해야 보임)
    othersListedMe,     // 다른 사람이 나를 자기 명단에 등록한 케이스 (동기화 없이도 보임)
    counts: {
      inMyFans: inMyFans.length,
      othersListedMe: othersListedMe.length,
    },
  });
}
