import { ReactNode } from 'react';

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
  viewCount?: number;
}

export interface SubScores {
  sourceUsage: number;
  faq: number;
  table: number;
  image: number;
  freshness: number;
  length: number;
  headings: number;
  keywordDensity: number;
  entity: number;
  internalLink: number;
  externalLink: number;
  eeat: number;
  schema: null;
}

export interface PostScore {
  postId: string;
  title: string | null;
  viewCount: number | null;
  publishedAt: string | null;
  representativeKeyword: string | null;
  aiScore: number;
  seoScore: number;
  geoScore: number;
  aeoScore: number;
  subScores: SubScores;
  causeTags: string[];
  computedAt: string;
}

export const SCORE_API = '/api/blog/analyze-post-score';

export const SUB_SCORE_LABELS: Record<keyof Omit<SubScores, 'schema'>, string> = {
  sourceUsage: '출처 활용',
  faq: 'FAQ',
  table: '표',
  image: '이미지',
  freshness: '최신성',
  length: '본문 길이',
  headings: '소제목',
  keywordDensity: '키워드 밀도',
  entity: '엔티티',
  internalLink: '내부링크',
  externalLink: '외부링크',
  eeat: 'E-E-A-T',
};

export const IMPROVEMENT_SUGGESTIONS: Partial<Record<keyof Omit<SubScores, 'schema'>, string>> = {
  sourceUsage: '뉴스·정부·공공기관 등 공식 출처 링크를 1~2개 추가하세요.',
  faq: '"자주 묻는 질문" 형태의 FAQ 섹션을 추가하세요.',
  table: '핵심 정보를 정리한 표를 1개 이상 추가하세요.',
  image: '사진(직접 촬영 원본 포함)을 3~5장 이상 추가하세요.',
  freshness: '오래된 정보라면 최신 내용으로 갱신하고 발행일을 새로 올리세요.',
  length: '본문을 800자 이상으로 보강하세요.',
  headings: '소제목(H태그)을 2~3개 이상 추가해 구조를 명확히 하세요.',
  keywordDensity: '대표 키워드를 본문에 자연스럽게 더 포함시키세요(0.5~2.5% 권장).',
  entity: '주제와 관련된 구체적인 용어·개체명을 더 다양하게 언급하세요.',
  internalLink: '내 블로그의 관련 포스팅으로 연결되는 링크를 추가하세요.',
  externalLink: '신뢰할 수 있는 외부 자료로 연결되는 링크를 추가하세요.',
  eeat: '1인칭 경험(직접 해봤어요 등)과 인용·근거 표기를 추가하세요.',
};

export function scoreColor(score: number): string {
  if (score >= 70) return 'text-up';
  if (score >= 40) return 'text-gold';
  return 'text-down';
}

export function ScoreCell({ score }: { score: number | undefined }) {
  if (score === undefined) return <span className="text-[10px] text-dim/50">--</span>;
  return <span className={`text-xs font-bold ${scoreColor(score)}`}>{score}</span>;
}

/** "개선하기" 패널 — Phase 1은 규칙 기반 sub-score만으로 약점을 나열하는 기초 진단(Claude 미사용). */
export function ImprovePanel({ score }: { score: PostScore }) {
  const weakItems = (Object.keys(SUB_SCORE_LABELS) as (keyof Omit<SubScores, 'schema'>)[])
    .filter(key => score.subScores[key] < 50)
    .sort((a, b) => score.subScores[a] - score.subScores[b]);

  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs">
          <span>AI <b className={scoreColor(score.aiScore)}>{score.aiScore}</b></span>
          <span>SEO <b className={scoreColor(score.seoScore)}>{score.seoScore}</b></span>
          <span>GEO <b className={scoreColor(score.geoScore)}>{score.geoScore}</b></span>
          <span>AEO <b className={scoreColor(score.aeoScore)}>{score.aeoScore}</b></span>
        </div>
        <span className="text-[10px] text-dim">규칙 기반 기초 진단입니다 — AI(Claude) 분석 기능은 준비 중입니다.</span>
      </div>
      {weakItems.length === 0 ? (
        <p className="text-xs text-dim">뚜렷한 약점이 발견되지 않았습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {weakItems.map(key => (
            <li key={key} className="text-xs flex items-start gap-2">
              <span className="font-semibold text-down shrink-0">{SUB_SCORE_LABELS[key]}({score.subScores[key]}점)</span>
              <span className="text-dim">{IMPROVEMENT_SUGGESTIONS[key]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface BriefingResult {
  // AI 브리핑(통합검색 인라인 위젯) — AI 탭과 완전히 별개인 독립 서비스
  hasAiBriefing: boolean | null;  // 이 키워드로 통합검색 시 AI 브리핑 위젯 콘텐츠 자체가 생성됐는지
  exposed: boolean | null;        // 그 위젯의 출처 목록에 내 게시글(blogId+postId)이 포함되는지
  sourceIndex: number | null;
  sourceTotal: number | null;
  matchedTitle: string | null;
  // AI 탭 — 위 필드와 서로 무관하게 독립적으로 판정된 결과(같은 키워드라도 소스 큐레이션이 다름)
  hasAiTab: boolean | null;       // 이 키워드로 AI 탭에 들어갔을 때 콘텐츠 자체가 생성됐는지
  tabExposed: boolean | null;     // AI 탭의 출처 목록에 내 게시글이 포함되는지
  tabSourceIndex: number | null;
  tabSourceTotal: number | null;
  tabMatchedTitle: string | null;
  error?: string;
  searchVolumeMonthly?: number | null;
  competition?: string | null;
  relatedKeywordCount?: number | null;
  checkedAt?: string | null;
}

export const STATE_API = '/api/my/ai-briefing-state';

// 서버(DB)에서 저장된 타겟 키워드/AI 브리핑 결과를 복원한다. (기기 간 동기화)
export async function fetchBriefingState(blogId: string): Promise<{
  postKeywords: Record<string, string[]>;
  briefingResults: Record<string, BriefingResult>;
}> {
  const res = await fetch(`${STATE_API}?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('상태 로드 실패');
  return res.json();
}

// 포스트별 타겟 키워드 할당을 DB에 저장 (제거된 키워드 삭제 포함)
export function saveKeywordsToDb(blogId: string, postId: string, keywords: string[]): void {
  fetch(STATE_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keywords }),
  }).catch(() => { /* 낙관적 UI — 실패는 다음 동작에서 재시도됨 */ });
}

// 단일 (post, keyword) AI 브리핑 확인 결과를 DB에 갱신
export function saveBriefingResultToDb(blogId: string, postId: string, keyword: string, result: BriefingResult): void {
  fetch(STATE_API, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keyword, result }),
  }).catch(() => { /* ignore */ });
}

export function rankKey(postId: string, keyword: string): string {
  return `${postId}::${keyword}`;
}

/**
 * "AI 브리핑" 컬럼 배지 — 통합검색 인라인 위젯(AI 탭과 무관한 별개 서비스) 결과만 사용.
 * 2026-07-04(6차) 오렌지 지시: 상태 문구를 "인용"/"미인용" 두 가지로만 통일한다.
 * 콘텐츠 자체가 생성되지 않은 경우("없음")와 생성됐지만 내 글이 인용되지 않은 경우를
 * 더 이상 구분 표시하지 않고 둘 다 "미인용"으로 표기한다 — exposed 단일 필드로만 판정.
 */
export function BriefingLabelBadge({ result }: { result?: BriefingResult }) {
  if (!result) return <span className="text-[10px] text-dim/50">--</span>;
  if (!result.exposed) {
    return (
      <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded-full" title="AI 브리핑 출처 목록에 이 게시글이 없습니다.">
        미인용
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full" title="AI 브리핑의 출처 목록에 이 게시글이 포함되어 있습니다.">
        인용
      </span>
      {result.sourceIndex && (
        <span className="text-[10px] text-dim">
          출처 #{result.sourceIndex}{result.sourceTotal ? `/${result.sourceTotal}` : ''}
        </span>
      )}
    </span>
  );
}

/**
 * "AI 탭" 컬럼 배지 — AI 탭(전체화면 채팅형 UI, AI 브리핑과 무관한 별개 서비스) 결과만 사용.
 * ⚠️ 절대 hasAiBriefing/exposed(AI 브리핑 필드)를 참조하지 않는다 — 같은 키워드라도 두 서비스는
 * 서로 다른 소스 큐레이션을 쓰므로 "브리핑 미인용+탭 인용" 같은 조합도 정상적으로 나올 수 있다.
 * 2026-07-04(6차) 오렌지 지시: 상태 문구를 "인용"/"미인용" 두 가지로만 통일(BriefingLabelBadge와 동일 원칙).
 */
export function AiTabBadge({ result }: { result?: BriefingResult }) {
  if (!result) return <span className="text-[10px] text-dim/50">--</span>;
  if (!result.tabExposed) {
    return (
      <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded-full" title="AI 탭 출처 목록에 이 게시글이 없습니다.">
        미인용
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full" title="AI 탭의 출처 목록에 이 게시글이 포함되어 있습니다.">
        인용
      </span>
      {result.tabSourceIndex && (
        <span className="text-[10px] text-dim">
          출처 #{result.tabSourceIndex}{result.tabSourceTotal ? `/${result.tabSourceTotal}` : ''}
        </span>
      )}
    </span>
  );
}

/** 키워드 검색 결과 카드 — AnimatedStatCard와 동일한 톤이지만 ○/X·텍스트 값(경쟁도 등)도 표시 가능 */
export function ResultStatCard({
  label, value, color = 'accent', spinning,
}: { label: string; value: ReactNode; color?: 'accent' | 'up' | 'down' | 'gold' | 'dim'; spinning?: boolean }) {
  const colorMap: Record<string, string> = {
    accent: 'text-accent', up: 'text-up', down: 'text-down', gold: 'text-gold', dim: 'text-dim',
  };
  return (
    <div className="relative h-28 flex flex-col justify-between bg-surface rounded-2xl border border-border p-4 shadow-xs">
      {spinning && (
        <span className="absolute top-2 right-2 w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      )}
      <p className="stat-title">{label}</p>
      <span className={`text-xl font-extrabold ${colorMap[color]} truncate`}>{value}</span>
    </div>
  );
}

/** 확인 진행 단계 → 사용자에게 보여줄 문구 (2026-07-04(6차) 진행 상태 UI) */
export const STAGE_LABELS: Record<string, string> = {
  searching: '검색 중...',
  briefing: 'AI 브리핑 확인 중...',
  tab: 'AI 탭 확인 중...',
  comparing: '출처 비교 중...',
  done: '완료',
};

export function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export interface AnalysisEntry {
  keyword: string;
  post: BlogPost;
  briefing: BriefingResult;
  searchVolume: { total: number | string; competition: string } | null;
  relatedCount: number | null;
  checkedAt: string;
}
