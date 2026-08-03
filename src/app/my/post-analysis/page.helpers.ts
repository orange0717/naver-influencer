export interface BloggerProfile {
  blogId: string;
  displayName: string;
  isInfluencer: boolean;
}

export interface BlogPost {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  date: string;
  isPublic: boolean;
}

export interface PostAnalysis {
  postId: string;
  title: string;
  charCount: number;
  wordCount: number;
  imageCount: number;
  videoCount: number;
  paragraphCount: number;
  linkCount: number;
  headingCount: number;
  mapCount: number;
  personalPronounCount: number;
  uniqueWordRatio: number;
  listItemCount: number;
  quotationCount: number;
  tableCount: number;
  textPreview: string;
  originalImageCount: number;
  avgImageSizeKB: number;
  success: boolean;
}

export interface AiResult {
  aiProbability: number;
  aiReasoning: string;
  keywords: { keyword: string; relevance: 'high' | 'medium' | 'low'; searchable: boolean }[];
  keySentences: { sentence: string; type: 'topic' | 'evidence' | 'conclusion' | 'appeal'; importance: number }[];
  writingStyle: { tone: string; readability: string; originality: number };
  textLength: number;
}

export interface PlagiarismResult {
  totalChecked: number;
  duplicateCount: number;
  plagiarismRate: number;
  originalRate: number;
  sentences: {
    sentence: string;
    matches: { title: string; link: string; bloggerName: string; description: string }[];
    isDuplicate: boolean;
  }[];
}

export interface TextAnalysisResult {
  morphemes: {
    totalWords: number;
    uniqueWords: number;
    topWords: { word: string; count: number }[];
    distribution: { nouns: number; verbs: number; adjectives: number; adverbs: number; conjunctions: number };
  };
  sentences: {
    count: number;
    avgLength: number;
    minLength: number;
    maxLength: number;
    lengthDistribution: { label: string; count: number; percent: number }[];
    readabilityScore: number;
    readabilityLabel: string;
    sentences: { text: string; length: number; type: 'longest' | 'shortest' }[];
  };
  characters: {
    total: number;
    korean: { count: number; percent: number };
    english: { count: number; percent: number };
    number: { count: number; percent: number };
    special: { count: number; percent: number };
    readingTimeMin: number;
  };
}

export function getAiBadge(score: number) {
  if (score <= 30) return { bg: 'bg-text/10', text: 'text-text', border: 'border-text/20', label: '사람' };
  if (score <= 60) return { bg: 'bg-accent/15', text: 'text-accent', border: 'border-accent/30', label: '불확실' };
  return { bg: 'bg-down/15', text: 'text-down', border: 'border-down/30', label: 'AI 의심' };
}

export const sentenceTypeLabel: Record<string, string> = {
  topic: '주제', evidence: '근거', conclusion: '결론', appeal: '어필',
};

export async function getProfileFromApi(): Promise<BloggerProfile | null> {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.type === 'unified' && (data.blogId || data.id)) {
      return { blogId: data.blogId || data.id, displayName: data.name || data.blogId || data.id, isInfluencer: true };
    }
    if (data.type === 'blogger' && data.id) {
      return { blogId: data.id, displayName: data.name || data.id, isInfluencer: false };
    }
    if (data.type === 'influencer' && data.id) {
      return { blogId: data.blogId || data.id, displayName: data.name || data.id, isInfluencer: true };
    }
    return null;
  } catch { return null; }
}
