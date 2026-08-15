import { describe, it, expect } from 'vitest';
import {
  buildKeywordRows,
  normalizeForCompare,
} from '@/components/home/KeywordRankingSection.helpers';
import type { AutoKeyword, KeywordMeta } from '@/components/home/KeywordRankingSection.helpers';

const POST_ID = 'post-1';
const POST_URL = 'https://blog.naver.com/orange/1';

function auto(keyword: string, isPrimary: boolean, keywordType: AutoKeyword['keywordType'] = isPrimary ? 'primary' : 'secondary'): AutoKeyword {
  return { keyword, normalized: keyword, keywordType, isPrimary, baseKeyword: keyword };
}

function build(over: Partial<Parameters<typeof buildKeywordRows>[0]> = {}) {
  return buildKeywordRows({
    postId: POST_ID,
    postUrl: POST_URL,
    rep: null,
    autoKeywords: [],
    savedKeywords: [],
    keywordMeta: {},
    ...over,
  });
}

describe('buildKeywordRows — 포스팅 1개 → 키워드 N개', () => {
  it('대표·추가·보조를 각각 독립된 행으로 만들고 대표 → 추가 → 보조 순으로 정렬한다', () => {
    const rows = build({
      rep: '솔로몬의 지혜',
      autoKeywords: [auto('솔로몬의 지혜', true), auto('지혜로운 판결', false)],
      savedKeywords: ['솔로몬의 지혜', '지혜로운 판결', '아이들'],
    });

    expect(rows.map(r => [r.keyword, r.kind])).toEqual([
      ['솔로몬의 지혜', 'primary'],
      ['아이들', 'manual'],
      ['지혜로운 판결', 'secondary'],
    ]);
  });

  it('저장된 키워드에 대표·보조가 섞여 있어도 "추가"로 잘못 분류하지 않는다', () => {
    // keyword_rank_lookups 에는 자동추출 키워드도 저장되므로, 저장 여부만으로 수동 입력이라 볼 수 없다.
    const rows = build({
      rep: '솔로몬의 지혜',
      autoKeywords: [auto('솔로몬의 지혜', true), auto('솔로몬', false, 'variant')],
      savedKeywords: ['솔로몬의 지혜', '솔로몬'],
    });

    expect(rows.find(r => r.keyword === '솔로몬의 지혜')?.kind).toBe('primary');
    expect(rows.find(r => r.keyword === '솔로몬')?.kind).toBe('secondary');
    expect(rows.some(r => r.kind === 'manual')).toBe(false);
  });

  it('추출 결과가 없어도 DB에 기록된 keyword_type 으로 종류를 복원한다', () => {
    const keywordMeta: Record<string, KeywordMeta> = {
      [`${POST_ID}::솔로몬의 지혜`]: { keywordType: 'primary' },
      [`${POST_ID}::솔로몬`]: { keywordType: 'variant' },
      [`${POST_ID}::아이들`]: { keywordType: 'manual' },
    };
    const rows = build({ savedKeywords: ['솔로몬의 지혜', '솔로몬', '아이들'], keywordMeta });

    expect(rows.find(r => r.keyword === '솔로몬의 지혜')?.kind).toBe('primary');
    expect(rows.find(r => r.keyword === '솔로몬')?.kind).toBe('secondary');
    expect(rows.find(r => r.keyword === '아이들')?.kind).toBe('manual');
  });

  it('종류 정보가 전혀 없으면 사용자가 직접 추가한 키워드로 본다', () => {
    const rows = build({ savedKeywords: ['짧고 좋은 글귀'] });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('manual');
    expect(rows[0].meta.keywordType).toBe('manual');
  });

  it('아직 순위조회 전인 대표키워드도 행으로 노출한다', () => {
    const rows = build({ rep: '솔로몬의 지혜', savedKeywords: [] });
    expect(rows.map(r => r.keyword)).toEqual(['솔로몬의 지혜']);
    expect(rows[0].kind).toBe('primary');
  });

  it('중복 키워드는 한 행으로 합친다 (공백·대소문자 차이 포함)', () => {
    const rows = build({
      rep: '솔로몬의 지혜',
      autoKeywords: [auto('솔로몬의 지혜', true)],
      savedKeywords: ['솔로몬의 지혜', '  솔로몬의  지혜  ', 'ABC', 'abc'],
    });
    const keywords = rows.map(r => r.keyword);
    expect(keywords.filter(k => normalizeForCompare(k) === '솔로몬의 지혜')).toHaveLength(1);
    expect(keywords.filter(k => normalizeForCompare(k) === 'abc')).toHaveLength(1);
  });

  it('빈 문자열·공백만 있는 키워드는 행으로 만들지 않는다', () => {
    const rows = build({ savedKeywords: ['', '   ', '아이들'] });
    expect(rows.map(r => r.keyword)).toEqual(['아이들']);
  });

  it('키워드가 하나도 없으면 빈 배열 (포스팅 제목은 행 생성에 영향을 주지 않는다)', () => {
    expect(build()).toEqual([]);
  });

  it('모든 행 메타에 postUrl 을 채워 순위 저장 시 포스팅 연결이 끊기지 않게 한다', () => {
    const rows = build({
      rep: '솔로몬의 지혜',
      autoKeywords: [auto('솔로몬의 지혜', true), auto('솔로몬', false)],
      savedKeywords: ['아이들'],
    });
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.meta.postUrl).toBe(POST_URL);
  });

  it('보조 키워드가 아직 저장 전이어도 행으로 노출한다', () => {
    const rows = build({
      rep: '솔로몬의 지혜',
      autoKeywords: [auto('솔로몬의 지혜', true), auto('지혜로운 판결', false)],
      savedKeywords: ['솔로몬의 지혜'],
    });
    expect(rows.map(r => r.keyword)).toContain('지혜로운 판결');
  });
});

describe('normalizeForCompare — 중복 등록 방지', () => {
  it('앞뒤 공백·연속 공백·대소문자를 무시한다', () => {
    expect(normalizeForCompare('  짧고   좋은  글귀 ')).toBe('짧고 좋은 글귀');
    expect(normalizeForCompare('Solomon')).toBe(normalizeForCompare('solomon'));
  });

  it('서로 다른 키워드는 구분한다', () => {
    expect(normalizeForCompare('아이들')).not.toBe(normalizeForCompare('아이'));
  });
});
