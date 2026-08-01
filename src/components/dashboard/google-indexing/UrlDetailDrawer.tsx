'use client';

import { useState } from 'react';
import { FAILURE_REASON_LABEL, ERROR_CODE_LABEL, type IndexedUrl, type IndexedUrlProgressStage } from '@/lib/google-indexing-types';

interface CheckHistoryItem {
  id: string;
  checked_at: string;
  verdict: string | null;
  coverage_state: string | null;
  raw_response: unknown;
  api_call_success: boolean;
  error_message: string | null;
}

interface Props {
  row: IndexedUrl;
  onDiagnose: (id: string) => void;
  diagnosing: boolean;
}

const STAGES: { key: IndexedUrlProgressStage; label: string }[] = [
  { key: 'registering', label: '등록중' },
  { key: 'requesting', label: '구글요청중' },
  { key: 'checking', label: '색인확인중' },
  { key: 'done', label: '완료' },
];

const SUB_SCORE_LABEL: Record<string, string> = {
  length: '본문',
  headings: 'Heading',
  table: '표',
  image: '이미지',
  faq: 'FAQ',
  freshness: '최신성',
  keywordDensity: '키워드밀도',
  entity: '엔티티',
  internalLink: '내부링크',
  externalLink: '외부링크',
  sourceUsage: '출처활용',
  eeat: 'E-E-A-T',
};

function ProgressBar({ stage }: { stage: IndexedUrlProgressStage }) {
  const currentIdx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => (
        <div key={s.key} className="flex-1 flex items-center gap-1">
          <div
            className={`h-1.5 flex-1 rounded-full ${i <= currentIdx ? 'bg-accent' : 'bg-border'}`}
            title={s.label}
          />
        </div>
      ))}
    </div>
  );
}

export default function UrlDetailDrawer({ row, onDiagnose, diagnosing }: Props) {
  const canDiagnose = (row.status === 'not_indexed' || row.status === 'error') && !row.ai_diagnosis;
  const [checks, setChecks] = useState<CheckHistoryItem[] | null>(null);
  const [loadingChecks, setLoadingChecks] = useState(false);

  async function loadChecks() {
    if (checks) {
      setChecks(null); // 토글: 다시 누르면 접기
      return;
    }
    setLoadingChecks(true);
    try {
      const res = await fetch(`/api/google-indexing/urls/${row.id}/checks`);
      if (res.ok) {
        const data = await res.json();
        setChecks(data.checks);
      }
    } finally {
      setLoadingChecks(false);
    }
  }

  return (
    <div className="bg-bg rounded-lg p-4 mt-2 space-y-3">
      <div>
        <div className="flex justify-between text-[10px] text-dim mb-1">
          {STAGES.map((s) => (
            <span key={s.key}>{s.label}</span>
          ))}
        </div>
        <ProgressBar stage={row.progress_stage} />
      </div>

      <div className="text-xs text-dim space-y-1">
        <p>등록시간: {new Date(row.registered_at).toLocaleString('ko-KR')}</p>
        <p>마지막 확인: {row.last_checked_at ? new Date(row.last_checked_at).toLocaleString('ko-KR') : '아직 확인 전'}</p>
        {row.google_verdict && <p>구글 판정: {row.google_verdict}</p>}
        {row.google_coverage_state && <p>커버리지 상태: {row.google_coverage_state}</p>}
        {row.error_code && (
          <p className="text-down">
            오류코드: {ERROR_CODE_LABEL[row.error_code] || row.error_code}
            {row.http_status ? ` (HTTP ${row.http_status})` : ''}
            {' — '}
            {row.retryable ? '재시도 가능(자동/수동 재시도로 해결될 수 있어요)' : '조치 필요(사용자 설정 확인이 필요해요)'}
          </p>
        )}
        {row.error_message && <p className="text-down">오류 메시지: {row.error_message}</p>}
      </div>

      {(row.status === 'error' || row.status === 'not_indexed' || row.status === 'indexed') && (
        <div>
          <button
            type="button"
            onClick={loadChecks}
            disabled={loadingChecks}
            className="text-xs font-bold text-accent hover:underline disabled:opacity-50"
          >
            {loadingChecks ? '불러오는 중...' : checks ? 'Raw Response 접기' : 'Raw Response 보기'}
          </button>
          {checks && (
            <div className="mt-2 space-y-2">
              {checks.length === 0 && <p className="text-xs text-dim">확인 이력이 없어요.</p>}
              {checks.map((c) => (
                <div key={c.id} className="bg-surface border border-border rounded-lg p-2">
                  <p className="text-[10px] text-dim mb-1">
                    {new Date(c.checked_at).toLocaleString('ko-KR')} · {c.api_call_success ? '성공' : '실패'}
                  </p>
                  {c.error_message && <p className="text-[10px] text-down mb-1">{c.error_message}</p>}
                  <pre className="text-[10px] whitespace-pre-wrap break-all text-dim max-h-40 overflow-y-auto">
                    {JSON.stringify(c.raw_response ?? {}, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {row.seo_score !== null && row.seo_sub_scores && (
        <div>
          <p className="text-xs font-bold text-text mb-2">SEO 점수: {row.seo_score}점</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(row.seo_sub_scores)
              .filter(([, v]) => v !== null)
              .map(([key, value]) => (
                <div key={key} className="text-[10px]">
                  <div className="flex justify-between text-dim mb-0.5">
                    <span>{SUB_SCORE_LABEL[key] || key}</span>
                    <span>{value}</span>
                  </div>
                  <div className="h-1 bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full ${(value as number) >= 50 ? 'bg-up' : 'bg-down'}`}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {row.failure_reason_code && !row.ai_diagnosis && (
        <p className="text-xs text-down">추정 원인: {FAILURE_REASON_LABEL[row.failure_reason_code] || row.failure_reason_code}</p>
      )}

      {row.ai_diagnosis && (
        <div className="bg-surface border border-border rounded-lg p-3">
          <p className="text-xs font-bold text-text mb-1">AI 진단</p>
          <p className="text-xs text-dim whitespace-pre-wrap">{row.ai_diagnosis}</p>
        </div>
      )}

      {canDiagnose && (
        <button
          type="button"
          onClick={() => onDiagnose(row.id)}
          disabled={diagnosing}
          className="text-xs font-bold text-accent hover:underline disabled:opacity-50"
        >
          {diagnosing ? '진단 중...' : 'AI 실패원인 진단하기'}
        </button>
      )}
    </div>
  );
}
