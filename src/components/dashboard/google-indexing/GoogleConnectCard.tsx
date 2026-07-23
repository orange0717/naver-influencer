'use client';

import GlassCard from '@/components/dashboard/GlassCard';

interface Props {
  connected: boolean;
  googleEmail: string | null;
  siteUrl: string | null;
  siteVerified: boolean;
  loading: boolean;
  onDisconnect: () => void;
}

export default function GoogleConnectCard({ connected, googleEmail, siteUrl, siteVerified, loading, onDisconnect }: Props) {
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
          <a
            href="/api/google-indexing/oauth/start"
            className="shrink-0 inline-flex items-center justify-center bg-accent hover:bg-accent-hover text-white font-bold text-sm rounded-xl px-5 py-3 transition-colors"
          >
            Google 계정 연결
          </a>
        </div>
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
