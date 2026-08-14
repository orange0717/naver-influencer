import { describe, it, expect } from 'vitest';
import { extractKeywordCandidates, stripJosa } from '../keyword-candidates';

describe('stripJosa (조사 제거 — 어간 2자 이상 유지 시에만)', () => {
  it('솔로몬의 → 솔로몬', () => {
    expect(stripJosa('솔로몬의')).toBe('솔로몬');
  });
  it('글귀를 → 글귀', () => {
    expect(stripJosa('글귀를')).toBe('글귀');
  });
  it('어간이 1자만 남으면 제거하지 않음(사과=과)', () => {
    expect(stripJosa('사과')).toBe('사과');
  });
});

describe('extractKeywordCandidates — 스펙 #2 예시 "솔로몬의 지혜 오렌지도서관 단상"', () => {
  const title = '솔로몬의 지혜 오렌지도서관 단상';

  it('브랜드 힌트 없이: 대표는 의미 있는 명사구/복합명사이고 한 글자·일반어·조사토큰이 아님', () => {
    const r = extractKeywordCandidates({ title });
    // 대표는 "지혜"·"단상"·"솔로몬의"(조사토큰) 같은 나쁜 후보가 아니어야 한다(스펙 #2).
    expect(r.primary).not.toBe('지혜');
    expect(r.primary).not.toBe('단상');
    expect(r.primary).not.toBe('솔로몬의');
    // 대표는 명사구(공백 포함) 또는 복합명사 "오렌지도서관"
    expect(r.primary === '오렌지도서관' || (r.primary?.includes(' ') ?? false)).toBe(true);
    // 오렌지도서관은 대표 또는 보조로 반드시 등장
    expect([r.primary, ...r.secondaries]).toContain('오렌지도서관');
    // 장식어 "단상"은 어떤 후보에도 단독으로 남지 않는다(스펙 #4)
    expect(r.candidates.every(c => c.keyword !== '단상')).toBe(true);
  });

  it('브랜드 힌트("오렌지도서관")를 주면 그것이 대표(스펙 #3/#6 예시)', () => {
    const r = extractKeywordCandidates({ title, brandHints: ['오렌지도서관'] });
    expect(r.primary).toBe('오렌지도서관');
    expect(r.secondaries).toContain('솔로몬의 지혜');
  });
});

describe('extractKeywordCandidates — 장식어/일반어/한글자 배제', () => {
  it('끝 장식어(후기)를 떼고 명사구를 대표로(제주도 여행 후기 → 제주도 여행)', () => {
    const r = extractKeywordCandidates({ title: '제주도 여행 후기' });
    expect(r.primary).toBe('제주도 여행');
    expect(r.primary).not.toBe('후기');
  });

  it('단독 일반어는 대표가 되지 않는다(일상/추천)', () => {
    const r = extractKeywordCandidates({ title: '오늘의 일상 추천' });
    expect(r.primary).not.toBe('일상');
    expect(r.primary).not.toBe('추천');
  });

  it('한 글자/숫자 토큰은 후보에서 강한 감점', () => {
    const r = extractKeywordCandidates({ title: '책 2권 소개' });
    expect(r.primary).not.toBe('책');
    expect(r.primary).not.toBe('2');
  });
});

describe('extractKeywordCandidates — 작품/책 제목(따옴표)·사용자 키워드·태그', () => {
  it('《달러구트 꿈 백화점》은 통째로 대표(작품명 우선)', () => {
    const r = extractKeywordCandidates({ title: '《달러구트 꿈 백화점》 리뷰' });
    expect(r.primary).toBe('달러구트 꿈 백화점');
  });

  it('사용자 직접 입력 키워드는 최우선(스펙 #1 우선순위 #5)', () => {
    const r = extractKeywordCandidates({ title: '제주도 여행 후기', userKeyword: '제주 3박4일' });
    expect(r.primary).toBe('제주 3박4일');
  });

  it('태그는 보조 후보로 반영된다', () => {
    const r = extractKeywordCandidates({ title: '주말 나들이', tags: ['서울숲피크닉'] });
    expect([r.primary, ...r.secondaries]).toContain('서울숲피크닉');
  });
});

describe('extractKeywordCandidates — 빈/무의미 입력', () => {
  it('빈 제목이면 primary=null', () => {
    const r = extractKeywordCandidates({ title: '' });
    expect(r.primary).toBeNull();
  });
});
