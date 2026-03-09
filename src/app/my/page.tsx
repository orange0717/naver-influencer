import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

export default async function MyDashboard() {
  // 서버에서 직접 쿠키 인증 (API 호출 불필요)
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

  // 인플루언서 미연결
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

  // 인플루언서 정보
  const { data: influencer } = await supabase
    .from('influencers')
    .select('*')
    .eq('id', userProfile.linked_influencer_id)
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

  // 최신 순위 데이터
  const { data: latestRankings } = await supabase
    .from('keyword_rankings')
    .select(`
      rank_position, previous_rank, rank_change, is_integrated_top3,
      keyword_id,
      keyword_challenges!inner(keyword, category, participant_count, search_volume_monthly)
    `)
    .eq('influencer_id', userProfile.linked_influencer_id)
    .order('snapshot_date', { ascending: false })
    .limit(200);

  // 최신 날짜의 순위만 (키워드별 중복 제거)
  const latestByKeyword = new Map<string, (typeof latestRankings extends (infer T)[] | null ? T : never)>();
  for (const r of (latestRankings || [])) {
    if (!latestByKeyword.has(r.keyword_id)) {
      latestByKeyword.set(r.keyword_id, r);
    }
  }
  const currentRankings = Array.from(latestByKeyword.values());

  // 통계 계산
  const totalKeywords = currentRankings.length;
  const avgRank = totalKeywords > 0
    ? currentRankings.reduce((s, r) => s + r.rank_position, 0) / totalKeywords
    : 0;
  const top3Count = currentRankings.filter(r => r.rank_position <= 3).length;
  const rankUpCount = currentRankings.filter(r => r.rank_change > 0).length;
  const rankDownCount = currentRankings.filter(r => r.rank_change < 0).length;

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
    };
  }).sort((a, b) => a.rank_position - b.rank_position);

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
          <p className="text-[11px] text-dim mb-1">나의 랭킹</p>
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

      {/* ─── 키워드 챌린지 순위 ─── */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg/50">
          <h3 className="font-bold text-sm">키워드 챌린지 순위</h3>
          <span className="text-xs text-dim font-rank">{rankings.length}개 키워드</span>
        </div>

        {/* Desktop */}
        <table className="w-full text-sm hidden md:table">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs w-8">#</th>
              <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">키워드</th>
              <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs w-16">순위</th>
              <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs w-16">변동</th>
              <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs w-20">참여자</th>
              <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs w-14">통합</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r, i) => (
              <tr key={r.keyword_id} className="border-b border-border/30 last:border-0 hover:bg-surface-hover transition-colors">
                <td className="py-2.5 px-4 text-xs text-dim font-rank">{i + 1}</td>
                <td className="py-2.5 px-4">
                  <Link href={`/keywords/${r.keyword_id}`} className="font-medium text-sm hover:text-accent transition-colors">
                    {r.keyword}
                  </Link>
                  <span className="text-[10px] text-dim ml-1.5">{r.category}</span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span className={`text-sm font-black font-rank ${r.rank_position <= 3 ? 'text-accent' : ''}`}>
                    {r.rank_position}위
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  {r.rank_change > 0 ? (
                    <span className="text-xs font-bold text-up">▲{r.rank_change}</span>
                  ) : r.rank_change < 0 ? (
                    <span className="text-xs font-bold text-down">▼{Math.abs(r.rank_change)}</span>
                  ) : (
                    <span className="text-xs text-dim">-</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right text-xs text-dim font-rank">{r.participant_count}명</td>
                <td className="py-2.5 px-3 text-center">
                  {r.is_integrated_top3 && <span className="text-xs font-bold text-gold">T3</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile */}
        <div className="md:hidden divide-y divide-border/30">
          {rankings.map((r, i) => (
            <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-dim font-rank w-5">{i + 1}</span>
                <div className="min-w-0">
                  <span className="font-medium text-sm truncate block">{r.keyword}</span>
                  <span className="text-[10px] text-dim">{r.category} · {r.participant_count}명</span>
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

        {rankings.length === 0 && (
          <div className="text-center py-12 text-dim text-sm">아직 키워드 순위 데이터가 없습니다.</div>
        )}
      </div>

      {/* ─── 누적 활동 현황 ─── */}
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
