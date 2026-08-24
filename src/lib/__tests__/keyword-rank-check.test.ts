import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/kv-cache', () => ({
  cacheGet: async () => null,
  cacheSet: async () => {},
}));

import { matchInfluencerContentByHandle, checkBlogTab, checkViewTab } from '@/lib/keyword-rank-check';

// 실제 "한국소설" 통합검색 결과 순서: simple.arti → orangelibrary → kkkclub1
const html = [
  '<a href="https://in.naver.com/simple.arti/contents/internal/980951800684224?areacode=ink">',
  '<a href="https://in.naver.com/orangelibrary/contents/internal/984735023423040?areacode=ink">',
  '<a href="https://in.naver.com/kkkclub1/contents/internal/980641764412736?areacode=ink">',
].join('\n');

describe('matchInfluencerContentByHandle', () => {
  it('점이 들어간 handle도 한 자리로 세어 뒤 순위를 당기지 않는다', () => {
    expect(matchInfluencerContentByHandle(html, new Set(['orangelibrary']), 0)).toBe(2);
  });

  it('점 handle 자신도 매칭된다', () => {
    expect(matchInfluencerContentByHandle(html, new Set(['simple.arti']), 0)).toBe(1);
  });

  it('같은 콘텐츠가 여러 번 나와도 중복으로 세지 않는다', () => {
    expect(matchInfluencerContentByHandle(`${html}\n${html}`, new Set(['kkkclub1']), 0)).toBe(3);
  });

  it('없는 handle이면 null', () => {
    expect(matchInfluencerContentByHandle(html, new Set(['nobody']), 0)).toBeNull();
  });
});

// 네이버는 차단·보안문자·점검 때도 HTTP 200으로 안내 페이지를 준다.
// 그 응답을 "정상 조회"로 받아들이면 결과를 0건 파싱하고도 미노출로 확정된다.
describe('차단/점검 응답을 미노출로 확정하지 않는다', () => {
  const resultPage = (body: string) =>
    `<html><body><div id="main_pack">${body}</div></body></html>`;

  /** 네이버 차단 안내 페이지 — HTTP 200이지만 검색 결과 골격이 없다. */
  const blockedPage = '<html><body><div class="error_area">잘못된 접근입니다</div></body></html>';

  const mockFetchHtml = (html: string, ok = true) =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, text: async () => html })));

  afterEach(() => vi.unstubAllGlobals());

  it('블로그탭: 차단 페이지는 exposed:false 가 아니라 error:true', async () => {
    mockFetchHtml(blockedPage);
    const res = await checkBlogTab('강아지', 'myblog', '12345', { force: true });
    expect(res.error).toBe(true);
    expect(res.scannedDepth).toBeUndefined();
  });

  it('통합검색: 차단 페이지는 exposed:false 가 아니라 error:true', async () => {
    mockFetchHtml(blockedPage);
    const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
    expect(res.error).toBe(true);
  });

  it('정상 결과 페이지에서 내 글을 찾으면 그대로 노출로 판정한다', async () => {
    mockFetchHtml(resultPage('<a data-url="https://blog.naver.com/myblog/12345" data-cr-on="r=3"></a>'));
    const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
    expect(res).toMatchObject({ exposed: true, rank: 3 });
    expect(res.error).toBeUndefined();
  });

  it('정상 결과 페이지에 내 글이 없으면 진짜 미노출로 판정한다', async () => {
    mockFetchHtml(resultPage('<a data-url="https://blog.naver.com/other/999" data-cr-on="r=1"></a>'));
    const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
    expect(res.exposed).toBe(false);
    expect(res.error).toBeUndefined();
  });

  // "30위 밖"이라고 적으려면 30위까지 실제로 읽었어야 한다. 페이지에 3건뿐이면 확인 범위는 3위다.
  it('조회 범위는 실제로 읽어낸 최대 순위까지만 주장한다', async () => {
    mockFetchHtml(resultPage(
      [1, 2, 3].map(r => `<a data-url="https://blog.naver.com/other/${r}" data-cr-on="r=${r}"></a>`).join(''),
    ));
    const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
    expect(res.scannedDepth).toBe(3);
  });

  it('순위를 하나도 읽지 못하면 조회 범위를 주장하지 않는다', async () => {
    mockFetchHtml(resultPage('<div>결과 없음</div>'));
    const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
    expect(res.exposed).toBe(false);
    expect(res.scannedDepth).toBeUndefined();
  });

  it('postId 가 없으면 조회 자체가 성립하지 않으므로 확인 불가로 신호한다', async () => {
    mockFetchHtml(resultPage(''));
    const res = await checkBlogTab('강아지', 'myblog', '', { force: true });
    expect(res.error).toBe(true);
  });
});
