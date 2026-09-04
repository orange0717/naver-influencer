import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/kv-cache', () => ({
  cacheGet: async () => null,
  cacheSet: async () => {},
}));

import { matchInfluencerContentByHandle, checkBlogTab, checkViewTab } from '@/lib/keyword-rank-check';
import { buildSearchUrl } from '@/lib/exposure-conditions';

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

// handle 만 보고 매칭하면 "같은 인플루언서의 다른 글"이 걸려도 이 글이 노출됐다고 판정된다.
// 제목을 넘기면 글 단위로 구분한다.
describe('matchInfluencerContentByHandle — 제목으로 글 단위 구분', () => {
  const anchor = (handle: string, id: string, title: string) =>
    `<a href="https://in.naver.com/${handle}/contents/internal/${id}?areacode=ink">${title}<span>새 창 열림</span></a>`;
  const page = [
    anchor('simple.arti', '1', '양귀자 모순 한국 소설 추천'),
    anchor('orangelibrary', '2', '쇼펜하우어 아포리즘 필사 후기'),
  ].join('\n');

  it('제목이 같은 글이면 그 순위를 돌려준다', () => {
    expect(
      matchInfluencerContentByHandle(page, new Set(['orangelibrary']), 0, '쇼펜하우어 아포리즘 필사 후기'),
    ).toBe(2);
  });

  it('handle 은 같지만 다른 글이면 이 글의 노출로 인정하지 않는다', () => {
    expect(
      matchInfluencerContentByHandle(page, new Set(['orangelibrary']), 0, '카피라이팅 잘하는 법'),
    ).toBeNull();
  });

  it('네이버가 제목을 말줄임해도 같은 글로 인정한다', () => {
    expect(
      matchInfluencerContentByHandle(page, new Set(['orangelibrary']), 0, '쇼펜하우어 아포리즘 필사 후기 - 3주차 기록'),
    ).toBe(2);
  });

  it('제목을 하나도 못 뽑는 마크업에서는 handle 기준으로 되돌아간다(미노출 오판 방지)', () => {
    const noAnchor = 'data-url="https://in.naver.com/orangelibrary/contents/internal/2?areacode=ink"';
    expect(matchInfluencerContentByHandle(noAnchor, new Set(['orangelibrary']), 0, '전혀 다른 제목')).toBe(1);
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

  // 페이지는 200으로 떴지만 판정 대상 항목을 0건 파싱했다면, 그건 미노출을 확인한 게 아니라
  // 아무것도 확인하지 못한 것이다. 2026-08-24 통합검색 마크업이 fender-ui 로 바뀌며 실제로 이 상황이 됐다.
  it('결과 항목을 0건 파싱하면 미노출이 아니라 확인 불가로 신호한다', async () => {
    mockFetchHtml(resultPage('<div>결과 없음</div>'));
    const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
    expect(res.error).toBe(true);
    expect(res.scannedDepth).toBeUndefined();
  });

  it('블로그탭도 결과 항목 0건이면 확인 불가로 신호한다', async () => {
    mockFetchHtml(resultPage('<div>결과 없음</div>'));
    const res = await checkBlogTab('강아지', 'myblog', '12345', { force: true });
    expect(res.error).toBe(true);
  });

  it('postId 가 없으면 조회 자체가 성립하지 않으므로 확인 불가로 신호한다', async () => {
    mockFetchHtml(resultPage(''));
    const res = await checkBlogTab('강아지', 'myblog', '', { force: true });
    expect(res.error).toBe(true);
  });

  // §3.2 — 판정은 blogId+logNo 로만 하고, 표기가 달라도 같은 글로 본다.
  // 아래 셋은 전부 "멀쩡히 노출 중인데 미노출로 굳던" 실제 구멍이다.
  describe('표기가 달라도 같은 글로 인정한다(§3.2 정준화)', () => {
    it('data-url 이 m.blog 여도 노출로 판정한다', async () => {
      mockFetchHtml(resultPage('<a data-url="https://m.blog.naver.com/myblog/12345" data-cr-on="r=4"></a>'));
      const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
      expect(res).toMatchObject({ exposed: true, rank: 4 });
    });

    // 🚨 혼합 마크업이 진짜 사고 지점이었다. www 형제 항목 때문에 seen 이 비지 않아
    //    <a> href 폴백이 아예 돌지 않았고, m.blog 인 내 글만 조용히 사라졌다.
    it('www 항목과 m.blog 항목이 섞여 있어도 m.blog 인 내 글을 놓치지 않는다', async () => {
      mockFetchHtml(resultPage(
        '<a data-url="https://blog.naver.com/other/999" data-cr-on="r=1"></a>' +
        '<a data-url="https://m.blog.naver.com/myblog/12345" data-cr-on="r=2"></a>',
      ));
      const res = await checkBlogTab('강아지', 'myblog', '12345', { force: true });
      expect(res).toMatchObject({ exposed: true, rank: 2 });
    });

    it('PostView 뷰어형 + &amp; 엔티티도 읽어낸다', async () => {
      mockFetchHtml(resultPage(
        '<a data-url="https://blog.naver.com/PostView.naver?blogId=myblog&amp;logNo=12345" data-cr-on="r=5"></a>',
      ));
      const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
      expect(res).toMatchObject({ exposed: true, rank: 5 });
    });

    it('blogId 대소문자가 달라도 같은 글이다', async () => {
      mockFetchHtml(resultPage('<a data-url="https://blog.naver.com/MyBlog/12345" data-cr-on="r=1"></a>'));
      const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
      expect(res.exposed).toBe(true);
    });

    it('남의 글은 여전히 노출로 인정하지 않는다(거짓 노출 0건)', async () => {
      mockFetchHtml(resultPage(
        '<a data-url="https://m.blog.naver.com/myblog/99999" data-cr-on="r=1"></a>' +
        '<a data-url="https://blog.naver.com/PostView.naver?blogId=other&amp;logNo=12345" data-cr-on="r=2"></a>',
      ));
      const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
      expect(res.exposed).toBe(false);
      expect(res.error).toBeUndefined();
    });
  });

  // §4 "근거를 남길 수 없는 판정은 판정이 아니다."
  // 순위만 돌려주고 그 숫자를 만들어 낸 조회 URL·응답을 남기지 않으면 나중에 아무도 반증할 수 없다.
  describe('판정과 함께 근거(조회 URL·응답 지문)를 남긴다', () => {
    it('노출 판정에는 실제로 읽은 검색 URL과 지문이 붙는다', async () => {
      mockFetchHtml(resultPage('<a data-url="https://blog.naver.com/myblog/12345" data-cr-on="r=3"></a>'));
      const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
      expect(res.snapshots).toHaveLength(1);
      // 근거 URL은 화면용으로 다시 조립한 것이 아니라 조회에 쓴 그 URL이어야 한다.
      expect(res.snapshots![0].url).toBe(buildSearchUrl('view', '강아지'));
      expect(res.snapshots![0].hash).toMatch(/^[0-9a-f]{16}$/);
      expect(res.snapshots![0].bytes).toBeGreaterThan(0);
    });

    // 확인 불가야말로 근거가 필요하다 — "무엇을 읽었길래 확인을 못 했나"에 답해야 하기 때문이다.
    it('차단 페이지로 확인 불가가 나도 그 응답의 지문을 남긴다', async () => {
      mockFetchHtml(blockedPage);
      const res = await checkViewTab('강아지', 'myblog', '12345', 1, { force: true });
      expect(res.error).toBe(true);
      expect(res.snapshots).toHaveLength(1);
      expect(res.snapshots![0].url).toBe(buildSearchUrl('view', '강아지'));
    });

    it('블로그탭은 페이지마다 조회 URL을 따로 남긴다', async () => {
      mockFetchHtml(resultPage('<a data-url="https://blog.naver.com/other/999" data-cr-on="r=1"></a>'));
      const res = await checkBlogTab('강아지', 'myblog', '12345', { force: true });
      expect(res.snapshots).toHaveLength(3); // 1·2·3페이지
      expect(res.snapshots!.map(s => s.url)).toEqual([
        buildSearchUrl('blog', '강아지'),
        buildSearchUrl('blog', '강아지', 11),
        buildSearchUrl('blog', '강아지', 21),
      ]);
    });

    // 조회 URL을 다른 곳에서 다시 조립하면 "조회는 A로 하고 근거엔 B를 적는" 상태가 되고,
    // 그때부터 근거는 근거가 아니라 장식이 된다. 그래서 URL 생성기는 하나뿐이어야 한다.
    it('검색 URL 생성기는 조회 조건(탭 파라미터)을 그대로 담는다', () => {
      expect(buildSearchUrl('view', '강아지')).toContain('where=webkr');
      expect(buildSearchUrl('blog', '강아지')).toContain('ssc=tab.blog.all');
      expect(buildSearchUrl('influencer', '강아지')).toContain('ssc=tab.influencer.all');
      // start=1 은 1페이지라 붙이지 않는다(네이버 기본값과 같은 URL이어야 캐시도 함께 맞는다).
      expect(buildSearchUrl('blog', '강아지', 1)).toBe(buildSearchUrl('blog', '강아지'));
    });
  });
});
