import { parseNaverBlogPostUrl } from './naver-blog-url';

/**
 * 블로그 URL 또는 ID에서 순수 blogId만 추출해 정규화한다.
 * 네이버 블로그 blogId 파싱/정규화의 단일 진입점 — 다른 곳에서 별도 정규식을 만들지 말고 이 함수를 사용할 것.
 *
 * 지원 입력 형태:
 * - https://blog.naver.com/BLOGID → blogid
 * - https://m.blog.naver.com/BLOGID → blogid
 * - https://blog.naver.com/BLOGID/123456789 (포스트 경로) → blogid
 * - https://blog.naver.com/PostView.naver?blogId=BLOGID&logNo=123 → blogid
 * - @BLOGID, BLOGID → blogid
 *
 * 정규화 규칙: '@' 접두사 제거 + 소문자 변환 (대소문자·표기 차이로 동일 사용자가
 * 다른 blogId 문자열로 저장되는 것을 방지하기 위한 표준 규칙)
 */
export function extractBlogId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // 포스트 URL (경로형 /{blogId}/{postNo}, PostView.naver?blogId=...) 우선 시도.
  // 프로토콜이 없는 입력(blog.naver.com/foo)도 지원하기 위해 필요 시 보정한다.
  const maybeUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const postParsed = parseNaverBlogPostUrl(maybeUrl);
  if (postParsed) return normalizeBlogId(postParsed.blogId);

  // 프로필 URL (포스트 경로 없이 blogId만 있는 형태)
  const urlMatch = trimmed.match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([^/?#]+)/i);
  if (urlMatch) return normalizeBlogId(urlMatch[1]);

  // 순수 ID 입력 (@ 접두사 허용)
  return normalizeBlogId(trimmed);
}

function normalizeBlogId(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase();
}

/**
 * blogId가 유효한 네이버 블로그 ID인지 확인
 * UUID나 빈 값이면 false
 */
export function isValidBlogId(blogId: string): boolean {
  if (!blogId || blogId.length === 0) return false;
  // UUID 패턴 (Supabase profile.id)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(blogId)) return false;
  // 네이버 블로그 ID: 영문, 숫자, _, - 조합
  return /^[a-zA-Z0-9_-]+$/.test(blogId);
}

/**
 * 크롤링으로 뽑아낸 네이버 ID가 "읽어내는 데 성공한 값"인지 판정한다.
 *
 * 위 isValidBlogId 와 목적이 다르다. 저건 사용자가 입력한 블로그 ID의 형식 검증이고,
 * 이건 HTML 파싱 결과가 ID인지 파싱 실패의 잔해인지를 가리는 용도다.
 *
 * ⚠️ 일부러 허용목록을 쓰지 않는다.
 *   crawl-rankings 의 extractNaverId() 는 프로필 링크를 못 읽으면 '' 나 URL 조각을 돌려주는데,
 *   그게 그대로 influencers.naver_id 로 upsert(onConflict: naver_id) 되면 서로 다른 인플루언서가
 *   한 행으로 합쳐져 avg_rank·keyword_score·ninfl_rank 가 남의 순위로 오염된다.
 *   그렇다고 /^[a-zA-Z0-9_-]+$/ 같은 허용목록을 쓰면, 이 저장소에서 실제로 났던 사고처럼
 *   `.`·`-` 가 든 멀쩡한 ID까지 걸러서 실적이 조용히 0으로 굳는다(2026-08-25).
 *   그래서 "명백히 ID가 아닌 것"만 거른다 — 빈 값, 경로/쿼리 구분자, 공백, URL.
 */
export function looksLikeParsedNaverId(raw: string | null | undefined): boolean {
  const id = (raw ?? '').trim();
  if (!id) return false;
  if (/^https?:/i.test(id)) return false;
  return !/[/?=&\s#]/.test(id);
}
