import { fetchWithRetry } from './crawler';

/**
 * in.naver.com은 React SPA이지만 서버가 초기 HTML에 Apollo 캐시 전체를
 * `window.__APOLLO_STATE__ = {...}`로 심어둔다. 별도 GraphQL 쿼리 재구성 없이
 * 이 블록만 파싱하면 토픽/Discover 데이터를 그대로 얻을 수 있다(2026-07-27 실측 확인).
 */

export interface NaverDomainCategory {
  id: string;
  name: string;
  code: string;
}

/** discoverCategoryTopics/keywordCategories 실측으로 확보한 20개 대표주제 고정 ID (2026-07-27) */
export const NAVER_DOMAIN_CATEGORIES: NaverDomainCategory[] = [
  { id: '111161268236416', name: '여행', code: 'travel' },
  { id: '135968806145856', name: '패션', code: 'fashion' },
  { id: '111161392861312', name: '뷰티', code: 'beauty' },
  { id: '135968760155968', name: '푸드', code: 'food' },
  { id: '170701789269728', name: 'IT테크', code: 'technology' },
  { id: '135968958734144', name: '자동차', code: 'car' },
  { id: '135968722317120', name: '리빙', code: 'living' },
  { id: '135969005989696', name: '육아', code: 'parenting' },
  { id: '170711097855776', name: '생활건강', code: 'health' },
  { id: '135968856821568', name: '게임', code: 'game' },
  { id: '135969050107712', name: '동물/펫', code: 'pet' },
  { id: '135968917376832', name: '운동/레저', code: 'sports' },
  { id: '170711154143008', name: '프로스포츠', code: 'prosports' },
  { id: '170711252131616', name: '방송/연예', code: 'broadcast' },
  { id: '170711305961248', name: '대중음악', code: 'music' },
  { id: '170711358865184', name: '영화', code: 'movie' },
  { id: '170711425294112', name: '공연/전시/예술', code: 'art' },
  { id: '170711493439264', name: '도서', code: 'book' },
  { id: '170711548084000', name: '경제/비즈니스', code: 'biz' },
  { id: '170711606808352', name: '어학/교육', code: 'edu' },
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * `window.__APOLLO_STATE__ = { ... };` 블록을 balanced-brace 스캔으로 추출한다.
 * 같은 스크립트 라인에 `window.__REACT_QUERY_STATE__ = ...`가 바로 이어붙기 때문에
 * `indexOf('</script>')`로 자르면 안 되고, 여는 중괄호 개수를 세어 실제 JSON 끝을 찾는다.
 */
function extractApolloState(html: string): Record<string, unknown> | null {
  const marker = 'window.__APOLLO_STATE__ = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const jsonStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null;

  try {
    return JSON.parse(html.slice(jsonStart, end));
  } catch {
    return null;
  }
}

function resolveRef(state: Record<string, unknown>, value: unknown): unknown {
  if (value && typeof value === 'object' && '__ref' in (value as Record<string, unknown>)) {
    return state[(value as { __ref: string }).__ref];
  }
  return value;
}

async function fetchApolloState(url: string): Promise<Record<string, unknown>> {
  const res = await fetchWithRetry(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko-KR,ko;q=0.9' },
  });
  const html = await res.text();
  const state = extractApolloState(html);
  if (!state) throw new Error(`__APOLLO_STATE__ 파싱 실패: ${url}`);
  return state;
}

export interface NaverTopicCard {
  topicId: string;
  title: string;
  thumbnailUrl: string | null;
  contentCount: number;
  introduction: string | null;
  createdAt: string | null;
  modifiedAt: string | null;
  topicSubject: string | null;
  topicSubjectCategory: string | null;
  topicSubjectCategoryId: string | null;
}

export interface NaverTopicCardsPage {
  items: NaverTopicCard[];
  topicCount: number;
  nextCursor: string | null;
}

function toTopicCard(raw: Record<string, unknown>): NaverTopicCard {
  return {
    topicId: String(raw.id ?? ''),
    title: (raw.title as string) || '',
    thumbnailUrl: (raw.thumbnailUrl as string) || null,
    contentCount: Number(raw.contentCount ?? 0),
    introduction: (raw.introduction as string) || null,
    createdAt: (raw.createdAt as string) || null,
    modifiedAt: (raw.modifiedAt as string) || null,
    topicSubject: (raw.topicSubject as string) || null,
    topicSubjectCategory: (raw.topicSubjectCategory as string) || null,
    topicSubjectCategoryId: raw.topicSubjectCategoryId != null ? String(raw.topicSubjectCategoryId) : null,
  };
}

/** GET in.naver.com/{naverId}/topic — 인플루언서의 토픽 카드 목록(1페이지) */
export async function fetchInfluencerTopicCards(naverId: string): Promise<NaverTopicCardsPage> {
  const state = await fetchApolloState(`https://in.naver.com/${encodeURIComponent(naverId)}/topic`);
  const root = state.ROOT_QUERY as Record<string, unknown> | undefined;
  if (!root) return { items: [], topicCount: 0, nextCursor: null };

  const key = Object.keys(root).find(k => k.startsWith('topicCards:'));
  if (!key) return { items: [], topicCount: 0, nextCursor: null };

  const topicCards = root[key] as { topicCount?: number; items?: unknown[]; paging?: { nextCursor?: string } };
  const items = (topicCards.items || [])
    .map(ref => resolveRef(state, ref))
    .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
    .map(toTopicCard);

  return {
    items,
    topicCount: topicCards.topicCount || items.length,
    nextCursor: topicCards.paging?.nextCursor || null,
  };
}

export interface NaverTopicPost {
  contentId: string;
  title: string;
  introBody: string;
  tags: string[];
}

export interface NaverTopicDetail {
  topicId: string;
  title: string;
  thumbnailUrl: string | null;
  posts: NaverTopicPost[];
  tags: string[];
}

/** GET in.naver.com/{naverId}/topic/{topicId} — 토픽에 포함된 포스팅 목록 + 태그 */
export async function fetchTopicDetail(naverId: string, topicId: string): Promise<NaverTopicDetail | null> {
  const state = await fetchApolloState(
    `https://in.naver.com/${encodeURIComponent(naverId)}/topic/${encodeURIComponent(topicId)}`,
  );
  const viewerTopic = state[`ViewerTopic:${topicId}`] as Record<string, unknown> | undefined;
  if (!viewerTopic) return null;

  const componentMeta = (viewerTopic.topicComponentMeta as Record<string, unknown>[]) || [];
  const posts: NaverTopicPost[] = componentMeta
    .filter(c => c.type === 'CONTENT')
    .map(c => ({
      contentId: String(c.contentId ?? ''),
      title: (c.introductionTitle as string) || '',
      introBody: (c.introductionBody as string) || '',
      tags: [],
    }));

  const tags = ((viewerTopic.tags as Record<string, unknown>[]) || []).map(t => (t.tagName as string) || '').filter(Boolean);

  return {
    topicId,
    title: (viewerTopic.title as string) || '',
    thumbnailUrl: (viewerTopic.thumbnailUrl as string) || null,
    posts,
    tags,
  };
}

export interface DiscoverFeedItem {
  creatorUrlId: string | null;
  creatorNickname: string | null;
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  url: string | null;
}

export interface DiscoverCategorySnapshot {
  categoryId: string;
  categoryName: string;
  latest: DiscoverFeedItem[];
  popular: { poolId: string; poolName: string | null; items: DiscoverFeedItem[] };
  expert: { poolId: string; poolName: string | null; items: DiscoverFeedItem[] };
  specialty: { poolId: string; poolName: string | null; items: DiscoverFeedItem[] };
}

function toFeedItems(state: Record<string, unknown>, feeds: unknown): DiscoverFeedItem[] {
  if (!Array.isArray(feeds)) return [];
  const items: DiscoverFeedItem[] = [];
  for (const feedRaw of feeds) {
    const feed = feedRaw as Record<string, unknown>;
    const creator = resolveRef(state, feed.creator) as Record<string, unknown> | undefined;
    const contents = (feed.contents as Record<string, unknown>[]) || [];
    for (const content of contents) {
      items.push({
        creatorUrlId: (creator?.urlId as string) || null,
        creatorNickname: (creator?.nickname as string) || null,
        contentId: String(content.contentId ?? ''),
        title: (content.title as string) || '',
        thumbnailUrl: (content.thumbnailUrl as string) || null,
        publishedAt: (content.publishedAt as string) || null,
        url: (content.url as string) || null,
      });
    }
  }
  return items;
}

/** GET in.naver.com/discover/{categoryId} — 도메인별 최신/인기/전문가/특집 토픽 피드 */
export async function fetchDiscoverCategory(category: NaverDomainCategory): Promise<DiscoverCategorySnapshot> {
  const state = await fetchApolloState(`https://in.naver.com/discover/${encodeURIComponent(category.id)}`);
  const root = (state.ROOT_QUERY as Record<string, unknown>) || {};

  const latestKey = Object.keys(root).find(k => k.startsWith('discoverCategoryTopics:'));
  const latest = latestKey ? toFeedItems(state, (root[latestKey] as Record<string, unknown>)?.items) : [];

  function collection(type: 'POPULAR' | 'EXPERT' | 'SPECIALTY') {
    const key = Object.keys(root).find(
      k => k.startsWith('discoverCollection(') && k.includes(`"collectionType":"${type}"`),
    );
    if (!key) return { poolId: '', poolName: null, items: [] };
    const col = root[key] as Record<string, unknown>;
    return {
      poolId: String(col.poolId ?? ''),
      poolName: (col.filters as Record<string, unknown>[] | null)?.[0]?.poolName as string | undefined || null,
      items: toFeedItems(state, col.feeds),
    };
  }

  return {
    categoryId: category.id,
    categoryName: category.name,
    latest,
    popular: collection('POPULAR'),
    expert: collection('EXPERT'),
    specialty: collection('SPECIALTY'),
  };
}
