/**
 * 대표 키워드 캐시 재사용 판단 — 저신뢰 규칙 결과가 AI 보정을 건너뛴 채 30일간 굳던 버그의 회귀 테스트.
 *
 * 배경(2026-08-25 프로덕션 실측): 목록 화면 자동 추출은 allowAI:false 로 규칙 최선값만 저장하는데,
 * 그 값이 TTL 캐시로 굳어 AI 보정이 켜진 미노출 검사에서도 캐시 히트로 반환됐다. 그 결과
 * 규칙 엔진이 스스로 ambiguous 라고 신고한 파편("나를" 0.52 · "힘들때" 0.58 · "오렌지도서관의" 0.28)이
 * 그대로 검색어가 되어 '미노출' 판정의 근거로 쓰였다.
 */
import { describe, it, expect } from 'vitest';
import { shouldReuseCachedKeyword, type CachedKeywordRow } from '../post-keyword-extractor';

// 규칙 엔진 에포크(2026-08-15T08:45:00Z) 이후이면서 TTL(30일) 안쪽인 기준 시각
const NOW = Date.parse('2026-08-25T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function row(over: Partial<CachedKeywordRow> = {}): CachedKeywordRow {
  return {
    keyword_source: 'title',
    extracted_at: new Date(NOW - 24 * HOUR).toISOString(),
    confidence: 0.9,
    ...over,
  };
}

describe('shouldReuseCachedKeyword', () => {
  it('신뢰도 높은 최근 저장값은 재사용한다', () => {
    expect(shouldReuseCachedKeyword(row(), true, NOW)).toBe(true);
  });

  it('저장 기록이 없으면 재사용하지 않는다', () => {
    expect(shouldReuseCachedKeyword(row({ extracted_at: null }), true, NOW)).toBe(false);
  });

  it('TTL(30일)이 지나면 재사용하지 않는다', () => {
    const old = new Date(NOW - 31 * 24 * HOUR).toISOString();
    expect(shouldReuseCachedKeyword(row({ extracted_at: old }), true, NOW)).toBe(false);
  });

  it('추출 규칙이 바뀐 시점(RULE_ENGINE_EPOCH) 이전 저장값은 재사용하지 않는다', () => {
    const beforeEpoch = new Date(Date.parse('2026-08-15T00:00:00Z')).toISOString();
    expect(shouldReuseCachedKeyword(row({ extracted_at: beforeEpoch }), true, NOW)).toBe(false);
  });

  // ↓ 이번 수정의 핵심
  it('AI 보정이 켜진 호출에서 저신뢰 규칙 결과는 재사용하지 않는다 (실측: "나를" 0.52)', () => {
    expect(shouldReuseCachedKeyword(row({ confidence: 0.52 }), true, NOW)).toBe(false);
  });

  it('AI 보정을 끈 호출(대량 자동추출)에서는 저신뢰여도 재사용한다 — 대량 처리에 AI를 태우지 않기 위함', () => {
    expect(shouldReuseCachedKeyword(row({ confidence: 0.52 }), false, NOW)).toBe(true);
  });

  it('이미 AI가 뽑은 값은 신뢰도가 낮게 적혀 있어도 다시 AI로 보내지 않는다', () => {
    expect(shouldReuseCachedKeyword(row({ keyword_source: 'ai', confidence: 0.4 }), true, NOW)).toBe(true);
  });

  it('저신뢰라도 쿨다운(6시간) 안이면 재사용한다 — AI 실패 시 매 검사마다 재호출되는 것을 막는다', () => {
    const justNow = new Date(NOW - 1 * HOUR).toISOString();
    expect(shouldReuseCachedKeyword(row({ confidence: 0.3, extracted_at: justNow }), true, NOW)).toBe(true);
  });

  it('쿨다운이 지난 저신뢰 값은 재추출 대상이다', () => {
    const past = new Date(NOW - 7 * HOUR).toISOString();
    expect(shouldReuseCachedKeyword(row({ confidence: 0.3, extracted_at: past }), true, NOW)).toBe(false);
  });

  it('confidence 컬럼이 없는 환경(null)은 저신뢰로 오인하지 않는다 — 전 건 AI 재추출 방지', () => {
    expect(shouldReuseCachedKeyword(row({ confidence: null }), true, NOW)).toBe(true);
  });

  it('경계값 0.7은 재사용한다(임계값 미만일 때만 재추출)', () => {
    expect(shouldReuseCachedKeyword(row({ confidence: 0.7 }), true, NOW)).toBe(true);
    expect(shouldReuseCachedKeyword(row({ confidence: 0.69 }), true, NOW)).toBe(false);
  });
});
