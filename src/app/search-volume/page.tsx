'use client';

import { useState } from 'react';
import Banner from '@/components/Banner';
import { PROMO_BANNERS } from '@/lib/banner-data';

interface KeywordVolume {
  keyword: string;
  monthlyPc: number | string;
  monthlyMobile: number | string;
  monthlyTotal: number | string;
  competition: string;
}

function formatCount(n: number | string): string {
  if (typeof n === 'string') return n;
  return n.toLocaleString();
}

export default function SearchVolumePage() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<KeywordVolume[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = input.trim();
    if (!keyword) return;

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const res = await fetch(`/api/search-volume?keyword=${encodeURIComponent(keyword)}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '검색량 조회에 실패했습니다.');
        setResults([]);
        return;
      }

      setResults(data.keywords || []);
    } catch {
      setError('검색량 조회 중 오류가 발생했습니다.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-extrabold">키워드 검색량 조회</h1>
        <p className="text-xs text-dim mt-0.5">네이버 키워드 월간 검색량을 확인하세요</p>
      </div>

      {/* 검색 입력 */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="키워드를 입력하세요 (예: 맛집추천, 여행코스)"
            className="flex-1 px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm shrink-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                조회 중
              </span>
            ) : '검색량 조회'}
          </button>
        </form>
        <p className="text-[11px] text-dim mt-2">연관 키워드의 검색량도 함께 표시됩니다</p>
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-sm text-down">
          {error}
        </div>
      )}

      {/* API 키 미설정 안내 */}
      {searched && error && error.includes('API') && (
        <div className="bg-accent/5 rounded-xl border border-accent/20 p-5 text-center">
          <p className="text-sm font-semibold mb-1">네이버 검색광고 API 연동 준비 중</p>
          <p className="text-xs text-dim">API 키 설정 후 검색량 조회가 가능합니다.</p>
        </div>
      )}

      {/* 결과 테이블 */}
      {results.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-bg/50">
            <h3 className="font-bold text-sm">검색량 결과</h3>
            <p className="text-[11px] text-dim mt-0.5">{results.length}개 키워드</p>
          </div>

          {/* 데스크톱 테이블 */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-dim">
                  <th className="text-left px-5 py-3 font-semibold">키워드</th>
                  <th className="text-right px-4 py-3 font-semibold">PC 검색량</th>
                  <th className="text-right px-4 py-3 font-semibold">모바일 검색량</th>
                  <th className="text-right px-4 py-3 font-semibold">합계</th>
                  <th className="text-center px-4 py-3 font-semibold">경쟁도</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {results.map((kw, i) => (
                  <tr key={i} className="hover:bg-surface-hover transition">
                    <td className="px-5 py-3.5 font-semibold">{kw.keyword}</td>
                    <td className="px-4 py-3.5 text-right font-rank">{formatCount(kw.monthlyPc)}</td>
                    <td className="px-4 py-3.5 text-right font-rank">{formatCount(kw.monthlyMobile)}</td>
                    <td className="px-4 py-3.5 text-right font-rank font-bold text-accent">{formatCount(kw.monthlyTotal)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        kw.competition === '높음' ? 'bg-down/10 text-down' :
                        kw.competition === '중간' ? 'bg-accent/10 text-accent' :
                        'bg-up/10 text-up'
                      }`}>{kw.competition}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden divide-y divide-border/20">
            {results.map((kw, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{kw.keyword}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    kw.competition === '높음' ? 'bg-down/10 text-down' :
                    kw.competition === '중간' ? 'bg-accent/10 text-accent' :
                    'bg-up/10 text-up'
                  }`}>{kw.competition}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-bg rounded-lg py-1.5">
                    <div className="text-sm font-bold font-rank">{formatCount(kw.monthlyPc)}</div>
                    <div className="text-[10px] text-dim">PC</div>
                  </div>
                  <div className="bg-bg rounded-lg py-1.5">
                    <div className="text-sm font-bold font-rank">{formatCount(kw.monthlyMobile)}</div>
                    <div className="text-[10px] text-dim">모바일</div>
                  </div>
                  <div className="bg-bg rounded-lg py-1.5">
                    <div className="text-sm font-bold font-rank text-accent">{formatCount(kw.monthlyTotal)}</div>
                    <div className="text-[10px] text-dim">합계</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 자사 홍보 배너 */}
      <Banner banner={PROMO_BANNERS[0]} dismissKey="searchvol-promo" />

      {/* 빈 상태 */}
      {searched && !loading && !error && results.length === 0 && (
        <div className="text-center py-16 text-dim text-sm">
          <p>검색 결과가 없습니다.</p>
        </div>
      )}

      {/* 안내 */}
      {!searched && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <h3 className="font-bold text-sm mb-3">검색량 조회란?</h3>
          <div className="space-y-2 text-sm text-dim">
            <p>네이버에서 해당 키워드가 월간 얼마나 검색되는지 확인할 수 있습니다.</p>
            <p>블로그 글 주제를 선정할 때 검색량이 높은 키워드를 선택하면 더 많은 유입을 기대할 수 있습니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}
