import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanKey } from '../../plans';

const getAuthUser = vi.fn();
const getPlanKeyByUserId = vi.fn();
const isRestrictedByUserId = vi.fn();

vi.mock('../../auth', () => ({ getAuthUser: (...a: unknown[]) => getAuthUser(...a) }));
vi.mock('../../admin', () => ({
  getPlanKeyByUserId: (...a: unknown[]) => getPlanKeyByUserId(...a),
  isRestrictedByUserId: (...a: unknown[]) => isRestrictedByUserId(...a),
}));

const { requireFeature } = await import('../requireFeature');

/** 로그인한 일반 회원(관리자 아님)으로 가장한다. */
function signedInAs(plan: PlanKey) {
  getAuthUser.mockResolvedValue({ userId: 'u1', user: { is_admin: false } });
  getPlanKeyByUserId.mockResolvedValue(plan);
  isRestrictedByUserId.mockResolvedValue(false);
}

const request = new Request('https://ninfle.kr/api/my/post-missing-history') as never;

beforeEach(() => vi.clearAllMocks());

describe('노출 현황(my.missing-posts) 서버 가드', () => {
  // 화면 분기만 고치고 이 가드를 빠뜨리면 API 직접 호출로 그대로 우회된다.
  it('Free 회원은 403 으로 막고 필요한 등급을 알려준다', async () => {
    signedInAs('free');
    const gate = await requireFeature(request, 'my.missing-posts');
    expect(gate.error?.status).toBe(403);
    await expect(gate.error!.json()).resolves.toMatchObject({
      requiresPlan: 'max',
      featureLocked: true,
    });
  });

  it('Pro 회원도 막힌다 — Max 기능이다', async () => {
    signedInAs('pro');
    expect((await requireFeature(request, 'my.missing-posts')).error?.status).toBe(403);
  });

  it('Max 회원은 통과한다', async () => {
    signedInAs('max');
    const gate = await requireFeature(request, 'my.missing-posts');
    expect(gate.error).toBeUndefined();
    expect(gate.plan).toBe('max');
  });

  it('비로그인은 401 이다', async () => {
    getAuthUser.mockResolvedValue(null);
    expect((await requireFeature(request, 'my.missing-posts')).error?.status).toBe(401);
  });
});

describe('상위 등급이 하위 등급 기능에서 막히지 않는다', () => {
  // 등급 비교를 rank 가 아닌 문자열 일치로 되돌리면 여기서 깨진다.
  it('Max 회원이 Pro 기능(키워드 순위)을 쓸 수 있다', async () => {
    signedInAs('max');
    const gate = await requireFeature(request, 'my.keyword-ranking');
    expect(gate.error).toBeUndefined();
  });

  it('Free 회원은 Pro 기능에서 403 이다', async () => {
    signedInAs('free');
    expect((await requireFeature(request, 'my.keyword-ranking')).error?.status).toBe(403);
  });
});
