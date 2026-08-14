'use client';

// 기간 필터(7/15/30/90/120/전체) + 시작~종료 날짜 직접 선택 — 노출 현황과 동일 UX.
// 확장 기간(>30일 또는 전체)은 lockExtended 시 🔒. 커스텀 날짜를 쓰면 기간 버튼은 비활성 표시.

export const PERIOD_OPTIONS = [7, 15, 30, 90, 120, 0] as const; // 0 = 전체
export const FREE_DAYS = 30; // 최근 30일 기본(무료), 초과 = 30일 이전(회원 전용 대상)

export function periodLabel(n: number): string {
  return n === 0 ? '전체' : `${n}일`;
}
export function isExtendedPeriod(n: number): boolean {
  return n === 0 || n > FREE_DAYS;
}

export default function PeriodFilter({
  period,
  onPeriod,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
  usingCustomRange,
  onResetCustom,
  lockExtended,
  busy,
}: {
  period: number;
  onPeriod: (n: number) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
  usingCustomRange: boolean;
  onResetCustom: () => void;
  lockExtended?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
        {PERIOD_OPTIONS.map(n => {
          const active = !usingCustomRange && period === n;
          const locked = Boolean(lockExtended && isExtendedPeriod(n));
          return (
            <button
              key={n}
              onClick={() => onPeriod(n)}
              className={`px-3 py-1.5 font-semibold transition cursor-pointer ${
                active ? 'bg-accent text-white' : 'text-dim hover:bg-surface-hover'
              }`}
            >
              {locked && <span className="mr-0.5">🔒</span>}
              {periodLabel(n)}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 text-[11px]">
        <input
          type="date"
          value={customFrom}
          onChange={e => onCustomFrom(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-border bg-surface text-dim"
        />
        <span className="text-dim">~</span>
        <input
          type="date"
          value={customTo}
          onChange={e => onCustomTo(e.target.value)}
          className="px-2 py-1.5 rounded-lg border border-border bg-surface text-dim"
        />
        {usingCustomRange && (
          <button onClick={onResetCustom} className="px-2 py-1 text-dim hover:text-accent cursor-pointer">
            초기화
          </button>
        )}
      </div>
      {busy && <span className="text-[11px] text-dim">조회 대상 계산 중...</span>}
    </div>
  );
}
