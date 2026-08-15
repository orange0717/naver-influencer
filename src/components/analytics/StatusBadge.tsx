'use client';

import StatusIcon from './StatusIcon';
import { TONE_BADGE_CLASS } from './tokens';
import type { StatusTone } from './types';

// 상태 pill — 노출 현황 배지와 동일한 프레젠테이션.
//  · tone: 공용 상태 토큰(success/warning/danger/neutral/accent/info) — 이쪽을 쓴다.
//  · cls : 화면별 임의 색 클래스(기존 호출부 호환). tone 이 있으면 tone 이 이긴다.
export default function StatusBadge({
  label,
  tone,
  cls,
  icon,
  title,
}: {
  label: string;
  tone?: StatusTone;
  cls?: string;
  /** 라벨 앞 아이콘 표시(기본 false). true 면 tone 기본 아이콘이 붙는다. */
  icon?: boolean;
  title?: string;
}) {
  const colorClass = tone ? TONE_BADGE_CLASS[tone] : (cls ?? TONE_BADGE_CLASS.neutral);
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${colorClass}`}
    >
      {icon && <StatusIcon tone={tone ?? 'neutral'} size={11} />}
      {label}
    </span>
  );
}
