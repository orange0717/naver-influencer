'use client';
import { useEffect, useState } from 'react';

type UsageState = {
  isPro: boolean;
  used: number;
  limit: number | null;
} | null;

/**
 * 헤더에 표시하는 "오늘 무료 사용 X/3회" 배지. PRO 이용권 보유자는 "PRO 이용 중"으로 대체.
 * /api/usage/today는 로그인 여부와 무관하게 호출 가능(비회원은 IP 기준 카운트).
 */
export default function UsageQuotaBadge() {
  const [usage, setUsage] = useState<UsageState>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/usage/today')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setUsage({ isPro: !!data.isPro, used: data.used ?? 0, limit: data.limit ?? null });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!usage) return null;

  if (usage.isPro) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold leading-none bg-white/20 text-white shrink-0">
        PRO 이용 중
      </span>
    );
  }

  if (usage.limit === null) return null;

  const remaining = Math.max(0, usage.limit - usage.used);
  const exhausted = remaining === 0;

  return (
    <span
      title={exhausted ? '오늘 무료 이용을 모두 사용했습니다' : `오늘 무료 이용 ${remaining}회 남음`}
      className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold leading-none shrink-0 ${
        exhausted ? 'bg-down/20 text-white' : 'bg-white/15 text-white/90'
      }`}
    >
      오늘 무료 {usage.used}/{usage.limit}회
    </span>
  );
}
