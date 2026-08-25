import { describe, it, expect } from 'vitest';

import { extractBlogPost, findMatch } from '@/lib/naver-ai-briefing';

// 출처 URL을 파싱하지 못하면 findMatch 가 못 찾고, judge 는 그걸 NOT_CITED(진짜 미인용)로 확정한다.
// 즉 URL 파서의 구멍은 곧바로 "인용된 글을 미인용으로 오판"하는 데이터 오류가 된다.
describe('extractBlogPost — 출처 URL 파싱', () => {
  it('경로형 URL', () => {
    expect(extractBlogPost('https://blog.naver.com/orangelibrary_/223456789012')).toEqual({
      blogId: 'orangelibrary_',
      postId: '223456789012',
    });
  });

  it('모바일 서브도메인도 인식한다', () => {
    expect(extractBlogPost('https://m.blog.naver.com/orangelibrary_/223456789012')).toEqual({
      blogId: 'orangelibrary_',
      postId: '223456789012',
    });
  });

  it('쿼리형 PostView.naver', () => {
    expect(
      extractBlogPost('https://blog.naver.com/PostView.naver?blogId=orangelibrary_&logNo=223456789012'),
    ).toEqual({ blogId: 'orangelibrary_', postId: '223456789012' });
  });

  // 네이버는 구형 .nhn 링크를 아직도 출처로 내보낸다. 이걸 못 읽으면 실제 인용이 미인용으로 굳는다.
  it('구형 PostView.nhn 도 인식한다', () => {
    expect(
      extractBlogPost('https://blog.naver.com/PostView.nhn?blogId=orangelibrary_&logNo=223456789012'),
    ).toEqual({ blogId: 'orangelibrary_', postId: '223456789012' });
  });

  it('부가 쿼리스트링이 붙어도 인식한다', () => {
    expect(
      extractBlogPost(
        'https://m.blog.naver.com/PostView.nhn?blogId=orangelibrary_&logNo=223456789012&proxyReferer=&from=search',
      ),
    ).toEqual({ blogId: 'orangelibrary_', postId: '223456789012' });
  });

  it('네이버 블로그가 아니면 null', () => {
    expect(extractBlogPost('https://in.naver.com/orangelibrary/contents/internal/123')).toBeNull();
    expect(extractBlogPost('https://tistory.com/orangelibrary/223456789012')).toBeNull();
  });

  it('포스트 번호가 없는 블로그 홈은 null', () => {
    expect(extractBlogPost('https://blog.naver.com/orangelibrary_')).toBeNull();
  });

  it('URL 형식이 아니면 null (예외로 터지지 않는다)', () => {
    expect(extractBlogPost('오렌지도서관')).toBeNull();
    expect(extractBlogPost('')).toBeNull();
  });
});

describe('findMatch — blogId + logNo 둘 다 맞아야 인용', () => {
  const src = (url: string, title = 't') => ({ url, title });

  it('구형 .nhn 출처로 인용돼도 찾아낸다', () => {
    const sources = [
      src('https://blog.naver.com/someoneelse/111'),
      src('https://blog.naver.com/PostView.nhn?blogId=orangelibrary_&logNo=223456789012'),
    ];
    expect(findMatch(sources, 'orangelibrary_', '223456789012')?.index).toBe(2);
  });

  it('blogId 대소문자는 무시한다', () => {
    const sources = [src('https://blog.naver.com/OrangeLibrary_/223456789012')];
    expect(findMatch(sources, 'orangelibrary_', '223456789012')?.index).toBe(1);
  });

  it('같은 블로그의 다른 글은 인용으로 치지 않는다', () => {
    const sources = [src('https://blog.naver.com/orangelibrary_/999999999999')];
    expect(findMatch(sources, 'orangelibrary_', '223456789012')).toBeNull();
  });

  it('logNo 는 같지만 다른 블로그면 인용이 아니다', () => {
    const sources = [src('https://blog.naver.com/someoneelse/223456789012')];
    expect(findMatch(sources, 'orangelibrary_', '223456789012')).toBeNull();
  });
});
