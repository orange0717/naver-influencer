'use client';

import { FAILURE_REASON_LABEL, type IndexedUrl, type IndexedUrlProgressStage } from '@/lib/google-indexing-types';

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
        {row.error_message && <p className="text-down">오류: {row.error_message}</p>}
      </div>

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
