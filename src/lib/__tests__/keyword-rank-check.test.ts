import { describe, it, expect } from 'vitest';
import { matchInfluencerContentByHandle } from '@/lib/keyword-rank-check';

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
