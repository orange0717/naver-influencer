import { ReactNode } from 'react';
import { CITATION_STATUS_LABELS, citationStatusColor, type CitationState } from '@/lib/ai-citation-status';

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

export type CheckStatus = 'ok' | 'transient_error' | 'unanalyzable';

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
  // 인용 근거 URL(스펙 #8/#19) — 매칭된 내 글의 출처 URL. 미인용/미확인이면 null.
  matchedUrl?: string | null;
  tabMatchedUrl?: string | null;
  postUrl?: string | null;
  error?: string;
  searchVolumeMonthly?: number | null;
  competition?: string | null;
  relatedKeywordCount?: number | null;
  checkedAt?: string | null;
  checkStatus?: CheckStatus | null;
  lastError?: string | null;
}

export const EMPTY_BRIEFING: BriefingResult = {
  hasAiBriefing: null, exposed: null, sourceIndex: null, sourceTotal: null, matchedTitle: null,
  hasAiTab: null, tabExposed: null, tabSourceIndex: null, tabSourceTotal: null, tabMatchedTitle: null,
  checkedAt: null, checkStatus: null, lastError: null,
};

export const STATE_API = '/api/my/ai-briefing-state';
/** 키워드 SoT — 키워드순위 화면과 "같은" 저장소(keyword_rank_lookups). AI 브리핑은 여기서 읽기만 한다. */
export const RANKING_STATE_API = '/api/my/keyword-ranking-state';

// 서버(DB)에서 저장된 AI 브리핑/AI 탭 결과를 복원한다. (기기 간 동기화)
// 키워드 목록은 여기서 읽지 않는다 — 키워드 SoT는 fetchSharedKeywordState(키워드순위)다.
export async function fetchBriefingState(blogId: string): Promise<{
  briefingResults: Record<string, BriefingResult>;
}> {
  const res = await fetch(`${STATE_API}?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('상태 로드 실패');
  return res.json();
}

export interface KeywordMeta {
  keywordType?: string | null;
  isPrimary?: boolean | null;
  baseKeyword?: string | null;
  normalizedKeyword?: string | null;
  postUrl?: string | null;
}

/**
 * 대표 키워드 공용 소스(post_representative_keywords)에서 복원한 포스팅별 항목.
 * 키워드순위 화면이 쓰는 것과 같은 테이블이라 한쪽에서 고치면 양쪽에 동시에 반영된다.
 */
export interface RepKeywordEntry {
  keyword: string | null;
  source: string | null;
  confidence?: number | null;
  /** 제목 분석으로 뽑힌 검색 가능한 키워드 후보 전체(대표 포함) — '추출 키워드' 열에 표시 */
  candidates?: string[];
  /** 대표 키워드가 마지막으로 바뀐 시각 — 이보다 앞선 확인 결과는 무효로 본다(스펙 #9) */
  keywordChangedAt?: string | null;
}

/**
 * "추출 키워드" 열 — 포스팅 제목에서 자동 추출된 키워드 후보를 그대로 보여준다(스펙 #1/#2/#5).
 * 후보를 누르면 그 키워드가 대표 키워드가 되고, 대표가 바뀌면 이전 확인 결과는 무효가 된다.
 */
export function ExtractedKeywordsCell({
  candidates, representative, onPick, onExtract, extracting, disabled,
}: {
  candidates: string[];
  representative: string | null;
  onPick: (keyword: string) => void;
  onExtract: () => void;
  extracting: boolean;
  disabled?: boolean;
}) {
  if (extracting) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-dim">
        <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
        키워드 추출 중...
      </span>
    );
  }
  if (candidates.length === 0) {
    return (
      <button
        type="button"
        onClick={onExtract}
        disabled={disabled}
        className="text-[11px] text-accent cursor-pointer hover:underline disabled:opacity-50"
        title="포스팅 제목을 분석해 검색 가능한 키워드 후보를 뽑습니다(네이버 무호출)"
      >
        키워드 추출
      </button>
    );
  }
  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      {candidates.map(c => {
        const isRep = !!representative && c === representative;
        return (
          <button
            key={c}
            type="button"
            onClick={() => { if (!isRep) onPick(c); }}
            disabled={isRep || disabled}
            className={`max-w-full truncate px-1.5 py-0.5 rounded-full text-[10px] border transition ${
              isRep
                ? 'text-accent bg-accent/10 border-accent/30 font-semibold cursor-default'
                : 'text-dim bg-bg border-border/60 cursor-pointer hover:text-accent hover:border-accent/40'
            }`}
            title={isRep ? `${c} — 현재 대표 키워드` : `${c} — 대표 키워드로 지정`}
          >
            {c}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onExtract}
        disabled={disabled}
        className="text-[10px] text-dim/70 hover:text-accent cursor-pointer disabled:opacity-50 shrink-0"
        title="현행 추출 규칙으로 이 포스팅의 키워드를 다시 뽑습니다"
      >
        ⟳
      </button>
    </div>
  );
}

/**
 * 키워드순위가 쓰는 키워드 목록을 그대로 읽어온다(스펙 #1/#10).
 * X-View-Token을 붙이지 않으므로 무료 조회 한도를 소모하지 않는다(analysis-quota requireToken).
 */
export async function fetchSharedKeywordState(blogId: string): Promise<{
  postKeywords: Record<string, string[]>;
  keywordMeta: Record<string, KeywordMeta>;
}> {
  const res = await fetch(`${RANKING_STATE_API}?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('키워드 로드 실패');
  const data = await res.json();
  return { postKeywords: data.postKeywords || {}, keywordMeta: data.keywordMeta || {} };
}

/**
 * 포스트의 키워드 목록을 키워드순위와 "같은" 저장소에 저장한다.
 * AI 브리핑 전용 키워드 테이블을 따로 두지 않기 위한 유일한 쓰기 경로(스펙 #10).
 * PUT은 넘긴 목록으로 치환하므로 항상 기존 목록 + 신규를 합쳐서 보낸다.
 */
export function saveSharedKeywords(blogId: string, postId: string, keywords: string[], postUrl?: string): void {
  fetch(RANKING_STATE_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keywords, postUrl }),
  }).catch(() => { /* 낙관적 UI — 실패는 다음 동작에서 재시도됨 */ });
}

// 단일 (post, keyword) AI 브리핑 확인 결과를 DB에 갱신. postUrl을 넘기면 인용 근거와 함께 post_url도 저장(스펙 #19).
export function saveBriefingResultToDb(blogId: string, postId: string, keyword: string, result: BriefingResult, postUrl?: string): void {
  fetch(STATE_API, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keyword, result, postUrl }),
  }).catch(() => { /* ignore */ });
}

// 확인 실패(일시적 오류/분석불가)를 DB에 상태로 기록 — 성공 결과 컬럼은 건드리지 않는다.
export function saveBriefingErrorToDb(
  blogId: string, postId: string, keyword: string, checkStatus: Exclude<CheckStatus, 'ok'>, error?: string,
): void {
  fetch(STATE_API, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keyword, checkStatus, error }),
  }).catch(() => { /* ignore */ });
}

export function rankKey(postId: string, keyword: string): string {
  return `${postId}::${keyword}`;
}

/**
 * 확인 실패 상태(일시적 오류/분석불가) 공용 배지 — 성공 판정과 시각적으로 구분한다.
 * check_status가 오류일 때는 직전에 남아있던 exposed 값이 아니라 "마지막 확인이 실패했음"을
 * 정직하게 표기한다(스펙 #8: 검증 불가는 절대 미인용/미노출로 처리하지 않는다).
 */
function ErrorStatusBadge({ status, lastError }: { status: CheckStatus; lastError?: string | null }) {
  if (status === 'unanalyzable') {
    return (
      <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded-full" title={lastError || '구조적으로 분석할 수 없습니다.'}>
        분석불가
      </span>
    );
  }
  return (
    <span className="text-xs text-gold bg-gold/10 px-2 py-0.5 rounded-full" title={lastError || '네이버 접근 제한 등 일시적 오류로 확인하지 못했습니다.'}>
      조회 실패
    </span>
  );
}

function UncheckedBadge({ title }: { title: string }) {
  return <span className="text-xs text-dim/70 bg-bg px-2 py-0.5 rounded-full" title={title}>확인 전</span>;
}

/**
 * "AI 브리핑" 컬럼 배지(스펙 #8) — 통합검색 인라인 위젯 결과만 사용.
 * 확인 전 / 인용됨 / 미인용(브리핑은 떴으나 내 글 없음) / 브리핑 없음(그 키워드에 브리핑 자체가 안 뜸) / 조회 실패.
 */
export function BriefingLabelBadge({ result }: { result?: BriefingResult }) {
  if (!result || (!result.checkedAt && !result.checkStatus)) return <UncheckedBadge title="아직 이 키워드로 AI 브리핑을 확인한 적이 없습니다." />;
  if (result.checkStatus === 'transient_error' || result.checkStatus === 'unanalyzable') {
    return <ErrorStatusBadge status={result.checkStatus} lastError={result.lastError} />;
  }
  if (result.exposed) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full" title="AI 브리핑의 출처 목록에 이 게시글이 포함되어 있습니다.">
          인용됨
        </span>
        {result.sourceIndex && (
          <span className="text-[10px] text-dim">
            출처 #{result.sourceIndex}{result.sourceTotal ? `/${result.sourceTotal}` : ''}
          </span>
        )}
      </span>
    );
  }
  if (result.hasAiBriefing === false) {
    return (
      <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded-full" title="이 키워드로 검색해도 AI 브리핑 자체가 생성되지 않았습니다.">
        브리핑 없음
      </span>
    );
  }
  return (
    <span className="text-xs text-down bg-down/10 px-2 py-0.5 rounded-full" title="AI 브리핑은 생성됐지만 출처 목록에 이 게시글이 없습니다.">
      미인용
    </span>
  );
}

/**
 * "AI 탭" 컬럼 배지(스펙 #8) — AI 탭 결과만 사용. 확인 전 / 노출 / 미노출 / 조회 실패.
 * ⚠️ 절대 hasAiBriefing/exposed(AI 브리핑 필드)를 참조하지 않는다 — 같은 키워드라도 두 서비스는
 * 서로 다른 소스 큐레이션을 쓰므로 "브리핑 미인용 + 탭 노출" 같은 조합도 정상적으로 나온다(스펙 #4).
 */
export function AiTabBadge({ result }: { result?: BriefingResult }) {
  if (!result || (!result.checkedAt && !result.checkStatus)) return <UncheckedBadge title="아직 이 키워드로 AI 탭을 확인한 적이 없습니다." />;
  if (result.checkStatus === 'transient_error' || result.checkStatus === 'unanalyzable') {
    return <ErrorStatusBadge status={result.checkStatus} lastError={result.lastError} />;
  }
  if (result.tabExposed) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full" title="AI 탭의 출처 목록에 이 게시글이 포함되어 있습니다.">
          노출
        </span>
        {result.tabSourceIndex && (
          <span className="text-[10px] text-dim">
            {result.tabSourceIndex}번째{result.tabSourceTotal ? `/${result.tabSourceTotal}` : ''}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="text-xs text-down bg-down/10 px-2 py-0.5 rounded-full" title="AI 탭의 출처 목록에 이 게시글이 없습니다.">
      미노출
    </span>
  );
}

/**
 * 종합 상태 배지(스펙 #7 "상태" 컬럼) — 브리핑·탭을 합친 하나의 상태.
 * 색상·라벨은 ai-citation-status.ts의 단일 소스를 그대로 사용한다.
 */
export function CitationStatusBadge({ state }: { state: CitationState }) {
  const label = CITATION_STATUS_LABELS[state];
  const color = citationStatusColor(state);
  const cls: Record<string, string> = {
    up: 'text-up bg-up/10 font-bold',
    gold: 'text-gold bg-gold/10 font-semibold',
    accent: 'text-accent bg-accent/10 font-semibold',
    dim: 'text-dim bg-bg',
  };
  if (state === 'checking') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cls.accent}`}>
        <span className="w-2.5 h-2.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
        {label}
      </span>
    );
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls[color]}`}>{label}</span>;
}

/**
 * 상세 패널(스펙 #7 "상세" · #12) — 한 (포스팅, 키워드) 행의 실제 조회 결과를 보여준다.
 * 인용 근거 URL·출처 순번·마지막 확인 시각·실패 사유까지 저장된 값 그대로 표시한다.
 */
export function CitationDetailPanel({
  post, keyword, result, isPrimary,
}: {
  post: BlogPost;
  keyword: string;
  result?: BriefingResult;
  isPrimary: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3.5 space-y-3 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-dim">키워드</span>
        <span className="font-semibold">{keyword}</span>
        {isPrimary && <span className="text-[9px] text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">대표</span>}
        {result?.checkedAt && <span className="text-[10px] text-dim">마지막 확인 {timeAgo(result.checkedAt)}</span>}
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline ml-auto">포스팅 열기 ↗</a>
      </div>

      <div className="rounded-lg bg-bg/60 border border-border/60 p-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-dim w-16 shrink-0">AI 브리핑</span>
          <BriefingLabelBadge result={result} />
          {result?.matchedUrl && (
            <a href={result.matchedUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline truncate max-w-[240px]">
              인용 근거 {result.sourceIndex ? `#${result.sourceIndex}` : ''} ↗
            </a>
          )}
          {result?.matchedTitle && <span className="text-[10px] text-dim truncate max-w-[240px]">{result.matchedTitle}</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-dim w-16 shrink-0">AI 탭</span>
          <AiTabBadge result={result} />
          {result?.tabMatchedUrl && (
            <a href={result.tabMatchedUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline truncate max-w-[240px]">
              노출 근거 {result.tabSourceIndex ? `#${result.tabSourceIndex}` : ''} ↗
            </a>
          )}
          {result?.tabMatchedTitle && <span className="text-[10px] text-dim truncate max-w-[240px]">{result.tabMatchedTitle}</span>}
        </div>
      </div>

      {!result?.checkedAt && !result?.checkStatus && (
        <p className="text-dim">아직 확인한 적이 없습니다. &lsquo;다시 검사&rsquo;를 눌러 이 키워드의 AI 브리핑·AI 탭을 조회하세요.</p>
      )}
      {(result?.checkStatus === 'transient_error' || result?.checkStatus === 'unanalyzable') && (
        <p className="text-[11px] text-gold">
          조회 실패 사유: {result.lastError || '알 수 없음'} — 실패는 미인용/미노출로 처리하지 않습니다.
        </p>
      )}
    </div>
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
    <div className="relative h-28 flex flex-col justify-between bg-surface rounded-lg border border-border p-4 shadow-xs">
      {spinning && (
        <span className="absolute top-2 right-2 w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      )}
      <p className="stat-title">{label}</p>
      <span className={`text-xl font-extrabold ${colorMap[color]} truncate`}>{value}</span>
    </div>
  );
}

/** 확인 진행 단계 → 사용자에게 보여줄 문구 */
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

export interface HistoryEntry {
  exposed: boolean | null;
  tabExposed: boolean | null;
  checkedAt: string;
}

export const HISTORY_API = '/api/my/ai-briefing-history';

export async function fetchCitationHistory(blogId: string): Promise<Record<string, HistoryEntry[]>> {
  const res = await fetch(`${HISTORY_API}?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('이력 로드 실패');
  const data = await res.json();
  return (data.history || {}) as Record<string, HistoryEntry[]>;
}

function citationLabel(exposed: boolean | null, tabExposed: boolean | null): string {
  return `AI 브리핑 ${exposed ? '인용됨' : '미인용'} · AI 탭 ${tabExposed ? '노출' : '미노출'}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 인용 상태 변경 타임라인 — 스냅샷이 2개 이상일 때만 "8/10 미인용 → 8/11 인용" 형태로 렌더.
 * 스냅샷은 상태가 실제로 바뀔 때만 쌓이므로 배열 자체가 변화 지점의 나열이다.
 */
export function CitationTimeline({ entries }: { entries?: HistoryEntry[] }) {
  if (!entries || entries.length < 2) return <span className="text-[10px] text-dim/40">—</span>;
  const last = entries.slice(-3); // 최근 변화 3개만 노출
  return (
    <span className="inline-flex items-center gap-1 flex-wrap text-[10px] text-dim">
      {last.map((e, i) => {
        const cited = e.exposed || e.tabExposed;
        return (
          <span key={e.checkedAt} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-dim/50">→</span>}
            <span className={cited ? 'text-up font-semibold' : ''} title={citationLabel(e.exposed, e.tabExposed)}>
              {shortDate(e.checkedAt)} {cited ? '인용' : '미인용'}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export interface AnalysisEntry {
  keyword: string;
  post: BlogPost;
  briefing: BriefingResult;
  searchVolume: { total: number | string; competition: string } | null;
  relatedCount: number | null;
  checkedAt: string;
}
