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

interface QualityPost {
  title: string;
  keyword: string;
  rank: number | null;
}

interface QualityResult {
  blogId: string;
  score: number;
  grade: string;
  gradeLabel?: string;
  exposureScore: number;
  activityScore: number;
  topicScore: number;
  cached?: boolean;
  checkedAt?: string;
  details: {
    sampleCount: number;
    exposedCount: number;
    avgRank: number | null;
    posts: QualityPost[];
    postingPerMonth: number;
    uniqueCategories: number;
    totalCategories: number;
  };
}

const GRADE_LABEL: Record<string, string> = {
  OPTIMAL_1: '최적1',
  OPTIMAL_2: '최적2',
  SEMI_OPTIMAL: '준최적',
  NORMAL: '일반',
  LOW: '저품질',
};

const GRADE_COLOR: Record<string, string> = {
  OPTIMAL_1: 'text-up',
  OPTIMAL_2: 'text-accent',
  SEMI_OPTIMAL: 'text-accent',
  NORMAL: 'text-dim',
  LOW: 'text-down',
};

type Tab = 'ranking' | 'quality';

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>('ranking');

  const [rows, setRows] = useState<RankingRow[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);

  const [searchId, setSearchId] = useState('');
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [searching, setSearching] = useState(false);

  // 품질지수 상태
  const [qualityInput, setQualityInput] = useState('');
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/rankings/top?limit=50')
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rankings || []);
        setTotalActive(d.total_active || 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const searchMyRank = async () => {
    const id = searchId.trim().replace(/^https?:\/\/blog\.naver\.com\//, '').replace(/\/.*$/, '');
    if (!id) return;
    setSearching(true);
    setMyRank(null);
    try {
      const res = await fetch(`/api/rankings/${encodeURIComponent(id)}`);
      const data = await res.json();
      setMyRank(data);
    } finally {
      setSearching(false);
    }
  };

  const checkQuality = async () => {
    const id = qualityInput.trim().replace(/^https?:\/\/(?:m\.)?blog\.naver\.com\//, '').replace(/\/.*$/, '');
    if (!id) return;
    setQualityLoading(true);
    setQualityResult(null);
    setQualityError(null);
    try {
      const res = await fetch('/api/blog-quality/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setQualityError(data.error || '검사 실패');
      } else {
        setQualityResult(data);
      }
    } catch {
      setQualityError('네트워크 오류');
    } finally {
      setQualityLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">블로거 순위 · 품질지수</h1>
        <p className="text-sm text-dim mt-1">
          최근 1년 내 활동한 블로거 대상 · 활성 블로거 {totalActive.toLocaleString()}명 집계
        </p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border">
        {([['ranking', '블로거 순위'], ['quality', '블로그 품질지수']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition cursor-pointer ${
              tab === key ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'ranking' && (
        <>
          {/* 내 블로그 순위 조회 */}
          <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
            <h2 className="text-sm font-bold">내 블로그 순위 확인</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchMyRank()}
                placeholder="블로그 ID 또는 주소 (예: blog.naver.com/myid)"
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
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-bg rounded-lg p-3">
                            <p className="text-[11px] text-dim mb-1">전체 순위</p>
                            <p className="text-xl font-extrabold text-accent">
                              {myRank.global_rank?.toLocaleString()}위
                            </p>
                            <p className="text-[10px] text-dim mt-1">
                              활성 블로거 {myRank.total_active?.toLocaleString()}명 중
                            </p>
                          </div>
                          <div className="bg-bg rounded-lg p-3">
                            <p className="text-[11px] text-dim mb-1">상위</p>
                            <p className="text-xl font-extrabold text-accent">
                              {myRank.global_percentile}%
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

          {/* Top 50 */}
          <div className="bg-surface rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="text-sm font-bold">Top 50 전체 순위</h2>
            </div>
            {loading ? (
              <div className="p-8 text-center">
                <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
              </div>
            ) : rows.length === 0 ? (
              <p className="p-8 text-sm text-dim text-center">
                아직 데이터가 쌓이는 중입니다. 잠시 후 다시 확인해주세요.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {rows.map((r) => (
                  <div key={r.blog_id} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-10 text-sm font-bold text-accent font-rank shrink-0">
                      {r.rank_pos}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {r.blog_name || r.blog_id}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-dim">
                        {r.category && <span>{r.category}</span>}
                        {r.last_post_date && <span>· {r.last_post_date}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-dim font-mono shrink-0">
                      {Math.round(Number(r.rank_score))}점
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'quality' && (
        <>
          <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold">블로그 품질지수 검사</h2>
              <p className="text-[11px] text-dim mt-1">
                최근 포스트 10개의 검색 노출을 측정해 품질지수를 산출합니다. (C-rank + D.I.A. + D.I.A.+ 종합 결과)
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={qualityInput}
                onChange={(e) => setQualityInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && checkQuality()}
                placeholder="블로그 ID 또는 주소 (예: blog.naver.com/myid)"
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg border border-border focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={checkQuality}
                disabled={qualityLoading || !qualityInput.trim()}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-white disabled:opacity-40 cursor-pointer"
              >
                {qualityLoading ? '검사 중...' : '검사'}
              </button>
            </div>

            <p className="text-[11px] text-dim">
              · 비로그인 1일 1회, 로그인 1일 3회, 유료 무제한<br />
              · 같은 블로그는 24시간 캐시됩니다
            </p>

            {qualityError && (
              <div className="bg-down/10 border border-down/30 rounded-lg p-3">
                <p className="text-xs text-down font-semibold">{qualityError}</p>
              </div>
            )}

            {qualityLoading && (
              <div className="py-10 text-center">
                <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-dim mt-3">검색 노출 측정 중... (최대 30초)</p>
              </div>
            )}

            {qualityResult && (
              <div className="space-y-4 pt-3 border-t border-border">
                {/* 종합 점수 */}
                <div className="bg-bg rounded-xl p-5 text-center">
                  <p className="text-[11px] text-dim">{qualityResult.blogId}</p>
                  <p className={`text-5xl font-extrabold mt-2 ${GRADE_COLOR[qualityResult.grade] || ''}`}>
                    {qualityResult.score}
                  </p>
                  <p className={`text-lg font-bold mt-1 ${GRADE_COLOR[qualityResult.grade] || ''}`}>
                    {qualityResult.gradeLabel || GRADE_LABEL[qualityResult.grade]}
                  </p>
                  <p className="text-[10px] text-dim mt-2">
                    {qualityResult.cached ? '24시간 내 캐시된 결과' : '방금 측정'}
                  </p>
                </div>

                {/* 세부 점수 */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-bg rounded-lg p-3 text-center">
                    <p className="text-[10px] text-dim">검색노출 (70%)</p>
                    <p className="text-lg font-bold mt-1">{qualityResult.exposureScore}</p>
                  </div>
                  <div className="bg-bg rounded-lg p-3 text-center">
                    <p className="text-[10px] text-dim">활동성 (15%)</p>
                    <p className="text-lg font-bold mt-1">{qualityResult.activityScore}</p>
                  </div>
                  <div className="bg-bg rounded-lg p-3 text-center">
                    <p className="text-[10px] text-dim">주제집중도 (15%)</p>
                    <p className="text-lg font-bold mt-1">{qualityResult.topicScore}</p>
                  </div>
                </div>

                {/* 검색 노출 세부 */}
                <div className="bg-bg rounded-lg p-3">
                  <p className="text-xs font-bold mb-2">
                    최근 {qualityResult.details.sampleCount}개 포스트 검색 노출
                    <span className="text-dim font-normal ml-2">
                      · {qualityResult.details.exposedCount}/{qualityResult.details.sampleCount}개 노출
                      {qualityResult.details.avgRank !== null && ` · 평균 ${qualityResult.details.avgRank}위`}
                    </span>
                  </p>
                  <div className="space-y-1">
                    {qualityResult.details.posts.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px]">
                        <span className={`shrink-0 w-12 font-mono text-center rounded ${
                          p.rank === null
                            ? 'bg-down/10 text-down'
                            : p.rank <= 10
                            ? 'bg-up/10 text-up'
                            : p.rank <= 50
                            ? 'bg-accent/10 text-accent'
                            : 'bg-surface text-dim'
                        }`}>
                          {p.rank === null ? '미노출' : `${p.rank}위`}
                        </span>
                        <span className="truncate flex-1" title={p.title}>{p.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-dim leading-relaxed">
                  · 검색노출은 제목에서 추출한 핵심 키워드로 네이버 블로그 검색 시 상위 100위 내 본인 포스트 순위로 측정됩니다.<br />
                  · 활동성: 최근 30일 포스팅 비율, 주제집중도: RSS 카테고리 집중도.<br />
                  · 네이버 공식 지수가 아닌 추정치이며, C-rank/D.I.A./D.I.A.+ 종합 결과를 근사합니다.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <p className="text-[11px] text-dim text-center">
        순위는 주 1회 갱신됩니다. 수집·점수 산정 방식은 <a href="/bot-info" className="underline">봇 정보</a>에서 확인하세요.
      </p>
    </div>
  );
}
