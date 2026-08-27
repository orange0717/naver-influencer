import { describe, it, expect } from 'vitest';
import { isValidEmail } from '../auth';

/**
 * 이 검사가 사라지면 브라우저 기본 검증(type="email")만 남는데, 그건
 *  ① `a@b` 처럼 점 없는 주소를 통과시키고
 *  ② 걸릴 경우 submit 자체를 막아 우리 오류 메시지가 갱신되지 않는다
 * (2026-08-27 감사: 이메일에 '@'가 없는데 "비밀번호를 입력해주세요."가 떠 있었다).
 */
describe('isValidEmail', () => {
  it('정상 주소를 통과시킨다', () => {
    for (const e of ['a@b.co', 'orange@ninfle.kr', 'a.b+tag@sub.example.com']) {
      expect(isValidEmail(e), e).toBe(true);
    }
  });

  it('브라우저 기본 검증이 놓치는 "점 없는 주소"를 잡는다', () => {
    // type="email" 은 이걸 유효하다고 본다. 우리는 아니다.
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('orange@localhost')).toBe(false);
  });

  it('@ 가 없으면 거부한다', () => {
    expect(isValidEmail('이메일아님')).toBe(false);
    expect(isValidEmail('orange.ninfle.kr')).toBe(false);
  });

  it('빈 값·공백만 있는 값을 거부한다', () => {
    for (const e of ['', ' ', '   \t ']) expect(isValidEmail(e), JSON.stringify(e)).toBe(false);
  });

  it('앞뒤 공백은 잘라내고 판단한다 (사용자가 복사·붙여넣기 하면 흔하다)', () => {
    expect(isValidEmail('  orange@ninfle.kr  ')).toBe(true);
  });

  it('중간에 공백이 있으면 거부한다', () => {
    expect(isValidEmail('or ange@ninfle.kr')).toBe(false);
    expect(isValidEmail('orange@nin fle.kr')).toBe(false);
  });

  it('@ 가 여러 개면 거부한다', () => {
    expect(isValidEmail('a@b@c.com')).toBe(false);
  });

  it('로컬/도메인 한쪽이 비면 거부한다', () => {
    for (const e of ['@ninfle.kr', 'orange@', 'orange@.kr', 'orange@ninfle.']) {
      expect(isValidEmail(e), e).toBe(false);
    }
  });
});
