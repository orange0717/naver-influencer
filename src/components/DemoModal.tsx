'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';

interface DemoModalProps {
  open: boolean;
  onClose: () => void;
}

function extractNaverId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9._-]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return trimmed.replace(/^@/, '').toLowerCase();
}

function extractBlogId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9._-]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return trimmed.replace(/^@/, '').toLowerCase();
}

export default function DemoModal({ open, onClose }: DemoModalProps) {
  const [naverInput, setNaverInput] = useState('');
  const [blogInput, setBlogInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setNaverInput('');
    setBlogInput('');
    setError('');
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!naverInput.trim() && !blogInput.trim()) {
      setError('인플루언서홈 또는 블로그 주소를 입력해주세요.');
      return;
    }
    const naverId = naverInput.trim() ? extractNaverId(naverInput) : '';
    const blogId = blogInput.trim() ? extractBlogId(blogInput) : '';
    setError('');
    setLoading(true);
    // GET 리다이렉트 방식: 쿠키 설정 + /my 이동을 한 번에 처리
    const params = new URLSearchParams();
    if (naverId) params.set('naverId', naverId);
    if (blogId) params.set('blogId', blogId);
    window.location.href = `/api/auth/demo/start?${params.toString()}`;
  }

  return (
    <Modal open={open} onClose={handleClose} overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 백드롭 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 모달 */}
      <div className="relative bg-bg rounded-2xl border border-border shadow-xl w-full max-w-md p-8">
        <form onSubmit={handleStart}>
          {/* 배지 */}
          <div className="text-center mb-6">
            <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent text-xs font-bold rounded-full">
              7일 무료
            </span>
          </div>

          <h2 className="text-lg font-bold text-text text-center mb-2">
            7일 데모체험을 시작하시겠습니까?
          </h2>
          <p className="text-sm text-dim text-center mb-6 leading-relaxed">
            인플루언서홈 또는 블로그 주소를 입력하면<br />
            7일간 핵심 기능을 무료로 이용할 수 있습니다.
          </p>
          <p className="text-xs text-dim/80 text-center mb-8 leading-relaxed">
            ※ 맞춤법 검사·블로그 글 피드백 등 Claude AI 기능은<br />
            데모 체험에서 제외되며 가입 후 이용 가능합니다.
          </p>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">인플루언서홈 주소</label>
              <div className="flex items-center bg-surface border border-border rounded-xl overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
                <span className="px-3 text-sm text-dim shrink-0 border-r border-border bg-border/30">
                  in.naver.com/
                </span>
                <input
                  type="text"
                  value={naverInput}
                  onChange={e => { setNaverInput(e.target.value); setError(''); }}
                  placeholder="아이디"
                  className="flex-1 px-3 py-3 bg-transparent text-sm text-text placeholder:text-dim/60 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">블로그 주소</label>
              <div className="flex items-center bg-surface border border-border rounded-xl overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
                <span className="px-3 text-sm text-dim shrink-0 border-r border-border bg-border/30">
                  blog.naver.com/
                </span>
                <input
                  type="text"
                  value={blogInput}
                  onChange={e => { setBlogInput(e.target.value); setError(''); }}
                  placeholder="블로그 아이디"
                  className="flex-1 px-3 py-3 bg-transparent text-sm text-text placeholder:text-dim/60 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-down text-center mb-4">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-semibold text-dim hover:bg-surface transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition disabled:opacity-50"
            >
              {loading ? '확인 중...' : '데모 시작'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
