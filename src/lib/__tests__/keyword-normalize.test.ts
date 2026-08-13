import { describe, it, expect } from 'vitest';
import {
  normalizeKeyword,
  buildSpacelessVariant,
  expandKeyword,
  expandKeywords,
  buildAutoKeywords,
} from '../keyword-normalize';

describe('normalizeKeyword', () => {
  it('다중 공백을 단일 공백으로, 앞뒤 공백 제거', () => {
    expect(normalizeKeyword('  짧고   좋은  글귀 ')).toBe('짧고 좋은 글귀');
  });
  it('영문은 소문자화, 한글은 그대로', () => {
    expect(normalizeKeyword('Dallergut Dream')).toBe('dallergut dream');
    expect(normalizeKeyword('달러구트 꿈')).toBe('달러구트 꿈');
  });
});

describe('buildSpacelessVariant', () => {
  it('스펙 예시: 공백제거 변형 생성', () => {
    expect(buildSpacelessVariant('짧고 좋은 글귀')).toBe('짧고좋은글귀');
    expect(buildSpacelessVariant('달러구트 꿈 백화점')).toBe('달러구트꿈백화점');
    expect(buildSpacelessVariant('나미야 잡화점의 기적')).toBe('나미야잡화점의기적');
    expect(buildSpacelessVariant('히가시노 게이고')).toBe('히가시노게이고');
  });
  it('이미 공백이 없으면 변형 없음(판타지소설추천)', () => {
    expect(buildSpacelessVariant('판타지소설추천')).toBeNull();
  });
  it('무조건 붙이지 않음 — 어절 4개 이상인 긴 구는 변형 안 함', () => {
    expect(buildSpacelessVariant('나미야 잡화점의 기적 독후감')).toBeNull();
  });
  it('공백제거 결과가 12자를 넘으면 변형 안 함', () => {
    // 합치면 13자(일본소설추천=6 + 판타지장편소설=7) → 12자 초과로 변형 안 함
    expect(buildSpacelessVariant('일본소설추천 판타지장편소설')).toBeNull();
  });
  it('공백제거 결과가 너무 짧으면(2자 미만) 변형 안 함', () => {
    // 실제로는 2어절 최소 2자라 거의 없지만 방어적 확인
    expect(buildSpacelessVariant('가 나')).toBe('가나');
  });
});

describe('expandKeyword', () => {
  it('원본 + 변형을 반환하고 메타를 채운다', () => {
    const out = expandKeyword('짧고 좋은 글귀');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ keyword: '짧고 좋은 글귀', variantType: 'base' });
    expect(out[1]).toMatchObject({ keyword: '짧고좋은글귀', variantType: 'variant', baseKeyword: '짧고 좋은 글귀' });
  });
  it('변형이 없으면 원본만', () => {
    const out = expandKeyword('판타지소설추천');
    expect(out).toHaveLength(1);
    expect(out[0].variantType).toBe('base');
  });
  it('빈 문자열은 빈 배열', () => {
    expect(expandKeyword('   ')).toEqual([]);
  });
});

describe('expandKeywords', () => {
  it('normalized 기준으로 중복 제거하며 순서 보존', () => {
    const out = expandKeywords(['짧고 좋은 글귀', '짧고좋은글귀', '판타지소설추천']);
    const kws = out.map(o => o.keyword);
    // "짧고 좋은 글귀"의 변형과 명시 입력 "짧고좋은글귀"가 같은 normalized → 하나만
    expect(kws).toEqual(['짧고 좋은 글귀', '짧고좋은글귀', '판타지소설추천']);
  });
});

describe('buildAutoKeywords', () => {
  it('대표(+변형) + 보조 최대 2개(+변형)를 구성한다', () => {
    const out = buildAutoKeywords(
      '달러구트 꿈 백화점',
      ['달러구트 꿈 백화점', '판타지소설추천', '이미예 소설'],
      [],
    );
    const primary = out.find(o => o.isPrimary);
    expect(primary?.keyword).toBe('달러구트 꿈 백화점');
    expect(primary?.keywordType).toBe('primary');
    // 대표 변형
    expect(out.some(o => o.keyword === '달러구트꿈백화점' && o.keywordType === 'variant')).toBe(true);
    // 보조 2개
    const secondaries = out.filter(o => o.keywordType === 'secondary').map(o => o.keyword);
    expect(secondaries).toEqual(['판타지소설추천', '이미예 소설']);
    // 보조 변형(이미예 소설 → 이미예소설)
    expect(out.some(o => o.keyword === '이미예소설' && o.keywordType === 'variant')).toBe(true);
  });

  it('스크리닝 결과가 있으면 노출·낮은 순위 우선으로 보조를 고른다', () => {
    const out = buildAutoKeywords(
      '대표키워드',
      ['대표키워드', '후보A', '후보B', '후보C'],
      [
        { keyword: '대표키워드', exposed: true, rank: 3 },
        { keyword: '후보A', exposed: false, rank: null },
        { keyword: '후보B', exposed: true, rank: 5 },
        { keyword: '후보C', exposed: true, rank: 2 },
      ],
    );
    const secondaries = out.filter(o => o.keywordType === 'secondary').map(o => o.keyword);
    // 대표 제외, 노출된 것 우선 + 낮은 순위 우선 → 후보C(2), 후보B(5)
    expect(secondaries).toEqual(['후보C', '후보B']);
  });

  it('대표가 없으면 후보 첫 번째를 대표로', () => {
    const out = buildAutoKeywords(null, ['짧고 좋은 글귀'], []);
    expect(out[0]).toMatchObject({ keyword: '짧고 좋은 글귀', isPrimary: true });
    expect(out.some(o => o.keyword === '짧고좋은글귀')).toBe(true);
  });
});
