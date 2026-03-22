'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import GradeGauge from './GradeGauge';
import GlassCard from './GlassCard';

/** 순위 품질 점수 계산 시 순위당 감점 가중치 (1위=50점, 높을수록 감점) */
const RANK_QUALITY_BASE = 50;
const RANK_QUALITY_WEIGHT = 1.6;

interface BlogAnalysisMetrics {
  postsWithImages: number;
  longPosts: number;
  postsWithHeadings: number;
  avgCharCount: number;
  postsWithMedia: number;
  originalImageRatio: number;
  avgImageSizeKB: number;
  postsWithOriginalImages: number;
  avgPersonalPronounRatio: number;
  avgUniqueWordRatio: number;
  postsWithLists: number;
  postsWithQuotations: number;
}

interface BlogAnalysisAverages {
  charCount: number;
  wordCount: number;
  imageCount: number;
  videoCount: number;
  paragraphCount: number;
  linkCount: number;
  headingCount: number;
  personalPronounCount: number;
  uniqueWordRatio: number;
  listItemCount: number;
  quotationCount: number;
}

interface BlogPost {
  id: string;
  title: string;
  date: string;
}

interface RankingStats {
  avgRank: number;
  rankedCount: number;
  top5Count: number;
  top10Count: number;
  top20Count: number;
  keywordCount: number;
  improvedCount: number;
  declinedCount: number;
}

interface BlogScoreSectionProps {
  blogId: string;
  rankingStats?: RankingStats;
}

export default function BlogScoreSection({ blogId, rankingStats }: BlogScoreSectionProps) {
  const [postAnalysis, setPostAnalysis] = useState<{ metrics: BlogAnalysisMetrics; averages: BlogAnalysisAverages } | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const savedRef = useRef(false);

  const fetchPostAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/blog/analyze?blogId=${encodeURIComponent(blogId)}&count=10`);
      if (res.ok) {
        const data = await res.json();
        if (data.analyzedCount > 0) {
          setPostAnalysis({ metrics: data.metrics, averages: data.averages });
        }
      }
    } catch { /* ignore */ }
    finally { setAnalysisLoading(false); }
  }, [blogId]);

  const fetchBlogPosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=1&count=10`);
      if (res.ok) {
        const data = await res.json();
        setBlogPosts(data.posts || []);
      }
    } catch { /* ignore */ }
  }, [blogId]);

  useEffect(() => {
    fetchPostAnalysis();
    fetchBlogPosts();
  }, [fetchPostAnalysis, fetchBlogPosts]);

  // 점수 저장
  useEffect(() => {
    if (!postAnalysis || savedRef.current) return;
    savedRef.current = true;
    const timer = setTimeout(async () => {
      try {
        const scores = calcAllScores();
        if (scores.total === 0) return;
        await fetch('/api/blog/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blog_id: blogId,
            blog_name: blogId,
            total_score: scores.total,
            grade: scores.grade,
            crank_score: Math.round((scores.scores[0] + scores.scores[2]) / 2),
            dia_score: Math.round((scores.scores[1] + scores.scores[3]) / 2),
            diaplus_score: Math.round((scores.scores[4] + scores.scores[5]) / 2),
            keyword_count: rankingStats?.keywordCount || 0,
            ranked_count: rankingStats?.rankedCount || 0,
            avg_rank: rankingStats?.avgRank || 0,
            top5_count: rankingStats?.top5Count || 0,
            top10_count: rankingStats?.top10Count || 0,
          }),
        });
      } catch { /* ignore */ }
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postAnalysis]);

  const pa = postAnalysis;
  const rs = rankingStats;
  const hasRankData = rs && rs.rankedCount > 0;
  const rankQuality = rs && rs.avgRank > 0 ? Math.max(0, RANK_QUALITY_BASE - (rs.avgRank - 1) * RANK_QUALITY_WEIGHT) : 0;
  const top5Ratio = rs && rs.rankedCount > 0 ? (rs.top5Count / rs.rankedCount) : 0;
  const stabilityRatio = rs && (rs.improvedCount + rs.declinedCount) > 0
    ? rs.improvedCount / (rs.improvedCount + rs.declinedCount)
    : 0.5;

  // 1. 신뢰성
  const reliabilityScore = pa ? Math.min(100, Math.round(
    (pa.averages.linkCount >= 3 ? 30 : pa.averages.linkCount >= 2 ? 22 :
     pa.averages.linkCount >= 1 ? 15 : 3) +
    (pa.metrics.postsWithQuotations >= 0.5 ? 20 : pa.metrics.postsWithQuotations >= 0.2 ? 12 :
     pa.averages.quotationCount >= 1 ? 8 : 0) +
    (hasRankData ? Math.min(30, Math.round(rankQuality * 0.6)) : 0) +
    (hasRankData && rs ? Math.min(20, Math.round((rs.top10Count / Math.max(rs.rankedCount, 1)) * 20)) : 0)
  )) : (hasRankData && rs ? Math.min(100, Math.round(
    rankQuality * 0.6 + (rs.top10Count / Math.max(rs.rankedCount, 1)) * 40 +
    (rs.rankedCount >= 3 ? 20 : rs.rankedCount >= 1 ? 10 : 0)
  )) : 0);

  // 2. 경험
  const experienceScore = pa ? Math.min(100, Math.round(
    pa.metrics.originalImageRatio * 25 +
    Math.min(25, pa.metrics.avgPersonalPronounRatio * 800) +
    pa.metrics.postsWithOriginalImages * 15 +
    pa.metrics.postsWithMedia * 15 +
    (pa.metrics.avgImageSizeKB >= 500 ? 10 : pa.metrics.avgImageSizeKB >= 200 ? 7 :
     pa.metrics.avgImageSizeKB >= 100 ? 5 : 0) +
    pa.metrics.postsWithImages * 10
  )) : (hasRankData ? 30 : 0);

  // 3. 독창성
  const originalityScore = pa ? Math.min(100, Math.round(
    (pa.metrics.avgUniqueWordRatio >= 0.7 ? 25 : pa.metrics.avgUniqueWordRatio >= 0.6 ? 20 :
     pa.metrics.avgUniqueWordRatio >= 0.5 ? 15 : pa.metrics.avgUniqueWordRatio >= 0.4 ? 10 : 5) +
    (pa.metrics.avgCharCount >= 2000 ? 25 : pa.metrics.avgCharCount >= 1500 ? 20 :
     pa.metrics.avgCharCount >= 1000 ? 15 : pa.metrics.avgCharCount >= 500 ? 8 : 3) +
    pa.metrics.longPosts * 20 +
    pa.metrics.originalImageRatio * 15 +
    (hasRankData && rs && rs.rankedCount >= 3 ? 15 : hasRankData && rs && rs.rankedCount >= 1 ? 10 : 0)
  )) : (hasRankData && rs ? Math.min(100, Math.round(
    rankQuality * 0.8 + (rs.top10Count / Math.max(rs.rankedCount, 1)) * 35 +
    (rs.rankedCount >= 5 ? 25 : rs.rankedCount >= 3 ? 15 : rs.rankedCount >= 1 ? 10 : 0)
  )) : 0);

  // 4. 심층성
  const depthScore = pa ? Math.min(100, Math.round(
    (pa.metrics.avgCharCount >= 2000 ? 25 : pa.metrics.avgCharCount >= 1500 ? 20 :
     pa.metrics.avgCharCount >= 1000 ? 15 : pa.metrics.avgCharCount >= 500 ? 8 : 3) +
    (pa.averages.paragraphCount >= 15 ? 20 : pa.averages.paragraphCount >= 10 ? 15 :
     pa.averages.paragraphCount >= 5 ? 10 : 3) +
    (pa.averages.imageCount >= 8 ? 15 : pa.averages.imageCount >= 5 ? 12 :
     pa.averages.imageCount >= 3 ? 8 : 0) +
    (pa.metrics.postsWithLists >= 0.5 ? 15 : pa.metrics.postsWithLists >= 0.2 ? 10 :
     pa.averages.listItemCount >= 1 ? 5 : 0) +
    Math.min(15, Math.round(pa.metrics.longPosts * 15)) +
    (pa.averages.headingCount >= 3 ? 10 : pa.averages.headingCount >= 1 ? 5 : 0)
  )) : (hasRankData && rs ? Math.min(100, Math.round(
    top5Ratio * 50 + (rs.top5Count >= 3 ? 30 : rs.top5Count >= 1 ? 15 : 0) +
    (rs.avgRank > 0 && rs.avgRank <= 3 ? 20 : rs.avgRank <= 5 ? 15 : rs.avgRank <= 10 ? 10 : 0)
  )) : 0);

  // 5. 가독성
  const readabilityScore = pa ? Math.min(100, Math.round(
    pa.metrics.postsWithHeadings * 25 +
    (pa.averages.headingCount >= 5 ? 20 : pa.averages.headingCount >= 3 ? 15 :
     pa.averages.headingCount >= 1 ? 8 : 0) +
    (pa.metrics.postsWithLists >= 0.3 ? 15 : pa.metrics.postsWithLists >= 0.1 ? 8 : 0) +
    (pa.averages.imageCount >= 3 && pa.averages.imageCount <= 20 ? 20 :
     pa.averages.imageCount >= 1 ? 10 : 0) +
    (pa.averages.paragraphCount >= 5 ? 10 : pa.averages.paragraphCount >= 3 ? 5 : 0) +
    (pa.metrics.avgCharCount >= 500 ? 10 : pa.metrics.avgCharCount >= 300 ? 5 : 0)
  )) : (hasRankData && rs ? Math.min(100, Math.round(
    stabilityRatio * 50 + (rs.declinedCount === 0 ? 30 : rs.declinedCount <= 1 ? 15 : 0) +
    (rs.rankedCount >= 3 ? 20 : rs.rankedCount >= 1 ? 10 : 0)
  )) : 0);

  // 6. 꾸준함
  const calcConsistency = () => {
    if (blogPosts.length === 0) return 0;
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    let recentCount = 0;
    let monthCount = 0;
    const postDates: Date[] = [];
    for (const p of blogPosts) {
      const match = p.date.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
      if (!match) continue;
      const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
      postDates.push(d);
      if (d >= twoWeeksAgo) recentCount++;
      if (d >= oneMonthAgo) monthCount++;
    }
    const recentPostScore = Math.min(40, recentCount * 10);
    const regularityScore = Math.min(30, monthCount >= 8 ? 30 : monthCount >= 4 ? 20 : monthCount >= 2 ? 10 : 0);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const veryRecent = postDates.some(d => d >= threeDaysAgo);
    const streakBonus = veryRecent ? 30 : (recentCount > 0 ? 15 : 0);
    return Math.min(100, Math.round(recentPostScore + regularityScore + streakBonus));
  };
  const consistencyScore = calcConsistency();

  const allScores = [reliabilityScore, experienceScore, originalityScore, depthScore, readabilityScore, consistencyScore];
  const totalScore = (pa || hasRankData || blogPosts.length > 0)
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;

  function getGrade(score: number) {
    if (score >= 90) return { grade: 'S', label: '최상위', color: 'text-accent', bg: 'bg-accent/10' };
    if (score >= 75) return { grade: 'A', label: '상위', color: 'text-up', bg: 'bg-up/10' };
    if (score >= 60) return { grade: 'B', label: '중상위', color: 'text-[#2DB400]', bg: 'bg-[#2DB400]/10' };
    if (score >= 40) return { grade: 'C', label: '중위', color: 'text-amber-600', bg: 'bg-amber-50' };
    return { grade: 'D', label: '성장 중', color: 'text-dim', bg: 'bg-bg' };
  }
  const gradeInfo = getGrade(totalScore);

  const calcAllScores = () => ({
    total: totalScore,
    scores: allScores,
    grade: gradeInfo.grade,
  });

  if (totalScore === 0 && !analysisLoading) return null;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-[15px]">내 블로그 종합 점수</h3>
          <p className="text-[11px] text-dim mt-0.5">네이버 &ldquo;좋은 문서의 특성&rdquo; 기반 · 본문 {pa ? '10' : ''}개 글 분석</p>
        </div>
        <div className="text-right">
          {totalScore > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black">{totalScore}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeInfo.bg} ${gradeInfo.color}`}>
                {gradeInfo.grade}등급
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {analysisLoading ? (
        <div className="flex items-center justify-center py-6 gap-2 text-sm text-dim">
          <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          블로그 글 본문을 분석하고 있습니다...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <GradeGauge score={reliabilityScore} label="신뢰성" description="출처 · 인용문 · 검색 평판" color="#3B82F6" delay={100} />
            <GradeGauge score={experienceScore} label="경험" description="직접 촬영 · 1인칭 서술" color="#F59E0B" delay={150} />
            <GradeGauge score={originalityScore} label="독창성" description="고유 단어 · 원본 콘텐츠" color="#8B5CF6" delay={200} />
            <GradeGauge score={depthScore} label="심층성" description="글자 수 · 리스트 · 구조" color="#10B981" delay={250} />
            <GradeGauge score={readabilityScore} label="가독성" description="소제목 · 리스트 · 이미지" color="#EC4899" delay={300} />
            <GradeGauge score={consistencyScore} label="꾸준함" description="포스팅 빈도 · 정기성" color="#6366F1" delay={350} />
          </div>
          {pa && (
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-dim">
              <span className="bg-bg px-2 py-1 rounded-md">평균 {pa.averages.charCount.toLocaleString()}자</span>
              <span className="bg-bg px-2 py-1 rounded-md">이미지 {pa.averages.imageCount.toFixed(1)}장</span>
              {pa.metrics.avgImageSizeKB > 0 && (
                <span className={`px-2 py-1 rounded-md ${pa.metrics.originalImageRatio >= 0.5 ? 'bg-up/10 text-up' : 'bg-bg'}`}>
                  원본사진 {Math.round(pa.metrics.originalImageRatio * 100)}%
                </span>
              )}
              <span className="bg-bg px-2 py-1 rounded-md">문단 {pa.averages.paragraphCount}개</span>
              {pa.averages.headingCount > 0 && <span className="bg-bg px-2 py-1 rounded-md">소제목 {pa.averages.headingCount.toFixed(1)}개</span>}
              {pa.averages.linkCount > 0 && <span className="bg-bg px-2 py-1 rounded-md">출처 {pa.averages.linkCount.toFixed(1)}개</span>}
              {pa.averages.personalPronounCount > 0 && <span className="bg-bg px-2 py-1 rounded-md">경험표현 {pa.averages.personalPronounCount.toFixed(1)}회</span>}
              {pa.metrics.avgUniqueWordRatio > 0 && <span className="bg-bg px-2 py-1 rounded-md">고유단어 {Math.round(pa.metrics.avgUniqueWordRatio * 100)}%</span>}
              {pa.averages.listItemCount > 0 && <span className="bg-bg px-2 py-1 rounded-md">리스트 {pa.averages.listItemCount.toFixed(1)}개</span>}
              {pa.averages.quotationCount > 0 && <span className="bg-bg px-2 py-1 rounded-md">인용문 {pa.averages.quotationCount.toFixed(1)}개</span>}
              {pa.averages.videoCount > 0 && <span className="bg-bg px-2 py-1 rounded-md">영상 {pa.averages.videoCount.toFixed(1)}개</span>}
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
