import { describe, it, expect } from 'vitest';
import {
  blogPostKey,
  parseBlogPostRef,
  isSamePost,
  matchesPost,
  findBlogPostRefs,
  countBlogPostRefs,
} from '../naver-blog-post-ref';

describe('parseBlogPostRef — 표기 환원', () => {
  it('① 경로형', () => {
    expect(parseBlogPostRef('https://blog.naver.com/orangelibrary_/223456789012')).toEqual({
      blogId: 'orangelibrary_',
      logNo: '223456789012',
      key: 'orangelibrary_/223456789012',
    });
  });

  it('① 경로형 — m. / www. 접두사', () => {
    expect(parseBlogPostRef('https://m.blog.naver.com/orangelibrary_/223456789012')?.key)
      .toBe('orangelibrary_/223456789012');
    expect(parseBlogPostRef('https://www.blog.naver.com/orangelibrary_/223456789012')?.key)
      .toBe('orangelibrary_/223456789012');
    // 프로토콜 없이 마크업에서 뽑힌 조각도 같은 키가 나와야 한다
    expect(parseBlogPostRef('m.blog.naver.com/orangelibrary_/223456789012')?.key)
      .toBe('orangelibrary_/223456789012');
  });

  it('② 뷰어형 — .naver / .nhn, 파라미터 순서 무관', () => {
    expect(parseBlogPostRef('https://blog.naver.com/PostView.naver?blogId=abc-1&logNo=100')?.key)
      .toBe('abc-1/100');
    expect(parseBlogPostRef('https://blog.naver.com/PostView.nhn?logNo=100&blogId=abc-1')?.key)
      .toBe('abc-1/100');
    expect(parseBlogPostRef('https://m.blog.naver.com/PostView.naver?blogId=abc-1&logNo=100&redirect=Dlog')?.key)
      .toBe('abc-1/100');
  });

  it('③ 리다이렉트형 — blogId 는 경로, logNo 는 쿼리', () => {
    expect(parseBlogPostRef('https://blog.naver.com/orangelibrary_?Redirect=Log&logNo=223456789012')?.key)
      .toBe('orangelibrary_/223456789012');
  });

  it('④ blog.me 별칭형', () => {
    expect(parseBlogPostRef('http://orangelibrary.blog.me/223456789012')).toEqual({
      blogId: 'orangelibrary',
      logNo: '223456789012',
      key: 'orangelibrary/223456789012',
    });
  });

  it('href 안의 &amp; 엔티티를 되돌린다', () => {
    // HTML 에서 뽑은 조각은 이 형태가 기본이라, 되돌리지 않으면 logNo 를 못 읽어 미노출로 굳는다
    expect(parseBlogPostRef('https://blog.naver.com/PostView.naver?blogId=abc-1&amp;logNo=100')?.key)
      .toBe('abc-1/100');
    expect(parseBlogPostRef('https://blog.naver.com/orangelibrary_?Redirect=Log&amp;logNo=223456789012')?.key)
      .toBe('orangelibrary_/223456789012');
  });

  it('URL 을 품은 조각(따옴표·마크업 포함)에서도 뽑아낸다', () => {
    const frag = '<a href="https://m.blog.naver.com/orangelibrary_/223456789012?fromRss=true">글 제목</a>';
    expect(parseBlogPostRef(frag)?.key).toBe('orangelibrary_/223456789012');
  });

  it('읽어낼 수 없으면 null — 호출부는 이를 「미노출」 근거로 쓰지 않는다', () => {
    expect(parseBlogPostRef(null)).toBeNull();
    expect(parseBlogPostRef(undefined)).toBeNull();
    expect(parseBlogPostRef('')).toBeNull();
    expect(parseBlogPostRef('https://cafe.naver.com/abc/123')).toBeNull();
    // 호스트는 맞지만 logNo 가 없다 → 글 참조가 아니다
    expect(parseBlogPostRef('https://blog.naver.com/orangelibrary_')).toBeNull();
    expect(parseBlogPostRef('https://blog.naver.com/PostList.naver?blogId=abc-1')).toBeNull();
  });

  it('🚨 in.naver.com 인플루언서 콘텐츠는 여기서 다루지 않는다', () => {
    // 그 id 는 logNo 가 아니고 handle 도 blogId 와 다른 네임스페이스라,
    // 섞으면 남의 글을 내 글로 인정하는 거짓 노출이 난다.
    expect(parseBlogPostRef('https://in.naver.com/simple.arti/contents/internal/823456789012345')).toBeNull();
    expect(parseBlogPostRef('https://in.naver.com/orangelibrary/contents/internal/1234')).toBeNull();
  });
});

describe('비교 키', () => {
  it('blogId 대소문자를 구분하지 않는다 — 네이버가 두 표기를 모두 낸다', () => {
    expect(blogPostKey('OrangeLibrary_', 223)).toBe('orangelibrary_/223');
    expect(parseBlogPostRef('https://blog.naver.com/OrangeLibrary_/223')?.key)
      .toBe(parseBlogPostRef('https://blog.naver.com/orangelibrary_/223')?.key);
  });

  it('원문 표기의 대소문자는 blogId 에 보존한다', () => {
    expect(parseBlogPostRef('https://blog.naver.com/OrangeLibrary_/223')?.blogId).toBe('OrangeLibrary_');
  });

  it('logNo 는 문자열·숫자 어느 쪽으로 넣어도 같은 키', () => {
    expect(blogPostKey('abc', '223')).toBe(blogPostKey('abc', 223));
  });
});

describe('isSamePost / matchesPost', () => {
  it('blogId·logNo 둘 다 일치해야 같은 글이다', () => {
    const ref = parseBlogPostRef('https://blog.naver.com/orangelibrary_/223');
    expect(isSamePost(ref, 'orangelibrary_', '223')).toBe(true);
    expect(isSamePost(ref, 'orangelibrary_', '224')).toBe(false);
    expect(isSamePost(ref, 'other_blog', '223')).toBe(false);
  });

  it('null 참조는 일치가 아니다', () => {
    expect(isSamePost(null, 'orangelibrary_', '223')).toBe(false);
  });

  it('matchesPost 는 표기가 달라도 같은 글을 알아본다', () => {
    for (const raw of [
      'https://blog.naver.com/orangelibrary_/223',
      'https://m.blog.naver.com/orangelibrary_/223',
      'https://blog.naver.com/PostView.naver?blogId=orangelibrary_&amp;logNo=223',
      'https://blog.naver.com/orangelibrary_?Redirect=Log&logNo=223',
      'http://orangelibrary_.blog.me/223',
    ]) {
      expect(matchesPost(raw, 'ORANGELIBRARY_', 223), raw).toBe(true);
    }
  });
});

describe('findBlogPostRefs — 등장 순서 보존 + 첫 등장만', () => {
  const HTML = `
    <ul>
      <li><a href="https://blog.naver.com/aaa/111">첫째</a></li>
      <li><a href="https://m.blog.naver.com/bbb/222?fromRss=true">둘째</a></li>
      <li><a href="https://blog.naver.com/PostView.naver?blogId=ccc&amp;logNo=333">셋째</a></li>
      <li><a href="https://blog.naver.com/aaa/111">첫째 중복</a></li>
      <li><a href="https://in.naver.com/simple.arti/contents/internal/999">인플루언서</a></li>
      <li><a href="http://ddd.blog.me/444">넷째</a></li>
    </ul>`;

  it('순서를 보존한다 — 순위를 등장 순서로 세는 폴백 경로가 쓴다', () => {
    expect(findBlogPostRefs(HTML).map(r => r.key)).toEqual([
      'aaa/111',
      'bbb/222',
      'ccc/333',
      'ddd/444',
    ]);
  });

  it('같은 글은 첫 등장만 남긴다', () => {
    expect(countBlogPostRefs(HTML)).toBe(4);
  });

  it('블로그 글 링크가 없으면 빈 배열', () => {
    expect(findBlogPostRefs('<div>검색결과가 없습니다</div>')).toEqual([]);
    expect(countBlogPostRefs('')).toBe(0);
  });
});
