import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export default async function MyDashboard() {
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

  if (!authUser) {
    redirect('/auth/login');
  }

  const supabase = createServiceClient();

  // users 프로필 조회 (없으면 자동 생성)
  let { data: userProfile } = await supabase
    .from('users')
    .select('id, nickname, linked_influencer_id')
    .eq('auth_id', authUser.id)
    .single();

  if (!userProfile) {
    const { data: newUser } = await supabase
      .from('users')
      .insert({
        auth_id: authUser.id,
        email: authUser.email,
        nickname: authUser.email?.split('@')[0] || 'User',
        point_balance: 100,
      })
      .select('id, nickname, linked_influencer_id')
      .single();
    userProfile = newUser;
  }

  if (!userProfile?.linked_influencer_id) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-accent/15 flex items-center justify-center text-accent text-xl font-bold">N</div>
          <h2 className="text-xl font-bold">인플루언서 계정을 연결하세요</h2>
          <p className="text-sm text-dim">네이버 인플루언서 계정을 연결하면<br />키워드 순위를 실시간으로 확인할 수 있습니다.</p>
          <Link href="/my/link"
            className="inline-block px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition">
            계정 연결하기
          </Link>
        </div>
      </div>
    );
  }

  const influencerId = userProfile.linked_influencer_id;

  // 인플루언서 정보
  const { data: influencer } = await supabase
    .from('influencers')
    .select('*')
    .eq('id', influencerId)
    .single();

  if (!influencer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-down/15 flex items-center justify-center text-down text-xl font-bold">!</div>
          <p className="text-sm text-dim">인플루언서 정보를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  // ─── 1. 최신 순위 데이터 (keyword_rankings) ───
  const { data: latestRankings } = await supabase
    .from('keyword_rankings')
    .select(`
      rank_position, previous_rank, rank_change, is_integrated_top3,
      keyword_id,
      keyword_challenges!inner(keyword, category, participant_count, search_volume_monthly)
    `)
    .eq('influencer_id', influencerId)
    .order('snapshot_date', { ascending: false })
    .limit(500);

  // 최신 날짜의 순위만 (키워드별 중복 제거)
  const latestByKeyword = new Map<string, (typeof latestRankings extends (infer T)[] | null ? T : never)>();
  for (const r of (latestRankings || [])) {
    if (!latestByKeyword.has(r.keyword_id)) {
      latestByKeyword.set(r.keyword_id, r);
    }
  }
  const currentRankings = Array.from(latestByKeyword.values());

  // 순위 데이터 정리
  const rankings = currentRankings.map(r => {
    const kw = r.keyword_challenges as unknown as Record<string, unknown>;
    return {
      keyword_id: r.keyword_id,
      keyword: (kw?.keyword as string) || '',
      category: (kw?.category as string) || '',
      rank_position: r.rank_position,
      rank_change: r.rank_change,
      is_integrated_top3: r.is_integrated_top3,
      participant_count: (kw?.participant_count as number) || 0,
      search_volume: (kw?.search_volume_monthly as number) || 0,
    };
  }).sort((a, b) => a.rank_position - b.rank_position);

  // 통계 계산
  const totalRankedKeywords = rankings.length;
  const avgRank = totalRankedKeywords > 0
    ? rankings.reduce((s, r) => s + r.rank_position, 0) / totalRankedKeywords
    : 0;
  const top3Count = rankings.filter(r => r.rank_position <= 3).length;
  const top5 = rankings.slice(0, 5);
  const rankUpCount = rankings.filter(r => r.rank_change > 0).length;
  const rankDownCount = rankings.filter(r => r.rank_change < 0).length;

  // ─── 2. 내 키워드 전체 목록 (influencer_keywords) ───
  const { data: myKeywords } = await supabase
    .from('influencer_keywords')
    .select(`
      keyword_id,
      keyword_challenges(id, keyword, category, participant_count, search_volume_monthly)
    `)
    .eq('influencer_id', influencerId);

  // 키워드 목록 정리 + 순위 정보 병합
  const rankedMap = new Map(rankings.map(r => [r.keyword_id, r]));
  const allKeywords = (myKeywords || []).map(ik => {
    const kw = ik.keyword_challenges as unknown as Record<string, unknown>;
    const ranked = rankedMap.get(ik.keyword_id);
    return {
      keyword_id: (kw?.id as string) || ik.keyword_id,
      keyword: (kw?.keyword as string) || '',
      category: (kw?.category as string) || '기타',
      participant_count: (kw?.participant_count as number) || 0,
      search_volume: (kw?.search_volume_monthly as number) || 0,
      rank_position: ranked?.rank_position ?? null,
      rank_change: ranked?.rank_change ?? 0,
    };
  }).sort((a, b) => {
    // 순위 있는 것 먼저, 그 다음 검색량 순
    if (a.rank_position !== null && b.rank_position === null) return -1;
    if (a.rank_position === null && b.rank_position !== null) return 1;
    if (a.rank_position !== null && b.rank_position !== null) return a.rank_position - b.rank_position;
    return (b.search_volume || 0) - (a.search_volume || 0);
  });

  // 카테고리별 그룹핑
  const grouped = new Map<string, typeof allKeywords>();
  for (const kw of allKeywords) {
    const cat = kw.category || '기타';
    const arr = grouped.get(cat) || [];
    arr.push(kw);
    grouped.set(cat, arr);
  }
  // 키워드 수 내림차순 정렬
  const categoryGroups = Array.from(grouped.entries())
    .sort((a, b) => b[1].length - a[1].length);

  const totalKeywords = allKeywords.length;

  return (
    <div className="space-y-6">

      {/* ─── 프로필 헤더 ─── */}
      <div className="flex items-center gap-4">
        {influencer.image_url ? (
          <img src={influencer.image_url} alt="" className="w-14 h-14 rounded-full object-cover" />
        ) : (
          <div className="w-14 h-14 bg-accent/15 rounded-full flex items-center justify-center text-accent text-2xl font-bold">
            {influencer.display_name[0]}
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold">{influencer.display_name}</h1>
          <p className="text-xs text-dim">{influencer.my_keyword_category || influencer.category} · 팬 {formatCount(influencer.subscriber_count || 0)}</p>
        </div>
      </div>

      {/* ─── 주요 지표 4카드 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim mb-1">나의 평균 순위</p>
          <p className="text-2xl font-black font-rank text-accent">
            {avgRank > 0 ? `${Math.round(avgRank)}위` : '-'}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim mb-1">참여 키워드</p>
          <p className="text-2xl font-black font-rank">{totalKeywords}개</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim mb-1">TOP 3 키워드</p>
          <p className="text-2xl font-black font-rank text-up">{top3Count}개</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <p className="text-[11px] text-dim mb-1">순위 변동</p>
          <div className="flex items-baseline gap-2">
            {rankUpCount > 0 && (
              <span className="text-lg font-black font-rank text-up">▲{rankUpCount}</span>
            )}
            {rankDownCount > 0 && (
              <span className="text-lg font-black font-rank text-down">▼{rankDownCount}</span>
            )}
            {rankUpCount === 0 && rankDownCount === 0 && (
              <span className="text-lg font-black font-rank text-dim">-</span>
            )}
          </div>
        </div>
      </div>

      {/* ─── TOP 5 키워드 ─── */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-bg/50">
          <h3 className="font-bold text-sm">TOP 5 키워드</h3>
        </div>
        {top5.length > 0 ? (
          <div className="divide-y divide-border/30">
            {top5.map((r, i) => (
              <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                    i === 0 ? 'bg-gold/20 text-gold' : i <= 2 ? 'bg-accent/15 text-accent' : 'bg-border/50 text-dim'
                  }`}>{i + 1}</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-sm truncate block">{r.keyword}</span>
                    <span className="text-[10px] text-dim">{r.category} · {r.participant_count}명 참여{r.search_volume > 0 ? ` · 월 ${formatCount(r.search_volume)}회` : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.rank_change !== 0 && (
                    <span className={`text-xs font-bold ${r.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                      {r.rank_change > 0 ? '▲' : '▼'}{Math.abs(r.rank_change)}
                    </span>
                  )}
                  <span className={`text-sm font-black font-rank ${r.rank_position <= 3 ? 'text-accent' : ''}`}>
                    {r.rank_position}위
                  </span>
                  {r.is_integrated_top3 && <span className="text-xs font-bold text-gold">T3</span>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-dim text-sm">아직 순위 데이터가 없습니다.</div>
        )}
      </div>

      {/* ─── 내 키워드 리스트 (주제별) ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">내 키워드 리스트</h3>
          <span className="text-xs text-dim">{categoryGroups.length}개 주제 · {totalKeywords}개 키워드</span>
        </div>

        {categoryGroups.length > 0 ? (
          categoryGroups.map(([category, keywords]) => (
            <div key={category} className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-bg/30">
                <span className="text-sm font-bold">{category}</span>
                <span className="text-xs text-dim font-rank">{keywords.length}개</span>
              </div>
              <div className="divide-y divide-border/20">
                {keywords.map(kw => (
                  <Link key={kw.keyword_id} href={`/keywords/${kw.keyword_id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover transition">
                    <div className="min-w-0">
                      <span className="text-sm truncate block">{kw.keyword}</span>
                      <span className="text-[10px] text-dim">
                        {kw.participant_count}명 참여
                        {kw.search_volume > 0 ? ` · 월 ${formatCount(kw.search_volume)}회` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {kw.rank_change !== 0 && (
                        <span className={`text-[10px] font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                          {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                        </span>
                      )}
                      {kw.rank_position !== null ? (
                        <span className={`text-xs font-black font-rank px-2 py-0.5 rounded ${
                          kw.rank_position <= 3 ? 'bg-accent/15 text-accent' : 'bg-border/30 text-dim'
                        }`}>
                          {kw.rank_position}위
                        </span>
                      ) : (
                        <span className="text-[10px] text-dim">순위 없음</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-surface rounded-xl border border-border text-center py-12 text-dim text-sm">
            아직 참여 중인 키워드가 없습니다.
          </div>
        )}
      </div>

      {/* ─── 활동 현황 ─── */}
      <div className="bg-surface rounded-xl border border-border p-4">
        <h3 className="font-bold text-sm mb-3">활동 현황</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-black font-rank">{formatCount(influencer.subscriber_count || 0)}</p>
            <p className="text-[11px] text-dim mt-0.5">팬수</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{totalKeywords}</p>
            <p className="text-[11px] text-dim mt-0.5">참여 키워드</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{formatCount(influencer.total_follower_count || 0)}</p>
            <p className="text-[11px] text-dim mt-0.5">팔로워</p>
          </div>
        </div>
      </div>
    </div>
  );
}
