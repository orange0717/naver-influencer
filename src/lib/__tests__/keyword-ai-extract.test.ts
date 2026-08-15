import { describe, it, expect } from 'vitest';
import { validateAiKeywords } from '@/lib/keyword-ai-extract';

describe('validateAiKeywords', () => {
  it('제목에 없는 primary는 거부한다 (본문에서 뽑힌 조각)', () => {
    // 실제 발생: "솔로몬의 지혜 오렌지도서관 단상" → AI가 본문의 "아이를"을 대표로 반환
    expect(validateAiKeywords(
      { title: '솔로몬의 지혜 오렌지도서관 단상' },
      { primary: '아이를', secondaries: [] },
    )).toBeNull();
  });

  it('목적격 조사 를을 떼어낸 뒤 제목에 있으면 통과시킨다', () => {
    expect(validateAiKeywords(
      { title: '아이를 위한 그림책 추천' },
      { primary: '아이를', secondaries: [] },
    )).toEqual({ primary: '아이', secondaries: [] });
  });

  it('공백 차이는 무시하고 제목 등장 여부를 본다', () => {
    expect(validateAiKeywords(
      { title: '지구끝의온실 김초엽 SF소설추천' },
      { primary: '지구 끝의 온실', secondaries: ['김초엽'] },
    )).toEqual({ primary: '지구 끝의 온실', secondaries: ['김초엽'] });
  });

  it('결합어에서 잘라낸 primary는 제목의 부분문자열이므로 통과한다', () => {
    expect(validateAiKeywords(
      { title: '한국소설베스트셀러순위 TOP5(8월 넷째 주 예스24)' },
      { primary: '한국소설', secondaries: [] },
    )).toEqual({ primary: '한국소설', secondaries: [] });
  });

  it('제목에도 태그에도 없는 secondaries는 버리고 primary는 유지한다', () => {
    expect(validateAiKeywords(
      { title: '달러구트 꿈 백화점 1편 판타지소설추천', tags: ['판타지소설'] },
      { primary: '달러구트 꿈 백화점', secondaries: ['판타지소설', '본문에만나온말'] },
    )).toEqual({ primary: '달러구트 꿈 백화점', secondaries: ['판타지소설'] });
  });

  it('primary와 중복되는 secondary는 제거한다', () => {
    expect(validateAiKeywords(
      { title: '방구석미술관 서양미술편 추천' },
      { primary: '방구석미술관', secondaries: ['방구석 미술관', '서양미술'] },
    )).toEqual({ primary: '방구석미술관', secondaries: ['서양미술'] });
  });

  it('한 글자 primary는 거부한다', () => {
    expect(validateAiKeywords(
      { title: '책 읽는 밤' },
      { primary: '책', secondaries: [] },
    )).toBeNull();
  });

  it("'를'로 끝나는 명사형 조각도 조사를 떼되 제목에 없으면 거부한다", () => {
    expect(validateAiKeywords(
      { title: '겨울 여행지 추천' },
      { primary: '바다를', secondaries: [] },
    )).toBeNull();
  });

  it('괄호 안 부가설명은 primary가 될 수 없다(제목에 등장하더라도)', () => {
    expect(validateAiKeywords(
      { title: '신간도서 TOP3(매월 넷째 주 교보문고 MD 선택)' },
      { primary: '교보문고', secondaries: [] },
    )).toBeNull();
    expect(validateAiKeywords(
      { title: '인생명언 [변호사임용시험 편]' },
      { primary: '변호사임용시험', secondaries: [] },
    )).toBeNull();
  });

  it('괄호 밖 본류에서 뽑은 primary는 통과시킨다', () => {
    expect(validateAiKeywords(
      { title: '신간도서 TOP3(매월 넷째 주 교보문고 MD 선택)' },
      { primary: '신간도서', secondaries: [] },
    )).toEqual({ primary: '신간도서', secondaries: [] });
  });

  it('제목 전체가 괄호면 검사 표면이 없으므로 원 제목으로 판정한다', () => {
    expect(validateAiKeywords(
      { title: '(달러구트 꿈 백화점)' },
      { primary: '달러구트 꿈 백화점', secondaries: [] },
    )).toEqual({ primary: '달러구트 꿈 백화점', secondaries: [] });
  });
});
