'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import Modal from '@/components/ui/Modal';

const DEFAULT_FALLBACKS = ['', 'N사용자'];

function needsNickname(nickname?: string | null) {
  if (nickname == null) return true;
  const trimmed = nickname.trim();
  return DEFAULT_FALLBACKS.includes(trimmed);
}

export default function NicknameRequiredModal() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shouldShow = !!user && !!user.authId && !user.isAdmin && needsNickname(user.nickname);

  // 대상 외: 비로그인, Supabase Auth 가입자 아님, 관리자, 닉네임 정상
  if (!shouldShow) return null;

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    if (trimmed.length > 20) {
      setError('닉네임은 20자 이하로 입력해주세요.');
      return;
    }
    if (DEFAULT_FALLBACKS.includes(trimmed)) {
      setError('다른 닉네임을 입력해주세요.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // getSession() 는 hang 가능성이 있어 제거. getAuthUser 가 쿠키 폴백을 지원하므로
      // credentials: 'include' 로 Supabase SSR 쿠키만 동반 전송해도 인증 가능.
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nickname: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '닉네임 저장에 실패했습니다.');
        setSaving(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setValue('');
      setSaving(false);
    } catch {
      setError('네트워크 오류가 발생했습니다.');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {}}
      closeOnBackdrop={false}
      trapFocus
      overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4"
    >
      <div
        className="bg-surface rounded-lg border border-border shadow-xl w-full max-w-md p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-modal-title"
      >
        <h3 id="nickname-modal-title" className="font-bold text-base mb-2">
          닉네임을 입력해주세요
        </h3>
        <p className="text-xs text-dim leading-relaxed mb-4">
          서비스 이용을 위해 닉네임 등록이 필요합니다. 댓글·쪽지·커뮤니티에서 다른 회원에게
          표시되는 이름이며, 마이페이지에서 언제든 변경할 수 있습니다.
        </p>

        <label className="block text-xs font-semibold text-text mb-1.5">닉네임</label>
        <input
          type="text"
          value={value}
          onChange={e => {
            setValue(e.target.value.slice(0, 20));
            if (error) setError(null);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !saving) handleSave();
          }}
          placeholder="예: 오렌지도서관"
          maxLength={20}
          autoFocus
          className="w-full px-3 py-2.5 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
        />
        <div className="flex items-center justify-between mt-1 mb-4 min-h-[16px]">
          <span className="text-[11px] text-dim">{value.length} / 20</span>
          {error && <span className="text-xs font-semibold text-down">{error}</span>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={logout}
            disabled={saving}
            className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            로그아웃
          </button>
          <button
            onClick={handleSave}
            disabled={!value.trim() || saving}
            className="flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {saving ? '저장 중...' : '저장하고 계속하기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
