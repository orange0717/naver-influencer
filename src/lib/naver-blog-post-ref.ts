/**
 * §3.2 네이버 블로그 글 참조(URL) 정준화 — 노출 판정의 단일 비교 기준.
 *
 * 판정은 **제목 문자열이 아니라 blogId + logNo 로만** 한다. 이 파일은 검색 결과 HTML·OpenAPI 응답에
 * 섞여 나오는 여러 표기를 하나의 비교 키로 환원한다. 표기를 하나라도 못 읽으면 그 글은 스캔에서
 * 통째로 빠지고, 멀쩡히 노출 중인 글이 「미노출」로 굳는다 — 이 저장소에서 실제로 반복된 사고다.
 *
 * 환원하는 표기:
 *   ① 경로형   blog.naver.com/{blogId}/{logNo}                  (m. / www. 접두사 포함)
 *   ② 뷰어형   blog.naver.com/PostView.naver|nhn?blogId=..&logNo=..   (파라미터 순서 무관)
 *   ③ 리다이렉트형 blog.naver.com/{blogId}?Redirect=Log&logNo=..
 *   ④ 별칭형   {blogId}.blog.me/{logNo}
 *   HTML 에서 뽑은 조각의 `&amp;` 엔티티도 되돌린다(href 안에서는 이 형태가 기본이다).
 *
 * 🚨 in.naver.com/{handle}/contents/internal/{id} 는 **여기서 다루지 않는다.**
 *   그 id 는 logNo 가 아니라 인플루언서 콘텐츠 id 이고 handle 도 blogId 와 다른 네임스페이스라
 *   (핸들에는 점이 들어간다), 섞으면 남의 글을 내 글로 인정하는 거짓 노출이 난다.
 *   인플루언서 콘텐츠 매칭은 keyword-rank-check.ts 의 handleSet 경로가 따로 담당한다.
 *
 * 🚨 blogId 문자셋은 `[a-zA-Z0-9_-]` 가 맞다 — 점을 넣지 말 것.
 *   네이버 계정 ID 규칙이 그렇고, 입구(blog-access.ts)에서도 같은 문자셋으로 강제한다.
 *   점이 허용되는 건 in.naver.com 핸들 쪽이며 그건 위에 적은 대로 별개 경로다.
 */

/** 네이버 블로그 글 하나를 가리키는 정규화된 참조 */
export interface BlogPostRef {
  /** 원문 표기 그대로의 blogId (대소문자 보존) */
  blogId: string;
  /** 글 번호 */
  logNo: string;
  /** 비교 키 — 소문자 blogId + '/' + logNo */
  key: string;
}

/** 비교 키 생성 — blogId 는 대소문자를 구분하지 않는다(네이버가 두 표기를 모두 낸다). */
export function blogPostKey(blogId: string, logNo: string | number): string {
  return `${blogId.toLowerCase()}/${String(logNo)}`;
}

function ref(blogId: string, logNo: string): BlogPostRef {
  return { blogId, logNo, key: blogPostKey(blogId, logNo) };
}

/** HTML 조각에서 온 문자열을 URL 로 읽을 수 있게 되돌린다. */
function decodeFragment(raw: string): string {
  return raw.replace(/&amp;/gi, '&');
}

const PATH_FORM = /(?:m\.|www\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/i;
const BLOG_ME_FORM = /([a-zA-Z0-9_-]+)\.blog\.me\/(\d+)/i;
const HAS_BLOG_HOST = /blog\.naver\.com/i;
const QUERY_BLOG_ID = /[?&]blogId=([a-zA-Z0-9_-]+)/i;
const QUERY_LOG_NO = /[?&]logNo=(\d+)/i;
const REDIRECT_FORM = /(?:m\.|www\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)\?/i;

/**
 * URL 또는 URL 을 품은 조각에서 글 참조를 뽑는다. 읽어낼 수 없으면 null —
 * 호출부는 null 을 「이 항목은 블로그 글이 아니다」로만 쓰고, 절대 「미노출」 근거로 쓰지 않는다.
 */
export function parseBlogPostRef(raw: string | null | undefined): BlogPostRef | null {
  if (!raw) return null;
  const s = decodeFragment(raw);

  // ① 경로형이 가장 흔하고 가장 명확하다.
  const path = s.match(PATH_FORM);
  if (path) return ref(path[1], path[2]);

  // ④ blog.me 별칭
  const alias = s.match(BLOG_ME_FORM);
  if (alias) return ref(alias[1], alias[2]);

  if (!HAS_BLOG_HOST.test(s)) return null;

  const logNo = s.match(QUERY_LOG_NO)?.[1];
  if (!logNo) return null;

  // ② 뷰어형 — blogId 가 쿼리에 있다.
  const queryId = s.match(QUERY_BLOG_ID)?.[1];
  if (queryId) return ref(queryId, logNo);

  // ③ 리다이렉트형 — blogId 는 경로에, logNo 는 쿼리에 있다.
  const redirectId = s.match(REDIRECT_FORM)?.[1];
  if (redirectId) return ref(redirectId, logNo);

  return null;
}

/** 이 참조가 대상 글과 같은 글인가. blogId·logNo 둘 다 일치해야 한다. */
export function isSamePost(candidate: BlogPostRef | null, blogId: string, postId: string | number): boolean {
  if (!candidate) return false;
  return candidate.key === blogPostKey(blogId, postId);
}

/** URL 조각이 대상 글을 가리키는가 — parseBlogPostRef + isSamePost 의 축약. */
export function matchesPost(raw: string | null | undefined, blogId: string, postId: string | number): boolean {
  return isSamePost(parseBlogPostRef(raw), blogId, postId);
}

/**
 * HTML 전체에서 블로그 글 링크 후보를 등장 순서대로 훑는다.
 * 순위는 "등장 순서"로 세는 폴백 경로들이 쓰므로 순서를 보존하고, 같은 글은 첫 등장만 남긴다.
 */
const CANDIDATE_SCAN = /(?:m\.|www\.)?blog\.naver\.com\/[^\s"'<>\\)]+|[a-zA-Z0-9_-]+\.blog\.me\/[^\s"'<>\\)]+/gi;

export function findBlogPostRefs(html: string): BlogPostRef[] {
  const out: BlogPostRef[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(CANDIDATE_SCAN)) {
    const parsed = parseBlogPostRef(m[0]);
    if (!parsed || seen.has(parsed.key)) continue;
    seen.add(parsed.key);
    out.push(parsed);
  }
  return out;
}

/** HTML 안의 서로 다른 블로그 글 링크 개수 — 스캔 깊이(조회 범위) 산정용 */
export function countBlogPostRefs(html: string): number {
  return findBlogPostRefs(html).length;
}
