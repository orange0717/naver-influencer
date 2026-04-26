'use client';

import { useEffect, useState } from 'react';

interface ParsedRow {
  rank: number;
  category: string;
  naver_id: string;
  display_name: string;
  profile_url: string;
  image_url: string;
  subscriber_count: number | null;
  _error?: string;
}

interface Snapshot {
  snapshot_date: string;
  category_count: number;
  total_count: number;
}

const CSV_HEADER = 'rank,category,naver_id,display_name,profile_url,image_url,subscriber_count';

const SAMPLE = `1,여행,traveler1,여행하는 오렌지,https://in.naver.com/traveler1,,12345
2,여행,traveler2,세계일주 토끼,https://in.naver.com/traveler2,,9876
1,푸드,foodie1,홈쿠킹 마스터,https://in.naver.com/foodie1,,54321`;

// 간이 CSV 파서 (따옴표·이스케이프 미지원, 단순 콤마 분리)
function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  // 첫 줄이 헤더면 스킵
  let startIdx = 0;
  if (/^rank\s*,/i.test(lines[0])) startIdx = 1;

  const rows: ParsedRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const [rankStr, category, naver_id = '', display_name = '', profile_url = '', image_url = '', subStr = ''] = cols;
    const rank = Number(rankStr);
    let _error: string | undefined;
    if (!Number.isFinite(rank) || rank <= 0) _error = 'rank 값 오류';
    else if (!category) _error = 'category 누락';
    else if (!display_name) _error = 'display_name 누락';
    rows.push({
      rank: Number.isFinite(rank) ? rank : 0,
      category: category || '',
      naver_id,
      display_name,
      profile_url,
      image_url,
      subscriber_count: subStr ? Number(subStr) || null : null,
      _error,
    });
  }
  return rows;
}

export default function AdminOfficialRankingsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [snapshotDate, setSnapshotDate] = useState(today);
  const [csv, setCsv] = useState('');
  const [overwrite, setOverwrite] = useState(true);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadSnapshots = async () => {
    try {
      const res = await fetch('/api/admin/official-rankings/snapshots', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots || []);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadSnapshots();
  }, []);

  const handlePreview = () => {
    const rows = parseCsv(csv);
    setPreview(rows);
    setMessage(null);
  };

  const handleApply = async () => {
    const rows = parseCsv(csv);
    const valid = rows.filter((r) => !r._error);
    if (valid.length === 0) {
      setMessage({ type: 'err', text: '유효한 행이 없습니다. 먼저 미리보기로 확인하세요.' });
      return;
    }
    if (rows.some((r) => r._error)) {
      const ok = window.confirm(
        `${rows.filter((r) => r._error).length}개 행에 오류가 있습니다. 오류 행은 제외하고 ${valid.length}개 행만 저장합니다. 계속하시겠습니까?`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `${snapshotDate} 자 데이터로 ${valid.length}개 행을 저장합니다.${overwrite ? ' (같은 날짜 기존 데이터는 덮어씁니다)' : ''}`
      );
      if (!ok) return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/official-rankings/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          snapshotDate,
          overwrite,
          rows: valid.map((r) => ({
            rank: r.rank,
            category: r.category,
            naver_id: r.naver_id || null,
            display_name: r.display_name,
            profile_url: r.profile_url || null,
            image_url: r.image_url || null,
            subscriber_count: r.subscriber_count,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'err', text: data?.error || '업로드 실패' });
        return;
      }
      setMessage({
        type: 'ok',
        text: `저장 완료 — ${data.inserted}건 / 인플루언서 매칭 ${data.matched}건`,
      });
      setCsv('');
      setPreview([]);
      loadSnapshots();
    } catch {
      setMessage({ type: 'err', text: '네트워크 오류' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (date: string) => {
    if (!window.confirm(`${date} 스냅샷을 정말 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/admin/official-rankings/${date}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'err', text: data?.error || '삭제 실패' });
        return;
      }
      setMessage({ type: 'ok', text: `${date} 스냅샷 ${data.deleted}건 삭제 완료` });
      loadSnapshots();
    } catch {
      setMessage({ type: 'err', text: '네트워크 오류' });
    }
  };

  const errorCount = preview.filter((r) => r._error).length;
  const validCount = preview.length - errorCount;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-extrabold">네이버 공식 순위 업로드</h1>
        <p className="text-sm text-dim mt-1">
          네이버가 발표하는 공식 카테고리별 인플루언서 순위를 CSV로 붙여넣어 일괄 등록합니다. 주 1회 업데이트 권장.
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <p className="text-xs font-bold text-dim mb-1">스냅샷 날짜</p>
            <input
              type="date"
              value={snapshotDate}
              onChange={(e) => setSnapshotDate(e.target.value)}
              className="px-3 py-2 bg-bg border border-border rounded-lg text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            <span>같은 날짜 데이터 덮어쓰기</span>
          </label>
          <button
            onClick={() => setCsv(`${CSV_HEADER}\n${SAMPLE}`)}
            className="ml-auto px-3 py-1.5 rounded-lg bg-bg border border-border text-xs text-dim hover:text-accent transition cursor-pointer"
          >
            샘플 채우기
          </button>
        </div>

        <div>
          <p className="text-xs font-bold text-dim mb-1">CSV 데이터</p>
          <p className="text-[11px] text-dim mb-2">
            헤더 형식: <code className="font-mono">{CSV_HEADER}</code>
            <br />
            첫 줄이 헤더면 자동 스킵. naver_id / profile_url / image_url / subscriber_count 는 비워도 됨.
          </p>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={10}
            placeholder={`${CSV_HEADER}\n1,여행,...,...,...,...,...`}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs font-mono"
            spellCheck={false}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePreview}
            disabled={loading || !csv.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl bg-bg border border-border text-text text-sm font-bold hover:border-accent/40 transition cursor-pointer disabled:opacity-50"
          >
            미리보기
          </button>
          <button
            onClick={handleApply}
            disabled={loading || preview.length === 0 || validCount === 0}
            className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
          >
            {loading ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-4 ${
            message.type === 'ok' ? 'bg-up/10 border-up/30 text-up' : 'bg-down/10 border-down/30 text-down'
          }`}
        >
          <p className="text-sm font-semibold">{message.text}</p>
        </div>
      )}

      {preview.length > 0 && (
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-bold">미리보기 — {preview.length}행 (유효 {validCount} / 오류 {errorCount})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg border-b border-border">
                <tr className="text-left">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">카테고리</th>
                  <th className="px-3 py-2">순위</th>
                  <th className="px-3 py-2">naver_id</th>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">팬수</th>
                  <th className="px-3 py-2">오류</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border ${r._error ? 'bg-down/5' : ''}`}
                  >
                    <td className="px-3 py-2 text-dim">{i + 1}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2 font-bold">{r.rank}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-dim">{r.naver_id}</td>
                    <td className="px-3 py-2">{r.display_name}</td>
                    <td className="px-3 py-2 text-dim">{r.subscriber_count?.toLocaleString() ?? '-'}</td>
                    <td className="px-3 py-2 text-down">{r._error || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-bold">최근 스냅샷</p>
        </div>
        {snapshots.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-dim">아직 업로드된 데이터가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border">
            {snapshots.map((s) => (
              <li key={s.snapshot_date} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <span className="font-bold">{s.snapshot_date}</span>
                  <span className="text-xs text-dim ml-3">
                    {s.category_count}개 카테고리 · {s.total_count.toLocaleString()}명
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(s.snapshot_date)}
                  className="px-3 py-1 rounded-md text-xs bg-down/10 text-down hover:bg-down/20 transition cursor-pointer"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
