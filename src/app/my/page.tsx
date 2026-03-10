import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import CompetitorSection from '@/components/CompetitorSection';
import Banner from '@/components/Banner';
import { SUBSCRIBE_BANNERS } from '@/lib/banner-data';

export const dynamic = 'force-dynamic';

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  // UTC → KST 보정
  const date = new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' });
}

interface Recommendation {
  keyword_id: string;
  keyword: string;
  category: string;
  participant_count: number;
  recommendation_score: number;
  reason: string;
}

export default async function MyDashboard() {
  const cookieStore = await cookies();
  const naverId = cookieStore.get('naver_id')?.value;

  if (!naverId) {
    redirect('/auth/login');
  }

  const supabase = createServiceClient();

  // naver_id로 인플루언서 조회
  const { data: influencerData } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .single();

  if (!influencerData) {
    redirect('/auth/login');
  }

  const influencerId = influencerData.id;

  // 인플루언서 정보
  const { data: influencer } = await supabase
    .from('influencers')
    .select('*')
    .eq('id', influencerId)
    .single();

  // 구독 상태 확인 (users 테이블에서 linked_influencer_id로 조회)
  const { data: userProfile } = await supabase
    .from('users')
    .select('subscription_status, subscription_expires_at')
    .eq('linked_influencer_id', influencerId)
    .single();

  // 관리자 계정
  const ADMIN_IDS = ['orangelibrary'];
  const isAdmin = ADMIN_IDS.includes(naverId);

  const isSubscribed = isAdmin || (userProfile
    && userProfile.subscription_status === 'active'
    && !!userProfile.subscription_expires_at
    && new Date(userProfile.subscription_expires_at) > new Date());

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
  const categoryGroups = Array.from(grouped.entries())
    .sort((a, b) => b[1].length - a[1].length);

  const totalKeywords = allKeywords.length;

  // ─── 3. 오늘의 추천 키워드 ───
  let recommendations: Recommendation[] = [];
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_SUPABASE_URL
        ? 'http://localhost:3000'
        : 'http://localhost:3000';
    const recRes = await fetch(`${baseUrl}/api/recommendations`, { cache: 'no-store' });
    if (recRes.ok) {
      const recData = await recRes.json();
      recommendations = (recData.recommendations || []).slice(0, 6);
    }
  } catch {
    // 추천 API 실패 시 무시
  }

  return (
    <div className="space-y-8">

      {/* ─── 프로필 헤더 ─── */}
      <div className="bg-surface rounded-2xl border border-border p-5">
        <div className="flex items-center gap-4">
          {influencer.image_url ? (
            <img src={influencer.image_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 bg-accent/15 rounded-full flex items-center justify-center text-accent text-2xl font-bold">
              {influencer.display_name[0]}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-extrabold">{influencer.display_name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="text-sm text-dim">{influencer.my_keyword_category || influencer.category}</span>
              <span className="text-sm text-dim">팬 {formatCount(influencer.subscriber_count || 0)}</span>
              {influencer.first_seen_at && (
                <span className="text-sm text-dim">선정일 {formatDate(influencer.first_seen_at)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── 구독 유도 배너 (비구독자만) ─── */}
      {!isSubscribed && (
        <Banner banner={SUBSCRIBE_BANNERS[1]} dismissKey="dashboard-subscribe" />
      )}

      {/* ─── 대시보드 콘텐츠 (미구독 시 블라인드) ─── */}
      <div className="relative">

      {/* 미구독 시 블라인드 오버레이 */}
      {!isSubscribed && (
        <div className="absolute inset-0 z-10 flex items-start justify-center pt-40">
          <div className="bg-surface/95 backdrop-blur-sm rounded-2xl border border-accent/20 p-8 text-center space-y-4 shadow-xl max-w-sm mx-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-accent/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 className="text-lg font-extrabold text-text">구독하고 전체 데이터 보기</h2>
            <p className="text-sm text-dim leading-relaxed">
              나의 키워드 순위, 경쟁자 분석, 맞춤 추천 등<br />
              대시보드의 모든 데이터를 확인하세요.
            </p>
            <div className="flex flex-col items-center gap-2 pt-2">
              <Link href="/subscribe" className="px-8 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-sm">
                월 9,900원으로 구독하기
              </Link>
              <p className="text-[11px] text-dim">키워드·랭킹·인플루언서 검색은 무료입니다</p>
            </div>
          </div>
        </div>
      )}

      <div className={`space-y-8 ${!isSubscribed ? 'blur-[6px] select-none pointer-events-none' : ''}`}>

      {/* ─── 주요 지표 4카드 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-dim mb-2">나의 평균 순위</p>
          <p className={`text-2xl font-black font-rank ${avgRank > 0 ? 'text-accent' : 'text-dim'}`}>
            {avgRank > 0 ? `${Math.round(avgRank)}위` : '—'}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-dim mb-2">참여 키워드</p>
          <p className={`text-2xl font-black font-rank ${totalKeywords === 0 ? 'text-dim' : ''}`}>{totalKeywords}개</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-dim mb-2">TOP 3 키워드</p>
          <p className={`text-2xl font-black font-rank ${top3Count > 0 ? 'text-up' : 'text-dim'}`}>{top3Count}개</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-xs text-dim mb-2">순위 변동</p>
          <div className="flex items-baseline gap-2">
            {rankUpCount > 0 && (
              <span className="text-lg font-black font-rank text-up">▲{rankUpCount}</span>
            )}
            {rankDownCount > 0 && (
              <span className="text-lg font-black font-rank text-down">▼{rankDownCount}</span>
            )}
            {rankUpCount === 0 && rankDownCount === 0 && (
              <span className="text-lg font-black font-rank text-dim">—</span>
            )}
          </div>
        </div>
      </div>

      {/* ─── 오늘의 추천 키워드 ─── */}
      {recommendations.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-bg/50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm">오늘의 추천 키워드</h3>
              <p className="text-[11px] text-dim mt-0.5">블루오션 키워드를 매일 추천합니다</p>
            </div>
            <span className="text-xs text-accent font-semibold">TODAY&apos;S PICK</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 divide-border/30">
            {recommendations.map((rec) => (
              <Link key={rec.keyword_id} href={`/keywords/${rec.keyword_id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition border-b border-border/20 last:border-0 md:odd:border-r">
                <div className="min-w-0">
                  <span className="font-semibold text-sm block truncate">{rec.keyword}</span>
                  <span className="text-xs text-dim">{rec.category} · {rec.participant_count}명 참여</span>
                </div>
                <div className="shrink-0 ml-3">
                  <span className="text-[10px] text-accent bg-accent/10 px-2 py-1 rounded-full font-semibold">{rec.reason}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── TOP 5 키워드 ─── */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-bg/50">
          <h3 className="font-bold text-sm">TOP 5 키워드</h3>
        </div>
        {top5.length > 0 ? (
          <div className="divide-y divide-border/30">
            {top5.map((r, i) => (
              <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                    i === 0 ? 'bg-gold/20 text-gold' : i <= 2 ? 'bg-accent/15 text-accent' : 'bg-border/50 text-dim'
                  }`}>{i + 1}</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-sm truncate block">{r.keyword}</span>
                    <span className="text-xs text-dim">{r.category} · {r.participant_count}명 참여{r.search_volume > 0 ? ` · 월 ${formatCount(r.search_volume)}회` : ''}</span>
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
          <div className="text-center py-10 text-dim text-sm">
            <p>아직 순위 데이터가 없습니다.</p>
            <p className="text-xs mt-1">데이터 수집이 매일 자동으로 진행됩니다.</p>
          </div>
        )}
      </div>

      {/* ─── 경쟁자 분석 ─── */}
      <CompetitorSection
        naverId={naverId}
        myStats={{ avgRank: Math.round(avgRank * 10) / 10, totalKeywords, top3Count }}
      />

      {/* ─── 내 키워드 리스트 (주제별) ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">내 키워드 리스트</h3>
          <span className="text-xs text-dim">{categoryGroups.length}개 주제 · {totalKeywords}개 키워드</span>
        </div>

        {categoryGroups.length > 0 ? (
          categoryGroups.map(([category, keywords]) => (
            <div key={category} className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-bg/30">
                <span className="text-sm font-bold">{category}</span>
                <span className="text-xs text-dim font-rank">{keywords.length}개</span>
              </div>
              <div className="divide-y divide-border/20">
                {keywords.map(kw => (
                  <Link key={kw.keyword_id} href={`/keywords/${kw.keyword_id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-surface-hover transition">
                    <div className="min-w-0">
                      <span className="text-sm truncate block">{kw.keyword}</span>
                      <span className="text-xs text-dim">
                        {kw.participant_count}명 참여
                        {kw.search_volume > 0 ? ` · 월 ${formatCount(kw.search_volume)}회` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {kw.rank_change !== 0 && (
                        <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
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
                        <span className="text-xs text-dim">순위 없음</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-surface rounded-xl border border-border text-center py-12 text-dim text-sm">
            <p>아직 참여 중인 키워드가 없습니다.</p>
            <p className="text-xs mt-1">키워드 데이터 수집이 진행되면 자동으로 표시됩니다.</p>
          </div>
        )}
      </div>

      {/* ─── 활동 현황 ─── */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-4">활동 현황</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-black font-rank">{formatCount(influencer.subscriber_count || 0)}</p>
            <p className="text-xs text-dim mt-1">팬수</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{totalKeywords}</p>
            <p className="text-xs text-dim mt-1">참여 키워드</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{totalRankedKeywords}</p>
            <p className="text-xs text-dim mt-1">순위 키워드</p>
          </div>
        </div>
      </div>

      </div>
      </div>
    </div>
  );
}
