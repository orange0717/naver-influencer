import { describe, it, expect } from 'vitest';

import { aggregateSurfaceSamples, type SurfaceOutcome, type SurfaceStatus } from '@/lib/naver-ai-briefing';
import { AI_CITATION_SAMPLE_COUNT } from '@/lib/ai-citation-batch';

/**
 * AI 인용은 한 번 보고 단정하지 않는다(§3.7).
 * 같은 키워드라도 조회할 때마다 AI 답변의 출처가 달라진다는 것이 실측으로 확인돼 있어,
 * 1회 관측은 "판정"이 아니라 "표본"이다. 여기서 못 박는 건 그 표본들을 어떻게 하나의 판정으로
 * 합치는지 — 특히 "못 봤다"를 미인용으로 굳히지 않는 경계다.
 */

function sample(status: SurfaceStatus, patch: Partial<SurfaceOutcome> = {}): SurfaceOutcome {
  return {
    status,
    present: status === 'CITED' || status === 'NOT_CITED' ? true : null,
    sourceIndex: null,
    sourceTotal: null,
    matchedTitle: null,
    matchedUrl: null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

const cited = (patch: Partial<SurfaceOutcome> = {}) => sample('CITED', {
  sourceIndex: 2, sourceTotal: 5, matchedUrl: 'https://blog.naver.com/orangelibrary_/223456789012', ...patch,
});

describe('표본을 하나의 판정으로 합친다(§3.7)', () => {
  it('한 번이라도 인용을 봤으면 인용됨 — 근거 URL 이 실제로 있었다', () => {
    const r = aggregateSurfaceSamples([sample('NOT_CITED'), cited(), sample('NOT_CITED')]);
    expect(r.status).toBe('CITED');
    expect(r.citedSamples).toBe(1);
    expect(r.samples).toBe(3);
  });

  it('인용을 본 회차의 출처 순번·URL 을 그대로 쓴다 — 회차를 평균 내지 않는다', () => {
    const r = aggregateSurfaceSamples([sample('NOT_CITED'), cited({ sourceIndex: 4, sourceTotal: 9 })]);
    expect(r.sourceIndex).toBe(4);
    expect(r.sourceTotal).toBe(9);
    expect(r.matchedUrl).toContain('223456789012');
  });

  it('확인이 끝난 표본이 2회 이상이고 인용이 0회일 때만 미인용으로 확정한다', () => {
    const r = aggregateSurfaceSamples([sample('NOT_CITED'), sample('NOT_CITED'), sample('NOT_CITED')]);
    expect(r.status).toBe('NOT_CITED');
    expect(r.citedSamples).toBe(0);
    expect(r.samples).toBe(3);
  });

  // 이게 이 Phase 의 핵심이다. 예전엔 이 상황이 곧바로 '미인용'이었다.
  it('확인이 끝난 표본이 1회뿐이면 미인용으로 확정하지 않는다', () => {
    const r = aggregateSurfaceSamples([sample('NOT_CITED'), sample('UNVERIFIED'), sample('UNAVAILABLE')]);
    expect(r.status).toBe('UNVERIFIED');
    expect(r.errorCode).toBe('INSUFFICIENT_SAMPLES');
    expect(r.samples).toBe(1);
    expect(r.attempts).toBe(3);
  });

  it('확인이 한 번도 끝나지 않으면 실패 사유를 물려받는다 — 미인용으로 강등하지 않는다', () => {
    const r = aggregateSurfaceSamples([
      sample('UNVERIFIED', { errorCode: 'STREAM_TIMEOUT' }),
      sample('UNAVAILABLE', { errorCode: 'BLOCKED' }),
    ]);
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.errorCode).toBe('BLOCKED');
    expect(r.samples).toBe(0);
  });

  it('조회를 한 번도 못 했으면 표본 0 — 상태를 지어내지 않는다', () => {
    const r = aggregateSurfaceSamples([]);
    expect(r.status).toBe('UNVERIFIED');
    expect(r.samples).toBe(0);
    expect(r.attempts).toBe(0);
  });
});

describe('"AI 영역 자체가 없음"과 "있는데 인용 안 됨"을 섞지 않는다', () => {
  it('한 회차라도 영역이 떴으면 없다고 적지 않는다', () => {
    const r = aggregateSurfaceSamples([
      sample('NOT_CITED', { present: false }),
      sample('NOT_CITED', { present: true }),
    ]);
    expect(r.status).toBe('NOT_CITED');
    expect(r.present).toBe(true);
  });

  it('모든 회차에서 영역이 없었으면 없음으로 적는다', () => {
    const r = aggregateSurfaceSamples([
      sample('NOT_CITED', { present: false }),
      sample('NOT_CITED', { present: false }),
    ]);
    expect(r.present).toBe(false);
  });
});

describe('표본 수 상수', () => {
  // 1이 되면 §3.7 "1회 단정 금지"가 코드에서 사라진다 — 값을 바꾸려면 이 테스트를 먼저 마주치게 한다.
  it('한 건을 2회 이상 조회한다', () => {
    expect(AI_CITATION_SAMPLE_COUNT).toBeGreaterThanOrEqual(2);
  });
});
