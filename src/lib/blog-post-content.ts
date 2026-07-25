import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * 네이버 블로그 글에서 본문 텍스트를 추출 (최대 5000자)
 * ai-analyze, curate-blog-topics 크론이 공용으로 사용.
 */
export async function extractPostText(blogId: string, logNo: string): Promise<{ title: string; text: string; charCount: number; thumbnailUrl: string | null }> {
  const url = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${logNo}&directAccess=false`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
      'Referer': `https://blog.naver.com/${blogId}`,
    },
  });

  if (!res.ok) throw new Error('본문을 가져올 수 없습니다.');

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('meta[property="og:title"]').attr('content')?.trim()
    || $('.se-title-text').text().trim()
    || $('title').text().replace(/\s*[-:]\s*네이버\s*블로그.*/, '').trim()
    || '';
  const thumbnailUrl = $('meta[property="og:image"]').attr('content')?.trim() || null;

  // 본문 영역 찾기
  const contentSelectors = ['.se-main-container', '#postViewArea', '.post-view', '#viewTypeSelector'];
  let $content: cheerio.Cheerio<AnyNode> | null = null;
  for (const sel of contentSelectors) {
    const found = $(sel);
    if (found.length > 0 && found.text().trim().length > 10) {
      $content = found;
      break;
    }
  }
  if (!$content) $content = $('body');

  $content.find('script, style, noscript').remove();
  const fullText = $content.text().replace(/\s+/g, ' ').trim();

  return {
    title,
    text: fullText.substring(0, 5000),
    charCount: fullText.replace(/\s/g, '').length,
    thumbnailUrl,
  };
}
