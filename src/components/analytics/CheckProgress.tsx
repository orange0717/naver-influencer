'use client';

import { useEffect, useState } from 'react';

/**
 * 남은 시간 표기를 시작하는 최소 완료 건수. 1~2건만으로 평균을 내면 캐시 히트 한 건에
 * 전체 예상이 휘둘려 "10초 남음"이라 적어놓고 몇 분씩 도는 일이 생긴다.
 */
const MIN_SAMPLES_FOR_ETA = 3;

function formatEta(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `약 ${Math.max(sec, 5)}초 남음`;
  return `약 ${Math.round(sec / 60)}분 남음`;
}

/**
 * 지금까지 실제로 걸린 시간으로 남은 시간을 추정한다. 표본이 모자라거나 배치가 끝났으면 null.
 * 고정 상수(예: 건당 7초)로 만들어낸 시간은 쓰지 않는다 — 캐시 히트 비율에 따라 실제와 크게 달라진다.
 */
export function estimateEta(startedAt: number | null | undefined, current: number, total: number, now: number): string | null {
  const done = Math.max(current - 1, 0);
  if (!startedAt || done < MIN_SAMPLES_FOR_ETA || total <= current) return null;
  return formatEta(((now - startedAt) / done) * (total - current));
}

// 대량 조회 진행률 pill + 중단 버튼 — 노출 현황과 동일 UX. "47/90 순위 확인 중 52%".
export default function CheckProgress({
  current,
  total,
  label = '분석 중',
  onStop,
  startedAt,
}: {
  current: number;
  total: number;
  label?: string;
  onStop?: () => void;
  /** 배치 시작 시각(Date.now()). 주면 실제 소요 속도로 남은 시간을 추정해 함께 보여준다. */
  startedAt?: number | null;
}) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const eta = estimateEta(startedAt, current, total, now);

  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white font-bold rounded-xl text-xs">
        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        {current}/{total} {label} {pct}%
        {eta && <span className="font-semibold text-white/75">· {eta}</span>}
      </span>
      {onStop && (
        <button
          onClick={onStop}
          className="px-4 py-2 bg-down/10 text-down font-bold rounded-xl text-xs cursor-pointer hover:bg-down/20 transition"
        >
          중단
        </button>
      )}
    </div>
  );
}
