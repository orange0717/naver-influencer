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

// 사람별 관계는 "확정값"만 존재한다(내 인증 목록의 집합연산이므로 추정 없음, 스펙 16-1·16-2).
//   mutual        = 맞팬
//   onlyIFollow   = 내가 팬함
//   onlyFollowsMe = 상대만 팬함
// '관계 없음/확인 중/확인 실패'는 사람별이 아니라 데이터셋(syncState) 수준 개념이다.
type Relationship = 'mutual' | 'onlyIFollow' | 'onlyFollowsMe';

interface FanItem {
  urlId: string;
  nickname: string;
  imageUrl: string;
  category: string;
  followerCount: number;
  relationship: Relationship;
  myFollow: boolean;    // 내가 상대를 팬함
  theirFollow: boolean; // 상대가 나를 팬함
  firstSeenAt: string;  // 두 방향 중 가장 이른 최초 관측
  lastSeenAt: string;   // 두 방향 중 가장 최근 관측(마지막 확인)
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

  const items: FanItem[] = [];
  const summary = { total: 0, mutual: 0, onlyIFollow: 0, onlyFollowsMe: 0 };

  for (const slot of byUrlId.values()) {
    const myFollow = !!slot.iFollow;
    const theirFollow = !!slot.followsMe;
    const relationship: Relationship = myFollow && theirFollow
      ? 'mutual'
      : myFollow ? 'onlyIFollow' : 'onlyFollowsMe';

    // 표시용 프로필은 더 최근에 관측된 행 기준
    const rowsForItem = [slot.iFollow, slot.followsMe].filter(Boolean) as FanRow[];
    const newer = rowsForItem.reduce((a, b) =>
      new Date(a.last_seen_at) >= new Date(b.last_seen_at) ? a : b);
    const firstSeen = rowsForItem.reduce((min, r) =>
      new Date(r.first_seen_at) < new Date(min) ? r.first_seen_at : min, rowsForItem[0].first_seen_at);
    const lastSeen = rowsForItem.reduce((max, r) =>
      new Date(r.last_seen_at) > new Date(max) ? r.last_seen_at : max, rowsForItem[0].last_seen_at);

    items.push({
      urlId: newer.target_url_id,
      nickname: newer.target_nickname || newer.target_url_id,
      imageUrl: newer.target_image_url || '',
      category: newer.target_category || '',
      followerCount: newer.target_follower_count ?? 0,
      relationship,
      myFollow,
      theirFollow,
      firstSeenAt: firstSeen,
      lastSeenAt: lastSeen,
    });

    summary.total += 1;
    summary[relationship] += 1;
  }

  // 기본 정렬: 맞팬 우선 → 팬 수 내림차순
  const rank: Record<Relationship, number> = { mutual: 0, onlyIFollow: 1, onlyFollowsMe: 2 };
  items.sort((a, b) =>
    rank[a.relationship] - rank[b.relationship] || b.followerCount - a.followerCount);

  // 마지막 동기화 정보
  const { data: lastSync } = await supabase
    .from('follow_sync_log')
    .select('synced_at, source, status, followers_count, followings_count, added_count, removed_count')
    .eq('owner_user_id', ownerUserId)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 데이터셋 수준 확인 상태(스펙 5·16): 절대 맞팬으로 추정하지 않고 정직하게 구분한다.
  //   never  = 한 번도 동기화 안 함 → 전체가 '확인 중'
  //   failed = 마지막 동기화 실패   → '확인 실패'(기존 데이터는 보존)
  //   ok     = 정상 확인됨
  const syncState: 'never' | 'ok' | 'failed' =
    !lastSync && summary.total === 0 ? 'never'
    : lastSync?.status === 'failed' ? 'failed'
    : 'ok';

  return NextResponse.json({
    summary,
    syncState,
    items,
    lastSync: lastSync || null,
  });
}
