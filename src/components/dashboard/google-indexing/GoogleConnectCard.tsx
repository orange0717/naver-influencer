'use client';

import { useState } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';

interface Props {
  connected: boolean;
  googleEmail: string | null;
  siteUrl: string | null;
  siteVerified: boolean;
  loading: boolean;
  onDisconnect: () => void;
}

function GoogleConnectGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base text-text">Google 계정 연결 전 안내</h3>
          <button onClick={onClose} className="text-dim hover:text-text transition cursor-pointer text-lg">&times;</button>
        </div>

        <div className="bg-bg rounded-lg px-3 py-2.5 mb-4 text-sm text-dim leading-relaxed space-y-1.5">
          <p>이 기능은 현재 테스트 버전으로 운영 중이라, 사전에 등록된 구글 계정만 연결할 수 있어요.</p>
          <p>등록되지 않은 계정으로 진행하면 구글 화면에서 <span className="font-semibold text-text">&quot;액세스 차단됨&quot;</span> 오류가 뜰 수 있어요. 이 경우 관리자에게 계정 등록을 요청해주세요.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer"
          >
            취소
          </button>
          <a
            href="/api/google-indexing/oauth/start"
            className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer"
          >
            확인하고 계속하기
          </a>
        </div>
      </div>
    </div>
  );
}

export default function GoogleConnectCard({ connected, googleEmail, siteUrl, siteVerified, loading, onDisconnect }: Props) {
  const [showGuide, setShowGuide] = useState(false);

  if (!connected) {
    return (
      <GlassCard padding="lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-text mb-1">Google 계정 연결이 필요해요</h3>
            <p className="text-sm text-dim">
              내 네이버 블로그의 Google Search Console 속성에 접근 권한이 있는 구글 계정을 연결하면
              색인 요청과 상태 확인을 시작할 수 있어요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="shrink-0 inline-flex items-center justify-center bg-accent hover:bg-accent-hover text-white font-bold text-sm rounded-xl px-5 py-3 transition-colors cursor-pointer"
          >
            Google 계정 연결
          </button>
        </div>
        {showGuide && <GoogleConnectGuideModal onClose={() => setShowGuide(false)} />}
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="lg">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-up">●</span>
            <h3 className="text-base font-bold text-text">{googleEmail || 'Google 계정'} 연결됨</h3>
          </div>
          {siteVerified && siteUrl ? (
            <p className="text-sm text-dim">GSC 속성 확인됨: {siteUrl}</p>
          ) : (
            <p className="text-sm text-down">
              이 블로그의 GSC 속성을 아직 찾지 못했어요. Search Console에서 blog.naver.com/내블로그ID/ 속성을
              먼저 소유권 확인해주세요.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={loading}
          className="shrink-0 text-sm font-semibold text-dim hover:text-down border border-border rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50"
        >
          연결 해제
        </button>
      </div>
    </GlassCard>
  );
}
