'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAdAuth } from '@/hooks/useAdAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface Campaign {
  id: string;
  title: string;
  category: string;
  campaign_type: string;
  fee_per_post: number;
  max_participants: number;
  deadline: string | null;
  status: string;
  created_at: string;
  applicationCount: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '임시저장',
  active: '모집중',
  closed: '마감',
  completed: '완료',
  canceled: '취소',
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-dim/10 text-dim',
  active: 'bg-up/10 text-up',
  closed: 'bg-gold/10 text-gold',
  completed: 'bg-accent/10 text-accent',
  canceled: 'bg-down/10 text-down',
};

const TYPE_LABEL: Record<string, string> = {
  review: '리뷰',
  experience: '체험단',
  sponsored: '협찬',
};

export default function CampaignListPage() {
  const { advertiser, isLoading: authLoading } = useAdAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!advertiser.id) {
      setLoading(false);
      return;
    }

    const fetchCampaigns = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

        const url = filter ? `/api/ad/campaigns?status=${filter}` : '/api/ad/campaigns';
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = await res.json();
          setCampaigns(data.campaigns || []);
        }
      } catch {
        // 조회 실패
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, [advertiser.id, authLoading, filter]);

  // 비로그인 상태
  if (!authLoading && !advertiser.id) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="bg-surface border border-border rounded-2xl p-10">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-accent/10 flex items-center justify-center mb-5">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black mb-3">캠페인 관리</h1>
          <p className="text-dim leading-relaxed mb-6">
            체험단/리뷰 캠페인을 등록하고<br />
            인플루언서/블로거에게 자동으로 노출하세요.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/ad/login" className="px-6 py-3 border border-accent text-accent font-bold rounded-xl hover:bg-accent/5 transition text-sm">
              로그인
            </Link>
            <Link href="/ad/signup" className="px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-sm">
              광고주 회원가입
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">캠페인 관리</h1>
          <p className="text-sm text-dim mt-1">캠페인을 등록하고 신청을 관리하세요</p>
        </div>
        <Link href="/ad/campaign/new"
          className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white font-bold rounded-lg text-sm transition">
          캠페인 등록
        </Link>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: '', label: '전체' },
          { value: 'active', label: '모집중' },
          { value: 'draft', label: '임시저장' },
          { value: 'closed', label: '마감' },
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

      {/* 캠페인 목록 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-2xl">
          <p className="text-dim mb-4">등록된 캠페인이 없습니다</p>
          <Link href="/ad/campaign/new"
            className="inline-block px-5 py-2.5 bg-accent hover:bg-accent-hover text-white font-bold rounded-lg text-sm transition">
            첫 캠페인 등록하기
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map(c => (
            <Link key={c.id} href={`/ad/campaign/${c.id}`}
              className="bg-surface border border-border rounded-2xl p-5 hover:border-accent/40 transition-colors block">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status] || 'bg-dim/10 text-dim'}`}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                      {TYPE_LABEL[c.campaign_type] || c.campaign_type}
                    </span>
                    {c.category && (
                      <span className="text-[10px] text-dim">{c.category}</span>
                    )}
                  </div>
                  <h3 className="font-bold text-sm text-text truncate">{c.title}</h3>
                </div>
                <div className="text-right shrink-0">
                  {c.fee_per_post > 0 && (
                    <p className="text-sm font-bold text-accent">{c.fee_per_post.toLocaleString()}원</p>
                  )}
                  <p className="text-[11px] text-dim">
                    신청 {c.applicationCount}/{c.max_participants}명
                  </p>
                </div>
              </div>
              {c.deadline && (
                <p className="text-[11px] text-dim mt-2">마감일: {c.deadline}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
