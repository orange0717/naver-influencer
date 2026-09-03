/**
 * CSV 변환 유틸 (한글 엑셀 호환을 위한 UTF-8 BOM 포함)
 */

const UTF8_BOM = '\uFEFF';

/** 셀 한 칸 이스케이프: 큰따옴표·콤마·줄바꿈 포함 시 큰따옴표로 감싸기 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/** 행 배열 → CSV 문자열 (헤더 포함, BOM 포함) */
export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCell).join(',');
  const bodyLines = rows.map((row) => row.map(escapeCell).join(','));
  return UTF8_BOM + [headerLine, ...bodyLines].join('\n');
}

/** Next.js Response 헬퍼: CSV 파일로 응답 */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** 날짜 → YYYYMMDD */
export function todayStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** 한 번 다운로드 최대 행수 (Max 플랜 정책) */
export const DOWNLOAD_ROW_LIMIT = 500;

/** 브라우저에서 CSV 파일 다운로드 (Blob → a[download] 트리거) */
export function downloadCsvInBrowser(filename: string, csv: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
