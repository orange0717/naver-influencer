/** 네이버 블로그 포스트 URL을 파싱해 blogId/postNo/정규화된 URL을 반환. 형식이 아니면 null. */
export function parseNaverBlogPostUrl(input: string): { blogId: string; postNo: string; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^m\./, '');
  if (host !== 'blog.naver.com') return null;

  // PostView.naver?blogId=xxx&logNo=123 형식
  if (parsed.pathname === '/PostView.naver' || parsed.pathname === '/PostView.nhn') {
    const blogId = parsed.searchParams.get('blogId');
    const postNo = parsed.searchParams.get('logNo');
    if (blogId && postNo) {
      return { blogId, postNo, url: `https://blog.naver.com/${blogId}/${postNo}` };
    }
    return null;
  }

  // /{blogId}/{postNo} 경로 형식
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const [blogId, postNo] = segments;
    if (/^\d+$/.test(postNo)) {
      return { blogId, postNo, url: `https://blog.naver.com/${blogId}/${postNo}` };
    }
  }

  return null;
}
