'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import type { DashboardApp, AppCategoryMeta, PlanTier } from '@/lib/dashboard-catalog';

const PLAN_RANK: Record<PlanTier, number> = { free: 0, blogger: 1, influencer: 2 };

function planLabel(plan: PlanTier): string {
  if (plan === 'influencer') return '인플루언서';
  if (plan === 'blogger') return '예비 인플루언서 +';
  return '';
}

function ctaForRequiredPlan(plan?: PlanTier): string {
  if (plan === 'influencer') return '인플루언서 플랜';
  if (plan === 'blogger') return '예비 인플루언서 + 플랜';
  return '무료플랜';
}

interface Props {
  app: DashboardApp;
  category: AppCategoryMeta;
  currentPlan: PlanTier;
  isLoggedIn: boolean;
  onClose: () => void;
}

export default function AppDetailModal({ app, category, currentPlan, isLoggedIn, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const locked =
    !!app.requiredPlan && PLAN_RANK[currentPlan] < PLAN_RANK[app.requiredPlan];
  const needsLogin = !!app.authOnly && !isLoggedIn;

  let targetHref = app.href;
  if (app.devPreview) {
    targetHref = '#';
  } else if (locked && app.requiredPlan) {
    targetHref = `/subscribe?highlight=${app.requiredPlan === 'influencer' ? 'influencer' : 'blogger'}`;
  } else if (needsLogin) {
    targetHref = `/auth/login?redirect=${encodeURIComponent(app.href)}`;
  }

  let buttonLabel: string;
  if (app.devPreview) {
    buttonLabel = '준비 중';
  } else if (locked && app.requiredPlan) {
    buttonLabel = `${planLabel(app.requiredPlan)} 플랜으로 잠금 해제`;
  } else if (needsLogin) {
    buttonLabel = '로그인하고 사용하기';
  } else {
    buttonLabel = app.ctaLabel || '사용하기';
  }

  const isExternal = !!app.external && !locked && !needsLogin && !app.devPreview;
  const planTagLabel = app.requiredPlan ? planLabel(app.requiredPlan) : '무료';
  const showPaidTag = !app.requiredPlan && !!app.paidNote;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-detail-title"
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-bg rounded-2xl border border-border shadow-xl w-full max-w-md p-6 lg:p-8"
        onClick={e => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-3 right-3 p-1.5 rounded-full text-dim hover:text-text hover:bg-surface transition-colors cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* 뱃지 */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-full ${category.badgeClass}`}>
            {category.tag}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold text-dim bg-surface border border-border rounded-full">
            {planTagLabel}
          </span>
          {showPaidTag && (
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold text-accent bg-accent/10 border border-accent/20 rounded-full">
              유료
            </span>
          )}
          {app.devPreview && (
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold text-dim bg-bg border border-border rounded-full">
              개발 중
            </span>
          )}
          {locked && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-bold text-accent bg-accent/10 border border-accent/20 rounded-full">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" ry="2" />
                <path d="M8 11V7a4 4 0 018 0v4" />
              </svg>
              잠금
            </span>
          )}
        </div>

        {/* 제목 + 설명 */}
        <h2 id="app-detail-title" className="font-title font-bold text-lg lg:text-xl text-text mb-2">
          {app.title}
        </h2>
        <p className={`text-sm text-dim leading-relaxed ${app.freeNote || app.paidNote ? 'mb-3' : 'mb-6'}`}>
          {app.description}
        </p>
        {(app.freeNote || app.paidNote) && (
          <div className="mb-6 space-y-1 text-xs">
            {app.freeNote && (
              <p className="text-accent font-semibold">{app.freeNote}</p>
            )}
            {app.paidNote && (
              <p className="text-text font-semibold">{app.paidNote}</p>
            )}
          </div>
        )}

        {/* CTA */}
        {app.devPreview ? (
          <button
            type="button"
            disabled
            className="w-full inline-flex items-center justify-center py-3 rounded-xl text-sm font-bold bg-surface text-dim border border-border cursor-not-allowed"
          >
            {buttonLabel}
          </button>
        ) : isExternal ? (
          <a
            href={targetHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className={`w-full inline-flex items-center justify-center py-3 rounded-xl text-sm font-bold transition-all ${category.buttonClass}`}
          >
            {buttonLabel}
          </a>
        ) : (
          <Link
            href={targetHref}
            onClick={onClose}
            className={`w-full inline-flex items-center justify-center py-3 rounded-xl text-sm font-bold transition-all ${category.buttonClass}`}
          >
            {buttonLabel}
          </Link>
        )}

        {/* 잠금/로그인 보조 안내 */}
        {!app.devPreview && (locked || needsLogin) && (
          <p className="mt-3 text-xs text-dim text-center">
            {locked && app.requiredPlan === 'influencer' && '인플루언서 플랜 구독이 필요합니다.'}
            {locked && app.requiredPlan === 'blogger' && '예비 인플루언서 + 플랜 구독이 필요합니다.'}
            {!locked && needsLogin && '로그인 후 이용할 수 있습니다.'}
          </p>
        )}

        {/* CTA 라벨로 통일된 플랜 표기 */}
        {!app.devPreview && !locked && !needsLogin && app.requiredPlan && (
          <p className="mt-3 text-xs text-dim text-center">
            {ctaForRequiredPlan(app.requiredPlan)} 이용 가능
          </p>
        )}
      </div>
    </div>
  );
}
