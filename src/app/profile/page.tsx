'use client';
import Modal from '@/components/ui/Modal';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { clearUserScopedLocalStorage } from '@/lib/clear-user-storage';
import UsagePeriodCard from '@/components/dashboard/UsagePeriodCard';
import { extractBlogId } from '@/lib/blog-utils';
import type { UserProfile, LinkedInfluencer } from './page.helpers';
import { NotificationSettingsSection, SnsInput } from './page.helpers';

type CreditTx = {
  amount: number;
  balanceAfter: number;
  type: string;
  label: string;
  createdAt: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [linkedInfluencer, setLinkedInfluencer] = useState<LinkedInfluencer | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditTx, setCreditTx] = useState<CreditTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [withdrawalReason, setWithdrawalReason] = useState('');

  // 프로모션 코드
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoResult, setPromoResult] = useState<{ success: boolean; label?: string; expires_at?: string; error?: string } | null>(null);

  // 쿠폰 등록
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponResult, setCouponResult] = useState<{ success: boolean; plan?: string; expiresAt?: string; error?: string } | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<{ code: string; name: string; plan: string; duration_days: number }[]>([]);

  // 블로그 주소
  const [blogIdInput, setBlogIdInput] = useState('');
  const [blogIdSaving, setBlogIdSaving] = useState(false);

  // SNS 링크
  const [snsInstagram, setSnsInstagram] = useState('');
  const [snsYoutube, setSnsYoutube] = useState('');
  const [snsX, setSnsX] = useState('');
  const [snsTiktok, setSnsTiktok] = useState('');
  const [snsSaving, setSnsSaving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const supabase = createSupabaseBrowserClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      router.push('/auth/login');
      return;
    }

    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      setUser(data.user);
      setLinkedInfluencer(data.linked_influencer);
      setNicknameInput(data.user.nickname);
      setEmailInput(data.user.email);
      setAvatarUrl(data.user.avatar_url || null);
      setBlogIdInput(data.user.blog_id || '');
      if (data.ad_profile) {
        setSnsInstagram(data.ad_profile.sns_instagram || '');
        setSnsYoutube(data.ad_profile.sns_youtube || '');
        setSnsX(data.ad_profile.sns_x || '');
        setSnsTiktok(data.ad_profile.sns_tiktok || '');
      }
    }

    const couponsRes = await fetch('/api/coupons/available', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (couponsRes.ok) {
      const couponsData = await couponsRes.json();
      setAvailableCoupons(couponsData.items || []);
    }

    // 크레딧 잔액 + 거래 내역 (구독과 독립적인 사용량)
    const [balRes, txRes] = await Promise.all([
      fetch('/api/credits/balance', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/credits/transactions?limit=50', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (balRes.ok) {
      const balData = await balRes.json();
      setCreditBalance(typeof balData.balance === 'number' ? balData.balance : 0);
    }
    if (txRes.ok) {
      const txData = await txRes.json();
      setCreditTx(txData.transactions || []);
    }

    setLoading(false);
  }

  const saveNickname = async () => {
    const name = nicknameInput.trim();
    if (!name || !user) return;

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nickname: name }),
    });

    if (res.ok) {
      setUser(prev => prev ? { ...prev, nickname: name } : null);
      setEditingNickname(false);
      showToast('닉네임이 변경되었습니다.');
    }
  };

  const saveEmail = async () => {
    const email = emailInput.trim();
    if (!email || !user) return;

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      setUser(prev => prev ? { ...prev, email } : null);
      setEditingEmail(false);
      showToast('이메일이 변경되었습니다.');
    }
  };

  const saveBlogId = async () => {
    if (!user) return;
    setBlogIdSaving(true);

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    // URL에서 blog ID 추출
    const blogId = extractBlogId(blogIdInput);

    if (!blogId) {
      showToast('블로그 아이디를 입력해주세요.');
      setBlogIdSaving(false);
      return;
    }

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ blog_id: blogId }),
    });

    if (res.ok) {
      setUser(prev => prev ? { ...prev, blog_id: blogId } : null);
      setBlogIdInput(blogId);
      showToast('블로그 주소가 저장되었습니다.');
      // 블로그 주소 최초 입력 시 대시보드로 이동
      if (!user.blog_id) {
        setTimeout(() => router.push(`/my/blogger?blogId=${blogId}`), 500);
      }
    } else {
      showToast('블로그 주소 저장에 실패했습니다.');
    }
    setBlogIdSaving(false);
  };

  const unlinkInfluencer = async () => {
    if (!user) return;

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ unlink_influencer: true }),
    });

    if (res.ok) {
      setUser(prev => prev ? { ...prev, linked_influencer_id: null } : null);
      setLinkedInfluencer(null);
      showToast('인플루언서 계정 연결이 해제되었습니다.');
    }
  };

  const saveSnsLinks = async () => {
    if (!user) return;
    setSnsSaving(true);

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sns_instagram: snsInstagram.trim(),
        sns_youtube: snsYoutube.trim(),
        sns_x: snsX.trim(),
        sns_tiktok: snsTiktok.trim(),
      }),
    });

    if (res.ok) {
      showToast('SNS 링크가 저장되었습니다.');
    } else {
      const data = await res.json();
      showToast(data.error || '저장에 실패했습니다.');
    }
    setSnsSaving(false);
  };

  const applyPromoCode = async () => {
    if (!promoCode.trim() || promoLoading) return;
    setPromoLoading(true);
    setPromoResult(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const res = await fetch('/api/promo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: promoCode.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setPromoResult({ success: true, label: data.label, expires_at: data.expires_at });
        setPromoCode('');
        showToast(`${data.label} 적용 완료!`);
      } else {
        setPromoResult({ success: false, error: data.error });
      }
    } catch {
      setPromoResult({ success: false, error: '코드 적용 중 오류가 발생했습니다.' });
    } finally {
      setPromoLoading(false);
    }
  };

  const redeemCoupon = async (codeOverride?: string) => {
    const code = (codeOverride ?? couponCode).trim();
    if (!code || couponLoading) return;
    setCouponLoading(true);
    setCouponResult(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const res = await fetch('/api/coupons/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (res.ok) {
        setCouponResult({ success: true, plan: data.plan, expiresAt: data.expiresAt });
        setCouponCode('');
        setAvailableCoupons(prev => prev.filter(c => c.code !== code));
        setUser(prev => prev ? { ...prev, subscription_plan: data.plan, subscription_expires_at: data.expiresAt } : prev);
        showToast('쿠폰이 등록되었습니다!');
      } else {
        setCouponResult({ success: false, error: data.error });
      }
    } catch {
      setCouponResult({ success: false, error: '쿠폰 등록 중 오류가 발생했습니다.' });
    } finally {
      setCouponLoading(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const reason = withdrawalReason.trim();
    if (!reason) {
      showToast('탈퇴 사유를 입력해주세요.');
      return;
    }
    setDeleteLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const res = await fetch('/api/profile', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });

      if (res.ok) {
        await supabase.auth.signOut();
        await fetch('/api/auth/logout', { method: 'POST' });
        clearUserScopedLocalStorage();
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        showToast(data.error || '탈퇴 처리에 실패했습니다.');
      }
    } catch {
      showToast('탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-dim">
        로딩 중...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-dim mb-4">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="text-accent font-semibold">로그인하기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="type-page-title">마이페이지</h1>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-accent/50 text-text px-5 py-3 rounded-xl shadow-lg text-sm font-semibold animate-pulse">
          {toast}
        </div>
      )}

      {/* 기본 정보 */}
      <div className="bg-surface rounded-lg border border-border p-5 space-y-4">
        <div className="flex items-center gap-4">
          <label className="relative w-14 h-14 rounded-full cursor-pointer group shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="프로필" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <div className="w-14 h-14 bg-accent/20 rounded-full flex items-center justify-center text-xl font-bold text-accent">
                {user.nickname[0]}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { showToast('2MB 이하 이미지만 업로드 가능합니다.'); return; }
                setAvatarUploading(true);
                try {
                  const supabase = createSupabaseBrowserClient();
                  const session = await supabase.auth.getSession();
                  const token = session.data.session?.access_token || '';
                  const formData = new FormData();
                  formData.append('file', file);
                  const res = await fetch('/api/profile/avatar', {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: formData,
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || '업로드 실패');
                  setAvatarUrl(data.url);
                  showToast('프로필 사진이 변경되었습니다.');
                } catch (err) {
                  showToast('업로드 실패: ' + (err instanceof Error ? err.message : '오류'));
                } finally {
                  setAvatarUploading(false);
                }
              }}
              disabled={avatarUploading}
            />
            {avatarUploading && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </label>
          <div className="flex-1">
            {editingNickname ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={e => setNicknameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveNickname()}
                  className="flex-1 px-3 py-1.5 bg-bg border border-accent rounded-lg text-sm text-text focus:outline-none"
                  autoFocus
                />
                <button onClick={saveNickname}
                  className="px-3 py-1.5 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer">
                  저장
                </button>
                <button onClick={() => { setEditingNickname(false); setNicknameInput(user.nickname); }}
                  className="px-3 py-1.5 bg-surface-hover text-dim text-xs rounded-lg cursor-pointer">
                  취소
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold text-lg">{user.nickname}</p>
                <button onClick={() => setEditingNickname(true)}
                  className="text-xs text-dim border border-border rounded px-2 py-0.5 hover:border-accent/40 cursor-pointer">
                  편집
                </button>
              </div>
            )}
            {editingEmail ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveEmail()}
                  className="flex-1 px-3 py-1 bg-bg border border-accent rounded-lg text-sm text-text focus:outline-none"
                  autoFocus
                  placeholder="이메일 주소"
                />
                <button onClick={saveEmail}
                  className="px-3 py-1 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer">
                  저장
                </button>
                <button onClick={() => { setEditingEmail(false); setEmailInput(user.email); }}
                  className="px-3 py-1 bg-surface-hover text-dim text-xs rounded-lg cursor-pointer">
                  취소
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-dim">{user.email}</p>
                <button onClick={() => setEditingEmail(true)}
                  className="text-xs text-dim border border-border rounded px-2 py-0.5 hover:border-accent/40 cursor-pointer">
                  변경
                </button>
              </div>
            )}
            <p className="text-xs text-dim">가입일: {new Date(user.created_at).toLocaleDateString('ko-KR')}</p>
          </div>
        </div>
      </div>

      {/* 이용 기간 요약 카드 (가입일 / 이용권 만료까지) */}
      <UsagePeriodCard
        userCreatedAt={user.created_at}
        subscriptionExpiresAt={user.subscription_expires_at}
      />

      {/* 구독 등급 */}
      <div className="bg-surface rounded-lg border border-border p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm mb-1">이용권</h3>
            {user.subscription_plan ? (
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  user.subscription_plan === 'INFLUENCER'
                    ? 'bg-accent text-white'
                    : 'bg-accent/15 text-accent'
                }`}>
                  {user.subscription_plan === 'INFLUENCER' ? '인플루언서' : '블로거'}
                </span>
                {user.subscription_expires_at && (
                  <span className="text-xs text-dim">
                    ~{new Date(user.subscription_expires_at).toLocaleDateString('ko-KR')} 까지
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-dim">무료 플랜</p>
            )}
          </div>
          <Link
            href="/subscribe"
            className="text-xs text-accent font-semibold hover:underline"
          >
            {user.subscription_plan ? '플랜 변경' : '업그레이드'}
          </Link>
        </div>
      </div>

      {/* 인플루언서 연결 */}
      <div className="bg-surface rounded-lg border border-border p-5 space-y-4">
        <h3 className="font-bold text-sm">연결된 인플루언서</h3>
        {linkedInfluencer ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center font-bold text-accent">
                  {linkedInfluencer.display_name[0]}
                </div>
                <div>
                  <span className="font-medium">{linkedInfluencer.display_name}</span>
                  <p className="text-xs text-dim">in.naver.com/{linkedInfluencer.naver_id}</p>
                </div>
              </div>
              <Link href="/my" className="text-sm text-accent font-semibold shrink-0">대시보드 →</Link>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <Link href="/my/link" className="text-xs text-accent hover:underline">
                다른 인플루언서로 변경 →
              </Link>
              <button onClick={unlinkInfluencer}
                className="text-xs text-down border border-down/30 rounded px-2 py-1 hover:bg-down/10 transition cursor-pointer">
                연결 해제
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-dim">연결된 인플루언서가 없습니다.</p>
            <Link href="/my/link" className="block text-center py-3 bg-accent/12 rounded-lg text-accent font-semibold text-sm">
              인플루언서 계정 연결하기
            </Link>
          </div>
        )}
      </div>

      {/* 블로그 주소 */}
      <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h3 className="font-bold text-sm">블로그 주소</h3>
        <div className="flex items-center bg-bg border border-border rounded-lg overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30 transition">
          <span className="px-3 text-sm text-dim shrink-0 border-r border-border bg-border/30">
            blog.naver.com/
          </span>
          <input type="text" value={blogIdInput} onChange={e => setBlogIdInput(e.target.value)}
            placeholder="블로그 아이디"
            className="flex-1 px-3 py-2.5 bg-transparent text-sm text-text placeholder:text-dim/60 focus:outline-none" />
        </div>
        <p className="text-[11px] text-dim">블로그 대시보드에서 포스팅 순위를 확인하려면 입력해주세요.</p>
        <button
          onClick={saveBlogId}
          disabled={blogIdSaving}
          className="px-4 py-2 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
        >
          {blogIdSaving ? '저장 중...' : '블로그 주소 저장'}
        </button>
      </div>

      {/* SNS 링크 */}
      <div className="bg-surface rounded-lg border border-border p-5 space-y-4">
        <div>
          <h3 className="font-bold text-sm">SNS 링크</h3>
          <p className="text-xs text-dim mt-1">SNS 계정을 등록하면 프로필에 표시됩니다.</p>
        </div>

          <div className="space-y-3">
            <SnsInput
              label="Instagram"
              icon="IG"
              value={snsInstagram}
              onChange={setSnsInstagram}
              placeholder="아이디 또는 URL (예: myaccount)"
            />
            <SnsInput
              label="YouTube"
              icon="YT"
              value={snsYoutube}
              onChange={setSnsYoutube}
              placeholder="채널 아이디 또는 URL"
            />
            <SnsInput
              label="X (Twitter)"
              icon="X"
              value={snsX}
              onChange={setSnsX}
              placeholder="아이디 또는 URL (예: @myaccount)"
            />
            <SnsInput
              label="TikTok"
              icon="TT"
              value={snsTiktok}
              onChange={setSnsTiktok}
              placeholder="아이디 또는 URL (예: @myaccount)"
            />
          </div>

          <button
            onClick={saveSnsLinks}
            disabled={snsSaving}
            className="px-4 py-2 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
          >
            {snsSaving ? '저장 중...' : 'SNS 링크 저장'}
          </button>
      </div>

      {/* 프로모션 코드 */}
      <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h3 className="font-bold text-sm">프로모션 코드</h3>
        <p className="text-[11px] text-dim">프로모션 코드를 입력하면 유료 기능을 무료로 이용할 수 있습니다.</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null); }}
            onKeyDown={e => e.key === 'Enter' && applyPromoCode()}
            placeholder="코드 입력"
            maxLength={20}
            className="flex-1 px-3 py-2.5 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent transition-colors uppercase"
          />
          <button
            onClick={applyPromoCode}
            disabled={promoLoading || !promoCode.trim()}
            className="px-4 py-2.5 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 shrink-0"
          >
            {promoLoading ? '확인중...' : '적용'}
          </button>
        </div>
        {promoResult && (
          <p className={`text-xs ${promoResult.success ? 'text-up' : 'text-down'}`}>
            {promoResult.success
              ? `${promoResult.label} (만료: ${new Date(promoResult.expires_at!).toLocaleDateString('ko-KR')})`
              : promoResult.error}
          </p>
        )}
      </div>

      {/* 받은 쿠폰 (자동 노출) */}
      {availableCoupons.length > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-sm text-accent">회원님께 도착한 무료 체험 쿠폰이 있어요</h3>
          {availableCoupons.map(c => (
            <div key={c.code} className="flex items-center justify-between bg-surface rounded-lg p-3 gap-3">
              <div>
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="text-[11px] text-dim">
                  {c.plan === 'INFLUENCER' ? '인플루언서' : '블로거'} 플랜 · {c.duration_days}일 · <span className="font-mono">{c.code}</span>
                </p>
              </div>
              <button
                onClick={() => redeemCoupon(c.code)}
                disabled={couponLoading}
                className="px-4 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 shrink-0"
              >
                {couponLoading ? '등록중...' : '지금 등록하기'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 쿠폰 등록 */}
      <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h3 className="font-bold text-sm">쿠폰 등록</h3>
        <p className="text-[11px] text-dim">발급받은 무료 체험 쿠폰 코드를 입력하세요.</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={couponCode}
            onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponResult(null); }}
            onKeyDown={e => e.key === 'Enter' && redeemCoupon()}
            placeholder="쿠폰 코드 입력"
            maxLength={20}
            className="flex-1 px-3 py-2.5 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent transition-colors uppercase"
          />
          <button
            onClick={() => redeemCoupon()}
            disabled={couponLoading || !couponCode.trim()}
            className="px-4 py-2.5 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 shrink-0"
          >
            {couponLoading ? '등록중...' : '등록'}
          </button>
        </div>
        {couponResult && (
          <p className={`text-xs ${couponResult.success ? 'text-up' : 'text-down'}`}>
            {couponResult.success
              ? `${couponResult.plan === 'INFLUENCER' ? '인플루언서' : '블로거'} 플랜 적용 완료 (만료: ${new Date(couponResult.expiresAt!).toLocaleDateString('ko-KR')})`
              : couponResult.error}
          </p>
        )}
      </div>

      {/* 알림 설정 */}
      <NotificationSettingsSection />

      {/* 크레딧 잔액 (구독과 별개인 사용량) */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs text-dim">보유 크레딧</p>
            <p className="font-rank font-extrabold text-2xl text-text mt-0.5">
              {creditBalance === null ? '—' : creditBalance.toLocaleString()}
            </p>
            <p className="text-[11px] text-dim mt-1">AI·대량 분석 등 고비용 기능에 사용됩니다.</p>
          </div>
          <Link
            href="/subscribe"
            className="shrink-0 px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 transition"
          >
            크레딧 충전
          </Link>
        </div>
      </div>

      {/* 크레딧 사용 내역 */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-sm">최근 크레딧 내역</h3>
        </div>

        {creditTx.length === 0 ? (
          <div className="p-8 text-center text-dim text-sm">크레딧 내역이 없습니다.</div>
        ) : (
          <>
            {/* Desktop */}
            <table className="w-full text-sm hidden sm:table">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">내역</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-dim text-xs">크레딧</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-dim text-xs">잔액</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">날짜</th>
                </tr>
              </thead>
              <tbody>
                {creditTx.map((h, idx) => (
                  <tr key={idx} className="border-b border-border/50">
                    <td className="py-3 px-4 text-sm">{h.label}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold text-sm font-rank tabular-nums ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                        {h.amount > 0 ? '+' : ''}{h.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-dim font-rank tabular-nums">{h.balanceAfter.toLocaleString()}</td>
                    <td className="py-3 px-4 text-left text-xs text-dim tabular-nums">
                      {new Date(h.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-border/50">
              {creditTx.map((h, idx) => (
                <div key={idx} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm">{h.label}</p>
                    <p className="text-xs text-dim">
                      {new Date(h.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`font-bold text-sm font-rank tabular-nums ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                    {h.amount > 0 ? '+' : ''}{h.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 로그아웃 */}
      <div>
        <button onClick={handleLogout}
          className="w-full py-3 bg-surface border border-border text-dim rounded-xl font-semibold text-sm hover:border-accent/40 transition cursor-pointer">
          로그아웃
        </button>
      </div>

      {/* 회원 탈퇴 */}
      <div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-3 bg-surface border border-down/30 text-down rounded-xl font-semibold text-sm hover:bg-down/10 transition cursor-pointer"
        >
          회원 탈퇴
        </button>
      </div>

      {/* 탈퇴 확인 모달 */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setWithdrawalReason(''); }}
        closeOnEscape={!deleteLoading}
        closeOnBackdrop={!deleteLoading}
        trapFocus
        role="dialog"
        ariaModal
        ariaLabelledBy="delete-modal-title"
        overlayClassName="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      >
        <div className="bg-surface rounded-lg border border-border p-6 max-w-sm mx-4 shadow-lg space-y-4">
            <h3 id="delete-modal-title" className="text-lg font-extrabold text-text">회원 탈퇴</h3>
            <div className="space-y-2 text-sm text-dim">
              <p>정말 탈퇴하시겠습니까?</p>
              <p>탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.</p>
              <ul className="list-disc pl-5 text-xs space-y-1 mt-2">
                <li>계정 정보 및 프로필</li>
                <li>크레딧 잔액 및 거래 내역</li>
              </ul>
            </div>
            <div>
              <label className="text-xs text-dim font-semibold block mb-1">탈퇴 사유 <span className="text-down font-normal">(필수)</span></label>
              <textarea
                value={withdrawalReason}
                onChange={e => setWithdrawalReason(e.target.value)}
                placeholder="서비스 개선을 위해 탈퇴 사유를 알려주세요."
                maxLength={500}
                rows={3}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors resize-none"
              />
              <p className="text-xs text-dim text-right mt-0.5">{withdrawalReason.length}/500</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setWithdrawalReason(''); }}
                className="flex-1 py-2.5 bg-surface-hover text-text rounded-xl font-semibold text-sm cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || !withdrawalReason.trim()}
                className="flex-1 py-2.5 bg-down text-white rounded-xl font-semibold text-sm hover:bg-down/80 transition cursor-pointer disabled:opacity-50"
              >
                {deleteLoading ? '처리 중...' : '탈퇴하기'}
              </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
