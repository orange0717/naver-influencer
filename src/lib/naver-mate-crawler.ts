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
  failedTopics: string[];
}

/** 25개 주제 × 4개 서비스(블로그/카페/지식iN/프리미엄콘텐츠)를 순회 수집 후 DB upsert */
export async function crawlNaverMates(): Promise<CrawlResult> {
  const supabase = createServiceClient();
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC → KST 보정 (자정 근처 월 경계 오차 방지)
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + 1;

  let totalFetched = 0;
  let totalUpserted = 0;
  const failedTopics: string[] = [];

  for (const { topicId, category } of MATE_TOPICS) {
    const fetchers: [MatePlatform, () => Promise<NormalizedMate[]>][] = [
      ['blog', () => fetchBlogTopic(topicId)],
      ['cafe', () => fetchCafeTopic(topicId)],
      ['kin', () => fetchKinTopic(topicId)],
      ['premium', () => fetchPremiumTopic(topicId)],
    ];

    for (const [platform, fetcher] of fetchers) {
      try {
        const mates = await fetcher();
        totalFetched += mates.length;

        for (const mate of mates) {
          const { data: mateRow, error: mateErr } = await supabase
            .from('naver_mates')
            .upsert(
              {
                platform: mate.platform,
                platform_key: mate.platformKey,
                category,
                topic_id: topicId,
                display_name: mate.displayName,
                profile_image_url: mate.profileImageUrl,
                home_url: mate.homeUrl,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'platform,platform_key' },
            )
            .select('id')
            .single();

          if (mateErr || !mateRow) {
            console.error(`[naver-mate-crawler] mate upsert failed (${platform}/${mate.platformKey}):`, mateErr?.message);
            continue;
          }

          const { error: monthlyErr } = await supabase
            .from('naver_mate_monthly')
            .upsert(
              {
                mate_id: mateRow.id,
                year,
                month,
                ai_briefing_count: mate.aiBriefingCount,
                is_new: mate.isNew,
                expertise_value: mate.expertiseValue,
                latest_post_title: mate.latestPostTitle,
                latest_post_url: mate.latestPostUrl,
                latest_post_date: mate.latestPostDate,
                collected_at: new Date().toISOString(),
              },
              { onConflict: 'mate_id,year,month' },
            );

          if (monthlyErr) {
            console.error(`[naver-mate-crawler] monthly upsert failed (${platform}/${mate.platformKey}):`, monthlyErr.message);
            continue;
          }
          totalUpserted += 1;
        }
      } catch (err) {
        console.error(`[naver-mate-crawler] ${platform}/${topicId} 수집 실패:`, err instanceof Error ? err.message : err);
        failedTopics.push(`${platform}/${topicId}`);
      }
      // 네이버 자동화 탐지 회피 — 요청 간 간격
      await sleep(400);
    }
  }

  return { totalFetched, totalUpserted, failedTopics };
}
