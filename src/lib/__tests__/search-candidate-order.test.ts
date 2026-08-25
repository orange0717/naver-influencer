import { describe, it, expect } from 'vitest';
import { buildSearchCandidates, REP_KEYWORD_TRUST_MIN, MAX_SEARCH_CANDIDATES } from '../post-exposure-check';

/**
 * 검색 후보 순서 회귀 테스트.
 *
 * 배경(2026-08-25): 대표 키워드 추출이 저신뢰인데도 그 결과가 후보 1순위를 차지해
 * candidates[0](=query) 이 "나를"·"힘들때" 같은 조사 파편이 되는 일이 있었다.
 * query 는 §11 2차 재검증과 getSearchVolume 과 화면 표시를 전부 지배하기 때문에,
 * 파편이 1순위면 재검증이 그 파편으로만 재조회해 실제로는 노출인 글을 미노출로 확정할 수 있었다.
 *
 * 여기서 지키려는 불변식은 둘이다.
 *   1) 저신뢰 대표 키워드는 절대 candidates[0] 이 되지 않는다.
 *   2) 그렇다고 후보 목록에서 사라지지도 않는다(노출을 잡을 기회는 남긴다).
 */

const BLOG = 'orangelibrary_';
const TITLE = '행복명언 세계 명언집 中';

describe('buildSearchCandidates — 대표 키워드 확신도에 따른 순서', () => {
  it('고신뢰 대표 키워드는 제목 기반 검색어보다 앞에 온다', () => {
    const { candidates, keywordUncertain } = buildSearchCandidates({
      postTitle: TITLE,
      blogId: BLOG,
      keywordCandidates: ['행복명언 모음'],
      keywordConfidence: 0.83,
    });
    expect(candidates[0]).toBe('행복명언 모음');
    expect(keywordUncertain).toBe(false);
  });

  it('저신뢰 대표 키워드는 1순위를 차지하지 못한다 (실측 "나를" 0.52)', () => {
    const { candidates, keywordUncertain } = buildSearchCandidates({
      postTitle: '나를 힘들게 하는 사람에 대해 말하지 않기로 했다',
      blogId: BLOG,
      keywordCandidates: ['나를'],
      keywordConfidence: 0.52,
    });
    expect(candidates[0]).not.toBe('나를');
    expect(keywordUncertain).toBe(true);
  });

  it('저신뢰여도 대표 키워드를 후보에서 버리지는 않는다', () => {
    const { candidates } = buildSearchCandidates({
      postTitle: '가을 엽서',
      blogId: BLOG,
      keywordCandidates: ['가을'],
      keywordConfidence: 0.58,
    });
    expect(candidates).toContain('가을');
  });

  it('사용자가 직접 등록한 키워드는 확신도와 무관하게 항상 1순위', () => {
    const { candidates } = buildSearchCandidates({
      postTitle: TITLE,
      blogId: BLOG,
      keyword: '내가 고른 키워드',
      keywordCandidates: ['행복'],
      keywordConfidence: 0.3,
    });
    expect(candidates[0]).toBe('내가 고른 키워드');
  });

  it('확신도 미지정(레거시 호출)은 신뢰하는 것으로 보고 기존 순서를 유지한다', () => {
    const { candidates, keywordUncertain } = buildSearchCandidates({
      postTitle: TITLE,
      blogId: BLOG,
      keywordCandidates: ['행복명언'],
    });
    expect(candidates[0]).toBe('행복명언');
    expect(keywordUncertain).toBe(false);
  });

  it('경계값: 0.7 이면 신뢰, 0.69 면 뒤로 밀린다', () => {
    const at = buildSearchCandidates({
      postTitle: TITLE, blogId: BLOG, keywordCandidates: ['행복명언'], keywordConfidence: REP_KEYWORD_TRUST_MIN,
    });
    expect(at.candidates[0]).toBe('행복명언');
    expect(at.keywordUncertain).toBe(false);

    const below = buildSearchCandidates({
      postTitle: TITLE, blogId: BLOG, keywordCandidates: ['행복명언'], keywordConfidence: 0.69,
    });
    expect(below.candidates[0]).not.toBe('행복명언');
    expect(below.keywordUncertain).toBe(true);
  });

  it('대표 키워드가 아예 없으면 저신뢰여도 keywordUncertain 을 세우지 않는다', () => {
    const { keywordUncertain } = buildSearchCandidates({
      postTitle: TITLE, blogId: BLOG, keywordCandidates: [], keywordConfidence: 0.3,
    });
    expect(keywordUncertain).toBe(false);
  });

  it('후보는 §12 상한을 넘지 않고 중복도 제거한다', () => {
    const { candidates } = buildSearchCandidates({
      postTitle: '아주 긴 제목 여러 어절 로 구성된 포스팅 제목 예시 입니다',
      blogId: BLOG,
      keywordCandidates: ['키워드1', '키워드2', '키워드3', '키워드4', '키워드5'],
      keywordConfidence: 0.9,
    });
    expect(candidates.length).toBeLessThanOrEqual(MAX_SEARCH_CANDIDATES);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
