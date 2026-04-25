'use client';

import { useState, useEffect } from 'react';

interface RankingRow {
  rank_pos: number;
  blog_id: string;
  blog_name: string | null;
  category: string | null;
  rank_score: number;
  last_post_date: string | null;
}

interface MyRank {
  found: boolean;
  blog_id?: string;
  blog_name?: string | null;
  category?: string | null;
  rank_score?: number;
  is_active?: boolean;
  global_rank?: number | null;
  total_active?: number;
  global_percentile?: number | null;
  category_rank?: number | null;
  total_category?: number;
  last_post_date?: string | null;
  message?: string;
}

interface NameHit {
  blog_id: string;
  blog_name: string | null;
  category: string | null;
  is_active: boolean;
  global_rank: number | null;
  rank_score: number | null;
  last_post_date: string | null;
}

export default function BloggerRankingView() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [searching, setSearching] = useState(false);
  const [nameHits, setNameHits] = useState<NameHit[] | null>(null);

  useEffect(() => {
    fetch('/api/rankings/top?limit=50')
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rankings || []);
        setTotalActive(d.total_active || 0);
      })
      .finally(() => setLoading(false));
  }, []);

  // 영숫자·언더스코어·하이픈만 있으면 블로그 ID로 간주
  const isLikelyBlogId = (s: string) => /^[a-zA-Z0-9_-]+$/.test(s);

  const fetchRankById = async (id: string) => {
    const res = await fetch(`/api/rankings/${encodeURIComponent(id)}`);
    return (await res.json()) as MyRank;
  };

  const searchMyRank = async () => {
    const raw = searchId.trim();
    if (!raw) return;

    // URL 입력이면 ID 추출
    const fromUrl = raw.replace(/^https?:\/\/blog\.naver\.com\//, '').replace(/\/.*$/, '');
    setSearching(true);
    setMyRank(null);
    setNameHits(null);

    try {
      if (isLikelyBlogId(fromUrl)) {
        // 블로그 ID 로 직접 조회
        const data = await fetchRankById(fromUrl);
        setMyRank(data);
      } else {
        // 블로그 이름으로 검색 (한글·특수문자 포함)
        const res = await fetch(`/api/rankings/search?q=${encodeURIComponent(raw)}`);
        const data = await res.json();
        if (!res.ok) {
          setMyRank({
            found: false,
            message: `검색 중 오류가 발생했습니다 (${res.status}). 잠시 후 다시 시도해주세요.`,
          });
          return;
        }
        const hits: NameHit[] = data.results || [];
        if (hits.length === 0) {
          setMyRank({ found: false, message: `"${raw}"와(과) 일치하는 블로거를 찾지 못했습니다.` });
        } else if (hits.length === 1) {
          // 단일 매치면 바로 상세 순위 조회
          const detail = await fetchRankById(hits[0].blog_id);
          setMyRank(detail);
        } else {
          // 여러 매치면 선택 리스트 표시
          setNameHits(hits);
        }
      }
    } finally {
      setSearching(false);
    }
  };

  const selectNameHit = async (hit: NameHit) => {
    setSearching(true);
    setNameHits(null);
    try {
      const detail = await fetchRankById(hit.blog_id);
      setMyRank(detail);
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <p className="text-[11px] text-dim">
        최근 1년 내 활동한 블로거 대상 · 활성 블로거 {totalActive.toLocaleString()}명 집계
      </p>

      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-bold">내 블로그 순위 확인</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchMyRank()}
            placeholder="블로그 이름 · ID · 주소 (예: 쭌이덕, myid, blog.naver.com/myid)"
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg border border-border focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={searchMyRank}
            disabled={searching || !searchId.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-white disabled:opacity-40 cursor-pointer"
          >
            {searching ? '조회 중...' : '조회'}
          </button>
        </div>

        {nameHits && nameHits.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <p className="text-xs text-dim">
              &quot;{searchId.trim()}&quot; 검색 결과 {nameHits.length}건 — 순위를 볼 블로거를 선택하세요.
            </p>
            <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {nameHits.map((h) => (
                <li key={h.blog_id}>
                  <button
                    type="button"
                    onClick={() => selectNameHit(h)}
                    className="w-full text-left px-3 py-2 hover:bg-bg transition flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">{h.blog_name || h.blog_id}</span>
                      <span className="text-[11px] text-dim truncate">@{h.blog_id}</span>
                      {h.category && (
                        <span className="text-[10px] text-dim bg-bg px-1.5 py-0.5 rounded shrink-0">
                          {h.category}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-accent font-bold shrink-0">
                      {h.is_active && h.global_rank
                        ? `${h.global_rank.toLocaleString()}위`
                        : h.is_active
                          ? '집계 대기'
                          : '비활성'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {myRank && (
          <div className="mt-3 pt-3 border-t border-border">
            {!myRank.found ? (
              <p className="text-sm text-dim">{myRank.message || '해당 블로그 정보가 없습니다.'}</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{myRank.blog_name || myRank.blog_id}</span>
                  {myRank.category && (
                    <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded">{myRank.category}</span>
                  )}
                </div>
                {myRank.is_active ? (
                  myRank.global_rank == null ? (
                    <div className="bg-bg rounded-lg p-3 text-xs text-dim leading-relaxed">
                      활성 블로거로 감지됐지만 아직 순위가 집계되지 않았습니다.
                      순위는 <span className="font-semibold">주 1회 갱신</span>됩니다 — 다음 갱신 때 반영될 예정이에요.
                      {typeof myRank.total_active === 'number' && (
                        <> 현재 활성 블로거 {myRank.total_active.toLocaleString()}명.</>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-bg rounded-lg p-3">
                          <p className="text-[11px] text-dim mb-1">전체 순위</p>
                          <p className="text-xl font-extrabold text-accent">
                            {myRank.global_rank.toLocaleString()}위
                          </p>
                          <p className="text-[10px] text-dim mt-1">
                            활성 블로거 {myRank.total_active?.toLocaleString()}명 중
                          </p>
                        </div>
                        <div className="bg-bg rounded-lg p-3">
                          <p className="text-[11px] text-dim mb-1">상위</p>
                          <p className="text-xl font-extrabold text-accent">
                            {myRank.global_percentile ?? '-'}%
                          </p>
                          <p className="text-[10px] text-dim mt-1">백분위</p>
                        </div>
                      </div>
                      {myRank.category_rank && (
                        <div className="bg-bg rounded-lg p-3">
                          <p className="text-[11px] text-dim mb-1">{myRank.category} 카테고리 순위</p>
                          <p className="text-base font-bold">
                            {myRank.category_rank}위 / {myRank.total_category?.toLocaleString()}명
                          </p>
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <p className="text-xs text-dim">
                    최근 1년 이상 포스팅이 없어 순위 대상에서 제외되었습니다. 최근 포스팅 감지 시 자동 복귀됩니다.
                  </p>
                )}
                {myRank.last_post_date && (
                  <p className="text-[11px] text-dim">최근 포스팅: {myRank.last_post_date}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 text-sm text-dim leading-relaxed">
        <p className="font-semibold text-text mb-1">Top 50 블로그 순위 — 준비 중</p>
        전체 블로그 순위는 포스팅 수 · 구독자 수 · 카테고리 정보가 충분히 수집된 뒤 공개합니다.
        현재는 위의 <span className="font-semibold">내 블로그 순위 확인</span> 기능만 사용 가능합니다.
        <span className="block mt-1 text-[11px]">데이터 수집 진행률은 <a href="/bot-info" className="underline">봇 정보</a>에서 확인하세요.</span>
      </div>
      {/* rows/loading 은 내부 용도로 보존 — 사용하지 않으므로 경고 억제 */}
      <span className="hidden">{loading ? '' : rows.length}</span>
    </>
  );
}
