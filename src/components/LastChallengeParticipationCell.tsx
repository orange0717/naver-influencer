'use client';

export interface LastChallengeParticipationFields {
  lastChallengedAt?: string | null;
  lastCrawledAt?: string | null;
  isInactive?: boolean;
}

function formatKoDate(d: string | null | undefined): string {
  if (!d) return '—';
  const isDateOnly = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const date = isDateOnly ? new Date(`${d}T00:00:00+09:00`) : new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
}

/** 네이버 챌린지 참여일 우선, 없으면 순위 수집일(보조) */
export function LastChallengeParticipationCell({ inf }: { inf: LastChallengeParticipationFields }) {
  if (inf.isInactive) {
    return <span className="text-down/70">활동하지 않음</span>;
  }
  if (inf.lastChallengedAt) {
    return <span>{formatKoDate(inf.lastChallengedAt)}</span>;
  }
  if (inf.lastCrawledAt) {
    return (
      <span
        className="text-dim"
        title="네이버 챌린지 참여 시각을 아직 받지 못했습니다. 순위 크롤이 성공하면 챌린지 수·TOP3가 함께 채워집니다."
      >
        수집 {formatKoDate(inf.lastCrawledAt)}
      </span>
    );
  }
  return <span className="text-dim">—</span>;
}
