'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdAuth } from '@/hooks/useAdAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const CATEGORIES = [
  '뷰티', '패션', '맛집', '여행', '육아', '건강', '도서',
  'IT/테크', '반려동물', '인테리어', '부동산', '자동차', '교육', '엔터테인먼트', '기타',
];

export default function CampaignNewPage() {
  const { advertiser } = useAdAuth();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [campaignType, setCampaignType] = useState('review');
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [feePerPost, setFeePerPost] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('1');
  const [deadline, setDeadline] = useState('');
  const [postingDeadline, setPostingDeadline] = useState('');
  const [requirements, setRequirements] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!advertiser.id) {
    return (
      <div className="text-center py-12">
        <p className="text-dim mb-4">로그인이 필요합니다</p>
        <Link href="/ad/login" className="text-accent hover:underline text-sm">로그인</Link>
      </div>
    );
  }

  const handleSubmit = async (status: 'draft' | 'active') => {
    setError('');
    if (!title.trim()) return setError('캠페인명을 입력해주세요.');

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch('/api/ad/campaigns', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title.trim(),
          campaignType,
          category,
          region: region.trim(),
          description: description.trim(),
          feePerPost: feePerPost ? parseInt(feePerPost.replace(/,/g, '')) : 0,
          maxParticipants: parseInt(maxParticipants) || 1,
          deadline: deadline || undefined,
          postingDeadline: postingDeadline || undefined,
          requirements: requirements.trim(),
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '캠페인 생성에 실패했습니다.');
        return;
      }

      const data = await res.json();
      router.push(`/ad/campaign/${data.campaignId}`);
    } catch {
      setError('오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleFeeChange = (val: string) => {
    const digits = val.replace(/[^0-9]/g, '');
    if (digits) {
      setFeePerPost(parseInt(digits).toLocaleString());
    } else {
      setFeePerPost('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/ad/campaign" className="text-xs text-dim hover:text-accent transition">캠페인</Link>
          <span className="text-xs text-dim">/</span>
          <span className="text-xs text-accent font-semibold">새 캠페인</span>
        </div>
        <h1 className="text-xl font-extrabold">캠페인 등록</h1>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
        <div>
          <label className="text-xs font-semibold text-dim block mb-1.5">캠페인명 *</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: [뷰티] 신제품 체험 리뷰어 모집" maxLength={200}
            className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
        </div>

        <div>
          <label className="text-xs font-semibold text-dim block mb-1.5">캠페인 유형</label>
          <div className="flex gap-3">
            {[
              { value: 'review', label: '리뷰' },
              { value: 'experience', label: '체험단' },
              { value: 'sponsored', label: '협찬' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="campaignType" value={opt.value}
                  checked={campaignType === opt.value}
                  onChange={e => setCampaignType(e.target.value)}
                  className="w-4 h-4 accent-accent cursor-pointer" />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">카테고리</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition">
              <option value="">선택</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">지역 (선택)</label>
            <input type="text" value={region} onChange={e => setRegion(e.target.value)} placeholder="전국, 서울, 부산..."
              className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-dim block mb-1.5">캠페인 설명</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="캠페인에 대한 상세 설명을 입력해주세요" rows={4} maxLength={5000}
            className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">건당 원고료 (원)</label>
            <input type="text" value={feePerPost} onChange={e => handleFeeChange(e.target.value)} placeholder="50,000"
              className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">모집 인원</label>
            <input type="number" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} min={1} max={1000}
              className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">모집 마감일</label>
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">포스팅 기한</label>
            <input type="date" value={postingDeadline} onChange={e => setPostingDeadline(e.target.value)}
              className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-dim block mb-1.5">참여 조건</label>
          <textarea value={requirements} onChange={e => setRequirements(e.target.value)}
            placeholder="예: 팬수 1,000명 이상, 뷰티 카테고리 활동중인 인플루언서" rows={3} maxLength={2000}
            className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition resize-none" />
        </div>

        {error && (
          <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">{error}</div>
        )}

        {feePerPost && maxParticipants && (
          <div className="bg-bg rounded-xl p-4">
            <p className="text-xs text-dim">예상 총 예산: <span className="font-bold text-text">
              {(parseInt(feePerPost.replace(/,/g, '') || '0') * parseInt(maxParticipants || '0')).toLocaleString()}원
            </span></p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={() => handleSubmit('draft')} disabled={loading}
            className="flex-1 py-3 border border-border text-dim font-bold rounded-xl hover:bg-bg transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? '저장 중...' : '임시저장'}
          </button>
          <button onClick={() => handleSubmit('active')} disabled={loading}
            className="flex-1 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? '등록 중...' : '등록하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
