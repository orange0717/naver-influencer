import { describe, it, expect } from 'vitest';
import { reconcileParticipation } from '../keyword/sync-reconcile';

/**
 * reconcileParticipation 이 실제로 쓰는 체인만 흉내내는 최소 fake.
 * 목적은 "언제 지우고 언제 안 지우는가" 한 가지다.
 */
function fakeSupabase(state: { alive: string[]; deleted: string[] }) {
  const updates: { deleted_at: string | null; ids: string[] }[] = [];
  const runs: Record<string, unknown>[] = [];

  function builder(table: string, op: 'select' | 'update' | 'insert', payload?: Record<string, unknown>) {
    const filters: Record<string, unknown> = {};
    let ids: string[] = [];
    const self: Record<string, unknown> = {
      eq() { return self; },
      in(_col: string, list: string[]) { ids = list; return self; },
      is(col: string, val: unknown) { filters[`is:${col}`] = val; return self; },
      not(col: string, _op: string, val: unknown) { filters[`not:${col}`] = val; return self; },
      order() { return self; },
      limit() { return self; },
      then(resolve: (r: { data: unknown; error: null }) => void) {
        if (op === 'insert') {
          runs.push(payload as Record<string, unknown>);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        if (op === 'update') {
          const deletedAt = (payload as { deleted_at: string | null }).deleted_at;
          updates.push({ deleted_at: deletedAt, ids });
          if (deletedAt === null) {
            state.deleted = state.deleted.filter((k) => !ids.includes(k));
            state.alive.push(...ids);
          } else {
            state.alive = state.alive.filter((k) => !ids.includes(k));
            state.deleted.push(...ids);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        // select: 살아있는 행 + 지워진 행을 한 번에 준다 (실제 구현과 동일한 모양)
        void filters;
        const rows = [
          ...state.alive.map((keyword_id) => ({ keyword_id, deleted_at: null })),
          ...state.deleted.map((keyword_id) => ({ keyword_id, deleted_at: '2026-08-01T00:00:00Z' })),
        ];
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return self;
  }

  const supabase = {
    from(table: string) {
      return {
        select: () => builder(table, 'select'),
        update: (payload: Record<string, unknown>) => builder(table, 'update', payload),
        insert: (payload: Record<string, unknown>) => builder(table, 'insert', payload),
      };
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, updates, runs, state };
}

const base = {
  influencerId: 'inf-1',
  source: 'cron' as const,
  fetchedCount: 2,
  reportedTotal: 2,
  startedAt: '2026-08-26T00:00:00Z',
};

describe('reconcileParticipation', () => {
  it('목록을 끝까지 받았을 때만 사라진 참여를 tombstone 한다', async () => {
    const f = fakeSupabase({ alive: ['a', 'b', 'gone'], deleted: [] });
    const r = await reconcileParticipation({
      ...base, supabase: f.supabase, currentKeywordIds: ['a', 'b'], complete: true,
    });
    expect(r.status).toBe('success');
    expect(r.tombstoned).toBe(1);
    expect(f.state.deleted).toEqual(['gone']);
  });

  it('부분 수집(complete=false)이면 tombstone 을 실행하지 않는다', async () => {
    const f = fakeSupabase({ alive: ['a', 'b', 'gone'], deleted: [] });
    const r = await reconcileParticipation({
      ...base, supabase: f.supabase, currentKeywordIds: ['a'], complete: false,
    });
    expect(r.status).toBe('partial');
    expect(r.tombstoned).toBe(0);
    expect(f.state.alive).toEqual(['a', 'b', 'gone']);
    // 물리 삭제는 어떤 경우에도 쓰지 않는다 — update 만 나간다.
    expect(f.updates.every((u) => 'deleted_at' in u)).toBe(true);
  });

  it('목록이 통째로 비어 오면 삭제로 오인하지 않는다', async () => {
    const f = fakeSupabase({ alive: ['a', 'b'], deleted: [] });
    const r = await reconcileParticipation({
      ...base, supabase: f.supabase, currentKeywordIds: [], complete: true, fetchedCount: 0, reportedTotal: 0,
    });
    expect(r.tombstoned).toBe(0);
    expect(f.state.alive).toEqual(['a', 'b']);
    expect(f.runs[0].note).toBe('empty list — tombstone skipped');
  });

  it('다시 참여한 키워드는 deleted_at 을 되돌린다', async () => {
    const f = fakeSupabase({ alive: ['a'], deleted: ['back'] });
    const r = await reconcileParticipation({
      ...base, supabase: f.supabase, currentKeywordIds: ['a', 'back'], complete: true,
    });
    expect(r.restored).toBe(1);
    expect(f.state.deleted).toEqual([]);
    expect(f.state.alive.sort()).toEqual(['a', 'back']);
  });

  it('네이버 원본 총계와 수집 수가 어긋나면 기록에 남긴다', async () => {
    const f = fakeSupabase({ alive: ['a'], deleted: [] });
    const r = await reconcileParticipation({
      ...base, supabase: f.supabase, currentKeywordIds: ['a'], complete: true,
      fetchedCount: 1, reportedTotal: 572,
    });
    expect(r.mismatch).toBe(true);
    expect(f.runs[0].note).toBe('reported_total != fetched_count');
    expect(f.runs[0].status).toBe('success');
  });

  it('모든 실행을 keyword_sync_runs 에 남긴다', async () => {
    const f = fakeSupabase({ alive: [], deleted: [] });
    await reconcileParticipation({
      ...base, supabase: f.supabase, currentKeywordIds: ['a'], complete: true,
    });
    expect(f.runs).toHaveLength(1);
    expect(f.runs[0].influencer_id).toBe('inf-1');
    expect(f.runs[0].finished_at).toBeTruthy();
  });
});
