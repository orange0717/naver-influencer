'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useNotificationSettings } from '@/hooks/useNotifications';
import SavedKeywords from '@/components/dashboard/SavedKeywords';

interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  point_balance: number;
  total_charged: number;
  total_used: number;
  linked_influencer_id: string | null;
  blog_id: string | null;
  created_at: string;
}

interface LinkedInfluencer {
  display_name: string;
  naver_id: string;
}

interface Transaction {
  amount: number;
  tx_type: string;
  description: string;
  created_at: string;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-text">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${checked ? 'bg-accent' : 'bg-border'}`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

function NotificationSettingsSection() {
  const { settings, isLoading, updateSettings } = useNotificationSettings();

  if (isLoading || !settings) return null;

  const handleChange = (key: string, value: boolean) => {
    updateSettings({ [key]: value });
  };

  return (
    <div id="notification-settings" className="bg-surface rounded-xl border border-border p-5">
      <h3 className="font-bold text-sm mb-3">알림 설정</h3>
      <div className="space-y-2">
        <p className="text-xs text-dim mb-2">알림 채널</p>
        <ToggleRow label="이메일 알림" checked={settings.email_enabled} onChange={(v) => handleChange('email_enabled', v)} />
        <ToggleRow label="카카오 알림톡" checked={settings.kakao_enabled} onChange={(v) => handleChange('kakao_enabled', v)} />
        <ToggleRow label="인앱 알림" checked={settings.in_app_enabled} onChange={(v) => handleChange('in_app_enabled', v)} />

        <hr className="border-border my-2" />

        <p className="text-xs text-dim mb-2">알림 유형</p>
        <ToggleRow label="TOP3 진입 알림" checked={settings.notify_top3_entry} onChange={(v) => handleChange('notify_top3_entry', v)} />
        <ToggleRow label="TOP3 이탈 알림" checked={settings.notify_top3_exit} onChange={(v) => handleChange('notify_top3_exit', v)} />
        <ToggleRow label="순위 큰 변동 알림 (3단계 이상)" checked={settings.notify_significant_change} onChange={(v) => handleChange('notify_significant_change', v)} />
      </div>
    </div>
  );
}

/** SNS 입력 필드 */
function SnsInput({ label, icon, value, onChange, placeholder }: {
  label: string; icon: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 text-center text-base shrink-0">{icon}</span>
      <div className="flex-1">
        <label className="text-xs text-dim font-semibold block mb-1">{label}</label>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={200}
          className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
        />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [linkedInfluencer, setLinkedInfluencer] = useState<LinkedInfluencer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [toast, setToast] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 광고 프로필
  const [adFeeAmount, setAdFeeAmount] = useState<number | null>(null);
  const [adFeeText, setAdFeeText] = useState('');
  const [adProcess, setAdProcess] = useState('');
  const [adSchedule, setAdSchedule] = useState('');
  const [adSaving, setAdSaving] = useState(false);

  // 블로그 주소
  const [blogIdInput, setBlogIdInput] = useState('');
  const [blogIdSaving, setBlogIdSaving] = useState(false);

  // SNS 링크
  const [snsInstagram, setSnsInstagram] = useState('');
  const [snsYoutube, setSnsYoutube] = useState('');
  const [snsX, setSnsX] = useState('');
  const [snsTiktok, setSnsTiktok] = useState('');
  const [snsThreads, setSnsThreads] = useState('');
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
      setTransactions(data.transactions || []);
      setNicknameInput(data.user.nickname);
      setBlogIdInput(data.user.blog_id || '');
      if (data.ad_profile) {
        setAdFeeAmount(data.ad_profile.ad_fee_amount ?? null);
        setAdFeeText(data.ad_profile.ad_fee_text || '');
        setAdProcess(data.ad_profile.ad_process || '');
        setAdSchedule(data.ad_profile.ad_schedule || '');
        setSnsInstagram(data.ad_profile.sns_instagram || '');
        setSnsYoutube(data.ad_profile.sns_youtube || '');
        setSnsX(data.ad_profile.sns_x || '');
        setSnsTiktok(data.ad_profile.sns_tiktok || '');
      }
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

  const saveBlogId = async () => {
    if (!user) return;
    setBlogIdSaving(true);

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    // URL에서 blog ID 추출
    let blogId = blogIdInput.trim();
    const urlMatch = blogId.match(/(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9._-]+)/);
    if (urlMatch) blogId = urlMatch[1].toLowerCase();
    blogId = blogId.replace(/^@/, '').toLowerCase();

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

  const saveAdProfile = async () => {
    if (!user) return;
    setAdSaving(true);

    const supabase = createSupabaseBrowserClient();
    const token = (await supabase.auth.getSession()).data.session?.access_token;

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ad_fee_amount: adFeeAmount,
        ad_fee_text: adFeeText.trim(),
        ad_process: adProcess.trim(),
        ad_schedule: adSchedule.trim(),
      }),
    });

    if (res.ok) {
      showToast('광고 프로필이 저장되었습니다.');
    } else {
      const data = await res.json();
      showToast(data.error || '저장에 실패했습니다.');
    }
    setAdSaving(false);
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

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleteLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const token = (await supabase.auth.getSession()).data.session?.access_token;

      const res = await fetch('/api/profile', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        await supabase.auth.signOut();
        await fetch('/api/auth/logout', { method: 'POST' });
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
      <h1 className="text-xl font-bold">마이페이지</h1>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-accent/50 text-text px-5 py-3 rounded-xl shadow-lg text-sm font-semibold animate-pulse">
          {toast}
        </div>
      )}

      {/* 기본 정보 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-accent/20 rounded-full flex items-center justify-center text-xl font-bold text-accent">
            {user.nickname[0]}
          </div>
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
            <p className="text-sm text-dim">{user.email}</p>
            <p className="text-xs text-dim">가입일: {new Date(user.created_at).toLocaleDateString('ko-KR')}</p>
          </div>
        </div>
      </div>

      {/* 인플루언서 연결 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
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
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <h3 className="font-bold text-sm">블로그 주소</h3>
        <div className="flex items-center bg-bg border border-border rounded-xl overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30 transition">
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
      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
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

      {/* 광고 프로필 */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <div>
          <h3 className="font-bold text-sm">광고 프로필</h3>
          <p className="text-xs text-dim mt-1">광고단가와 진행방법을 등록하면 프로필에 표시됩니다.</p>
        </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-dim font-semibold block mb-1">광고단가 (원고료)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dim">&#8361;</span>
                <input
                  type="number"
                  value={adFeeAmount ?? ''}
                  onChange={e => setAdFeeAmount(e.target.value ? Math.max(0, parseInt(e.target.value)) : null)}
                  placeholder="예: 30000"
                  min="0"
                  max="99999999"
                  className="w-full pl-8 pr-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-dim font-semibold block mb-1">단가 설명 <span className="text-dim font-normal">(선택)</span></label>
              <input
                type="text"
                value={adFeeText}
                onChange={e => setAdFeeText(e.target.value)}
                placeholder="예: 협의 가능, 키워드에 따라 상이"
                maxLength={200}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div>
              <label className="text-xs text-dim font-semibold block mb-1">광고 가능 일정 <span className="text-dim font-normal">(선택)</span></label>
              <input
                type="text"
                value={adSchedule}
                onChange={e => setAdSchedule(e.target.value)}
                placeholder="예: 주 2건 가능, 현재 1건 진행 중, 5월부터 가능"
                maxLength={500}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div>
              <label className="text-xs text-dim font-semibold block mb-1">진행방법 <span className="text-dim font-normal">(선택)</span></label>
              <textarea
                value={adProcess}
                onChange={e => setAdProcess(e.target.value)}
                placeholder="예: 키워드 협의 후 원고 작성, 검수 1회 포함, 발행 후 30일 유지"
                maxLength={1000}
                rows={3}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors resize-none"
              />
              <p className="text-xs text-dim text-right mt-0.5">{adProcess.length}/1000</p>
            </div>

            <button
              onClick={saveAdProfile}
              disabled={adSaving}
              className="px-4 py-2 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
            >
              {adSaving ? '저장 중...' : '광고 프로필 저장'}
            </button>
          </div>
      </div>

      {/* 알림 설정 */}
      <NotificationSettingsSection />

      {/* 저장된 키워드 */}
      <SavedKeywords />

      {/* 사용 내역 */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-sm">최근 사용 내역</h3>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-dim text-sm">사용 내역이 없습니다.</div>
        ) : (
          <>
            {/* Desktop */}
            <table className="w-full text-sm hidden sm:table">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">내역</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-dim text-xs">포인트</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-dim text-xs">날짜</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((h, idx) => (
                  <tr key={idx} className="border-b border-border/50">
                    <td className="py-3 px-4 text-sm">{h.description}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`font-bold text-sm font-rank ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                        {h.amount > 0 ? '+' : ''}{h.amount}P
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-xs text-dim">
                      {new Date(h.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-border/50">
              {transactions.map((h, idx) => (
                <div key={idx} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm">{h.description}</p>
                    <p className="text-xs text-dim">
                      {new Date(h.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`font-bold text-sm font-rank ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                    {h.amount > 0 ? '+' : ''}{h.amount}P
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
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-surface rounded-2xl border border-border p-6 max-w-sm mx-4 shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 id="delete-modal-title" className="text-lg font-extrabold text-text">회원 탈퇴</h3>
            <div className="space-y-2 text-sm text-dim">
              <p>정말 탈퇴하시겠습니까?</p>
              <p>탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.</p>
              <ul className="list-disc pl-5 text-xs space-y-1 mt-2">
                <li>계정 정보 및 프로필</li>
                <li>포인트 잔액 및 거래 내역</li>
              </ul>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-surface-hover text-text rounded-xl font-semibold text-sm cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="flex-1 py-2.5 bg-down text-white rounded-xl font-semibold text-sm hover:bg-down/80 transition cursor-pointer disabled:opacity-50"
              >
                {deleteLoading ? '처리 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
