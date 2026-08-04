/**
 * 네이버 인플루언서 "이번 주 신규" 집계용 KST 주 경계.
 * - 평~토: 가장 최근에 지난 일요일 00:00 KST 이후
 * - 일요일: 그 전주 일요일 00:00 KST 이후 (자정 직후 빈 화면 방지, /api/influencers/recent 와 동일)
 *
 * 집계 구간이 바뀌는 시점: KST 월요일 0:00 (그 순간 `recentNewInfluencersSinceIso` 반환값이 바뀜).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const WEEK_SCAN_STEP_MS = 60 * 1000;

/** 이번 주 신규 선정 집계 시작 시각 (UTC ISO). */
export function recentNewInfluencersSinceIso(atMs: number = Date.now()): string {
  const nowKst = new Date(atMs + KST_OFFSET_MS);
  const dow = nowKst.getUTCDay(); // 0=Sun..6=Sat (KST 달력 성분)
  const offset = dow === 0 ? 7 : dow;
  const sundayKst = new Date(nowKst);
  sundayKst.setUTCDate(sundayKst.getUTCDate() - offset);
  sundayKst.setUTCHours(0, 0, 0, 0);
  return new Date(sundayKst.getTime() - KST_OFFSET_MS).toISOString();
}

/** `recentNewInfluencersSinceIso` 값이 달라지는 첫 시각(대략 1분 단위). 주간 자동 갱신 타이머용. */
function nextNewInfluencerSinceChangeAt(atMs: number = Date.now()): Date {
  const cur = recentNewInfluencersSinceIso(atMs);
  const horizon = atMs + 10 * 24 * 60 * 60 * 1000;
  for (let t = atMs + WEEK_SCAN_STEP_MS; t <= horizon; t += WEEK_SCAN_STEP_MS) {
    if (recentNewInfluencersSinceIso(t) !== cur) {
      return new Date(t);
    }
  }
  return new Date(atMs + 7 * 24 * 60 * 60 * 1000);
}

/** 브라우저: 집계 주간 전환 직후 callback 호출, 이후 매주 반복. 탭 활성화 시에도 한 번 호출. */
export function subscribeNewInfluencerWeekBoundaryRefresh(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let timeoutId: number | undefined;

  const scheduleNext = () => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    const nextAt = nextNewInfluencerSinceChangeAt(Date.now()).getTime();
    const delay = Math.max(5_000, nextAt - Date.now() + 2_000);
    timeoutId = window.setTimeout(() => {
      callback();
      scheduleNext();
    }, delay);
  };

  scheduleNext();

  const onVis = () => {
    if (document.visibilityState === 'visible') callback();
  };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    timeoutId = undefined;
    document.removeEventListener('visibilitychange', onVis);
  };
}

/** UI용 "M/D ~ M/D" (위 since부터 7일 구간, 토요일까지). */
export function formatNewInfluencerWeekRangeKst(atMs: number = Date.now()): { start: string; end: string } {
  const since = recentNewInfluencersSinceIso(atMs);
  const startAnchor = new Date(new Date(since).getTime() + KST_OFFSET_MS);
  const saturday = new Date(startAnchor);
  saturday.setUTCDate(saturday.getUTCDate() + 6);
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return { start: fmt(startAnchor), end: fmt(saturday) };
}
