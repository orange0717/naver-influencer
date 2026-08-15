'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface FoundInfluencer {
  naverId: string;
  name: string;
  imageUrl?: string;
  myKeywordCategory?: string;
  subscriberCount?: number;
  totalFollowerCount?: number;
}

type Step = 'search' | 'verify' | 'done';

// URL에서 ID 추출 (https://in.naver.com/orangelibrary → orangelibrary)
const extractNaverId = (input: string): string => {
  const trimmed = input.trim();
  const match = trimmed.match(/in\.naver\.com\/([^/?#]+)/);
  if (match) return match[1];
  return trimmed;
};

export default function LinkInfluencerClient() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundInfluencer[]>([]);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<FoundInfluencer | null>(null);
  const [pageCode, setPageCode] = useState('');
  const [instruction, setInstruction] = useState('');
  const [codeIssued, setCodeIssued] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const [linkedName, setLinkedName] = useState('');

  const runSearch = async (raw: string) => {
    setError('');
    setResults([]);
    const q = extractNaverId(raw);
    if (!q) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/influencers/search?search=${encodeURIComponent(q)}&limit=5`);
      const data = await res.json();
      setResults(data.influencers || []);
      if ((data.influencers || []).length === 0) {
        setError('인플루언서를 찾을 수 없습니다. 아직 크롤링되지 않은 경우 ID를 정확히 입력해주세요.');
      }
    } catch {
      setError('검색 중 오류가 발생했습니다.');
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const prefill = searchParams.get('naverId');
    if (prefill) {
      setQuery(prefill);
      runSearch(prefill);
    }
  }, [searchParams]);

  const handleSearch = () => runSearch(query);

  const selectForVerification = async (inf: FoundInfluencer) => {
    setSelected(inf);
    setStep('verify');
    setVerifyError('');
    setPageCode('');
    setInstruction('');
    setCodeIssued(false);
    await requestCode(inf.naverId);
  };

  const requestCode = async (naverId: string) => {
    setCodeLoading(true);
    setVerifyError('');
    try {
      const res = await fetch('/api/auth/demo/request-page-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyError(data.error || '코드 발급에 실패했습니다.');
        return;
      }
      setPageCode(data.pageCode);
      setInstruction(data.instruction);
      setCodeIssued(true);
    } catch {
      setVerifyError('코드 발급 중 오류가 발생했습니다.');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!selected) return;
    setVerifying(true);
    setVerifyError('');
    try {
      const verifyRes = await fetch('/api/auth/demo/verify-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId: selected.naverId }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        setVerifyError(verifyData.error || '인증에 실패했습니다.');
        return;
      }

      const linkRes = await fetch('/api/my/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId: selected.naverId }),
      });
      if (!linkRes.ok) {
        const body = await linkRes.json().catch(() => ({}));
        setVerifyError(body.error || '연결에 실패했습니다.');
        return;
      }

      setLinkedName(selected.name);
      setStep('done');
    } catch {
      setVerifyError('인증 확인 중 오류가 발생했습니다.');
    } finally {
      setVerifying(false);
    }
  };

  const backToSearch = () => {
    setStep('search');
    setSelected(null);
    setVerifyError('');
    setCodeIssued(false);
  };

  if (step === 'done') {
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

  if (step === 'verify' && selected) {
    return (
      <div className="max-w-lg mx-auto mt-8 space-y-6">
        <div>
          <h1 className="type-page-title">본인 인증</h1>
          <p className="text-sm text-dim mt-1">
            in.naver.com/{selected.naverId} 의 소개글에 아래 코드를 붙여 넣어 본인 계정임을 인증해주세요.
          </p>
        </div>

        {codeIssued ? (
          <>
            <div className="rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm text-text">
              <p className="mb-2 font-bold text-accent">{pageCode}</p>
              <p className="text-xs leading-relaxed text-dim">{instruction}</p>
            </div>
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="w-full py-3 bg-accent text-white rounded-xl font-bold text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
            >
              {verifying ? '인증 확인 중...' : '인증 확인'}
            </button>
          </>
        ) : (
          <button
            onClick={() => requestCode(selected.naverId)}
            disabled={codeLoading}
            className="w-full py-3 bg-accent text-white rounded-xl font-bold text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
          >
            {codeLoading ? '코드 발급 중...' : '인증 코드 받기'}
          </button>
        )}

        {verifyError && (
          <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-sm text-down">{verifyError}</div>
        )}

        <button onClick={backToSearch} className="w-full text-center text-xs text-dim underline hover:text-accent cursor-pointer">
          다른 계정 선택하기
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8 space-y-6">
      <h1 className="type-page-title">내 인플루언서 계정 연결</h1>
      <p className="text-sm text-dim">
        네이버 인플루언서 ID를 입력하면 내 키워드 순위를 실시간으로 확인할 수 있습니다.
      </p>

      <div className="flex gap-2">
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="네이버 인플루언서 ID (예: orangelibrary)"
          className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent" />
        <button onClick={handleSearch} disabled={searching}
          className="px-5 py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">
          {searching ? '...' : '검색'}
        </button>
      </div>

      {query && (
        <p className="text-xs text-dim">https://in.naver.com/{extractNaverId(query).toLowerCase()}</p>
      )}

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-sm text-down">
          <p className="text-down/80">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          {results.map(inf => (
            <div key={inf.naverId}
              className="bg-surface border-2 border-accent/30 rounded-xl p-4 hover:border-accent/50 transition">
              <div className="flex items-center gap-3 mb-3">
                {inf.imageUrl ? (
                  <img src={inf.imageUrl} alt={inf.name} className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center text-lg font-bold text-accent shrink-0">
                    {inf.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{inf.name}</p>
                  <p className="text-xs text-dim">@{inf.naverId}</p>
                  <p className="text-xs text-dim">
                    {inf.myKeywordCategory} · 팬 {(inf.subscriberCount || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <button onClick={() => selectForVerification(inf)}
                className="w-full py-2.5 bg-accent text-white rounded-lg font-bold text-sm hover:bg-accent-hover transition cursor-pointer">
                이 계정으로 연결하기
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
