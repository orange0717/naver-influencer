'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAdAuth } from '@/hooks/useAdAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface DashboardData {
  stats: {
    activeCampaigns: number;
    totalCampaigns: number;
    totalApplications: number;
    acceptedApplications: number;
    totalSpend: number;
  };
  recentCampaigns: Array<{
    id: string;
    title: string;
    status: string;
    fee_per_post: number;
    max_participants: number;
    created_at: string;
  }>;
  recentApplications: Array<{
    id: string;
    campaign_id: string;
    naver_id: string;
    status: string;
    applied_at: string;
    campaignTitle?: string;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '임시저장', active: '모집중', closed: '마감', completed: '완료', canceled: '취소',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-dim/10 text-dim', active: 'bg-up/10 text-up', closed: 'bg-gold/10 text-gold',
  completed: 'bg-accent/10 text-accent', canceled: 'bg-down/10 text-down',
};
const APP_STATUS_LABEL: Record<string, string> = {
  pending: '대기중', accepted: '수락', rejected: '거절', completed: '완료',
};

export default function AdDashboardPage() {
  const { advertiser, isLoading: authLoading } = useAdAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!advertiser.id) {
      setLoading(false);
      return;
    }

    const fetchDashboard = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

        const res = await fetch('/api/ad/dashboard', { headers });
        if (res.ok) {
          setData(await res.json());
        }
      } catch { /* 조회 실패 */ } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [advertiser.id, authLoading]);

  if (!authLoading && !advertiser.id) {
    return (
      <div className="text-center py-12">
        <p className="text-dim mb-4">로그인이 필요합니다</p>
        <Link href="/orangeconnect/login" className="text-accent hover:underline text-sm">로그인</Link>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="text-center py-12">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const { stats, recentCampaigns, recentApplications } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold">대시보드</h1>
        <p className="text-sm text-dim mt-1">{advertiser.companyName}님의 캠페인 현황</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: '활성 캠페인', value: stats.activeCampaigns, suffix: '건' },
          { label: '전체 신청', value: stats.totalApplications, suffix: '건' },
          { label: '수락 인원', value: stats.acceptedApplications, suffix: '명' },
          { label: '총 집행금액', value: stats.totalSpend.toLocaleString(), suffix: '원' },
        ].map(card => (
          <div key={card.label} className="bg-surface border border-border rounded-lg p-5">
            <p className="text-[10px] text-dim font-semibold mb-1">{card.label}</p>
            <p className="text-2xl font-extrabold font-rank">
              {card.value}<span className="text-sm text-dim font-normal ml-1">{card.suffix}</span>
            </p>
          </div>
        ))}
      </div>

      {/* 빠른 실행 */}
      <div className="flex gap-3">
        <Link href="/orangeconnect/campaign/new"
          className="px-5 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl text-sm transition">
          캠페인 등록
        </Link>
        <Link href="/orangeconnect/search"
          className="px-5 py-3 border border-border text-text font-bold rounded-xl text-sm hover:bg-bg transition">
          AI 인플루언서 검색
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* 최근 캠페인 */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base">캠페인 현황</h2>
            <Link href="/orangeconnect/campaign" className="text-xs text-accent hover:underline">전체 보기</Link>
          </div>
          {recentCampaigns.length === 0 ? (
            <p className="text-sm text-dim text-center py-4">등록된 캠페인이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {recentCampaigns.map(c => (
                <Link key={c.id} href={`/orangeconnect/campaign/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-bg transition-colors block">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                      <span className="text-sm font-bold truncate">{c.title}</span>
                    </div>
                  </div>
                  {c.fee_per_post > 0 && (
                    <span className="text-xs font-bold text-accent shrink-0 ml-2">
                      {c.fee_per_post.toLocaleString()}원
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 최근 신청 */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="font-bold text-base mb-4">최근 신청</h2>
          {recentApplications.length === 0 ? (
            <p className="text-sm text-dim text-center py-4">아직 신청이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {recentApplications.map(a => (
                <Link key={a.id} href={`/orangeconnect/campaign/${a.campaign_id}`}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-bg transition-colors block">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">@{a.naver_id}</p>
                    <p className="text-[11px] text-dim truncate">{a.campaignTitle}</p>
                  </div>
                  <span className="text-[10px] text-dim shrink-0 ml-2">
                    {APP_STATUS_LABEL[a.status] || a.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
