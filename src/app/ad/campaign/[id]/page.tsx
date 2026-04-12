'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdAuth } from '@/hooks/useAdAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { formatCount } from '@/lib/format';
import { use } from 'react';

interface Campaign {
  id: string;
  title: string;
  description: string;
  category: string;
  region: string;
  campaign_type: string;
  budget: number;
  fee_per_post: number;
  max_participants: number;
  deadline: string | null;
  posting_deadline: string | null;
  requirements: string;
  status: string;
  created_at: string;
}

interface Application {
  id: string;
  naver_id: string;
  message: string;
  status: string;
  applied_at: string;
  accepted_at: string | null;
  influencer: {
    display_name: string;
    subscriber_count: number;
    category: string;
    image_url: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '임시저장', active: '모집중', closed: '마감', completed: '완료', canceled: '취소',
};
const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-dim/10 text-dim', active: 'bg-up/10 text-up', closed: 'bg-gold/10 text-gold',
  completed: 'bg-accent/10 text-accent', canceled: 'bg-down/10 text-down',
};
const TYPE_LABEL: Record<string, string> = { review: '리뷰', experience: '체험단', sponsored: '협찬' };
const APP_STATUS_LABEL: Record<string, string> = {
  pending: '대기중', accepted: '수락', rejected: '거절', completed: '완료', canceled: '취소',
};
const APP_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-gold/10 text-gold', accepted: 'bg-up/10 text-up', rejected: 'bg-down/10 text-down',
  completed: 'bg-accent/10 text-accent', canceled: 'bg-dim/10 text-dim',
};

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { advertiser } = useAdAuth();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState({ total: 0, pending: 0, accepted: 0, rejected: 0, completed: 0 });
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const getHeaders = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, []);

  useEffect(() => {
    if (!advertiser.id) return;

    const fetchData = async () => {
      try {
        const headers = await getHeaders();

        const [campRes, appsRes] = await Promise.all([
          fetch(`/api/ad/campaigns/${id}`, { headers }),
          fetch(`/api/ad/campaigns/${id}/applications`, { headers }),
        ]);

        if (campRes.ok) {
          const data = await campRes.json();
          setCampaign(data.campaign);
          setStats(data.stats);
        }
        if (appsRes.ok) {
          const data = await appsRes.json();
          setApplications(data.applications || []);
        }
      } catch {
        // 조회 실패
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [advertiser.id, id, getHeaders]);

  const handleStatusChange = async (newStatus: string) => {
    if (!confirm(`캠페인을 "${STATUS_LABEL[newStatus]}" 상태로 변경하시겠습니까?`)) return;
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/ad/campaigns/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCampaign(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch { /* 실패 */ }
  };

  const handleDelete = async () => {
    if (!confirm('이 캠페인을 삭제하시겠습니까?')) return;
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/ad/campaigns/${id}`, { method: 'DELETE', headers });
      if (res.ok) router.push('/ad/campaign');
    } catch { /* 실패 */ }
  };

  const handleApplicationAction = async (appId: string, status: 'accepted' | 'rejected') => {
    setActionLoading(appId);
    try {
      const headers = await getHeaders();
      const res = await fetch(`/api/ad/campaigns/${id}/applications/${appId}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setApplications(prev => prev.map(a => a.id === appId ? { ...a, status } : a));
        setStats(prev => ({
          ...prev,
          pending: prev.pending - 1,
          [status]: (prev[status as keyof typeof prev] as number) + 1,
        }));
      }
    } catch { /* 실패 */ } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12">
        <p className="text-dim mb-4">캠페인을 찾을 수 없습니다</p>
        <Link href="/ad/campaign" className="text-accent hover:underline text-sm">목록으로</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2">
        <Link href="/ad/campaign" className="text-xs text-dim hover:text-accent transition">캠페인</Link>
        <span className="text-xs text-dim">/</span>
        <span className="text-xs text-accent font-semibold truncate">{campaign.title}</span>
      </div>

      {/* 캠페인 정보 */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[campaign.status]}`}>
                {STATUS_LABEL[campaign.status]}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                {TYPE_LABEL[campaign.campaign_type]}
              </span>
              {campaign.category && <span className="text-[10px] text-dim">{campaign.category}</span>}
              {campaign.region && <span className="text-[10px] text-dim">{campaign.region}</span>}
            </div>
            <h1 className="text-xl font-extrabold">{campaign.title}</h1>
          </div>
          {campaign.fee_per_post > 0 && (
            <p className="text-lg font-bold text-accent shrink-0">{campaign.fee_per_post.toLocaleString()}원</p>
          )}
        </div>

        {campaign.description && (
          <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{campaign.description}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-bg rounded-xl p-3 text-center">
            <p className="text-[10px] text-dim">모집</p>
            <p className="text-sm font-bold">{stats.accepted}/{campaign.max_participants}명</p>
          </div>
          <div className="bg-bg rounded-xl p-3 text-center">
            <p className="text-[10px] text-dim">신청</p>
            <p className="text-sm font-bold">{stats.total}명</p>
          </div>
          <div className="bg-bg rounded-xl p-3 text-center">
            <p className="text-[10px] text-dim">마감일</p>
            <p className="text-sm font-bold">{campaign.deadline || '-'}</p>
          </div>
          <div className="bg-bg rounded-xl p-3 text-center">
            <p className="text-[10px] text-dim">포스팅 기한</p>
            <p className="text-sm font-bold">{campaign.posting_deadline || '-'}</p>
          </div>
        </div>

        {campaign.requirements && (
          <div className="bg-bg rounded-xl p-4">
            <p className="text-xs font-semibold text-dim mb-1">참여 조건</p>
            <p className="text-sm text-text whitespace-pre-wrap">{campaign.requirements}</p>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-2 pt-2 flex-wrap">
          {campaign.status === 'draft' && (
            <>
              <button onClick={() => handleStatusChange('active')}
                className="px-4 py-2 bg-up text-white text-sm font-bold rounded-lg hover:bg-up/90 transition cursor-pointer">
                모집 시작
              </button>
              <Link href={`/ad/campaign/${id}/edit`}
                className="px-4 py-2 border border-border text-sm font-bold rounded-lg hover:bg-bg transition">
                수정
              </Link>
              <button onClick={handleDelete}
                className="px-4 py-2 text-down text-sm font-bold rounded-lg hover:bg-down/5 transition cursor-pointer">
                삭제
              </button>
            </>
          )}
          {campaign.status === 'active' && (
            <>
              <button onClick={() => handleStatusChange('closed')}
                className="px-4 py-2 bg-gold text-white text-sm font-bold rounded-lg hover:bg-gold/90 transition cursor-pointer">
                모집 마감
              </button>
              <Link href={`/ad/campaign/${id}/edit`}
                className="px-4 py-2 border border-border text-sm font-bold rounded-lg hover:bg-bg transition">
                수정
              </Link>
            </>
          )}
          {campaign.status === 'closed' && (
            <button onClick={() => handleStatusChange('completed')}
              className="px-4 py-2 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer">
              완료 처리
            </button>
          )}
        </div>
      </div>

      {/* 신청 목록 */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <h2 className="font-bold text-base mb-4">
          신청 목록 <span className="text-dim font-normal text-sm">({stats.total})</span>
        </h2>

        {applications.length === 0 ? (
          <p className="text-sm text-dim text-center py-6">아직 신청이 없습니다</p>
        ) : (
          <div className="space-y-3">
            {applications.map(app => (
              <div key={app.id} className="flex items-center justify-between gap-4 p-4 bg-bg rounded-xl">
                <div className="flex items-center gap-3 min-w-0">
                  {app.influencer?.image_url ? (
                    <img src={app.influencer.image_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                      {app.influencer?.display_name?.charAt(0) || app.naver_id.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/influencers/${app.naver_id}`} className="font-bold text-sm text-text hover:text-accent truncate">
                        {app.influencer?.display_name || app.naver_id}
                      </Link>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${APP_STATUS_COLOR[app.status]}`}>
                        {APP_STATUS_LABEL[app.status]}
                      </span>
                    </div>
                    <p className="text-[11px] text-dim">
                      {app.influencer?.category || ''} {app.influencer ? `| 팬수 ${formatCount(app.influencer.subscriber_count)}` : ''}
                    </p>
                    {app.message && <p className="text-[11px] text-dim mt-0.5 truncate">{app.message}</p>}
                  </div>
                </div>

                {app.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleApplicationAction(app.id, 'accepted')}
                      disabled={actionLoading === app.id}
                      className="px-3 py-1.5 bg-up text-white text-xs font-bold rounded-lg hover:bg-up/90 transition cursor-pointer disabled:opacity-50">
                      수락
                    </button>
                    <button onClick={() => handleApplicationAction(app.id, 'rejected')}
                      disabled={actionLoading === app.id}
                      className="px-3 py-1.5 border border-down/30 text-down text-xs font-bold rounded-lg hover:bg-down/5 transition cursor-pointer disabled:opacity-50">
                      거절
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
