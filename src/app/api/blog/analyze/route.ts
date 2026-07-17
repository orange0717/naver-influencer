import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { analyzePost, type PostAnalysis } from '@/lib/post-structure-analyzer';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 분석 결과 캐시 (10분, 최대 200개 엔트리)
const MAX_CACHE_SIZE = 200;
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 10 * 60 * 1000;

export interface BlogAnalysisResult {
  blogId: string;
  analyzedCount: number;
  totalPosts: number;
  posts: PostAnalysis[];
  /** 블로그 전체 평균 */
  averages: {
    charCount: number;
    wordCount: number;
    imageCount: number;
    videoCount: number;
    paragraphCount: number;
    linkCount: number;
    headingCount: number;
    personalPronounCount: number;
    uniqueWordRatio: number;
    listItemCount: number;
    quotationCount: number;
  };
  /** 점수 계산용 지표 */
  metrics: {
    /** 경험: 이미지가 많은 글 비율 (3장 이상) */
    postsWithImages: number;
    /** 심층성: 1000자 이상 글 비율 */
    longPosts: number;
    /** 가독성: 소제목이 있는 글 비율 */
    postsWithHeadings: number;
    /** 독창성: 평균 글자 수 (긴 글 = 독자적 콘텐츠) */
    avgCharCount: number;
    /** 경험: 동영상/지도 포함 글 비율 */
    postsWithMedia: number;
    /** 경험: 원본 사진(100KB+) 비율 — 직접 촬영 증거 */
    originalImageRatio: number;
    /** 경험: 평균 이미지 크기 (KB) */
    avgImageSizeKB: number;
    /** 경험: 원본 사진이 있는 글 비율 */
    postsWithOriginalImages: number;
    /** 경험: 1인칭 대명사 평균 비율 — 직접 경험 증거 */
    avgPersonalPronounRatio: number;
    /** 독창성: 고유 단어 비율 평균 */
    avgUniqueWordRatio: number;
    /** 가독성: 리스트 사용 글 비율 */
    postsWithLists: number;
    /** 신뢰성: 인용문 있는 글 비율 */
    postsWithQuotations: number;
  };
}

/**
 * GET /api/blog/analyze?blogId=xxx&postIds=111,222,333
 * 또는 GET /api/blog/analyze?blogId=xxx&count=5  (최근 글 5개 자동 분석)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const blogId = searchParams.get('blogId');
    const postIdsParam = searchParams.get('postIds');
    const count = Math.min(parseInt(searchParams.get('count') || '10', 10), 15); // 기본 10개, 최대 15개

    if (!blogId) {
      return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
    }

    const denied = await assertBlogResourceAccess(request, blogId);
    if (denied) return denied;

    // 캐시 확인
    const cacheKey = `analyze-${blogId}-${postIdsParam || count}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data);
    }

    // postIds가 없으면 최근 글 목록을 먼저 가져옴
    let postIds: string[] = [];
    if (postIdsParam) {
      postIds = postIdsParam.split(',').slice(0, 10);
    } else {
      // PostTitleListAsync에서 최근 글 ID 가져오기
      try {
        const listUrl = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&currentPage=1&countPerPage=${count}`;
        const listRes = await fetch(listUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': '*/*',
            'Referer': `https://blog.naver.com/${blogId}`,
          },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          if (listData.resultCode === 'S' && listData.postList) {
            postIds = listData.postList.map((p: { logNo: string }) => p.logNo);
          }
        }
      } catch { /* 목록 가져오기 실패 */ }

      // 폴백: RSS에서 postId 추출
      if (postIds.length === 0) {
        try {
          const rssUrl = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
          const rssRes = await fetch(rssUrl, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/xml, text/xml, */*' },
          });
          if (rssRes.ok) {
            const xml = await rssRes.text();
            const $rss = cheerio.load(xml, { xml: true });
            $rss('item').each((i, el) => {
              if (i >= count) return false;
              const link = $rss(el).find('link').text().trim() || $rss(el).find('guid').text().trim();
              const match = link.match(/\/(\d+)/);
              if (match) postIds.push(match[1]);
            });
          }
        } catch { /* RSS도 실패 */ }
      }
    }

    if (postIds.length === 0) {
      return NextResponse.json({
        blogId,
        analyzedCount: 0,
        totalPosts: 0,
        posts: [],
        averages: { charCount: 0, wordCount: 0, imageCount: 0, videoCount: 0, paragraphCount: 0, linkCount: 0, headingCount: 0, personalPronounCount: 0, uniqueWordRatio: 0, listItemCount: 0, quotationCount: 0 },
        metrics: { postsWithImages: 0, longPosts: 0, postsWithHeadings: 0, avgCharCount: 0, postsWithMedia: 0, originalImageRatio: 0, avgImageSizeKB: 0, postsWithOriginalImages: 0, avgPersonalPronounRatio: 0, avgUniqueWordRatio: 0, postsWithLists: 0, postsWithQuotations: 0 },
      });
    }

    // 각 글 분석 (순차 처리 + 딜레이)
    const analyses: PostAnalysis[] = [];
    for (let i = 0; i < postIds.length; i++) {
      const analysis = await analyzePost(blogId, postIds[i]);
      analyses.push(analysis);
      // 레이트 리미팅: 500ms 대기
      if (i < postIds.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const successful = analyses.filter(a => a.success);
    const n = successful.length || 1;

    // 평균 계산
    const averages = {
      charCount: Math.round(successful.reduce((s, a) => s + a.charCount, 0) / n),
      wordCount: Math.round(successful.reduce((s, a) => s + a.wordCount, 0) / n),
      imageCount: Math.round(successful.reduce((s, a) => s + a.imageCount, 0) / n * 10) / 10,
      videoCount: Math.round(successful.reduce((s, a) => s + a.videoCount, 0) / n * 10) / 10,
      paragraphCount: Math.round(successful.reduce((s, a) => s + a.paragraphCount, 0) / n),
      linkCount: Math.round(successful.reduce((s, a) => s + a.linkCount, 0) / n * 10) / 10,
      headingCount: Math.round(successful.reduce((s, a) => s + a.headingCount, 0) / n * 10) / 10,
      personalPronounCount: Math.round(successful.reduce((s, a) => s + a.personalPronounCount, 0) / n * 10) / 10,
      uniqueWordRatio: Math.round(successful.reduce((s, a) => s + a.uniqueWordRatio, 0) / n * 100) / 100,
      listItemCount: Math.round(successful.reduce((s, a) => s + a.listItemCount, 0) / n * 10) / 10,
      quotationCount: Math.round(successful.reduce((s, a) => s + a.quotationCount, 0) / n * 10) / 10,
    };

    // 이미지 크기 분석 종합
    const allImages = successful.flatMap(a => a.images);
    const totalOriginalImages = successful.reduce((s, a) => s + a.originalImageCount, 0);
    const totalCheckedImages = allImages.length;
    const avgImgSize = totalCheckedImages > 0
      ? Math.round(allImages.reduce((s, i) => s + i.size, 0) / totalCheckedImages / 1024) : 0;

    // 점수 산출용 지표
    const totalPronounCount = successful.reduce((s, a) => s + a.personalPronounCount, 0);
    const totalWordCount = successful.reduce((s, a) => s + a.wordCount, 0);
    const metrics = {
      postsWithImages: successful.filter(a => a.imageCount >= 3).length / n,
      longPosts: successful.filter(a => a.charCount >= 1000).length / n,
      postsWithHeadings: successful.filter(a => a.headingCount >= 2).length / n,
      avgCharCount: averages.charCount,
      postsWithMedia: successful.filter(a => a.videoCount > 0 || a.mapCount > 0).length / n,
      originalImageRatio: totalCheckedImages > 0 ? totalOriginalImages / totalCheckedImages : 0,
      avgImageSizeKB: avgImgSize,
      postsWithOriginalImages: successful.filter(a => a.originalImageCount >= 1).length / n,
      // 새 깊이 분석 지표
      avgPersonalPronounRatio: totalWordCount > 0 ? totalPronounCount / totalWordCount : 0,
      avgUniqueWordRatio: successful.length > 0
        ? Math.round(successful.reduce((s, a) => s + a.uniqueWordRatio, 0) / n * 100) / 100 : 0,
      postsWithLists: successful.filter(a => a.listItemCount >= 2).length / n,
      postsWithQuotations: successful.filter(a => a.quotationCount >= 1).length / n,
    };

    const result: BlogAnalysisResult = {
      blogId,
      analyzedCount: successful.length,
      totalPosts: postIds.length,
      posts: analyses,
      averages,
      metrics,
    };

    // 캐시 저장 (크기 제한: 오래된 항목부터 제거)
    if (cache.size >= MAX_CACHE_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(cacheKey, { data: result, expires: Date.now() + CACHE_TTL });

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: '블로그 글 분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
