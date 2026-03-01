'use client';

import { useState } from 'react';
import { mockInfluencers } from '@/data/mock-influencers';

export default function LinkInfluencer() {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<typeof mockInfluencers[0] | null>(null);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = () => {
    setError('');
    setFound(null);
    const q = query.trim().toLowerCase();
    if (!q) return;
    const match = mockInfluencers.find(i =>
      i.naver_id.toLowerCase() === q || i.display_name.includes(query.trim())
    );
    if (match) setFound(match);
    else setError('아직 크롤링되지 않은 인플루언서입니다. ID가 정확한지 확인해주세요.');
  };

  if (linked && found) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold">계정 연결 완료!</h2>
        <p className="text-dim">{found.display_name} 계정이 연결되었습니다.</p>
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
        <button onClick={handleSearch}
          className="px-5 py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent-hover transition cursor-pointer">
          검색
        </button>
      </div>

      {query && (
        <p className="text-xs text-dim">https://in.naver.com/{query.trim().toLowerCase()}</p>
      )}

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-sm text-down">
          <p className="font-semibold mb-1">인플루언서를 찾을 수 없습니다</p>
          <p className="text-down/80">{error}</p>
        </div>
      )}

      {found && (
        <div className="bg-surface border-2 border-accent/50 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-up text-lg">✓</span>
            <span className="font-bold">인플루언서 발견!</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-accent/20 rounded-full flex items-center justify-center text-lg font-bold text-accent">
              {found.display_name[0]}
            </div>
            <div>
              <p className="font-bold">{found.display_name}</p>
              <p className="text-xs text-dim">{found.sub_category}</p>
              <p className="text-xs text-dim">
                팬 {found.fan_count.toLocaleString()} · 키워드 {found.total_keywords}개 참여
              </p>
            </div>
          </div>
          <button onClick={() => setLinked(true)}
            className="w-full py-3 bg-accent text-white rounded-xl font-bold hover:bg-accent-hover transition cursor-pointer">
            이 계정으로 연결하기
          </button>
        </div>
      )}
    </div>
  );
}
