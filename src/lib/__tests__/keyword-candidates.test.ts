import { describe, it, expect } from 'vitest';
import { extractKeywordCandidates, stripJosa, auditStoredKeyword } from '../keyword-candidates';

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

describe('extractKeywordCandidates — 복합 고유명사를 쪼개지 않는다(스펙 #3, 사용자 예시)', () => {
  it('예시 A: "달러구트 꿈 백화점 1편 판타지소설추천" → 달러구트 꿈 백화점(회차/자동결합 제외)', () => {
    const r = extractKeywordCandidates({ title: '달러구트 꿈 백화점 1편 판타지소설추천' });
    expect(r.primary).toBe('달러구트 꿈 백화점');
    // 조각(달러구트) 단독이 대표가 되면 안 된다
    expect(r.primary).not.toBe('달러구트');
    // 회차(1편)는 어떤 후보에도 대표로 남지 않는다
    expect(r.primary).not.toContain('1편');
  });

  it('예시 C: "방구석미술관 서양미술관관람추천" → 방구석미술관', () => {
    const r = extractKeywordCandidates({ title: '방구석미술관 서양미술관관람추천' });
    expect(r.primary).toBe('방구석미술관');
  });

  it('예시 D: "운명을 바꾸는 부동산 투자 사업(기초편) 부동산책추천" → 조사절/판형 제외한 명사구', () => {
    const r = extractKeywordCandidates({ title: '운명을 바꾸는 부동산 투자 사업(기초편) 부동산책추천' });
    expect(r.primary).toBe('부동산 투자 사업');
    expect(r.primary).not.toContain('기초편');
    expect(r.primary).not.toContain('운명을');
    expect(r.primary).not.toContain('바꾸는');
  });

  it('아이폰 17 프로: 모델 숫자는 유지(스펙 #4 예외)', () => {
    const r = extractKeywordCandidates({ title: '아이폰 17 프로 리뷰 스마트폰추천' });
    expect(r.primary).toContain('아이폰');
    expect(r.primary).toContain('17');
  });

  it('예시 B(스펙 #24-2): "인생명언 (전도서 말씀구절 中)" → 인생명언(괄호 부가설명 분리)', () => {
    const r = extractKeywordCandidates({ title: '인생명언 (전도서 말씀구절 中)' });
    expect(r.primary).toBe('인생명언');
    expect(r.primary).not.toContain('전도서');
    expect(r.primary).not.toContain('말씀');
  });
});

describe('extractKeywordCandidates — 회차/날짜/일반어를 대표로 뽑지 않는다(스펙 #4/#7)', () => {
  it('회차 단독 "1편/2부"는 대표가 아니다', () => {
    const r = extractKeywordCandidates({ title: '제주 여행기 1편' });
    expect(r.primary).not.toBe('1편');
  });
  it('연도/월 단독은 대표가 아니다', () => {
    const r = extractKeywordCandidates({ title: '2026년 신년 계획 세우기' });
    expect(r.primary).not.toBe('2026년');
  });
  it('일반 수식어(추천/후기/정보/방법)는 단독 대표가 아니다', () => {
    for (const g of ['추천', '후기', '정보', '방법', '정리', '리뷰']) {
      const r = extractKeywordCandidates({ title: `무언가 좋은 ${g}` });
      expect(r.secondaries).not.toContain(g);
      expect(r.primary).not.toBe(g);
    }
  });
});

describe('extractKeywordCandidates — 신뢰도/미확인(스펙 #12/#13)', () => {
  it('명확한 복합 고유명사는 confidence가 높고 ambiguous=false', () => {
    const r = extractKeywordCandidates({ title: '달러구트 꿈 백화점 1편' });
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
    expect(r.ambiguous).toBe(false);
  });
  it('서로 다른 고유명사 2개가 경합하면 ambiguous=true', () => {
    const r = extractKeywordCandidates({ title: '솔로몬의 지혜 오렌지도서관 단상' });
    expect(r.ambiguous).toBe(true);
  });
});

describe('auditStoredKeyword — 기존 데이터 점검(스펙 #18~20)', () => {
  it('manual은 재추출 대상이 아니다(스펙 #19)', () => {
    const a = auditStoredKeyword({ title: '아무 제목', storedKeyword: '내가 정한 키워드', source: 'manual', confidence: null });
    expect(a.verdict).toBe('manual');
  });
  it('쪼개진 조각(달러구트)은 suspicious + 더 나은 대표 제안', () => {
    const a = auditStoredKeyword({ title: '달러구트 꿈 백화점 1편 판타지소설추천', storedKeyword: '달러구트', source: 'title', confidence: null });
    expect(a.verdict).toBe('suspicious');
    expect(a.suggested).toBe('달러구트 꿈 백화점');
  });
  it('회차/숫자만 저장된 값은 suspicious', () => {
    const a = auditStoredKeyword({ title: '제주 여행기 1편', storedKeyword: '1편', source: 'title', confidence: null });
    expect(a.verdict).toBe('suspicious');
  });
  it('대표키워드 없음은 missing', () => {
    const a = auditStoredKeyword({ title: '달러구트 꿈 백화점', storedKeyword: null, source: 'title', confidence: null });
    expect(a.verdict).toBe('missing');
  });
  it('현행 로직과 일치하는 좋은 값은 normal', () => {
    const a = auditStoredKeyword({ title: '방구석미술관 서양미술관관람추천', storedKeyword: '방구석미술관', source: 'title', confidence: 0.83 });
    expect(a.verdict).toBe('normal');
  });
});
