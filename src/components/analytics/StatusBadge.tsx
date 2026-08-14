'use client';

// 상태 pill — 노출 현황 배지와 동일한 프레젠테이션. 색(cls)은 호출측이 상태에 맞게 매핑해 넘긴다.
export default function StatusBadge({
  label,
  cls,
  title,
}: {
  label: string;
  cls: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}
