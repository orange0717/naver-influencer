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

  it('속격 "-의"는 개체 경계가 아니다: "나미야 잡화점의 기적 히가시노 게이고 …" → 작품명 전체', () => {
    const r = extractKeywordCandidates({ title: '나미야 잡화점의 기적 히가시노 게이고 일본장편소설추천' });
    expect(r.primary).toBe('나미야 잡화점의 기적');
  });

  it('문장형 제목의 서술어도 경계가 아니다: "다정한 것이 살아남는다 과학도서추천"', () => {
    const r = extractKeywordCandidates({ title: '다정한 것이 살아남는다 과학도서추천' });
    expect(r.primary).toBe('다정한 것이 살아남는다');
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

describe('수식어·의도어 제거와 재결합(실제 검색어 기준)', () => {
  it('연결형/부사형 수식어는 대표가 되지 않는다', () => {
    expect(extractKeywordCandidates({ title: '쉽고 떫고 좋은 규리' }).primary).toBe('규리');
    expect(extractKeywordCandidates({ title: '가장 완벽한 여행 코스' }).primary).toBe('완벽한 여행 코스');
  });

  it('같은 글자로 끝나는 명사(냉장고·경기고·광고·가게)는 수식어로 오탐하지 않는다', () => {
    expect(extractKeywordCandidates({ title: 'LG 냉장고 추천' }).primary).toBe('LG 냉장고');
    expect(extractKeywordCandidates({ title: '경기고 야구부 후기' }).primary).toBe('경기고 야구부');
    expect(extractKeywordCandidates({ title: '광고 대행사 비교' }).primary).toBe('광고 대행사 비교');
    expect(extractKeywordCandidates({ title: '동네 가게 소개' }).primary).toBe('동네 가게');
  });

  it('head가 용언 명사형이면 수식어를 도로 붙여 한 덩어리로 만든다', () => {
    const r = extractKeywordCandidates({ title: '더 빠르게 실패하기 자기계발도서추천' });
    expect(r.primary).toBe('더 빠르게 실패하기');
    // 규칙만으로는 책 제목인지 확신할 수 없어 AI 보정 대상으로 남긴다
    expect(r.ambiguous).toBe(true);
  });

  it('의도어(뜻·순위)는 대표에서 떼어낸다', () => {
    expect(extractKeywordCandidates({ title: '코스피 뜻 정리' }).primary).toBe('코스피');
    expect(extractKeywordCandidates({ title: '강남 맛집 순위 모음' }).primary).toBe('강남 맛집');
  });

  it('후기 유형어 꼬리(개봉기·완독·감상평·결말·신청방법)도 떼어낸다', () => {
    expect(extractKeywordCandidates({ title: '갤럭시 S26 울트라 개봉기' }).primary).toBe('갤럭시 S26 울트라');
    expect(extractKeywordCandidates({ title: '세이노의 가르침 완독 후기' }).primary).toBe('세이노의 가르침');
    expect(extractKeywordCandidates({ title: '불편한 편의점 2권 감상평' }).primary).toBe('불편한 편의점');
    expect(extractKeywordCandidates({ title: '넷플릭스 오징어게임3 결말 해석' }).primary).toBe('넷플릭스 오징어게임3');
    // 유형어가 대표로 뽑히던 최악 케이스 — 실제 검색어는 상품명이다
    expect(extractKeywordCandidates({ title: '2026년 청년도약계좌 신청방법' }).primary).toBe('청년도약계좌');
  });
});

describe('규칙이 확정하면 안 되는 경계(AI 보정으로 넘김)', () => {
  it('숫자가 구 중간에 있으면 개체 끝인지 내부인지 못 가른다', () => {
    // "달리구도 못해낸 300"(작품명) + "원화집"(유형어)인지 규칙으로는 확정 불가
    expect(extractKeywordCandidates({ title: '달리구도 못해낸 300 원화집 추천' }).ambiguous).toBe(true);
    expect(extractKeywordCandidates({ title: '아이폰 17 프로 리뷰' }).ambiguous).toBe(true);
    // 끝자리 숫자는 경계가 분명하므로 해당 없음
    expect(extractKeywordCandidates({ title: '달러구트 꿈 백화점 1편' }).ambiguous).toBe(false);
  });

  it('관형형 "-을/ㄹ"을 목적격 조사로 오인해 잘린 경우', () => {
    // '미움받을'은 목적격 조사절이 아니라 작품 제목의 일부
    expect(extractKeywordCandidates({ title: '미움받을 용기 아들러 심리학' }).ambiguous).toBe(true);
  });

  it('5어절 이상이 붙은 구간은 4어절 상한에 잘려 경계를 믿을 수 없다', () => {
    // 작품명 뒤 저자명이 흡수돼 "지구 끝의 온실 김초엽"으로 확정되던 케이스.
    // 인명 사전 없이는 규칙으로 못 가르므로 AI가 작품명/저자명을 분리하게 넘긴다.
    expect(extractKeywordCandidates({ title: '지구 끝의 온실 김초엽 SF소설추천' }).ambiguous).toBe(true);
    // 4어절 이하는 종전대로 확정한다
    expect(extractKeywordCandidates({ title: '강남역 파스타 맛집 브런치' }).ambiguous).toBe(false);
  });

  it('장식어가 아닌 일반어가 앞에 오면 브랜드 첫 단어일 수 있다', () => {
    // '트렌드 코리아 2026'이 통째로 브랜드명 — '코리아 2026'으로 잘라 확정하면 안 된다
    expect(extractKeywordCandidates({ title: '트렌드 코리아 2026 후기' }).ambiguous).toBe(true);
    // 반면 장식어(추천·후기)는 진짜 경계이므로 확정을 막지 않는다
    expect(extractKeywordCandidates({ title: '추천 도서 방구석미술관' }).primary).toBe('방구석미술관');
  });
});
