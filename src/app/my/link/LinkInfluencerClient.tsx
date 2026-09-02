'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseInfluencerId, influencerHomeUrl } from '@/lib/influencer-url';

export default function LinkInfluencerClient() {
  const searchParams = useSearchParams();

  const [done, setDone] = useState(false);
  const [url, setUrl] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkedName, setLinkedName] = useState('');

  useEffect(() => {
    const prefill = searchParams.get('naverId');
    if (prefill) setUrl(prefill);
  }, [searchParams]);

  const previewId = parseInfluencerId(url);

  const handleSubmit = async () => {
    // 저장 중에는 무시한다. 버튼은 disabled 로 막히지만 Enter 키는 그대로 들어온다.
    if (saving) return;

    setError('');
    if (!previewId) {
      setError('인플루언서 홈 주소를 확인해 주세요. (예: https://in.naver.com/orangelibrary)');
      return;
    }
    if (!nickname.trim()) {
      setError('닉네임을 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/my/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, nickname }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '연결에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      setLinkedName(data.displayName || nickname.trim());
      setDone(true);
    } catch {
      setError('연결 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-up/15 flex items-center justify-center text-up text-2xl font-bold">OK</div>
        <h2 className="text-xl font-bold">계정 연결 완료!</h2>
        <p className="text-dim">{linkedName} 계정이 연결되었습니다.</p>
        <a href="/my" className="inline-block mt-4 px-6 py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition">
          내 대시보드로 이동
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8 space-y-6">
      <h1 className="type-page-title">내 인플루언서 계정 연결</h1>
      <p className="text-sm text-dim">
        인플루언서 홈 주소를 입력하시면 내 키워드 순위를 실시간으로 확인하실 수 있습니다.
      </p>

      <div className="space-y-2">
        <label htmlFor="influencer-url" className="block text-sm font-semibold">인플루언서 홈 주소</label>
        <input id="influencer-url" type="text" value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="https://in.naver.com/orangelibrary"
          className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent" />
        {previewId && (
          <p className="text-xs text-dim">{influencerHomeUrl(previewId)}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="influencer-nickname" className="block text-sm font-semibold">닉네임</label>
        <input id="influencer-nickname" type="text" value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="화면에 표시될 이름"
          className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent" />
      </div>

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-sm text-down">
          <p className="text-down/80">{error}</p>
        </div>
      )}

      <button onClick={handleSubmit} disabled={saving}
        className="w-full py-3 bg-accent text-white rounded-xl font-bold text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">
        {saving ? '연결 중...' : '계정 연결하기'}
      </button>
    </div>
  );
}
