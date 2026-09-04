import { createHash } from 'crypto';

/**
 * §3.3 / §4 — 노출 검사의 "조회 조건"과 "판정 근거" 단일 출처.
 *
 * 지시서 §6: "검사 조건(탭·기기·시각) 없이 순위 숫자만 표시" 금지.
 * 지시서 §4: "근거를 남길 수 없는 판정은 판정이 아니다."
 *
 * 그래서 순위를 만들어 낸 조건(어떤 URL을·어떤 기기로·로그인 여부·언어)을 판정과 같은 레코드에
 * 함께 남기고 화면에도 그대로 보여준다. 문구를 화면에 직접 적지 않고 이 모듈을 거치게 한 이유는,
 * 실제 조회 코드(keyword-rank-check.ts)와 화면 설명이 갈라지는 순간 그 설명이 거짓이 되기 때문이다.
 * URL 도 화면용으로 다시 조립하지 않고 여기 buildSearchUrl 하나만 쓴다 —
 * 조회는 A 로 하고 근거엔 B 를 적어 두면 근거가 아니라 장식이다.
 */

/** 조회에 쓰는 UA — 데스크톱(PC) 크롬. 모바일 UA 로 바꾸면 순위가 달라지므로 조건으로 명시한다. */
export const SEARCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type SearchArea = 'view' | 'blog' | 'influencer';

/** 영역 → 화면 표기 이름 */
export const AREA_LABEL: Record<SearchArea, string> = {
  view: '통합검색',
  blog: '블로그탭',
  influencer: '인플루언서탭',
};

/** 영역 → 네이버 검색 탭 파라미터(조회 조건의 핵심 축) */
const AREA_TAB_PARAM: Record<SearchArea, string> = {
  view: 'where=webkr',
  blog: 'ssc=tab.blog.all',
  influencer: 'ssc=tab.influencer.all',
};

/**
 * 검사에 실제로 쓰는 검색 URL을 만든다.
 * start 는 블로그탭 2·3페이지에서만 쓴다 — 통합검색·인플루언서탭은 네이버가 start 를 무시한다
 * (그래서 두 탭은 1페이지만 조회한다. keyword-rank-check.ts 주석 참고).
 */
export function buildSearchUrl(area: SearchArea, query: string, start?: number): string {
  const base = `https://search.naver.com/search.naver?${AREA_TAB_PARAM[area]}&sm=tab_jum&query=${encodeURIComponent(query)}`;
  return start && start > 1 ? `${base}&start=${start}` : base;
}

/** 검사 시 고정하는 조회 조건(§3.3). 값이 바뀌면 판정도 바뀌므로 근거에 그대로 저장한다. */
export interface ExposureConditions {
  /** 'pc' — 데스크톱 UA 로만 조회한다. 모바일 결과는 순위가 다르다. */
  device: 'pc';
  /** 로그인 여부. 항상 false — 쿠키를 붙이지 않으므로 개인화가 섞이지 않는다. */
  loggedIn: boolean;
  /** Accept-Language */
  language: string;
  /** 지역 파라미터. 지정하지 않는다(네이버 기본값) → null */
  region: string | null;
  userAgent: string;
}

export const EXPOSURE_CONDITIONS: ExposureConditions = {
  device: 'pc',
  loggedIn: false,
  language: 'ko-KR',
  region: null,
  userAgent: SEARCH_USER_AGENT,
};

/** 화면 한 줄 요약 — 순위 숫자 옆에 항상 따라붙어야 하는 최소 조건 표기 */
export const CONDITIONS_SUMMARY = 'PC · 비로그인 · 한국어(ko-KR) · 지역 미지정';

/**
 * §3.4 순위 카운팅 규칙 — 화면 툴팁의 정본.
 *
 * ⚠️ 여기 적는 건 "이렇게 세면 좋겠다"가 아니라 **지금 코드가 실제로 세는 방식**이다.
 * 구현과 다른 규칙을 적어 두면 사용자는 우리가 안 하는 일을 했다고 믿게 된다.
 * keyword-rank-check.ts 를 고치면 이 목록도 같이 고칠 것.
 */
export const RANK_COUNTING_RULES: string[] = [
  '순위는 네이버가 결과 항목에 직접 붙이는 공식 순위 값(data-cr-on="r=")을 그대로 씁니다. 그 값이 없는 마크업에서만 결과 등장 순서로 셉니다.',
  '광고·파워링크는 공식 순위 값도 블로그 글 링크도 아니어서 순위 계산에서 빠집니다.',
  '인플루언서 콘텐츠(in.naver.com)는 공식 순위 값이 없어 등장 순서로 셉니다.',
  '같은 글이 여러 번 나오면 처음 한 번만 셉니다(글 주소의 blogId+logNo 기준, 제목 문자열로 세지 않습니다).',
  '블로그탭은 3페이지(상위 30위)까지, 통합검색·인플루언서탭은 1페이지만 조회합니다 — 두 탭은 네이버가 start 파라미터를 무시해 2·3페이지가 1페이지와 같은 결과를 돌려줍니다.',
  '표시되는 순위는 페이지 전체 기준입니다. 스마트블록 같은 섹션 안에서의 위치는 아직 제공하지 않습니다.',
];

/** 한 번의 네이버 조회에 대한 근거 한 줄 — 어떤 URL을 읽었고 그 응답이 무엇이었는지 */
export interface SearchSnapshot {
  /** 실제로 요청한 URL(페이지 파라미터 포함) */
  url: string;
  /** 응답 HTML 의 sha256 앞 16자 — 같은 화면을 봤는지 나중에 대조하기 위한 지문 */
  hash: string;
  /** 응답 HTML 바이트 길이 — 해시만으로는 "빈 페이지였나"를 알 수 없다 */
  bytes: number;
}

/** 스냅샷 지문 — 원본 HTML 을 저장하지 않고도 "같은 페이지였는가"를 대조할 수 있게 한다 */
export function snapshotHash(html: string): string {
  return createHash('sha256').update(html).digest('hex').slice(0, 16);
}

/** 근거 JSONB 가 무한정 커지지 않도록 영역당 저장할 스냅샷 상한 */
export const MAX_SNAPSHOTS_PER_AREA = 6;

/** ISO 시각을 KST 고정 표기로 — 서버·브라우저 시간대와 무관하게 같은 문자열이 나와야 근거로 쓸 수 있다(§3.8) */
export function toKstString(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const kst = new Date(t + 9 * 60 * 60 * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} `
    + `${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}:${p(kst.getUTCSeconds())} KST`;
}
