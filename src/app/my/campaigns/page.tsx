'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface MyApplication {
  id: string;
  campaign_id: string;
  status: string;
  applied_at: string;
  accepted_at: string | null;
  campaign: {
    title: string;
    category: string;
    campaign_type: string;
    fee_per_post: number;
    deadline: string | null;
    posting_deadline: string | null;
    advertiser_company: string;
  } | null;
}

const APP_STATUS_LABEL: Record<string, string> = {
  pending: '대기중', accepted: '수락됨', rejected: '거절', completed: '완료', canceled: '취소',
};
const APP_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gold/10 text-gold', accepted: 'bg-up/10 text-up', rejected: 'bg-down/10 text-down',
  completed: 'bg-accent/10 text-accent', canceled: 'bg-dim/10 text-dim',
};
const TYPE_LABEL: Record<string, string> = { review: '리뷰', experience: '체험단', sponsored: '협찬' };

export default function MyCampaignsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (authLoading || !user.id) {
      if (!authLoading) setLoading(false);
      return;
    }

    const fetchApplications = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

        const url = filter ? `/api/my/campaigns?status=${filter}` : '/api/my/campaigns';
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          setApplications(data.applications || []);
        }
      } catch { /* 조회 실패 */ } finally {
        setLoading(false);
      }
    };

    fetchApplications();
  }, [user.id, authLoading, filter]);

  const handleCancel = async (campaignId: string) => {
    if (!confirm('신청을 취소하시겠습니까?')) return;
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch(`/api/campaigns/${campaignId}/apply`, { method: 'DELETE', headers });
      if (res.ok) {
        setApplications(prev => prev.map(a => a.campaign_id === campaignId ? { ...a, status: 'canceled' } : a));
      }
    } catch { /* 실패 */ }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold">캠페인 현황</h1>
        <p className="text-sm text-dim mt-1">신청한 캠페인의 진행 상황을 확인하세요</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { value: '', label: '전체' },
          { value: 'pending', label: '대기중' },
          { value: 'accepted', label: '수락됨' },
          { value: 'completed', label: '완료' },
        ].map(tab => (
          <button key={tab.value} onClick={() => { setFilter(tab.value); setLoading(true); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              filter === tab.value ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:border-accent/40'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <p className="text-dim mb-4">신청한 캠페인이 없습니다</p>
          <Link href="/campaigns" className="text-accent hover:underline text-sm font-semibold">
            캠페인 둘러보기
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {applications.map(app => (
            <div key={app.id} className="bg-surface border border-border rounded-lg p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${APP_STATUS_COLOR[app.status]}`}>
                      {APP_STATUS_LABEL[app.status]}
                    </span>
                    {app.campaign && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                        {TYPE_LABEL[app.campaign.campaign_type] || app.campaign.campaign_type}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-sm">{app.campaign?.title || '삭제된 캠페인'}</h3>
                  {app.campaign && (
                    <p className="text-[11px] text-dim mt-0.5">{app.campaign.advertiser_company}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {app.campaign?.fee_per_post ? (
                    <p className="text-sm font-bold text-accent">{app.campaign.fee_per_post.toLocaleString()}원</p>
                  ) : null}
                  <p className="text-[11px] text-dim">
                    신청일: {new Date(app.applied_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              </div>

              {app.campaign && (
                <div className="flex items-center gap-4 mt-2 text-[11px] text-dim">
                  {app.campaign.deadline && <span>마감: {app.campaign.deadline}</span>}
                  {app.campaign.posting_deadline && <span>포스팅 기한: {app.campaign.posting_deadline}</span>}
                </div>
              )}

              {app.status === 'pending' && (
                <div className="mt-3">
                  <button onClick={() => handleCancel(app.campaign_id)}
                    className="text-xs text-down font-semibold hover:underline cursor-pointer">
                    신청 취소
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
