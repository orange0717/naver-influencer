/**
 * IndexNow — 페이지 등록/수정 시 Bing·Yandex 등에 즉시 크롤링 요청
 * 키 파일: public/f682c64e7f2a9ddd7bea27a62cb447f8749c2bf4d8859067e26215292c465377.txt
 */
const SITE_URL = 'https://ninfle.kr';
const INDEXNOW_KEY = 'f682c64e7f2a9ddd7bea27a62cb447f8749c2bf4d8859067e26215292c465377';
const INDEXNOW_KEY_LOCATION = `${SITE_URL}/${INDEXNOW_KEY}.txt`;

/**
 * IndexNow에 URL을 제출. 실패해도 호출자의 흐름을 막지 않도록 예외를 삼킨다.
 */
export async function submitToIndexNow(urls: string | string[]): Promise<void> {
  const urlList = Array.isArray(urls) ? urls : [urls];
  if (urlList.length === 0) return;

  try {
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'ninfle.kr',
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList,
      }),
    });
  } catch (err) {
    console.error('[indexnow] submit failed:', err instanceof Error ? err.message : err);
  }
}
