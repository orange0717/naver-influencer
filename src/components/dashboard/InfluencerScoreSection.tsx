'use client';

import { useState } from 'react';
import GradeGauge from './GradeGauge';
import GlassCard from './GlassCard';

interface InfluencerScoreSectionProps {
  subscriberCount: number;
  categoryRank: number;
  categoryTotal: number;
  totalKeywords: number;
  rankedKeywords: number;
  top3Count: number;
  top10Count: number;
  avgRank: number;
  rankUpCount: number;
  rankDownCount: number;
  integratedTop3Count: number;
  overallRank: number;
  overallTotal: number;
}

function ScoreContent({ influenceScore, expertiseScore, exposureScore, growthScore, activityScore, competitivenessScore, subscriberCount, totalKeywords, rankedKeywords, top3Count, integratedTop3Count, rankUpCount }: { influenceScore: number; expertiseScore: number; exposureScore: number; growthScore: number; activityScore: number; competitivenessScore: number; subscriberCount: number; totalKeywords: number; rankedKeywords: number; top3Count: number; integratedTop3Count: number; rankUpCount: number }) {
  const [showTags, setShowTags] = useState(false);
  return (
    <>
      <div className="grid grid-cols-3 gap-3 cursor-pointer" onClick={() => setShowTags(!showTags)}>
        <GradeGauge score={influenceScore} label="영향력" description="사용자 피드백 · 팬 수" color="#3B82F6" delay={100} />
        <GradeGauge score={expertiseScore} label="전문성" description="주제 전문성 · 콘텐츠 적합성" color="#F59E0B" delay={150} />
        <GradeGauge score={exposureScore} label="노출도" description="검색 노출 · 평균 순위" color="#8B5CF6" delay={200} />
        <GradeGauge score={growthScore} label="성장성" description="순위 상승 · 하락 비율" color="#10B981" delay={250} />
        <GradeGauge score={activityScore} label="활동성" description="참여 이력 · 콘텐츠 품질" color="#EC4899" delay={300} />
        <GradeGauge score={competitivenessScore} label="경쟁력" description="주제 랭킹 · TOP 3 보유" color="#6366F1" delay={350} />
      </div>
      {showTags && (
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-dim animate-fade-in">
          <span className="bg-bg px-2 py-1 rounded-md">팬 {subscriberCount.toLocaleString()}명</span>
          <span className="bg-bg px-2 py-1 rounded-md">키워드 {totalKeywords}개</span>
          <span className="bg-bg px-2 py-1 rounded-md">노출 {rankedKeywords}개</span>
          {top3Count > 0 && <span className="bg-up/10 text-up px-2 py-1 rounded-md">TOP 3 {top3Count}개</span>}
          {integratedTop3Count > 0 && <span className="bg-gold/10 text-gold px-2 py-1 rounded-md">통합검색 {integratedTop3Count}개</span>}
          {rankUpCount > 0 && <span className="bg-up/10 text-up px-2 py-1 rounded-md">상승 {rankUpCount}개</span>}
        </div>
      )}
    </>
  );
}

function getGrade(score: number) {
  if (score >= 90) return { grade: 'S', label: '최상위', color: 'text-accent', bg: 'bg-accent/10' };
  if (score >= 75) return { grade: 'A', label: '상위', color: 'text-up', bg: 'bg-up/10' };
  if (score >= 60) return { grade: 'B', label: '중상위', color: 'text-[#2DB400]', bg: 'bg-[#2DB400]/10' };
  if (score >= 40) return { grade: 'C', label: '중위', color: 'text-amber-600', bg: 'bg-amber-50' };
  return { grade: 'D', label: '성장 중', color: 'text-dim', bg: 'bg-bg' };
}

export default function InfluencerScoreSection({
  subscriberCount,
  categoryRank,
  categoryTotal,
  totalKeywords,
  rankedKeywords,
  top3Count,
  top10Count,
  avgRank,
  rankUpCount,
  rankDownCount,
  integratedTop3Count,
  overallRank,
  overallTotal,
}: InfluencerScoreSectionProps) {
  const hasData = rankedKeywords > 0;

  // 1. 영향력 (Influence): 팬 수 + 카테고리 내 순위
  const influenceScore = Math.min(100, Math.round(
    // 팬 수 (max 50)
    (subscriberCount >= 50000 ? 50 : subscriberCount >= 10000 ? 40 :
     subscriberCount >= 5000 ? 30 : subscriberCount >= 1000 ? 20 :
     subscriberCount >= 100 ? 10 : 5) +
    // 카테고리 내 순위 백분율 (max 50)
    (categoryRank > 0 && categoryTotal > 0
      ? Math.round((1 - categoryRank / categoryTotal) * 50)
      : 0)
  ));

  // 2. 전문성 (Expertise): 참여 키워드 수 + TOP 3 비율
  const expertiseScore = hasData ? Math.min(100, Math.round(
    // 참여 키워드 수 (max 40)
    (totalKeywords >= 50 ? 40 : totalKeywords >= 30 ? 32 :
     totalKeywords >= 15 ? 24 : totalKeywords >= 5 ? 16 :
     totalKeywords >= 1 ? 8 : 0) +
    // TOP 3 비율 (max 35)
    Math.min(35, Math.round((top3Count / Math.max(totalKeywords, 1)) * 35)) +
    // 통합검색 TOP 3 보너스 (max 25)
    (integratedTop3Count >= 5 ? 25 : integratedTop3Count >= 3 ? 20 :
     integratedTop3Count >= 1 ? 12 : 0)
  )) : 0;

  // 3. 노출도 (Exposure): 노출 키워드 비율 + 평균 순위
  const exposureRate = totalKeywords > 0 ? rankedKeywords / totalKeywords : 0;
  const exposureScore = hasData ? Math.min(100, Math.round(
    // 노출 비율 (max 50)
    exposureRate * 50 +
    // 평균 순위 (max 30): 낮을수록 좋음
    (avgRank > 0 && avgRank <= 3 ? 30 : avgRank <= 5 ? 24 :
     avgRank <= 10 ? 18 : avgRank <= 15 ? 12 : avgRank <= 20 ? 6 : 3) +
    // TOP 10 비율 (max 20)
    Math.min(20, Math.round((top10Count / Math.max(totalKeywords, 1)) * 20))
  )) : 0;

  // 4. 성장성 (Growth): 순위 상승 키워드 + 상승 비율
  const growthScore = hasData ? Math.min(100, Math.round(
    // 상승 키워드 수 (max 40)
    (rankUpCount >= 10 ? 40 : rankUpCount >= 5 ? 30 :
     rankUpCount >= 3 ? 22 : rankUpCount >= 1 ? 12 : 0) +
    // 상승 비율 (max 30): 상승 키워드 / 전체
    (rankedKeywords > 0
      ? Math.min(30, Math.round((rankUpCount / rankedKeywords) * 30))
      : 0) +
    // 하락 패널티 반전 (max 30): 하락 적을수록 높음
    (rankDownCount === 0 ? 30 : rankDownCount <= 2 ? 20 :
     rankDownCount <= 5 ? 10 : 0)
  )) : 0;

  // 5. 활동성 (Activity): 키워드 참여 활발도
  const activityScore = Math.min(100, Math.round(
    // 참여 키워드 수 (max 40)
    (totalKeywords >= 30 ? 40 : totalKeywords >= 20 ? 32 :
     totalKeywords >= 10 ? 24 : totalKeywords >= 5 ? 16 :
     totalKeywords >= 1 ? 8 : 0) +
    // 노출 키워드 수 (max 30): 활발한 활동 지표
    (rankedKeywords >= 20 ? 30 : rankedKeywords >= 10 ? 24 :
     rankedKeywords >= 5 ? 16 : rankedKeywords >= 1 ? 8 : 0) +
    // 순위 변동 활발도 (max 30): 변동 있음 = 활발한 경쟁
    ((rankUpCount + rankDownCount) >= 10 ? 30 :
     (rankUpCount + rankDownCount) >= 5 ? 22 :
     (rankUpCount + rankDownCount) >= 2 ? 14 :
     (rankUpCount + rankDownCount) >= 1 ? 8 : 0)
  ));

  // 6. 경쟁력 (Competitiveness): 전체 인플루언서 대비 상대 성적
  const competitivenessScore = overallRank > 0 && overallTotal > 0
    ? Math.min(100, Math.round(
        // 전체 순위 백분율 (max 60)
        (1 - overallRank / overallTotal) * 60 +
        // TOP 3 보유 수 (max 25)
        (top3Count >= 10 ? 25 : top3Count >= 5 ? 20 :
         top3Count >= 3 ? 15 : top3Count >= 1 ? 8 : 0) +
        // 평균 순위 보너스 (max 15)
        (avgRank > 0 && avgRank <= 5 ? 15 : avgRank <= 10 ? 10 : avgRank <= 20 ? 5 : 0)
      ))
    : 0;

  const allScores = [influenceScore, expertiseScore, exposureScore, growthScore, activityScore, competitivenessScore];
  const totalScore = hasData || subscriberCount > 0
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;
  const gradeInfo = getGrade(totalScore);

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-[15px]">인플루언서 종합 점수</h3>
          <p className="text-[11px] text-dim mt-0.5">키워드챌린지 성과 기반 6차원 분석</p>
        </div>
        <div className="text-right">
          {totalScore > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black">{totalScore}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${gradeInfo.bg} ${gradeInfo.color}`}>
                {gradeInfo.grade}등급
              </span>
            </div>
          )}
        </div>
      </div>

      {!hasData && subscriberCount === 0 ? (
        <div className="text-center py-6 text-dim text-sm">
          <p>키워드를 동기화하면</p>
          <p>인플루언서 종합 등급이 계산됩니다.</p>
        </div>
      ) : (
        <ScoreContent
          influenceScore={influenceScore} expertiseScore={expertiseScore}
          exposureScore={exposureScore} growthScore={growthScore}
          activityScore={activityScore} competitivenessScore={competitivenessScore}
          subscriberCount={subscriberCount} totalKeywords={totalKeywords}
          rankedKeywords={rankedKeywords} top3Count={top3Count}
          integratedTop3Count={integratedTop3Count} rankUpCount={rankUpCount}
        />
      )}
    </GlassCard>
  );
}
