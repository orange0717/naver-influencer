import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

interface FanRow {
  target_url_id: string;
  target_nickname: string | null;
  target_image_url: string | null;
  target_category: string | null;
  target_follower_count: number | null;
  direction: 'I_FOLLOW' | 'FOLLOWS_ME';
  first_seen_at: string;
  last_seen_at: string;
}

interface FanItem {
  urlId: string;
  nickname: string;
  imageUrl: string;
  category: string;
  followerCount: number;
  firstSeenAt: string;
}

function toItem(row: FanRow): FanItem {
  return {
    urlId: row.target_url_id,
    nickname: row.target_nickname || row.target_url_id,
    imageUrl: row.target_image_url || '',
    category: row.target_category || '',
    followerCount: row.target_follower_count ?? 0,
    firstSeenAt: row.first_seen_at,
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireInfluencerPlan(request);
  if ('error' in gate) return gate.error;
  const auth = gate.authUser;

  const supabase = createServiceClient();
  const ownerUserId = auth.userId;

  const { data: rows, error } = await supabase
    .from('follow_relations')
    .select('target_url_id, target_nickname, target_image_url, target_category, target_follower_count, direction, first_seen_at, last_seen_at')
    .eq('owner_user_id', ownerUserId)
    .is('removed_at', null);

  if (error) {
    console.error('[fans] fetch failed:', error);
    return NextResponse.json({ error: 'DB 조회 실패' }, { status: 500 });
  }

  // url_id 기준 그룹핑: 양쪽에 있으면 맞팬
  const byUrlId = new Map<string, { iFollow?: FanRow; followsMe?: FanRow }>();
  for (const r of (rows || []) as FanRow[]) {
    const slot = byUrlId.get(r.target_url_id) || {};
    if (r.direction === 'I_FOLLOW') slot.iFollow = r;
    else slot.followsMe = r;
    byUrlId.set(r.target_url_id, slot);
  }

  const mutual: FanItem[] = [];
  const onlyIFollow: FanItem[] = [];     // 내가만 팬 (일방적으로 내가 팬)
  const onlyFollowsMe: FanItem[] = [];   // 나를만 팬 (일방적으로 나를 팬)

  for (const slot of byUrlId.values()) {
    if (slot.iFollow && slot.followsMe) {
      // 두 쪽 다 있으면 더 최근 정보 기준으로 표시
      const newer = new Date(slot.iFollow.last_seen_at) > new Date(slot.followsMe.last_seen_at)
        ? slot.iFollow : slot.followsMe;
      mutual.push(toItem(newer));
    } else if (slot.iFollow) {
      onlyIFollow.push(toItem(slot.iFollow));
    } else if (slot.followsMe) {
      onlyFollowsMe.push(toItem(slot.followsMe));
    }
  }

  // 정렬: 팬 수 내림차순
  const sortByFanDesc = (a: FanItem, b: FanItem) => b.followerCount - a.followerCount;
  mutual.sort(sortByFanDesc);
  onlyIFollow.sort(sortByFanDesc);
  onlyFollowsMe.sort(sortByFanDesc);

  // 마지막 동기화 정보
  const { data: lastSync } = await supabase
    .from('follow_sync_log')
    .select('synced_at, source, status, followers_count, followings_count, added_count, removed_count')
    .eq('owner_user_id', ownerUserId)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    counts: {
      mutual: mutual.length,
      onlyIFollow: onlyIFollow.length,
      onlyFollowsMe: onlyFollowsMe.length,
      totalIFollow: mutual.length + onlyIFollow.length,
      totalFollowsMe: mutual.length + onlyFollowsMe.length,
    },
    mutual,
    onlyIFollow,
    onlyFollowsMe,
    lastSync: lastSync || null,
  });
}
