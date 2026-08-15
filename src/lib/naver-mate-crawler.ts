import { createServiceClient } from './supabase-server';
import { fetchWithRetry, sleep } from './crawler';
import { MATE_TOPICS } from './naver-mate-categories';

/**
 * 네이버 메이트(mate.naver.com) 공식 AI 펠로우십 프로그램의 "이달의 메이트" 데이터 수집.
 * mate.naver.com 화면 자체는 카테고리당 4명만 보여주는 미리보기지만, 그 화면이 내부적으로 호출하는
 * 4개 서비스(블로그/카페/지식iN/프리미엄콘텐츠)의 topic-contributors API를 count를 크게 주고 직접 호출하면
 * 해당 월 해당 주제의 전체 명단을 받을 수 있음 (2026-07-07 실측 확인, count를 total 이상으로 줘도 실제 총량만 반환됨).
 * Referer: https://mate.naver.com/ 헤더가 없으면 403 — 브라우저 없이도 순수 fetch로 동작 확인됨.
 *
 * 수집 대상 25개 분야(TOPIC_001~025)는 naver-mate-categories.ts 의 MATE_TOPICS 를 유일한 원본으로 삼는다.
 */

type MatePlatform = 'blog' | 'cafe' | 'kin' | 'premium';

interface NormalizedMate {
  platform: MatePlatform;
  platformKey: string;
  displayName: string;
  profileImageUrl: string | null;
  homeUrl: string | null;
  expertiseValue: string | null;
  isNew: boolean;
  aiBriefingCount: number;
  latestPostTitle: string | null;
  latestPostUrl: string | null;
  latestPostDate: string | null;
}

const REFERER = 'https://mate.naver.com/';
const REQUEST_COUNT = 1000; // 실측: 실제 총량 이상 요청해도 그 달 진짜 총원만 반환됨

interface BlogLikeContributor {
  profile: {
    profileImagePcUrl?: string;
    profileImageMobileUrl?: string;
    expertiseValue?: string;
    isNewContributor?: boolean;
    cumulativeAibViewCount?: number;
    displayName?: string;
    contributorHomePcUrl?: string;
    contributorHomeMobileUrl?: string;
  };
  representativeContent?: {
    contentTitle?: string;
    contentPcUrl?: string;
    contentMobileUrl?: string;
    contentPublishDatetime?: string;
  };
}

function extractHomeKey(homeUrl: string | undefined): string | null {
  if (!homeUrl) return null;
  try {
    const u = new URL(homeUrl);
    const path = u.pathname.replace(/^\/+|\/+$/g, '');
    return path || null;
  } catch {
    return null;
  }
}

function normalizeBlogLike(platform: MatePlatform, c: BlogLikeContributor): NormalizedMate | null {
  const home = c.profile.contributorHomeMobileUrl || c.profile.contributorHomePcUrl;
  const key = extractHomeKey(home);
  if (!key || !c.profile.displayName) return null;
  return {
    platform,
    platformKey: key,
    displayName: c.profile.displayName,
    profileImageUrl: c.profile.profileImageMobileUrl || c.profile.profileImagePcUrl || null,
    homeUrl: home || null,
    expertiseValue: c.profile.expertiseValue || null,
    isNew: !!c.profile.isNewContributor,
    aiBriefingCount: c.profile.cumulativeAibViewCount || 0,
    latestPostTitle: c.representativeContent?.contentTitle || null,
    latestPostUrl: c.representativeContent?.contentMobileUrl || c.representativeContent?.contentPcUrl || null,
    latestPostDate: c.representativeContent?.contentPublishDatetime || null,
  };
}

interface KinContributor {
  profile: {
    profileImage?: string;
    profileLink?: string;
    nickName?: string;
    expertiseValue?: string;
    cumulativeAibViewCount?: number;
    isNewContributor?: boolean;
  };
  representativeContent?: {
    contentTitle?: string;
    contentMobileUrl?: string;
    contentPcUrl?: string;
  };
}

function normalizeKin(c: KinContributor): NormalizedMate | null {
  const link = c.profile.profileLink;
  if (!link || !c.profile.nickName) return null;
  // 지식iN 프로필은 평문 ID가 없고 암호화된 u= 토큰뿐이라 링크 전체를 고유키로 사용
  return {
    platform: 'kin',
    platformKey: link,
    displayName: c.profile.nickName,
    profileImageUrl: c.profile.profileImage || null,
    homeUrl: link,
    expertiseValue: c.profile.expertiseValue || null,
    isNew: !!c.profile.isNewContributor,
    aiBriefingCount: c.profile.cumulativeAibViewCount || 0,
    latestPostTitle: c.representativeContent?.contentTitle || null,
    latestPostUrl: c.representativeContent?.contentMobileUrl || c.representativeContent?.contentPcUrl || null,
    latestPostDate: null, // 지식iN API 응답에 게시일 필드 없음 (실측 확인)
  };
}

async function fetchBlogTopic(topicId: string): Promise<NormalizedMate[]> {
  const res = await fetchWithRetry(
    `https://m.blog.naver.com/api/v1/topic-contributors?topicIds=${topicId}&countPerTopic=${REQUEST_COUNT}`,
    { headers: { Referer: REFERER } },
  );
  const json = await res.json();
  const contributors: BlogLikeContributor[] = json?.result?.[0]?.contributors || [];
  return contributors.map((c) => normalizeBlogLike('blog', c)).filter((m): m is NormalizedMate => !!m);
}

async function fetchCafeTopic(topicId: string): Promise<NormalizedMate[]> {
  const res = await fetchWithRetry(
    `https://apis.naver.com/blogfe/cafe-add-api/external/v1/aib/ai-pick/contributors?topicIds=${topicId}&count=${REQUEST_COUNT}`,
    { headers: { Referer: REFERER } },
  );
  const json = await res.json();
  const contributors: BlogLikeContributor[] = json?.result?.result?.[0]?.contributors || [];
  return contributors.map((c) => normalizeBlogLike('cafe', c)).filter((m): m is NormalizedMate => !!m);
}

async function fetchKinTopic(topicId: string): Promise<NormalizedMate[]> {
  const res = await fetchWithRetry(
    `https://m.kin.naver.com/api-gateway/main/user-api/v1/ai-pick/campaign/topic-contributors?topicIds=${topicId}&countPerTopic=${REQUEST_COUNT}`,
    { headers: { Referer: REFERER } },
  );
  const json = await res.json();
  const contributors: KinContributor[] = json?.result?.[0]?.contributors || [];
  return contributors.map(normalizeKin).filter((m): m is NormalizedMate => !!m);
}

async function fetchPremiumTopic(topicId: string): Promise<NormalizedMate[]> {
  const res = await fetchWithRetry(
    `https://l.premium.naver.com/external/ai-pick/contents?topicIds=${topicId}&countPerTopic=${REQUEST_COUNT}`,
    { headers: { Referer: REFERER } },
  );
  const json = await res.json();
  const contributors: BlogLikeContributor[] = json?.data?.result?.[0]?.contributors || [];
  return contributors.map((c) => normalizeBlogLike('premium', c)).filter((m): m is NormalizedMate => !!m);
}

export interface CrawlResult {
  totalFetched: number;
  totalUpserted: number;
  totalTopicLinks: number;
  failedTopics: string[];
}

interface CollectedMate extends NormalizedMate {
  /** 이 메이트가 선정된 분야들 — 네이버 메이트 공식 순서(MATE_TOPICS)대로 쌓임 */
  topics: { topicId: string; category: string }[];
}

const UPSERT_CHUNK = 500;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * 25개 주제 × 4개 서비스(블로그/카페/지식iN/프리미엄콘텐츠) 수집 후 DB 일괄 upsert.
 *
 * 주제당 4개 서비스는 병렬 요청하고, DB 쓰기는 메이트 1명씩이 아니라 전량 모아 배치로 쓴다.
 * (건별 쓰기 시절엔 왕복이 수천 번이라 함수가 120초 제한에 걸려 앞의 3개 분야만 저장되고 죽었다.)
 */
export async function crawlNaverMates(): Promise<CrawlResult> {
  const supabase = createServiceClient();
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC → KST 보정 (자정 근처 월 경계 오차 방지)
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;

  let totalFetched = 0;
  const failedTopics: string[] = [];
  // key = platform|platformKey. 한 명이 여러 분야에 선정될 수 있어 분야는 배열로 누적한다.
  const collected = new Map<string, CollectedMate>();

  for (const { topicId, category } of MATE_TOPICS) {
    const fetchers: [MatePlatform, () => Promise<NormalizedMate[]>][] = [
      ['blog', () => fetchBlogTopic(topicId)],
      ['cafe', () => fetchCafeTopic(topicId)],
      ['kin', () => fetchKinTopic(topicId)],
      ['premium', () => fetchPremiumTopic(topicId)],
    ];

    const results = await Promise.all(
      fetchers.map(async ([platform, fetcher]) => {
        try {
          return await fetcher();
        } catch (err) {
          console.error(`[naver-mate-crawler] ${platform}/${topicId} 수집 실패:`, err instanceof Error ? err.message : err);
          failedTopics.push(`${platform}/${topicId}`);
          return [];
        }
      }),
    );

    for (const mate of results.flat()) {
      totalFetched += 1;
      const key = `${mate.platform}|${mate.platformKey}`;
      const prev = collected.get(key);
      if (prev) {
        if (!prev.topics.some((t) => t.topicId === topicId)) prev.topics.push({ topicId, category });
        prev.aiBriefingCount = Math.max(prev.aiBriefingCount, mate.aiBriefingCount);
      } else {
        collected.set(key, { ...mate, topics: [{ topicId, category }] });
      }
    }

    // 네이버 자동화 탐지 회피 — 주제 간 간격
    await sleep(300);
  }

  const mates = [...collected.values()];
  if (mates.length === 0) {
    return { totalFetched, totalUpserted: 0, totalTopicLinks: 0, failedTopics };
  }

  const now = new Date().toISOString();

  // 1) 메이트 본체 — category/topic_id 는 공식 순서상 가장 앞선 분야(대표 분야)로 고정.
  //    분야별 조회는 naver_mate_topics 가 담당하므로 여기서 덮어써도 분야가 유실되지 않는다.
  const idByKey = new Map<string, string>();
  for (const rows of chunk(mates, UPSERT_CHUNK)) {
    const { data, error } = await supabase
      .from('naver_mates')
      .upsert(
        rows.map((m) => ({
          platform: m.platform,
          platform_key: m.platformKey,
          category: m.topics[0].category,
          topic_id: m.topics[0].topicId,
          display_name: m.displayName,
          profile_image_url: m.profileImageUrl,
          home_url: m.homeUrl,
          updated_at: now,
        })),
        { onConflict: 'platform,platform_key' },
      )
      .select('id, platform, platform_key');

    if (error) {
      console.error('[naver-mate-crawler] mate 배치 upsert 실패:', error.message);
      continue;
    }
    for (const r of data || []) idByKey.set(`${r.platform}|${r.platform_key}`, r.id);
  }

  // 2) 월별 스냅샷(인용수 등) — 메이트 단위 값이라 분야와 무관하게 1행
  const monthlyRows = mates
    .filter((m) => idByKey.has(`${m.platform}|${m.platformKey}`))
    .map((m) => ({
      mate_id: idByKey.get(`${m.platform}|${m.platformKey}`)!,
      year,
      month,
      ai_briefing_count: m.aiBriefingCount,
      is_new: m.isNew,
      expertise_value: m.expertiseValue,
      latest_post_title: m.latestPostTitle,
      latest_post_url: m.latestPostUrl,
      latest_post_date: m.latestPostDate,
      collected_at: now,
    }));

  let totalUpserted = 0;
  for (const rows of chunk(monthlyRows, UPSERT_CHUNK)) {
    const { error } = await supabase.from('naver_mate_monthly').upsert(rows, { onConflict: 'mate_id,year,month' });
    if (error) {
      console.error('[naver-mate-crawler] monthly 배치 upsert 실패:', error.message);
      continue;
    }
    totalUpserted += rows.length;
  }

  // 3) 분야 매칭(다대다)
  const topicRows = mates.flatMap((m) => {
    const mateId = idByKey.get(`${m.platform}|${m.platformKey}`);
    if (!mateId) return [];
    return m.topics.map((t) => ({
      mate_id: mateId,
      topic_id: t.topicId,
      category: t.category,
      year,
      month,
      collected_at: now,
    }));
  });

  let totalTopicLinks = 0;
  for (const rows of chunk(topicRows, UPSERT_CHUNK)) {
    const { error } = await supabase
      .from('naver_mate_topics')
      .upsert(rows, { onConflict: 'mate_id,topic_id,year,month' });
    if (error) {
      console.error('[naver-mate-crawler] topic 배치 upsert 실패:', error.message);
      continue;
    }
    totalTopicLinks += rows.length;
  }

  return { totalFetched, totalUpserted, totalTopicLinks, failedTopics };
}
