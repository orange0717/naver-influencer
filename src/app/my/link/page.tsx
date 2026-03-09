'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface FoundInfluencer {
  naverId: string;
  name: string;
  imageUrl?: string;
  myKeywordCategory?: string;
  subscriberCount?: number;
  totalFollowerCount?: number;
}

export default function LinkInfluencer() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundInfluencer[]>([]);
  const [linked, setLinked] = useState(false);
  const [linkedName, setLinkedName] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  // URL에서 ID 추출 (https://in.naver.com/orangelibrary → orangelibrary)
  const extractNaverId = (input: string): string => {
    const trimmed = input.trim();
    const match = trimmed.match(/in\.naver\.com\/([^/?#]+)/);
    if (match) return match[1];
    return trimmed;
  };

  const handleSearch = async () => {
    setError('');
    setResults([]);
    const q = extractNaverId(query);
    if (!q) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/influencers?search=${encodeURIComponent(q)}&limit=5`);
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

  const handleLink = async (inf: FoundInfluencer) => {
    setLinking(true);
    setError('');
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('로그인이 필요합니다.');
        setLinking(false);
        return;
      }

      // DB에서 인플루언서 ID 조회
      const { data: dbInf } = await supabase
        .from('influencers')
        .select('id')
        .eq('naver_id', inf.naverId)
        .single();

      if (!dbInf) {
        setError('인플루언서 DB 레코드를 찾을 수 없습니다.');
        setLinking(false);
        return;
      }

      // users 테이블의 linked_influencer_id 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({ linked_influencer_id: dbInf.id })
        .eq('auth_id', user.id);

      if (updateError) {
        setError('연결 실패: ' + updateError.message);
        setLinking(false);
        return;
      }

      setLinkedName(inf.name);
      setLinked(true);
    } catch {
      setError('연결 중 오류가 발생했습니다.');
    } finally {
      setLinking(false);
    }
  };

  if (linked) {
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
      <h1 className="text-xl font-bold">내 인플루언서 계정 연결</h1>
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
                  <img src={inf.imageUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center text-lg font-bold text-accent shrink-0">
                    {inf.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{inf.name}</p>
                  <p className="text-xs text-dim">@{inf.naverId}</p>
                  <p className="text-xs text-dim">
                    {inf.myKeywordCategory} · 구독자 {(inf.subscriberCount || 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <button onClick={() => handleLink(inf)} disabled={linking}
                className="w-full py-2.5 bg-accent text-white rounded-lg font-bold text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">
                {linking ? '연결 중...' : '이 계정으로 연결하기'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
