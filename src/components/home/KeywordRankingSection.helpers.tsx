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

export interface RankingResult {
  blogTab: { exposed: boolean; rank: number | null };
  viewTab: { exposed: boolean; rank: number | null };
  influencerTab: { exposed: boolean; rank: number | null };
  query: string;
  searchVolume?: number;
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
};

export const STATE_API = '/api/my/keyword-ranking-state';
// 네이버 요청 최소화: 최근 10분 이내 갱신된 순위는 재조회하지 않고 그대로 표시
const STALE_MS = 10 * 60 * 1000;
export const FLASH_MS = 1400;

// 서버(DB)에서 저장된 키워드/순위 상태를 복원한다. (기기 간 동기화의 핵심)
export async function fetchRankingState(blogId: string): Promise<SyncedState> {
  const res = await fetch(`${STATE_API}?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('상태 로드 실패');
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
export async function saveRankResultToDb(blogId: string, postId: string, keyword: string, result: RankingResult): Promise<boolean> {
  try {
    const res = await fetch(STATE_API, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blogId, postId, keyword, result }),
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
  checked_at: string | null;
}

// 마지막 확인이 10분보다 오래됐거나 아예 없으면 갱신 대상
export function isStale(result: RankingResult | undefined): boolean {
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
  currentExposed: boolean,
  currentRank: number | null,
  refRank: number | null,
  refCheckedAt: string | null | undefined,
): DeltaDisplay {
  if (!refCheckedAt) {
    return { label: '-', colorClass: 'text-dim', tooltip: '비교할 이전 데이터가 없습니다' };
  }
  if (currentExposed && refRank != null && currentRank != null) {
    const delta = refRank - currentRank;
    if (delta > 0) return { label: `▲${delta}`, colorClass: 'text-up', tooltip: `${refRank}위 → ${currentRank}위 (▲${delta})` };
    if (delta < 0) return { label: `▼${Math.abs(delta)}`, colorClass: 'text-down', tooltip: `${refRank}위 → ${currentRank}위 (▼${Math.abs(delta)})` };
    return { label: '-', colorClass: 'text-dim', tooltip: `${refRank}위 → ${currentRank}위 (변동 없음)` };
  }
  if (currentExposed && refRank == null) {
    return { label: 'NEW', colorClass: 'text-blue-600', tooltip: '이전에는 미노출, 현재 신규 진입' };
  }
  if (!currentExposed && refRank != null) {
    return { label: 'OUT', colorClass: 'text-orange-600', tooltip: `${refRank}위 → 순위 이탈` };
  }
  return { label: '-', colorClass: 'text-dim', tooltip: '미노출 상태 유지' };
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
