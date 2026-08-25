import { describe, it, expect } from 'vitest';
import { extractKeywordCandidates, trimPhraseEdges } from '../keyword-candidates';

/**
 * 대표 구 가장자리 다듬기 회귀 테스트.
 *
 * 배경(2026-08-25): 규칙 엔진은 확신하지 못하는 구를 저신뢰로 내려 AI 보정(Haiku)에 넘기도록
 * 설계돼 있었다. 그런데 Anthropic 사용량 한도가 소진돼 AI 호출이 전부 400 으로 실패하자,
 * 폴백된 규칙 결과가 그대로 화면과 검색어에 남았다. 실측된 대표 키워드:
 *   "책리뷰 노동에 대해 말하지" · "이영초롱은 왜" · "너무도 황당한 지역"
 * 아무도 이렇게 검색하지 않는다. AI 없이도 조사·용언·의문사 꼬리는 규칙으로 뗄 수 있다.
 *
 * 여기서 지키려는 불변식은 넷이다.
 *   1) 저신뢰 구의 양 끝에서 비명사 어절을 뗀다.
 *   2) 가운데는 절대 건드리지 않는다 — 복합 고유명사가 쪼개지면 안 된다(스펙 #3).
 *   3) 다듬은 결과가 대표로 쓸 수 없으면 원본을 그대로 되돌린다(기능 제거가 아니라 개선 시도).
 *   4) 확신한 구(ambiguous=false)와 확신도 계산은 손대지 않는다 — 다듬었다고 신뢰도를 올리면
 *      그 값이 곧바로 1순위 검색어가 되어 post-exposure-check 의 REP_KEYWORD_TRUST_MIN
 *      게이트를 우회한다(파편 검색어로 인한 미노출 오탐이 되돌아온다).
 */

describe('trimPhraseEdges — 양 끝 다듬기 단위', () => {
  it('끝의 의존부사·용언을 떼고 조사를 벗긴다', () => {
    expect(trimPhraseEdges('책리뷰 노동에 대해 말하지')).toBe('책리뷰 노동');
  });

  it('끝의 의문사를 뗀다 (한 글자 의문사 "왜" 포함)', () => {
    expect(trimPhraseEdges('이영초롱은 왜')).toBe('이영초롱');
  });

  it('앞자리는 건드리지 않는다 — 수식어 재결합 결과를 도로 부수면 안 된다', () => {
    // 엔진은 용언 명사형이 단독으로 남지 않도록 앞 수식어를 일부러 도로 붙인다.
    // 앞자리를 떼면 그 판단이 무효가 된다("더 빠르게 실패하기"는 실제 책 제목이다).
    expect(trimPhraseEdges('더 빠르게 실패하기')).toBe('더 빠르게 실패하기');
    expect(trimPhraseEdges('너무도 황당한 지역')).toBe('너무도 황당한 지역');
    expect(trimPhraseEdges('그 사람의 이야기들')).toBe('그 사람의 이야기들');
    // 의미 있는 한 글자가 앞에 오는 제목들
    expect(trimPhraseEdges('꽃 동시 초등학교2학년동시')).toBe('꽃 동시 초등학교2학년동시');
    expect(trimPhraseEdges('네 이웃의 식탁')).toBe('네 이웃의 식탁');
  });

  it('용언 명사형(글쓰기)은 떼지 않는다 — 그 자체로 검색되는 키워드다', () => {
    expect(trimPhraseEdges('AI 글쓰기')).toBe('AI 글쓰기');
    expect(trimPhraseEdges('나민애의 책 읽고 글쓰기')).toBe('나민애의 책 읽고 글쓰기');
  });

  it('문장 종결형(…다/…니다)은 떼지 않는다 — 문장형 작품 제목과 못 가른다', () => {
    expect(trimPhraseEdges('인생은 실전이다')).toBe('인생은 실전이다');
    expect(trimPhraseEdges('금성으로 돌아오다')).toBe('금성으로 돌아오다');
    expect(trimPhraseEdges('어서오세요 휴남동서점입니다')).toBe('어서오세요 휴남동서점입니다');
    expect(trimPhraseEdges('죽은 새는 울지 않는다')).toBe('죽은 새는 울지 않는다');
  });

  it('실측 상위 패턴: 인명·기관 뒤의 속격 "…의"를 뗀다 (936건 중 45건)', () => {
    expect(trimPhraseEdges('오렌지도서관의')).toBe('오렌지도서관');
    expect(trimPhraseEdges('데일 카네기의')).toBe('데일 카네기');
    expect(trimPhraseEdges('보도 섀퍼의')).toBe('보도 섀퍼');
    expect(trimPhraseEdges('수용소에서')).toBe('수용소');
  });

  it('한자·기호 꼬리는 떼지만 한글 한 글자 명사는 남긴다', () => {
    expect(trimPhraseEdges('세계 명언집 中')).toBe('세계 명언집');
    expect(trimPhraseEdges('혼자 있는 시간의 힘')).toBe('혼자 있는 시간의 힘');
  });

  it('가운데는 건드리지 않는다 — 복합 고유명사 보존', () => {
    expect(trimPhraseEdges('달러구트 꿈 백화점')).toBe('달러구트 꿈 백화점');
    expect(trimPhraseEdges('나미야 잡화점의 기적')).toBe('나미야 잡화점의 기적');
  });

  it('목적격 절·관형형 용언은 앞에서 떼지 않는다 (수식어 재결합 판단 존중)', () => {
    // classifyToken 이 이미 경계로 처리했는데도 남아 있다면 앞쪽 로직이 작품 제목일 가능성을 보고
    // 일부러 도로 붙인 것이다. 여기서 떼면 책 제목이 훼손된다.
    expect(trimPhraseEdges('미움받을 용기')).toBe('미움받을 용기');
    expect(trimPhraseEdges('운명을 바꾸는 부동산 투자')).toBe('운명을 바꾸는 부동산 투자');
  });

  it('되돌림: 다듬으면 일반어만 남는 경우 원본을 유지한다', () => {
    // '블로그'는 STOPWORD 라 단독으로는 대표가 될 수 없다 → 원본 유지.
    expect(trimPhraseEdges('블로그의')).toBe('블로그의');
    expect(trimPhraseEdges('후기와')).toBe('후기와');
  });

  it('되돌림: 다듬어도 여전히 조사로 끝나면 원본을 유지한다', () => {
    // "다정한 것이 살아남는다" → 용언을 떼면 "다정한 것이" 가 되는데 이건 더 나쁘다.
    expect(trimPhraseEdges('다정한 것이 살아남는다')).toBe('다정한 것이 살아남는다');
  });

  it('되돌림: 전부 떨어져 나가면 원본을 유지한다', () => {
    expect(trimPhraseEdges('왜 대해')).toBe('왜 대해');
  });

  it('조사처럼 보이는 명사 끝글자를 잘라내지 않는다', () => {
    // '가을'(NOUN_ENDS_EUL) · '자본주의'(주의) · '고양이'/'횡단보도'(이·도는 애초에 제외 대상)
    expect(trimPhraseEdges('깊어가는 가을')).toBe('깊어가는 가을');
    expect(trimPhraseEdges('한국 자본주의')).toBe('한국 자본주의');
    expect(trimPhraseEdges('길 잃은 고양이')).toBe('길 잃은 고양이');
    expect(trimPhraseEdges('서울 횡단보도')).toBe('서울 횡단보도');
  });
});

describe('extractKeywordCandidates — 다듬기가 붙은 실제 제목', () => {
  const cases: Array<[title: string, expected: string]> = [
    ['책리뷰 노동에 대해 말하지 않는 것들', '책리뷰 노동'],
    ['이영초롱은 왜 그랬을까', '이영초롱'],
  ];
  for (const [title, expected] of cases) {
    it(`저신뢰 제목을 다듬는다: ${title}`, () => {
      expect(extractKeywordCandidates({ title }).primary).toBe(expected);
    });
  }

  it('확신한 구(ambiguous=false)는 다듬지 않는다', () => {
    for (const title of ['혼자 있는 시간의 힘', '달러구트 꿈 백화점 리뷰', '노자 도덕경 무소유']) {
      const r = extractKeywordCandidates({ title });
      expect(r.ambiguous).toBe(false);
      expect(r.primary).toBe(title.replace(/\s*리뷰$/, ''));
    }
  });

  it('다듬어도 확신도·ambiguous 는 그대로다 — 1순위 검색어 게이트를 우회하면 안 된다', () => {
    const r = extractKeywordCandidates({ title: '책리뷰 노동에 대해 말하지 않는 것들' });
    expect(r.primary).toBe('책리뷰 노동');
    expect(r.ambiguous).toBe(true);
    expect(r.confidence).toBeLessThan(0.7); // REP_KEYWORD_TRUST_MIN
  });

  it('사용자 지정 키워드는 다듬지 않는다', () => {
    const r = extractKeywordCandidates({ title: '아무 제목', userKeyword: '나를 힘들게 하는 사람에 대해' });
    expect(r.primary).toBe('나를 힘들게 하는 사람에 대해');
  });

  it('따옴표·괄호 안 작품명은 원문 그대로 둔다', () => {
    // 문장형 작품 제목을 다듬으면 훼손이다.
    const r = extractKeywordCandidates({ title: '『나는 나로 살기로 했다』 독후감' });
    expect(r.primary).toBe('나는 나로 살기로 했다');
  });

  it('보조 후보도 다듬고 대표와 중복되면 제거한다', () => {
    const r = extractKeywordCandidates({ title: '행복명언(세계 명언집 中)' });
    expect(r.secondaries).toContain('세계 명언집');
    expect(r.secondaries).not.toContain(r.primary);
  });
});
