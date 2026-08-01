'use client';

import { Fragment, useState } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';
import UrlDetailDrawer from './UrlDetailDrawer';
import { STATUS_ICON, STATUS_LABEL, ERROR_CODE_LABEL, type IndexedUrl } from '@/lib/google-indexing-types';

function StatusCell({ row }: { row: IndexedUrl }) {
  return (
    <div>
      <div>{STATUS_ICON[row.status]} {STATUS_LABEL[row.status]}</div>
      {row.status === 'error' && row.error_code && (
        <div className="text-[10px] mt-0.5 space-x-1">
          <span className="font-semibold text-down">{ERROR_CODE_LABEL[row.error_code] || row.error_code}</span>
          <span className="text-dim">{row.retryable ? '· 재시도 가능' : '· 조치 필요'}</span>
        </div>
      )}
    </div>
  );
}

interface Props {
  urls: IndexedUrl[];
  onRecheck: (id: string) => void;
  onDelete: (id: string) => void;
  onDiagnose: (id: string) => void;
  recheckingId: string | null;
  diagnosingId: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function IndexedUrlsTable({ urls, onRecheck, onDelete, onDiagnose, recheckingId, diagnosingId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (urls.length === 0) {
    return (
      <GlassCard padding="lg">
        <p className="text-sm text-dim text-center py-8">등록된 URL이 없어요. 위에서 블로그 글 주소를 등록해보세요.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="none">
      {/* Desktop */}
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-dim">
            <th className="px-4 py-3 font-semibold">URL</th>
            <th className="px-4 py-3 font-semibold">등록일</th>
            <th className="px-4 py-3 font-semibold">색인상태</th>
            <th className="px-4 py-3 font-semibold text-right">관리</th>
          </tr>
        </thead>
        <tbody>
          {urls.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-b border-border/50 last:border-0">
                <td className="px-4 py-3 max-w-xs truncate">
                  <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {row.title || row.url}
                  </a>
                </td>
                <td className="px-4 py-3 text-dim whitespace-nowrap">{formatDate(row.registered_at)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusCell row={row} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2 text-xs font-semibold">
                    <button onClick={() => onRecheck(row.id)} disabled={recheckingId === row.id} className="text-accent hover:underline disabled:opacity-50">
                      {recheckingId === row.id ? '확인중...' : '재등록'}
                    </button>
                    <button onClick={() => setExpandedId(expandedId === row.id ? null : row.id)} className="text-dim hover:underline">
                      상세보기
                    </button>
                    <button onClick={() => onDelete(row.id)} className="text-down hover:underline">
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
              {expandedId === row.id && (
                <tr className="border-b border-border/50 last:border-0">
                  <td colSpan={4} className="px-4 pb-3">
                    <UrlDetailDrawer row={row} onDiagnose={onDiagnose} diagnosing={diagnosingId === row.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-border/50">
        {urls.map((row) => (
          <div key={row.id} className="p-4">
            <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-accent text-sm font-semibold hover:underline block truncate">
              {row.title || row.url}
            </a>
            <div className="flex items-center justify-between mt-2 text-xs text-dim">
              <span>{formatDate(row.registered_at)}</span>
              <StatusCell row={row} />
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs font-semibold">
              <button onClick={() => onRecheck(row.id)} disabled={recheckingId === row.id} className="text-accent disabled:opacity-50">
                {recheckingId === row.id ? '확인중...' : '재등록'}
              </button>
              <button onClick={() => setExpandedId(expandedId === row.id ? null : row.id)} className="text-dim">
                상세보기
              </button>
              <button onClick={() => onDelete(row.id)} className="text-down">
                삭제
              </button>
            </div>
            {expandedId === row.id && (
              <UrlDetailDrawer row={row} onDiagnose={onDiagnose} diagnosing={diagnosingId === row.id} />
            )}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
