import { describe, it, expect } from 'vitest';
import { newViewToken, viewHeaders, readQuotaExceeded, VIEW_TOKEN_HEADER } from '../analysis-view';

// 무료 하루 3회 조회 제한의 클라이언트 계약(화면 mount 토큰 + 402 파싱) 검증.
// DB 원자성/일일 리셋은 SQL(migration-148)·서버(analysis-quota.ts)에서 강제되며,
// 실데이터 검증은 로그인 세션 + 마이그레이션 적용이 필요하다(별도).

describe('newViewToken', () => {
  it('호출마다 서로 다른 토큰을 만든다(화면 mount 별 고유)', () => {
    const a = newViewToken();
    const b = newViewToken();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe('viewHeaders', () => {
  it('X-View-Token 헤더로 토큰을 실어준다', () => {
    const h = viewHeaders('tok-123');
    expect(h[VIEW_TOKEN_HEADER]).toBe('tok-123');
  });
});

describe('readQuotaExceeded', () => {
  it('402 + quotaExceeded 면 used/limit/needsSignup 을 파싱한다', async () => {
    const res = new Response(
      JSON.stringify({ quotaExceeded: true, used: 3, limit: 3, needsSignup: false }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    );
    const q = await readQuotaExceeded(res);
    expect(q).toEqual({ used: 3, limit: 3, needsSignup: false });
  });

  it('402 라도 quotaExceeded 가 아니면 null (다른 402 결제 응답과 구분)', async () => {
    const res = new Response(JSON.stringify({ error: '유료 플랜이 필요합니다.' }), { status: 402 });
    expect(await readQuotaExceeded(res)).toBeNull();
  });

  it('200 성공 응답은 초과가 아니다(null)', async () => {
    const res = new Response(JSON.stringify({ keywords: [] }), { status: 200 });
    expect(await readQuotaExceeded(res)).toBeNull();
  });

  it('본문을 clone 으로 읽어 원본 응답은 그대로 소비 가능하다', async () => {
    const res = new Response(JSON.stringify({ keywords: [1, 2] }), { status: 200 });
    await readQuotaExceeded(res); // 내부에서 clone 사용
    const body = await res.json(); // 원본은 아직 소비되지 않아야 함
    expect(body.keywords).toEqual([1, 2]);
  });
});
