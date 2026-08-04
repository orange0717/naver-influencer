import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServiceClient, createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import GlassCard from '@/components/dashboard/GlassCard';
import { formatDate } from '@/lib/format';
import type { CompositeRankSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RankRow {
  label: string;
  value: string;
  weight: string;
}

function computeRankMeta(snapshots: CompositeRankSnapshot[]) {
  const latest = snapshots[0] || null;
  if (!latest) return { latest: null as CompositeRankSnapshot | null, rankChange: 0 };
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const prior = snapshots.slice(1).find(r => new Date(r.snapshot_date).getTime() <= weekAgoMs);
  return { latest, rankChange: prior ? prior.rank - latest.rank : 0 };
}

export default async function NinflRankDetailPage() {
  const supabase = createServiceClient();
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  if (!authUser) {
    redirect('/auth/login?redirect=/my/rank');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('linked_influencer_id, blog_id')
    .eq('auth_id', authUser.id)
    .single();

  let naverId: string | undefined;
  if (profile?.linked_influencer_id) {
    const { data: linkedInf } = await supabase
      .from('influencers')
      .select('naver_id')
      .eq('id', profile.linked_influencer_id)
      .single();
    naverId = linkedInf?.naver_id || undefined;
  }
  if (!naverId && profile?.blog_id) {
    naverId = profile.blog_id;
  }
  if (!naverId) {
    redirect('/my');
  }

  const { data: influencerData } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .single();

  if (!influencerData) {
    redirect('/my');
  }

  const { data: rows } = await supabase
    .from('influencer_composite_rank_snapshots')
    .select('rank, composite_score, member_pool_size, top3_count, avg_integrated_rank, avg_blog_rank, ai_briefing_count, ai_tab_count, posting_count, missing_rate, snapshot_date')
    .eq('influencer_id', influencerData.id)
    .order('snapshot_date', { ascending: false })
    .limit(14);

  const snapshots = (rows || []) as CompositeRankSnapshot[];
  const { latest, rankChange } = computeRankMeta(snapshots);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <Link href="/my" className="text-xs text-dim hover:text-accent transition">← 내 대시보드</Link>
        <h1 className="font-title text-xl font-bold text-text mt-2">인플루언서 순위</h1>
        <p className="text-xs text-dim mt-1 leading-relaxed">
          N인플이 자체 산정한 순위입니다. 네이버 공식 인플루언서 순위가 아니며, N인플에 가입해 블로그를 연결한 회원 안에서만 비교합니다.
        </p>
      </div>

      {!latest ? (
        <GlassCard>
          <p className="text-sm text-dim text-center py-8">
            아직 순위가 산정되지 않았습니다. 매일 새벽 집계되며, 첫 집계까지 하루 정도 걸릴 수 있습니다.
          </p>
        </GlassCard>
      ) : (
        <>
          <GlassCard padding="lg" gradient>
            <div className="text-center">
              <p className="stat-title text-dim mb-2">N인플 회원 {latest.member_pool_size}명 중</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl font-extrabold font-rank text-accent">{latest.rank}</span>
                <span className="text-lg font-bold text-dim">위</span>
                {rankChange !== 0 && (
                  <span className={`text-sm font-bold ml-2 ${rankChange > 0 ? 'text-up' : 'text-down'}`}>
                    {rankChange > 0 ? '▲' : '▼'}{Math.abs(rankChange)}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-dim mt-2">{formatDate(latest.snapshot_date)} 기준 · 지난주 대비</p>
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="font-bold text-sm mb-4">순위 산정 기준</h2>
            <div className="divide-y divide-border">
              {([
                { label: '키워드챌린지 TOP3', value: `${latest.top3_count}개`, weight: '30%' },
                { label: '통합검색 평균순위', value: latest.avg_integrated_rank !== null ? `${latest.avg_integrated_rank.toFixed(1)}위` : '데이터 없음', weight: '20%' },
                { label: '블로그탭 평균순위', value: latest.avg_blog_rank !== null ? `${latest.avg_blog_rank.toFixed(1)}위` : '데이터 없음', weight: '20%' },
                { label: 'AI 브리핑 인용', value: `${latest.ai_briefing_count}건`, weight: '15%' },
                { label: 'AI 탭 노출', value: `${latest.ai_tab_count}건`, weight: '10%' },
                { label: '최근 7일 포스팅', value: `${latest.posting_count}건`, weight: '5%' },
                { label: '미노출률', value: `${latest.missing_rate}%`, weight: '감점' },
              ] as RankRow[]).map((row) => (
                <div key={row.label} className="flex items-center justify-between py-3">
                  <span className="text-sm text-text">{row.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold font-rank text-text">{row.value}</span>
                    <span className="text-[10px] text-dim w-10 text-right">{row.weight}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-dim mt-4 leading-relaxed">
              통합검색·블로그탭 평균순위는 낮을수록(=상위일수록), 나머지 지표는 높을수록 유리합니다. 미노출률은 높을수록 감점됩니다.
            </p>
          </GlassCard>
        </>
      )}
    </div>
  );
}
