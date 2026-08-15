'use client';

import { ReactNode } from 'react';
import { actionButtonClass } from './controls';

// 분석 화면 공용 페이지 헤더 — 제목 + 설명 + 우측 실행 버튼, 그 아래 보조 안내문(note).
// note 가 없으면 헤더 한 줄만 남으므로 키워드순위처럼 안내문 없는 화면도 같은 컴포넌트를 쓴다.

/** 우측 주 실행 버튼(전체 업데이트 / 대표키워드 추출 등). 화면마다 같은 치수로 서게 타입으로 고정한다. */
export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** 버튼 라벨 앞 아이콘(예: 새로고침 화살표) */
  icon?: ReactNode;
  title?: string;
}

export default function PageHeader({
  title,
  description,
  primaryAction,
  actions,
  note,
}: {
  title: string;
  description?: ReactNode;
  /** 주 CTA. 진행 중 상태(CheckProgress·중단 버튼)로 바꿔야 하면 actions 로 직접 넘긴다. */
  primaryAction?: PrimaryAction;
  /** primaryAction 오른쪽에 붙는 보조 요소(⋯ 더보기 메뉴, 진행률 pill 등) */
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
        {(primaryAction || actions) && (
          <div className="flex items-center gap-2 shrink-0">
            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                title={primaryAction.title}
                className={`inline-flex items-center gap-1.5 ${actionButtonClass}`}
              >
                {primaryAction.icon}
                {primaryAction.label}
              </button>
            )}
            {actions}
          </div>
        )}
      </div>
      {note && <p className="text-xs text-dim/80">{note}</p>}
    </div>
  );
}
