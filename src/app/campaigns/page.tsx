'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface Campaign {
  id: string;
  title: string;
  description: string;
  category: string;
  region: string;
  campaign_type: string;
  fee_per_post: number;
  max_participants: number;
  deadline: string | null;
  posting_deadline: string | null;
  requirements: string;
  advertiser: { company_name: string } | null;
  acceptedCount: number;
}

const TYPE_LABEL: Record<string, string> = { review: '리뷰', experience: '체험단', sponsored: '협찬' };

export default function CampaignBrowsePage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const res = await fetch('/api/campaigns');
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns || []);
          if (data.appliedCampaignIds) {
            setAppliedIds(new Set(data.appliedCampaignIds));
          }
        }
      } catch { /* 조회 실패 */ } finally {
        setLoading(false);
      }
    };
    fetchCampaigns();
  }, []);

  const handleApply = async (campaignId: string) => {
    if (!user.id) return;
    setApplyingId(campaignId);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch(`/api/campaigns/${campaignId}/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
      });

      if (res.ok) {
        setAppliedIds(prev => new Set([...prev, campaignId]));
        setMessage('');
      } else {
        const data = await res.json();
        alert(data.error || '신청에 실패했습니다.');
      }
    } catch { /* 실패 */ } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="type-page-title">캠페인 모집</h1>
        <p className="text-sm text-dim mt-1">광고주가 등록한 체험단/리뷰/협찬 캠페인에 참여하세요</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-lg">
          <p className="text-dim">현재 모집중인 캠페인이 없습니다</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(c => (
            <div key={c.id} className="bg-surface border border-border rounded-lg p-5 hover:border-accent/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-up/10 text-up">모집중</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                      {TYPE_LABEL[c.campaign_type] || c.campaign_type}
                    </span>
                    {c.category && <span className="text-[10px] text-dim">{c.category}</span>}
                    {c.region && <span className="text-[10px] text-dim">{c.region}</span>}
                  </div>
                  <h3 className="font-bold text-sm mb-1">{c.title}</h3>
                  {c.advertiser && (
                    <p className="text-[11px] text-dim">{c.advertiser.company_name}</p>
                  )}
                </div>
                {c.fee_per_post > 0 && (
                  <p className="text-base font-bold text-accent shrink-0">{c.fee_per_post.toLocaleString()}원</p>
                )}
              </div>

              {c.description && (
                <p className="text-sm text-text mt-3 leading-relaxed line-clamp-2">{c.description}</p>
              )}

              <div className="flex items-center gap-4 mt-3 text-[11px] text-dim">
                <span>모집 {c.acceptedCount}/{c.max_participants}명</span>
                {c.deadline && <span>마감: {c.deadline}</span>}
                {c.posting_deadline && <span>포스팅 기한: {c.posting_deadline}</span>}
              </div>

              {c.requirements && (
                <div className="mt-3 bg-bg rounded-lg p-3">
                  <p className="text-[11px] text-dim"><span className="font-semibold">참여 조건:</span> {c.requirements}</p>
                </div>
              )}

              <div className="mt-4">
                {!user.id ? (
                  <Link href="/auth/login" className="text-xs text-accent font-semibold hover:underline">
                    로그인 후 신청 가능
                  </Link>
                ) : appliedIds.has(c.id) ? (
                  <span className="text-xs text-up font-semibold">신청 완료</span>
                ) : (
                  <button onClick={() => handleApply(c.id)} disabled={applyingId === c.id}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg transition cursor-pointer disabled:opacity-50">
                    {applyingId === c.id ? '신청 중...' : '신청하기'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
