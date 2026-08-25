'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CONTACT_EMAIL } from '@/lib/site-contact';

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

/** 코드 만료 시각을 KST 로 표시. 값이 없거나 이상하면 아무것도 쓰지 않는다(추측해서 채우지 않음). */
const formatDeadline = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export default function LinkInfluencerClient() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundInfluencer[]>([]);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  /** 검색 결과 0건 — '아직 검색 안 함'과 구분해야 안내 문구를 띄울 수 있다. */
  const [searched, setSearched] = useState(false);

  const [selected, setSelected] = useState<FoundInfluencer | null>(null);
  const [pageCode, setPageCode] = useState('');
  const [codeExpiresAt, setCodeExpiresAt] = useState('');
  const [instruction, setInstruction] = useState('');
  const [codeIssued, setCodeIssued] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const [linkedName, setLinkedName] = useState('');

  const runSearch = async (raw: string) => {
    // 이미 검색 중이면 무시한다. 버튼은 disabled 로 막히지만 Enter 키는 그대로 들어와서
    // 연타하면 같은 요청이 여러 번 나가고, 늦게 도착한 응답이 최신 결과를 덮어쓸 수 있었다.
    if (searching) return;

    setError('');
    setResults([]);
    const q = extractNaverId(raw);
    if (!q) {
      // 예전에는 조용히 return 해서 검색 버튼이 고장난 것처럼 보였다.
      setError('네이버 인플루언서 ID를 입력해 주세요. (예: orangelibrary)');
      setSearched(false);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/influencers/search?search=${encodeURIComponent(q)}&limit=5`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
        setSearched(false);
        return;
      }
      setResults(data.influencers || []);
      setSearched(true);
    } catch {
      // 결과 0건과 통신 실패는 다르다 — searched 를 켜지 않아 '없음' 안내가 뜨지 않게 한다.
      setError('검색 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.');
      setSearched(false);
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
      setCodeExpiresAt(data.expiresAt || '');
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
              {formatDeadline(codeExpiresAt) && (
                <p className="text-xs leading-relaxed text-dim mt-2">
                  이 코드는 {formatDeadline(codeExpiresAt)}까지 유효합니다. 그 뒤에는 코드를 다시 받으셔야 합니다.
                </p>
              )}
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
        <input type="text" value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // 입력을 고치는 순간 이전 검색의 '없음' 안내를 치운다 — 새 ID에 대한 결과처럼 읽히면 안 된다.
            if (searched) setSearched(false);
            if (error) setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="네이버 인플루언서 ID (예: orangelibrary)"
          className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent" />
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

      {/*
        검색은 됐는데 결과가 0건인 경우.
        - 통신 실패(catch)와 구분한다. 예전에는 둘 다 같은 빨간 오류 상자로 나가서
          "내 계정이 없다"와 "검색이 안 됐다"를 사용자가 구분할 수 없었다.
        - 최근 선정자는 우리가 아직 수집하지 못했을 수 있다(실제로 발굴은 챌린지 참여·검색 상위
          노출을 통해서만 이뤄진다). 그러니 "ID를 정확히 입력하라"고만 하면 막다른 길이 된다.
      */}
      {searched && results.length === 0 && !error && (
        <div className="bg-surface border border-border rounded-xl p-4 text-sm space-y-2">
          <p className="font-semibold">검색 결과가 없습니다.</p>
          <ul className="text-xs text-dim leading-relaxed list-disc pl-4 space-y-1">
            <li>네이버 인플루언서 홈 주소(in.naver.com/<span className="font-rank">아이디</span>)의 아이디 부분을 그대로 입력했는지 확인해 주세요. 주소 전체를 붙여 넣어도 됩니다.</li>
            <li>최근 선정되신 경우 아직 저희가 수집하지 못했을 수 있습니다. 이때는 ID가 정확해도 검색되지 않습니다.</li>
          </ul>
          <p className="text-xs text-dim">
            계속 찾을 수 없다면{' '}
            <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('[N인플] 인플루언서 계정 연결 문의')}`}
              className="text-accent underline">
              {CONTACT_EMAIL}
            </a>
            {' '}로 인플루언서 홈 주소를 보내주시면 등록해 드리겠습니다.
          </p>
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
