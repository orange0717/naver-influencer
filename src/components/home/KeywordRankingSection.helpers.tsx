import type { ReactNode } from 'react';

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

// 노출 상태 구분(스펙 #8·#10·#21): exposed=true(노출) / false(미노출·조회범위밖) / null(미확인·일시오류)
//   + status로 'ok'(확인완료) / 'error'(일시적 오류) / 'unanalyzable'(분석불가)를 구분한다.
//   scannedDepth: exposed=false && 존재 → "N위 밖"(조회 범위 밖). 없으면 일반 미노출.
export type RankTab = { exposed: boolean | null; rank: number | null; scannedDepth?: number | null };
export type RankStatus = 'ok' | 'error' | 'unanalyzable';

// 키워드 메타(스펙 #11) — 대표/보조/변형/수동 구분
export type KeywordType = 'primary' | 'secondary' | 'variant' | 'manual';
export interface KeywordMeta {
  keywordType?: KeywordType;
  isPrimary?: boolean;
  baseKeyword?: string | null;
  normalizedKeyword?: string | null;
  postUrl?: string | null;
}

export interface RankingResult {
  blogTab: RankTab;
  viewTab: RankTab;
  influencerTab: RankTab;
  query: string;
  searchVolume?: number;
  status?: RankStatus;
  checkedAt?: string | null;
}

// 전일대비/7일대비 계산 근거 (get_keyword_rank_deltas RPC, 통합검색 순위 기준 — 오렌지 확정)
export type RankDelta = {
  prevRank: number | null;
  prevCheckedAt: string | null;
  weekRank: number | null;
  weekCheckedAt: string | null;
};

export type SyncedState = {
  postKeywords: Record<string, string[]>;
  rankingResults: Record<string, RankingResult>;
  rankDeltas: Record<string, RankDelta>;
  keywordMeta?: Record<string, KeywordMeta>;
};

// 자동 추출 키워드(대표/보조/변형) — representative-keywords(-state) API 응답 항목 (스펙 #4/#14)
export interface AutoKeyword {
  keyword: string;
  normalized: string;
  keywordType: 'primary' | 'secondary' | 'variant';
  isPrimary: boolean;
  baseKeyword: string;
}

// ── 키워드 행 모델 ─────────────────────────────────────────────────────────
// 화면은 (포스팅 1개 → 키워드 N개)를 계층 없이 평면 행으로 그린다. 포스팅 제목과 키워드는
// 서로 독립된 컬럼이고, 각 키워드 행이 자기 순위 데이터를 독립적으로 들고 있다.

// 대표(자동추출 primary) / 보조(secondary·variant) / 추가(사용자 직접 입력 manual)
export type KeywordKind = 'primary' | 'secondary' | 'manual';

export const KIND_META: Record<KeywordKind, { label: string; cls: string }> = {
  primary: { label: '대표', cls: 'text-accent bg-accent/10' },
  secondary: { label: '보조', cls: 'text-dim bg-border/30' },
  manual: { label: '추가', cls: 'text-blue bg-blue/10' },
};

// 서버(keyword-ranking-state PUT)는 포스팅당 20개까지만 저장하고 초과분은 잘라낸 뒤
// "목록에 없는 키워드"로 간주해 삭제한다 → 클라이언트에서 미리 막아 자동추출분 유실을 방지한다.
export const MAX_KEYWORDS_PER_POST = 20;

// 중복 등록 방지용 정규화 — 서버는 문자열 완전일치로만 중복을 막으므로
// 화면에서 공백·대소문자만 다른 사실상 같은 키워드까지 미리 걸러낸다.
export function normalizeForCompare(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, ' ');
}

// 한 포스팅의 키워드 행 1개 (포스팅 제목과 독립된 데이터 단위)
export type KeywordRow = { keyword: string; kind: KeywordKind; meta: KeywordMeta };

/**
 * 한 포스팅의 키워드 행 목록을 만든다. 대표 → 추가 → 보조 순으로 정렬한다.
 *
 * 종류 판정 우선순위: 추출 결과(autoKeywords/rep) > DB에 기록된 keyword_type > 수동 입력.
 * savedKeywords(keyword_rank_lookups 사본)에는 대표·보조·추가가 모두 섞여 있으므로
 * 저장 여부만으로 "사용자가 직접 추가한 키워드"라고 판단하면 안 된다.
 */
export function buildKeywordRows(params: {
  postId: string;
  postUrl?: string | null;
  rep: string | null;
  autoKeywords: AutoKeyword[];
  savedKeywords: string[];
  keywordMeta: Record<string, KeywordMeta>;
}): KeywordRow[] {
  const { postId, postUrl = null, rep, autoKeywords, savedKeywords, keywordMeta } = params;
  const autoByKeyword = new Map(autoKeywords.map(a => [a.keyword, a]));

  const kindOf = (keyword: string): KeywordKind => {
    if (rep && keyword === rep) return 'primary';
    const auto = autoByKeyword.get(keyword);
    if (auto) return auto.isPrimary ? 'primary' : 'secondary';
    const kt = keywordMeta[rankKey(postId, keyword)]?.keywordType;
    if (kt === 'primary') return 'primary';
    if (kt === 'secondary' || kt === 'variant') return 'secondary';
    return 'manual';
  };

  const metaOf = (keyword: string, kind: KeywordKind): KeywordMeta => {
    const auto = autoByKeyword.get(keyword);
    if (auto) return { keywordType: auto.keywordType, isPrimary: auto.isPrimary, baseKeyword: auto.baseKeyword, postUrl };
    const known = keywordMeta[rankKey(postId, keyword)];
    return { ...known, keywordType: known?.keywordType || (kind === 'manual' ? 'manual' : undefined), postUrl };
  };

  const rows: KeywordRow[] = [];
  const seen = new Set<string>();
  const push = (keyword: string, kind: KeywordKind) => {
    const norm = normalizeForCompare(keyword);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    rows.push({ keyword, kind, meta: metaOf(keyword, kind) });
  };

  // 1) 대표키워드 — 아직 순위조회 전이라 savedKeywords 에 없어도 행으로 노출한다.
  if (rep) push(rep, 'primary');
  // 2) 저장된 키워드 (대표·보조·추가 혼재)
  for (const raw of savedKeywords) {
    const kw = raw.trim();
    if (kw) push(kw, kindOf(kw));
  }
  // 3) 아직 저장 전인 보조 키워드
  for (const a of autoKeywords) {
    if (!a.isPrimary) push(a.keyword, 'secondary');
  }

  const order: Record<KeywordKind, number> = { primary: 0, manual: 1, secondary: 2 };
  return rows.sort((a, b) => order[a.kind] - order[b.kind]);
}

export const STATE_API = '/api/my/keyword-ranking-state';
export const REP_STATE_API = '/api/my/representative-keywords-state';
// 네이버 요청 최소화: 최근 10분 이내 갱신된 순위는 재조회하지 않고 그대로 표시
const STALE_MS = 10 * 60 * 1000;
export const FLASH_MS = 1400;

export interface CandidateScreenEntry {
  keyword: string;
  exposed: boolean;
  rank: number | null;
}

export interface RepKeywordEntry {
  keyword: string | null;
  source?: string | null;
  extractedAt?: string | null;
  // AI가 뽑은 후보 3~5개 전체(대표 포함) — 통합검색 1페이지 스크리닝 결과와 함께 태그로 표시
  candidates?: string[];
  candidateScreen?: CandidateScreenEntry[];
  // 자동 조회 키워드 집합: 대표 1(+변형) + 보조 1~2(+변형) (스펙 #4/#14)
  autoKeywords?: AutoKeyword[];
}

// 영속화된(post_representative_keywords) 포스트별 대표 키워드를 블로그 단위로 한 번에 복원
// headers: 전용 화면(/my/keyword-ranking)이 무료 조회 토큰(X-View-Token)을 실어 보낼 때만 전달.
export async function fetchRepKeywordsState(blogId: string, headers?: Record<string, string>): Promise<Record<string, RepKeywordEntry>> {
  const res = await fetch(`${REP_STATE_API}?blogId=${encodeURIComponent(blogId)}`, headers ? { headers } : undefined);
  if (!res.ok) {
    const e = new Error('대표 키워드 상태 로드 실패') as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return data.results || {};
}

// 서버(DB)에서 저장된 키워드/순위 상태를 복원한다. (기기 간 동기화의 핵심)
// headers: 전용 화면(/my/keyword-ranking)이 무료 조회 토큰(X-View-Token)을 실어 보낼 때만 전달.
export async function fetchRankingState(blogId: string, headers?: Record<string, string>): Promise<SyncedState> {
  const res = await fetch(`${STATE_API}?blogId=${encodeURIComponent(blogId)}`, headers ? { headers } : undefined);
  if (!res.ok) {
    const e = new Error('상태 로드 실패') as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// 포스트별 키워드 할당을 DB에 저장 (제거된 키워드 삭제 포함)
// keepalive: 저장 직후 새로고침/탭이동으로 페이지가 언로드돼도 요청이 취소되지 않고 전송되도록 보장
export async function saveKeywordsToDb(blogId: string, postId: string, keywords: string[]): Promise<boolean> {
  try {
    const res = await fetch(STATE_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blogId, postId, keywords }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 단일 (post, keyword) 순위 결과를 DB에 갱신. 화면엔 이미 최신 결과가 표시된 뒤 백그라운드로 저장하므로,
// 실패 시에도 화면을 되돌리진 않되 반드시 로그를 남겨 "화면엔 보이는데 DB엔 없는" 상태를 진단할 수 있게 한다.
export async function saveRankResultToDb(blogId: string, postId: string, keyword: string, result: RankingResult, meta?: KeywordMeta): Promise<boolean> {
  try {
    const res = await fetch(STATE_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blogId, postId, keyword, result, meta }),
      keepalive: true,
    });
    if (!res.ok) {
      console.error(`[keyword-ranking] 순위 DB 저장 실패 (status=${res.status}) postId=${postId} keyword=${keyword}`);
    }
    return res.ok;
  } catch (err) {
    console.error(`[keyword-ranking] 순위 DB 저장 중 네트워크 오류 postId=${postId} keyword=${keyword}`, err);
    return false;
  }
}

export function rankKey(postId: string, keyword: string): string {
  return `${postId}::${keyword}`;
}

// keyword_rank_lookups Realtime 페이로드 (migration-121로 publication 등록, migration-122로 RLS 정정)
export interface KeywordRankLookupRow {
  post_id: string;
  keyword: string;
  view_rank: number | null;
  view_exposed: boolean | null;
  blog_rank: number | null;
  blog_exposed: boolean | null;
  influencer_rank: number | null;
  influencer_exposed: boolean | null;
  search_volume: number | null;
  status: string | null;
  checked_at: string | null;
}

// 마지막 확인이 10분보다 오래됐거나 아예 없으면 갱신 대상
// 단, 분석불가(unanalyzable)는 연속 실패로 재조회를 중단한 상태이므로 갱신 대상에서 제외한다.
export function isStale(result: RankingResult | undefined): boolean {
  if (result?.status === 'unanalyzable') return false;
  if (!result?.checkedAt) return true;
  return Date.now() - new Date(result.checkedAt).getTime() > STALE_MS;
}

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

export type DeltaDisplay = { label: string; colorClass: string; tooltip: string };

// 전일대비/7일대비 표시 계산 — 통합검색(viewTab) 순위 기준 (오렌지 확정 결정)
// refCheckedAt이 없으면 비교할 이력 자체가 없는 것이므로 "-"로 표시 (신규진입 NEW와는 구분)
export function computeDeltaDisplay(
  currentExposed: boolean | null,
  currentRank: number | null,
  refRank: number | null,
  refCheckedAt: string | null | undefined,
): DeltaDisplay {
  if (!refCheckedAt) {
    return { label: '-', colorClass: 'text-dim', tooltip: '비교할 이전 데이터가 없습니다' };
  }
  if (currentExposed && refRank != null && currentRank != null) {
    // 순위 숫자는 낮을수록 좋음 → 이전-현재가 양수면 상승(+N), 음수면 하락(−N) (스펙 #16/#17)
    const delta = refRank - currentRank;
    if (delta > 0) return { label: `+${delta}`, colorClass: 'text-up', tooltip: `${refRank}위 → ${currentRank}위 (${delta}계단 상승)` };
    if (delta < 0) return { label: `−${Math.abs(delta)}`, colorClass: 'text-down', tooltip: `${refRank}위 → ${currentRank}위 (${Math.abs(delta)}계단 하락)` };
    return { label: '0', colorClass: 'text-dim', tooltip: `${refRank}위 → ${currentRank}위 (변동 없음)` };
  }
  if (currentExposed && refRank == null) {
    return { label: 'NEW', colorClass: 'text-blue-600', tooltip: '이전에는 미노출, 현재 신규 진입' };
  }
  if (!currentExposed && refRank != null) {
    return { label: 'OUT', colorClass: 'text-orange-600', tooltip: `${refRank}위 → 순위 이탈` };
  }
  return { label: '-', colorClass: 'text-dim', tooltip: '미노출 상태 유지' };
}

// 미노출(exposed=false) 셀의 텍스트: 조회 범위(scannedDepth)를 알면 "N위 밖"(조회 범위 밖, 스펙 #10/#21), 모르면 "순위권 밖".
function missLabel(tab: RankTab): { text: string; title: string } {
  const d = tab.scannedDepth;
  if (typeof d === 'number' && d > 0) {
    return { text: `${d}위 밖`, title: `조회 범위 밖 — 상위 ${d}위까지 확인했으나 발견되지 않았습니다(미노출 확정 아님)` };
  }
  return { text: '순위권 밖', title: '조회 범위 밖 — 확인한 상위 결과에서 발견되지 않았습니다' };
}

// 순위 셀 5구분 렌더 (스펙 #8·#10·#21) — 임의 숫자(0위/999위) 금지, 상태를 명시적으로 구분한다.
//   노출(N위) / 조회 범위 밖(N위 밖) / 분석중(--) / 분석불가 / 일시오류
// tab.exposed: true=노출, false=미노출/조회범위밖, null=미확인. result.status로 error/unanalyzable 구분.
export function renderRankTab(result: RankingResult | undefined, tab: RankTab | null | undefined): ReactNode {
  if (!result) return <span className="text-[10px] text-dim/50" title="분석중 — 아직 순위를 확인하지 않았습니다">--</span>;
  if (result.status === 'unanalyzable') {
    return <span className="text-[10px] text-dim/70" title="분석불가 — 검색이 불가하거나 연속 조회에 실패했습니다">분석불가</span>;
  }
  // 일시적 오류이거나 해당 탭이 미확인(null)이면 '미노출'로 오표기하지 않는다.
  if (result.status === 'error' || !tab || tab.exposed === null || tab.exposed === undefined) {
    return <span className="text-[10px] text-down/70" title="일시적 오류 — 잠시 후 자동으로 다시 조회합니다">일시오류</span>;
  }
  if (tab.exposed === true) {
    return <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">{tab.rank}위</span>;
  }
  const miss = missLabel(tab);
  return <span className="text-[10px] text-dim" title={miss.title}>{miss.text}</span>;
}

// CSV/텍스트용 라벨 — 노출(N위)/조회범위밖(N위 밖)/분석중(--)/분석불가/일시오류.
export function rankCellText(result: RankingResult | undefined, tab: RankTab | null | undefined): string {
  if (!result) return '--';
  if (result.status === 'unanalyzable') return '분석불가';
  if (result.status === 'error' || !tab || tab.exposed === null || tab.exposed === undefined) return '일시오류';
  if (tab.exposed === true) return `${tab.rank}위`;
  return missLabel(tab).text;
}

// 모바일 카드용 라벨 pill 버전 (통합/블로그/인플루언서) — 데스크톱 renderRankTab과 동일한 5구분.
export function renderRankPill(label: string, result: RankingResult | undefined, tab: RankTab | null | undefined): ReactNode {
  const base = 'text-[10px] font-bold px-1.5 py-0.5 rounded-full';
  if (!result) return <span className={`${base} bg-bg text-dim`}>{label} --</span>;
  if (result.status === 'unanalyzable') return <span className={`${base} bg-bg text-dim/70`} title="분석불가">{label} 분석불가</span>;
  if (result.status === 'error' || !tab || tab.exposed === null || tab.exposed === undefined) {
    return <span className={`${base} bg-bg text-down/70`} title="일시적 오류 — 잠시 후 자동 재조회">{label} 일시오류</span>;
  }
  if (tab.exposed === true) return <span className={`${base} bg-up/10 text-up`}>{label} {tab.rank}위</span>;
  const miss = missLabel(tab);
  return <span className={`${base} bg-bg text-dim`} title={miss.title}>{label} {miss.text}</span>;
}

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
