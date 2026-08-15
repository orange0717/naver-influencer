'use client';

import { ReactNode } from 'react';

// 분석 화면 공용 페이지 헤더 — 제목 + 설명 + 우측 실행 버튼, 그 아래 보조 안내문(note).
// note 가 없으면 헤더 한 줄만 남으므로 키워드순위처럼 안내문 없는 화면도 같은 컴포넌트를 쓴다.
export default function PageHeader({
  title,
  description,
  actions,
  note,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="text-xs text-dim mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {note && <p className="text-xs text-dim/80">{note}</p>}
    </div>
  );
}
