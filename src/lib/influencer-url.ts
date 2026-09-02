/**
 * 인플루언서 홈 주소 파싱 — 화면과 서버가 같은 규칙을 쓰도록 여기 한 곳에만 둔다.
 * 예전에는 화면과 서버가 각자 정규식을 갖고 있어서 한쪽만 고치면 조용히 어긋났다.
 */

/** in.naver.com 홈 주소에서 아이디 부분을 뽑아낸다. */
const HOME_URL_PATTERN = /^(?:https?:\/\/)?(?:www\.|m\.)?in\.naver\.com\/([^/?#]+)/i;

/** 네이버가 허용하는 아이디 형태 */
const ID_PATTERN = /^[a-zA-Z0-9._-]{2,30}$/;

/**
 * 주소 전체(https://in.naver.com/orangelibrary) 또는 아이디만(orangelibrary) 받아
 * 소문자 아이디를 돌려준다. 형태가 어긋나면 null.
 */
export function parseInfluencerId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromUrl = trimmed.match(HOME_URL_PATTERN);
  const candidate = (fromUrl ? fromUrl[1] : trimmed).toLowerCase();

  return ID_PATTERN.test(candidate) ? candidate : null;
}

export function influencerHomeUrl(id: string): string {
  return `https://in.naver.com/${id}`;
}
