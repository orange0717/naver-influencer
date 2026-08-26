import { describe, it, expect } from 'vitest';
import { aiCheckState, aiCheckTitle, formatAiCount } from '../topic-ai-check';

const UNCHECKED = '아직 확인하지 않았습니다.';

/**
 * 이 테스트가 지키는 것은 숫자 포맷이 아니라 **사실 관계**다.
 * 확인하지 않은 것을 0건으로, 일부만 확인한 것을 전부 확인한 것처럼 보이게 하면 안 된다.
 */
describe('aiCheckState — 확인 진행 상태', () => {
  it('확인한 글이 0이면 미확인이다', () => {
    expect(aiCheckState(0, 50)).toBe('none');
  });

  it('ai_checked_count 컬럼이 없어(null) 모를 때도 미확인으로 다룬다 — 마이그레이션 161 미적용', () => {
    expect(aiCheckState(null, 50)).toBe('none');
    expect(aiCheckState(undefined, 50)).toBe('none');
  });

  it('일부만 확인했으면 partial 이다', () => {
    expect(aiCheckState(3, 50)).toBe('partial');
    expect(aiCheckState(49, 50)).toBe('partial');
  });

  it('전부 확인했으면 full 이다', () => {
    expect(aiCheckState(50, 50)).toBe('full');
  });

  it('확인 수가 글 수보다 많아도(집계 지연 등) 미확인으로 되돌리지 않는다', () => {
    expect(aiCheckState(51, 50)).toBe('full');
  });

  it('글이 0개인 토픽에서 확인 수 0 은 여전히 미확인이다 — 0/0 을 "다 확인했다"로 읽지 않는다', () => {
    expect(aiCheckState(0, 0)).toBe('none');
  });
});

describe('formatAiCount — 화면 표기', () => {
  it('⚠️ 미확인은 0 이 아니라 "-" 로 쓴다 (이게 이 파일의 핵심)', () => {
    expect(formatAiCount(0, 0, 50)).toBe('-');
    expect(formatAiCount(0, null, 50)).toBe('-');
  });

  it('미확인이면 인용 건수가 0 이 아니어도 "-" 다 — 셀 수 없는 값을 내보내지 않는다', () => {
    expect(formatAiCount(7, 0, 50)).toBe('-');
  });

  it('⚠️ 일부만 확인한 0건과 전부 확인한 0건이 화면에서 달라야 한다', () => {
    const partial = formatAiCount(0, 3, 50);
    const full = formatAiCount(0, 50, 50);
    expect(partial).not.toBe(full);
    expect(partial).toBe('0 (3/50 확인)');
    expect(full).toBe('0');
  });

  it('전부 확인한 뒤의 0 은 진짜 "인용 0건" 이므로 그대로 0 이다', () => {
    expect(formatAiCount(0, 50, 50)).toBe('0');
  });

  it('접미사를 붙여도 규칙은 같다', () => {
    expect(formatAiCount(0, null, 50, '건')).toBe('-');
    expect(formatAiCount(2, 10, 50, '건')).toBe('2건 (10/50 확인)');
    expect(formatAiCount(2, 50, 50, '건')).toBe('2건');
  });
});

describe('aiCheckTitle — 마우스오버 설명', () => {
  it('미확인이면 미확인 안내를 준다', () => {
    expect(aiCheckTitle(0, 50, UNCHECKED)).toBe(UNCHECKED);
    expect(aiCheckTitle(null, 50, UNCHECKED)).toBe(UNCHECKED);
  });

  it('일부만 확인했으면 몇 개 중 몇 개를 확인했는지, 몇 개가 빠졌는지 밝힌다', () => {
    const title = aiCheckTitle(3, 50, UNCHECKED);
    expect(title).toContain('50개 중 3개');
    expect(title).toContain('47개');
    expect(title).not.toBe(UNCHECKED);
  });

  it('전부 확인했으면 덧붙일 말이 없다', () => {
    expect(aiCheckTitle(50, 50, UNCHECKED)).toBeUndefined();
  });
});
