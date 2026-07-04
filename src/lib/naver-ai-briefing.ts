import * as cheerio from 'cheerio';
import { fetchWithRetry } from './crawler';

/**
 * 네이버 "AI" 탭(생성형 검색 답변) 존재 여부 확인 — 네이버메이트 기능의 핵심 엔진.
 *
 * ⚠️ 2026-07-04 설계 변경(오렌지 지시): 기존에는 Headless Chromium(puppeteer-core +
 * @sparticuz/chromium)으로 실제 AI 탭에 진입해 답변 스트리밍을 기다린 뒤 내 포스팅이
 * 인용됐는지(exposed/sourceIndex)까지 확인했다. 그러나 실측 검증 결과:
 * - "노출 여부"의 실제 요구사항은 인용 여부가 아니라 **이 키워드에 AI 탭 자체가
 *   존재하는지(O/X)** 하나면 충분하다는 것으로 확정됨.
 * - AI 탭 존재 여부는 일반 검색 결과 페이지(`search.naver.com/search.naver?query=...`)의
 *   정적 HTML만으로 판별 가능하다 — 실측 확인: 해당 페이지에 AI 탭으로 연결되는
 *   `href="?ssc=tab.ait.all&..."` 앵커가 그대로 포함되어 있고(1.4MB 응답, 차단 문구 없음),
 *   이는 키워드 순위 확인 크롤러(crawl-rankings/crawl-blog-ranks)와 동일하게
 *   `fetchWithRetry` + cheerio 정적 파싱만으로 충분함을 의미한다.
 * - 반면 `ssc=tab.ait.all` URL 자체에 직접 GET하면(Referer/쿠키/헤더를 크롤러와 완전히
 *   동일하게 맞춰도) 네이버가 "잘못된 접근입니다"로 계속 거부한다(실측 3회 확인) — 즉
 *   답변 본문/인용 출처까지 보려면 여전히 실제 브라우저 실행이 필요하다. 하지만 그 범위는
 *   더 이상 이 기능의 요구사항이 아니므로, Headless Chromium 의존성 자체를 제거한다.
 * - 결과적으로 이 모듈은 puppeteer-core/@sparticuz/chromium을 더 이상 사용하지 않는다.
 *   과거 인용 인덱스 확인 로직(scripts/test-ai-briefing.mjs, blogId/postId 매칭 등)은
 *   요구사항에서 제외되어 그대로 두되(로컬 참고용), 이 파일에서는 삭제했다.
 */

export interface AiBriefingCheckResult {
  hasAiBriefing: boolean; // 이 키워드 검색 시 AI 탭이 제공되는지
  error?: string;
}

/**
 * keyword로 네이버 일반 검색 결과 페이지를 정적 HTML로 가져와 AI 탭 존재 여부만 판별한다.
 * 키워드 순위 확인 크롤러(crawl-rankings 등)와 동일한 fetchWithRetry 기반 구조 — 브라우저 실행 없음.
 */
export async function checkAiBriefingExposure(keyword: string): Promise<AiBriefingCheckResult> {
  try {
    const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
    const res = await fetchWithRetry(searchUrl, {
      headers: { Referer: 'https://search.naver.com/' },
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    const hasAiBriefing = $('a[href*="ssc=tab.ait.all"]').length > 0;
    return { hasAiBriefing };
  } catch (e) {
    return { hasAiBriefing: false, error: e instanceof Error ? e.message : String(e) };
  }
}
