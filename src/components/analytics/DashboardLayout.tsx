'use client';

import { ReactNode } from 'react';
import './analytics-tokens.css';
import PageHeader, { type PrimaryAction } from './PageHeader';
import SummaryCards, { type SummaryCard } from './SummaryCards';
import MetricCardGrid from './MetricCardGrid';
import AnalyticsTableShell from './AnalyticsTableShell';
import { ANALYTICS_SCOPE } from './tokens';
import type { MetricCardItem } from './types';

/**
 * 포스팅 분석 화면(키워드 순위·노출 현황·AI 브리핑) 공용 레이아웃.
 *
 * 세 화면이 "헤더 → 요약카드 → 필터 → 표" 라는 같은 골격을 각자 조립하고 있어서
 * 간격(space-y-6)·필터 줄 묶음(gap-3)·표 껍데기가 화면마다 조금씩 달라졌다.
 * 골격만 여기서 고정하고, 안쪽(필터 구성·표 컬럼)은 화면별 슬롯으로 받는다.
 */
export default function DashboardLayout({
  title,
  description,
  note,
  primaryAction,
  actions,
  banners,
  cards,
  metrics,
  cardsLoading,
  filters,
  tableTitle = '포스팅 목록',
  tableCount,
  tableLoading,
  width = 'default',
  paintCanvas = false,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  /** 헤더 아래 보조 안내문 */
  note?: ReactNode;
  /** 헤더 우측 주 실행 버튼(전체 업데이트·추출). 진행 중 UI로 바꿔야 하면 actions 를 쓴다. */
  primaryAction?: PrimaryAction;
  /** 헤더 우측 실행 버튼 영역 */
  actions?: ReactNode;
  /** 최상단 알림(에러·안내 배너) — 헤더보다 위에 붙는다 */
  banners?: ReactNode;
  /** 요약 카드(기존 형태). 상태 아이콘·추이가 필요하면 metrics 를 쓴다. */
  cards?: SummaryCard[];
  /** 상태 아이콘 + 추이(▲▼)를 포함한 지표 카드. cards 보다 우선한다. */
  metrics?: MetricCardItem[];
  cardsLoading?: boolean;
  /** 기간·상태·검색 등 필터 줄. 여러 줄이면 세로 gap-3 으로 쌓인다 */
  filters?: ReactNode;
  tableTitle?: string;
  tableCount?: ReactNode;
  tableLoading?: boolean;
  /** 표 내용(데스크톱 테이블 + 모바일 카드 + Empty) */
  children: ReactNode;
  /** 'wide' = 표 중심 화면(1800px 중앙정렬) · 'default' = 감싸는 레이아웃 폭을 따른다 */
  width?: 'wide' | 'default';
  /** 스펙 캔버스(#F9F7F5)까지 칠할지. 기본은 앱 캔버스를 그대로 둔다. */
  paintCanvas?: boolean;
  /** 표 아래 추가 영역(부가 카드·모달·드로어) */
  footer?: ReactNode;
}) {
  // ANALYTICS_SCOPE = --a-* 디자인 토큰(analytics-tokens.css)이 유효한 범위.
  // 이 안에서만 분석 화면 팔레트가 적용되고, 밖의 화면들은 앱 전역 팔레트를 그대로 쓴다.
  const widthClass = width === 'wide' ? 'w-full max-w-[1800px] mx-auto' : '';

  return (
    <div className={`${ANALYTICS_SCOPE} ${widthClass} space-y-6`.trim()} data-canvas={paintCanvas ? 'on' : undefined}>
      {banners}

      <PageHeader
        title={title}
        description={description}
        note={note}
        primaryAction={primaryAction}
        actions={actions}
      />

      {metrics && metrics.length > 0 ? (
        <MetricCardGrid metrics={metrics} loading={cardsLoading} />
      ) : (
        cards && cards.length > 0 && <SummaryCards cards={cards} loading={cardsLoading} />
      )}

      {filters && <div className="flex flex-col gap-3">{filters}</div>}

      <AnalyticsTableShell title={tableTitle} count={tableCount} loading={tableLoading}>
        {children}
      </AnalyticsTableShell>

      {footer}
    </div>
  );
}

export type { SummaryCard };
