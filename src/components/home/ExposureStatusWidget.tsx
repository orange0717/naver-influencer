'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import GlassCard from '@/components/dashboard/GlassCard';
import { MISSING_POSTS_RECENT_LIMIT } from '@/lib/plans';

/**
 * 대시보드 노출 현황 위젯 — 아래 포스팅 표와 데이터를 공유하지 않는다(2026-09-04 오렌지 지시 R3).
 *
 * 표의 개수 필터·페이지네이션·누락 필터 어느 것도 이 숫자를 움직이지 않는다. 전용 엔드포인트
 * (/api/my/exposure-recent)가 서버에서 최근 10개만 조회해 내려보내며, 화면에서 자르지 않는다.
 * 예전 카드는 표의 allBlogPosts 배열을 잘라 쓰고 있어서, 표의 '개수' 탭을 누르면 무관해 보이는
 * 누락율 숫자가 같이 바뀌었다.
 */

type ExposureRecent = {
  limit: number;
  posts: { id: string; title: string; exposureClass: string; checkedAt: string | null }[];
  summary: {
    total: number;
    checked: number;
    missing: number;
    missingRate: number;
    indexingWait: number;
    lastCheckedAt: string | null;
  };
};

const EYE_OFF = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
);
const WARN = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);

async function fetchExposureRecent(blogId: string): Promise<ExposureRecent> {
  const res = await fetch(`/api/my/exposure-recent?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // 원인과 다음 행동이 없는 "오류가 발생했습니다"는 쓰지 않는다 — 사용자가 할 수 있는 일이 사라진다.
    const reason =
      res.status === 429 ? '네이버가 잠시 요청을 제한했습니다. 1~2분 뒤 새로고침해 주세요.'
      : res.status === 502 ? '네이버에서 글 목록을 받지 못했습니다. 블로그가 비공개는 아닌지 확인한 뒤 새로고침해 주세요.'
      : res.status === 403 ? '이 블로그의 노출 현황을 볼 권한이 없습니다. 연결된 블로그가 맞는지 확인해 주세요.'
      : (body as { error?: string }).error || '노출 현황을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.';
    throw new Error(reason);
  }
  return res.json();
}

function StatBox({ icon, title, desc, value, tone }: {
  icon: React.ReactNode; title: string; desc: string; value: string; tone: 'dim' | 'up' | 'down' | 'accent';
}) {
  const valueColor = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'accent' ? 'text-accent' : 'text-dim';
  return (
    <div className="flex flex-col bg-surface rounded-lg border border-border p-4">
      <div className="w-8 h-8 rounded-full bg-sunken text-down flex items-center justify-center shrink-0">{icon}</div>
      <p className="stat-title mt-3">{title}</p>
      <p className="stat-desc line-clamp-2 mt-0.5">{desc}</p>
      <span className={`stat-value font-rank mt-2 ${valueColor}`}>{value}</span>
    </div>
  );
}

export default function ExposureStatusWidget({ blogId }: { blogId?: string | null }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    // 표(BlogAnalysisSection)와 캐시를 나눠 갖는다 — 키를 공유하면 한쪽 필터가 다른 쪽을 다시 그린다.
    queryKey: ['exposure-recent', blogId],
    queryFn: () => fetchExposureRecent(blogId!),
    enabled: !!blogId,
    staleTime: 60 * 1000,
  });

  if (!blogId) return null;

  const header = (
    <div className="px-5 py-4 border-b border-border bg-bg/30 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2.5 flex-wrap">
        <h3 className="font-bold text-[15px]">노출 현황</h3>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-dim bg-border/30">
          최근 {MISSING_POSTS_RECENT_LIMIT}개 글 기준
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-3 py-1.5 border border-border text-dim font-semibold rounded-lg hover:bg-surface-hover transition cursor-pointer text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isFetching ? '불러오는 중' : '새로고침'}
        </button>
        <Link href="/my/missing-posts" className="text-[11px] font-bold text-accent hover:underline">
          자세히 보기 →
        </Link>
      </div>
    </div>
  );

  let body: React.ReactNode;

  if (isLoading) {
    body = (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1].map(i => (
          <div key={i} className="h-[132px] rounded-lg border border-border bg-surface animate-pulse" />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-down font-semibold">노출 현황을 불러오지 못했습니다</p>
        <p className="text-xs text-dim max-w-md mx-auto">{(error as Error).message}</p>
        <button onClick={() => refetch()} className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer text-xs">
          다시 시도
        </button>
      </div>
    );
  } else if (!data || data.summary.total === 0) {
    body = (
      <div className="py-8 text-center space-y-1.5">
        <p className="text-sm font-semibold">아직 발행한 글이 없습니다</p>
        <p className="text-xs text-dim">글을 발행하면 최근 {MISSING_POSTS_RECENT_LIMIT}개를 기준으로 노출 여부를 보여드립니다.</p>
      </div>
    );
  } else {
    const s = data.summary;
    const unchecked = s.total - s.checked;
    body = (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatBox
            icon={EYE_OFF}
            title="미노출"
            desc={s.checked === 0 ? '아직 검사한 글이 없습니다' : `${s.checked}개 확인 중`}
            value={s.checked === 0 ? '—' : `${s.missing}개`}
            tone={s.checked === 0 ? 'dim' : s.missing === 0 ? 'up' : 'down'}
          />
          <StatBox
            icon={WARN}
            title="누락율"
            desc={s.checked === 0 ? '노출 현황에서 검사하면 표시됩니다' : `${s.checked}개 중 ${s.missing}개 누락`}
            value={s.checked === 0 ? '—' : `${s.missingRate}%`}
            tone={s.checked === 0 ? 'dim' : s.missingRate <= 30 ? 'up' : s.missingRate <= 60 ? 'accent' : 'down'}
          />
        </div>
        <p className="text-[11px] text-dim px-1">
          최근 {s.total}개 글 중 {s.checked}개 검사 완료
          {unchecked > 0 ? ` · 미검사 ${unchecked}개` : ''}
          {s.indexingWait > 0 ? ` · 색인 대기 ${s.indexingWait}개` : ''}
          {s.lastCheckedAt ? ` · 마지막 검사 ${new Date(s.lastCheckedAt).toLocaleDateString('ko-KR')}` : ''}
        </p>
      </div>
    );
  }

  return (
    <GlassCard padding="none">
      {header}
      <div className="p-5">{body}</div>
    </GlassCard>
  );
}
