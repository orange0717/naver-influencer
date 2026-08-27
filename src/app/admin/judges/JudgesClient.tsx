'use client';

import { useCallback, useEffect, useState } from 'react';
import { controlBoxClass } from '@/components/analytics/controls';
import { formatDateTimeShort } from '@/lib/format';

interface Judge {
  id: string;
  displayName: string;
  email: string;
  active: boolean;
  expired: boolean;
  expiresAt: string;
  issuedAt: string;
  deactivatedAt: string | null;
  lastVerifiedAt: string | null;
  lastLoginAt: string | null;
}

interface IssuedCredential {
  displayName: string;
  email: string;
  credential: string | null;
  magicLinkUrl: string | null;
  expiresAt: string;
  blogId: string | null;
  influencerLinked: boolean;
  influencerNote: string | null;
}

interface RouteResult {
  group: string;
  path: string;
  status: number | null;
  result: 'allow' | 'deny' | 'error';
  redirectedTo: string | null;
  note: string | null;
}

interface VerifyReport {
  judge: Judge;
  loginOk: boolean;
  loginNote: string | null;
  checkedAt: string;
  routes: RouteResult[];
}

/** 결과 라벨 — 색만으로 구분하지 않도록 텍스트를 항상 함께 낸다 */
const RESULT_LABEL: Record<RouteResult['result'], { text: string; className: string }> = {
  allow: { text: '접근 가능', className: 'text-accent' },
  deny: { text: '접근 차단', className: 'text-dim' },
  error: { text: '오류', className: 'text-red-500' },
};

function statusText(j: Judge): string {
  if (j.expired) return '만료';
  return j.active ? '활성' : '비활성';
}

/** 목록 행 높이 — 스켈레톤이 실제 행과 같은 높이를 갖도록 한 곳에서 관리 */
const ROW_HEIGHT = 'h-[52px]';

export default function JudgesClient() {
  const [judges, setJudges] = useState<Judge[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [issueOpen, setIssueOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);

  const fetchJudges = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const res = await fetch('/api/admin/judges', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setListError(data?.error?.message || '목록을 불러오지 못했습니다.');
        setJudges([]);
      } else {
        setJudges(data.judges || []);
      }
    } catch {
      setListError('목록을 불러오지 못했습니다.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchJudges(); }, [fetchJudges]);

  const toggleActive = async (judge: Judge) => {
    const next = !judge.active;
    if (!next && !confirm(`"${judge.displayName}" 계정을 즉시 비활성화합니다.\n진행 중인 세션도 함께 끊깁니다.\n계속하시겠습니까?`)) return;

    const res = await fetch(`/api/admin/judges/${judge.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error?.message || '상태 변경에 실패했습니다.');
      return;
    }
    fetchJudges();
  };

  const runVerify = async (judge: Judge) => {
    setVerifying(judge.id);
    setReport(null);
    try {
      const res = await fetch(`/api/admin/judges/${judge.id}/verify`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error?.message || '점검에 실패했습니다.');
      } else {
        setReport({ judge, ...data });
        fetchJudges();
      }
    } catch {
      alert('점검에 실패했습니다.');
    }
    setVerifying(null);
  };

  return (
    // 데스크톱 전용 화면 — 모바일 최적화하지 않는다.
    <div className="space-y-6 min-w-[900px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-page-title">심사위원 계정</h1>
          <p className="text-xs text-dim mt-1">
            외부 심사위원용 한시 계정. 인플루언서 플랜이 심사 종료일까지 부여되며 관리자 권한은 포함되지 않는다.
          </p>
        </div>
        <button
          onClick={() => setIssueOpen(true)}
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 transition"
        >
          계정 발급
        </button>
      </div>

      {listError && (
        <div className="bg-surface border border-border rounded-lg p-4 text-sm text-red-500">{listError}</div>
      )}

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-dim text-xs">
              <th className="text-left font-semibold px-4 py-3">표시명</th>
              <th className="text-left font-semibold px-4 py-3">로그인 식별자</th>
              <th className="text-left font-semibold px-4 py-3">상태</th>
              <th className="text-left font-semibold px-4 py-3">최근 로그인</th>
              <th className="text-left font-semibold px-4 py-3">발급일</th>
              <th className="text-left font-semibold px-4 py-3">만료</th>
              <th className="text-right font-semibold px-4 py-3">작업</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className={`border-b border-border ${ROW_HEIGHT}`}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4">
                      <div className="h-3 rounded bg-border/60 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && judges.length === 0 && (
              <tr className={ROW_HEIGHT}>
                <td colSpan={7} className="px-4 text-center text-dim text-sm">
                  발급된 심사위원 계정이 없습니다.
                </td>
              </tr>
            )}

            {!loading &&
              judges.map(judge => (
                <tr key={judge.id} className={`border-b border-border last:border-0 ${ROW_HEIGHT}`}>
                  <td className="px-4 font-semibold">{judge.displayName}</td>
                  <td className="px-4 text-dim">{judge.email}</td>
                  <td className="px-4">
                    <span
                      className={`text-xs font-bold ${
                        judge.expired ? 'text-dim' : judge.active ? 'text-accent' : 'text-red-500'
                      }`}
                    >
                      {statusText(judge)}
                    </span>
                  </td>
                  <td className="px-4 text-dim text-xs">
                    {judge.lastLoginAt ? formatDateTimeShort(judge.lastLoginAt) : '기록 없음'}
                  </td>
                  <td className="px-4 text-dim text-xs">{formatDateTimeShort(judge.issuedAt)}</td>
                  <td className="px-4 text-dim text-xs">{formatDateTimeShort(judge.expiresAt)}</td>
                  <td className="px-4 text-right whitespace-nowrap">
                    <button
                      onClick={() => runVerify(judge)}
                      disabled={verifying === judge.id}
                      className="px-2.5 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-surface-hover transition disabled:opacity-50"
                    >
                      {verifying === judge.id ? '점검 중...' : '접근 점검'}
                    </button>
                    <button
                      onClick={() => toggleActive(judge)}
                      disabled={judge.expired}
                      className="ml-2 px-2.5 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-surface-hover transition disabled:opacity-40"
                    >
                      {judge.active ? '비활성화' : '활성화'}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {issueOpen && (
        <IssueModal
          onClose={() => setIssueOpen(false)}
          onIssued={cred => {
            setIssued(cred);
            setIssueOpen(false);
            fetchJudges();
          }}
        />
      )}

      {issued && <CredentialModal issued={issued} onClose={() => setIssued(null)} />}

      {report && <VerifyModal report={report} onClose={() => setReport(null)} />}
    </div>
  );
}

/* ── 발급 폼 (모달 — 페이지 이동 없음) ───────────────────────── */

function IssueModal({
  onClose,
  onIssued,
}: {
  onClose: () => void;
  onIssued: (cred: IssuedCredential) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [blogId, setBlogId] = useState('');
  const [influencerNaverId, setInfluencerNaverId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');

    const res = await fetch('/api/admin/judges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: displayName.trim(),
        email: email.trim(),
        // datetime-local 은 타임존이 없는 로컬 시각 — ISO 로 변환해 보낸다
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
        blogId: blogId.trim(),
        influencerNaverId: influencerNaverId.trim(),
      }),
    });
    const data = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok) {
      setError(data?.error?.message || '발급에 실패했습니다.');
      return;
    }
    onIssued(data);
  };

  return (
    <ModalShell title="심사위원 계정 발급" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-dim mb-1.5">표시명</label>
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="예: 심사위원 A"
            required
            className={controlBoxClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-dim mb-1.5">이메일 (로그인 식별자)</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="judge@example.com"
            required
            className={controlBoxClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-dim mb-1.5">심사 종료일 (자동 비활성화 시점)</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            required
            className={controlBoxClass}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-dim mb-1.5">
            블로그 주소 (선택) — 심사위원이 볼 시연용 블로그
          </label>
          <input
            value={blogId}
            onChange={e => setBlogId(e.target.value)}
            placeholder="orangelibrary_"
            className={controlBoxClass}
          />
          <p className="text-[11px] text-dim mt-1">
            blog.naver.com/<b>여기</b> 부분. 비우면 심사위원 화면이 빈 상태로 보입니다.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-dim mb-1.5">
            인플루언서홈 주소 (선택)
          </label>
          <input
            value={influencerNaverId}
            onChange={e => setInfluencerNaverId(e.target.value)}
            placeholder="orangelibrary"
            className={controlBoxClass}
          />
          <p className="text-[11px] text-dim mt-1">
            in.naver.com/<b>여기</b> 부분. 이미 다른 계정에 연결된 인플루언서면 연결하지 않고
            그 사실을 알려줍니다(기존 계정의 연결은 건드리지 않습니다).
          </p>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-surface-hover transition">
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? '발급 중...' : '발급'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ── 발급 결과 (자격증명 1회 노출) ───────────────────────────── */

function CredentialModal({ issued, onClose }: { issued: IssuedCredential; onClose: () => void }) {
  const [copied, setCopied] = useState('');

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('실패');
    }
  };

  const block = `아이디(이메일): ${issued.email}\n비밀번호: ${issued.credential ?? ''}\n이용 기한: ${formatDateTimeShort(issued.expiresAt)}`;

  return (
    <ModalShell title="발급 완료" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-bg p-4 space-y-2 text-sm">
          <Row label="표시명" value={issued.displayName} />
          <Row label="아이디(이메일)" value={issued.email} />
          {issued.credential && <Row label="비밀번호" value={issued.credential} mono />}
          {issued.magicLinkUrl && <Row label="접속 링크" value={issued.magicLinkUrl} mono />}
          <Row label="이용 기한" value={formatDateTimeShort(issued.expiresAt)} />
          <Row label="연결된 블로그" value={issued.blogId || '없음'} />
          <Row
            label="인플루언서홈"
            value={issued.influencerLinked ? '연결됨' : issued.influencerNote || '연결 안 함'}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => copy('전체', block)}
            className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 transition"
          >
            {copied === '전체' ? '복사됨' : '발급 정보 복사'}
          </button>
          <p className="text-xs text-red-500 font-semibold">
            이 비밀번호는 지금 화면에서만 볼 수 있습니다. 창을 닫으면 다시 확인할 수 없습니다.
          </p>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-surface-hover transition">
            닫기
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-xs font-semibold text-dim pt-0.5">{label}</span>
      <span className={`flex-1 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

/* ── 점검 결과 ───────────────────────────────────────────────── */

function VerifyModal({ report, onClose }: { report: VerifyReport; onClose: () => void }) {
  const counts = report.routes.reduce<Record<string, number>>((acc, r) => {
    acc[r.result] = (acc[r.result] || 0) + 1;
    return acc;
  }, {});

  return (
    <ModalShell title={`접근 점검 — ${report.judge.displayName}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-bg p-4 text-sm space-y-1">
          <div>
            <span className="text-xs font-semibold text-dim mr-3">로그인</span>
            <span className={report.loginOk ? 'text-accent font-bold' : 'text-red-500 font-bold'}>
              {report.loginOk ? '세션 생성 성공' : '세션 생성 실패'}
            </span>
            {report.loginNote && <span className="text-xs text-dim ml-2">{report.loginNote}</span>}
          </div>
          <div className="text-xs text-dim">점검 시각 {formatDateTimeShort(report.checkedAt)}</div>
          <div className="text-xs text-dim">
            접근 가능 {counts.allow || 0} · 접근 차단 {counts.deny || 0} · 오류 {counts.error || 0}
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden max-h-[55vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border text-dim text-xs">
                <th className="text-left font-semibold px-4 py-2.5">그룹</th>
                <th className="text-left font-semibold px-4 py-2.5">경로</th>
                <th className="text-left font-semibold px-4 py-2.5">상태코드</th>
                <th className="text-left font-semibold px-4 py-2.5">결과</th>
                <th className="text-left font-semibold px-4 py-2.5">비고</th>
              </tr>
            </thead>
            <tbody>
              {report.routes.map(r => {
                const label = RESULT_LABEL[r.result];
                return (
                  <tr key={r.path} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-xs text-dim">{r.group}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.path}</td>
                    <td className="px-4 py-2.5 text-xs">{r.status ?? '—'}</td>
                    <td className={`px-4 py-2.5 text-xs font-bold ${label.className}`}>{label.text}</td>
                    <td className="px-4 py-2.5 text-xs text-dim break-all">
                      {r.redirectedTo ? `→ ${r.redirectedTo}` : r.note || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-surface-hover transition">
            닫기
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ── 공용 모달 셸 ────────────────────────────────────────────── */

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className={`bg-surface border border-border rounded-xl p-6 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-bold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}
