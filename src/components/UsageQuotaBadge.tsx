'use client';
import { useEffect, useState } from 'react';

type UsageState = {
  isPro: boolean;
  used: number;
  limit: number | null;
} | null;

/**
 * 헤더에 표시하는 "AI 질문 N회 남음" 배지. PRO 이용권 보유자는 "PRO 이용 중"으로 대체.
 * 이 무료 회차는 홈의 AI 질문(/api/ai-consultant)에만 적용된다 — 다른 기능은 회원/이용권 기준이라
 * "무료 X회"로 뭉뚱그려 쓰면 잠긴 기능 앞에서 안내가 서로 모순된다(2026-08-24).
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
      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-normal leading-none bg-accent/10 text-accent shrink-0">
        PRO 이용 중
      </span>
    );
  }

  if (usage.limit === null) return null;

  const remaining = Math.max(0, usage.limit - usage.used);
  const exhausted = remaining === 0;

  return (
    <span
      title={exhausted ? '오늘 무료 AI 질문을 모두 사용했습니다' : `오늘 무료 AI 질문 ${remaining}회 남음(하루 ${usage.limit}회)`}
      className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-normal leading-none shrink-0 ${
        exhausted ? 'bg-down/10 text-down' : 'bg-sunken text-text-2'
      }`}
    >
      {exhausted ? 'AI 질문 무료 소진' : `AI 질문 ${remaining}회 남음`}
    </span>
  );
}
