'use client';

import { Fragment, ReactNode } from 'react';
import AnalyticsTableShell from './AnalyticsTableShell';
import type { ColumnAlign, DataTableColumn, DataTableProps } from './types';

/* ═══════════════════════════════════════════════════════════════
   포스팅 목록 공용 표.

   각 화면이 따로 그리던 세 가지를 여기로 모은다.
     · Sticky Header — 긴 목록에서 스크롤해도 컬럼명이 남는다(maxHeight 와 한 쌍).
     · Loading State — 스켈레톤 행. "불러오는 중..." 한 줄로 표가 사라지지 않게 한다.
     · Empty State   — 제목 + 설명 + 복구 동작(필터 초기화 등).
   컬럼 정의(DataTableColumn)는 데스크톱 표와 모바일 카드가 공유한다.

   한 항목이 여러 행으로 펼쳐지는 화면(키워드 순위: 포스팅 1개 = 키워드 n행)은
   renderRows 로 본문만 직접 그리고 헤더·상태·껍데기는 그대로 공유한다.
   ═══════════════════════════════════════════════════════════════ */

const alignClass: Record<ColumnAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function HeadCells<T>({ columns, sticky }: { columns: DataTableColumn<T>[]; sticky: boolean }) {
  return (
    <tr className="border-b border-border/50 text-[11px] text-dim">
      {columns.map(col => (
        <th
          key={col.key}
          scope="col"
          className={[
            'px-3 py-3 font-semibold whitespace-nowrap',
            alignClass[col.align ?? 'left'],
            col.width ?? '',
            col.divider ? 'border-l border-border/40' : '',
            // sticky 헤더는 배경이 있어야 아래 행이 비쳐 보이지 않는다.
            sticky ? 'sticky top-0 z-10 bg-surface' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {col.header}
        </th>
      ))}
    </tr>
  );
}

function SkeletonRows<T>({ columns, rows }: { columns: DataTableColumn<T>[]; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="animate-soft-pulse">
          {columns.map(col => (
            <td key={col.key} className={`px-3 py-3.5 ${col.divider ? 'border-l border-border/40' : ''}`}>
              <span className="block h-3 rounded bg-border/60" style={{ width: r % 2 ? '60%' : '80%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function EmptyBlock({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="p-12 text-center space-y-2">
      <p className="text-sm text-text-2">{title}</p>
      {description && <p className="text-xs text-dim">{description}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  title,
  count,
  loading,
  loadingRows = 6,
  empty,
  stickyHeader = true,
  maxHeight,
  minWidth,
  tableClassName = '',
  rowClassName,
  onRowClick,
  renderRows,
  renderMobileCard,
  footer,
  className = '',
}: DataTableProps<T>) {
  const isEmpty = !loading && rows.length === 0;
  const emptyState = empty ?? { title: '표시할 포스팅이 없습니다.', description: '기간·상태 필터를 바꿔보세요.' };

  const body = (
    <>
      {isEmpty ? (
        <EmptyBlock {...emptyState} />
      ) : (
        <>
          {/* 데스크톱 표 */}
          <div
            className="hidden md:block overflow-auto"
            style={{ maxHeight: stickyHeader ? maxHeight : undefined }}
          >
            <table className={`w-full text-sm ${tableClassName}`.trim()} style={{ minWidth }}>
              <thead>
                <HeadCells columns={columns} sticky={stickyHeader} />
              </thead>
              <tbody className="divide-y divide-border/20">
                {loading ? (
                  <SkeletonRows columns={columns} rows={loadingRows} />
                ) : renderRows ? (
                  rows.map((row, i) => <Fragment key={rowKey(row, i)}>{renderRows(row, i)}</Fragment>)
                ) : (
                  rows.map((row, i) => (
                    <tr
                      key={rowKey(row, i)}
                      onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                      className={[
                        'hover:bg-surface-hover transition',
                        onRowClick ? 'cursor-pointer' : '',
                        rowClassName?.(row, i) ?? '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {columns.map(col => (
                        <td
                          key={col.key}
                          className={[
                            'px-3 py-3.5 align-middle',
                            alignClass[col.align ?? 'left'],
                            col.divider ? 'border-l border-border/40' : '',
                            col.cellClassName ?? '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {col.cell?.(row, i)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 — renderMobileCard 가 없으면 컬럼 정의로 라벨:값 목록을 만든다 */}
          <div className="md:hidden divide-y divide-border/20">
            {loading ? (
              Array.from({ length: Math.min(loadingRows, 4) }).map((_, i) => (
                <div key={i} className="p-4 space-y-2 animate-soft-pulse">
                  <span className="block h-3 w-3/4 rounded bg-border/60" />
                  <span className="block h-3 w-1/2 rounded bg-border/40" />
                </div>
              ))
            ) : renderMobileCard ? (
              rows.map((row, i) => <Fragment key={rowKey(row, i)}>{renderMobileCard(row, i)}</Fragment>)
            ) : (
              rows.map((row, i) => (
                <div
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                  className={`p-4 space-y-1.5 ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns
                    .filter(col => !col.hideOnMobile)
                    .map(col => (
                      <div key={col.key} className="flex items-start justify-between gap-3 text-xs">
                        <span className="text-dim shrink-0">{col.header}</span>
                        <span className="text-right min-w-0">{col.cell?.(row, i)}</span>
                      </div>
                    ))}
                </div>
              ))
            )}
          </div>
        </>
      )}
      {footer}
    </>
  );

  if (!title) return <div className={className}>{body}</div>;

  return (
    <div className={className}>
      <AnalyticsTableShell title={title} count={count} loading={loading}>
        {body}
      </AnalyticsTableShell>
    </div>
  );
}
