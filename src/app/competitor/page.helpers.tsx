import { extractBlogId } from '@/lib/blog-utils';

export type AnalysisTab = 'challenge' | 'blog' | 'posting';

export interface AuthInfo {
  naverId: string;
  blogId: string;
  displayName: string;
  subscriberCount: number;
  totalKeywords: number;
  top3Count: number;
  avgRank: number;
}

export interface BlogCompareData {
  mine: { todayVisitor: number; totalVisitor: number; subscriberCount: number; postCount: number };
  competitor: {
    todayVisitor: number;
    totalVisitor: number;
    subscriberCount: number;
    postCount: number;
    weeklyAvgVisitor: number | null;
    weeklyVisitors: { date: string; count: number }[];
    blogName: string;
    isInfluencer: boolean;
    influencerCategory: string | null;
    influencerSubCategory: string | null;
  };
}

export interface AiAnalysisResult {
  aiProbability: number;
  aiReasoning: string;
  keywords: { keyword: string; relevance: 'high' | 'medium' | 'low'; searchable: boolean }[];
  keySentences: { sentence: string; type: 'topic' | 'evidence' | 'conclusion' | 'appeal'; importance: number }[];
  writingStyle: { tone: string; readability: string; originality: number };
  textLength: number;
}

export interface CompetitorPost {
  id: string;
  title: string;
  url: string;
  date: string;
  commentCount: number;
  blogTab?: { exposed: boolean; rank: number | null };
  viewTab?: { exposed: boolean; rank: number | null };
  ai?: AiAnalysisResult;
  aiError?: string;
}

// AI 의심도 임계값: 50% 이상 = AI 추정 (사용자 결정)
export const AI_THRESHOLD = 50;
export function getAiBadgeStyle(score: number) {
  if (score < 30) return { bg: 'bg-up/10', text: 'text-up', label: '사람' };
  if (score < AI_THRESHOLD) return { bg: 'bg-dim/15', text: 'text-dim', label: '불확실' };
  return { bg: 'bg-down/15', text: 'text-down', label: 'AI 의심' };
}
export const sentenceTypeLabel: Record<string, string> = {
  topic: '주제', evidence: '근거', conclusion: '결론', appeal: '어필',
};

// 포스팅 URL에서 blogId + logNo 추출 (경로 또는 blogId/logNo 쿼리)
export function extractPostInfo(input: string): { blogId: string; logNo: string | null } {
  const trimmed = input.trim();
  const queryBlog = trimmed.match(/[?&]blogId=([a-zA-Z0-9_-]+)/);
  const queryLog = trimmed.match(/[?&]logNo=(\d+)/);
  if (queryBlog && queryLog) {
    return { blogId: queryBlog[1], logNo: queryLog[1] };
  }
  const pathMatch = trimmed.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
  if (pathMatch) {
    return { blogId: pathMatch[1], logNo: pathMatch[2] };
  }
  return { blogId: extractBlogId(trimmed), logNo: null };
}

export interface QuotaInfo {
  plan: 'free' | 'blogger' | 'influencer';
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
}

// ─── 통계 비교 행 컴포넌트 ───
export function StatRow({ label, value, compare, suffix, invertCompare }: {
  label: string;
  value: number;
  compare?: number;
  suffix?: string;
  invertCompare?: boolean; // true면 낮을수록 좋음 (누락율)
}) {
  const formatted = value.toLocaleString();
  const isHigher = compare !== undefined && value > compare;
  const isLower = compare !== undefined && value < compare;

  // invertCompare: 누락율은 낮을수록 좋으므로 색상 반전
  const colorClass = invertCompare
    ? (isHigher ? 'text-down' : isLower ? 'text-up' : 'text-text')
    : (isHigher ? 'text-up' : isLower ? 'text-down' : 'text-text');

  const showUp = invertCompare ? isLower : isHigher;
  const showDown = invertCompare ? isHigher : isLower;

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-bg/50 rounded-lg">
      <span className="text-xs text-dim">{label}</span>
      <span className={`text-sm font-bold font-rank ${colorClass}`}>
        {formatted}{suffix || ''}
        {showUp && <span className="text-[10px] ml-1">▲</span>}
        {showDown && <span className="text-[10px] ml-1">▼</span>}
      </span>
    </div>
  );
}
