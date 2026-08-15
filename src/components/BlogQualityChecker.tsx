'use client';

import { useState } from 'react';

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

const GRADE_COLOR: Record<string, string> = {
  EXCELLENT: 'text-up',
  GOOD: 'text-accent',
  NORMAL: 'text-dim',
  LOW: 'text-down',
};

export default function BlogQualityChecker() {
  const [qualityInput, setQualityInput] = useState('');
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);

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
    <div className="bg-surface rounded-lg border border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-bold">블로그 품질지수 검사</h2>
        <p className="text-[11px] text-dim mt-1">
          최근 포스트 10개의 검색 노출을 측정해 품질지수를 산출합니다. C-rank · D.I.A. · D.I.A.+ 종합 결과의 근사 추정치.
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
          <div className="bg-bg rounded-xl p-5 text-center">
            <p className="text-[11px] text-dim">{qualityResult.blogId}</p>
            <p className={`text-5xl font-extrabold mt-2 ${GRADE_COLOR[qualityResult.grade] || ''}`}>
              {qualityResult.score}<span className="text-2xl">%</span>
            </p>
            <p className="text-[10px] text-dim mt-2">
              {qualityResult.cached ? '24시간 내 캐시된 결과' : '방금 측정'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-bg rounded-lg p-3 text-center">
              <p className="text-[10px] text-dim">검색노출 (70%)</p>
              <p className="text-lg font-bold mt-1">{qualityResult.exposureScore}%</p>
            </div>
            <div className="bg-bg rounded-lg p-3 text-center">
              <p className="text-[10px] text-dim">활동성 (15%)</p>
              <p className="text-lg font-bold mt-1">{qualityResult.activityScore}%</p>
            </div>
            <div className="bg-bg rounded-lg p-3 text-center">
              <p className="text-[10px] text-dim">주제집중도 (15%)</p>
              <p className="text-lg font-bold mt-1">{qualityResult.topicScore}%</p>
            </div>
          </div>

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
  );
}
