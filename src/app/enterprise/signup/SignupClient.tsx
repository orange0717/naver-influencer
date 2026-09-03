'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { COMPANY_TYPES, buildInquiryMailto, type CompanyType } from '@/lib/enterprise-inquiry';
import { CONTACT_EMAIL } from '@/lib/site-contact';
import {
  MIN_SEATS,
  PLANS,
  PLAN_FEATURES,
  PLAN_LABEL,
  calcPrice,
  formatKRW,
  invitableSeats,
  isPlanId,
  type PlanId,
} from '@/lib/pricing';

const DRAFT_KEY = 'ninfle:org-signup-draft';

const INPUT_CLASS =
  'w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30';

const STEP_LABELS = ['요금제', '이용 인원', '기업 정보', '멤버 초대', '확인 · 결제'];

type Draft = {
  planId: PlanId | '';
  seatCount: number;
  companyName: string;
  bizRegNo: string;
  ceoName: string;
  industry: CompanyType | '';
  managerName: string;
  managerPhone: string;
  managerEmail: string;
  taxInvoiceEmail: string;
  memberEmails: string[];
};

const EMPTY_DRAFT: Draft = {
  planId: '',
  seatCount: 2,
  companyName: '',
  bizRegNo: '',
  ceoName: '',
  industry: '',
  managerName: '',
  managerPhone: '',
  managerEmail: '',
  taxInvoiceEmail: '',
  memberEmails: [''],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function loadDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return EMPTY_DRAFT;
  }
}

function RequiredMark() {
  return <span className="ml-0.5 text-down">*</span>;
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={`field-${id}`}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-text">
        {label}
        <RequiredMark />
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-dim">{hint}</p>}
      {error && <p className="mt-1 text-xs text-down">{error}</p>}
    </div>
  );
}

export default function SignupClient() {
  const router = useRouter();
  const { user, isLoading, isError } = useAuth();

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    setDraft(loadDraft());
    setRestored(true);
  }, []);

  // 새로고침·결제창 이탈로 입력이 날아가지 않도록 단계마다 보존한다(탭을 닫으면 사라진다).
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // 시크릿 모드 등 저장 불가 환경 — 보존만 못 할 뿐 가입은 계속 진행할 수 있다.
    }
  }, [draft, restored]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  };

  /**
   * 초대 입력칸 수는 항상 (좌석 수 - 1). 대표가 좌석 하나를 쓴다.
   * 다음 값을 렌더 시점의 seatCount 가 아니라 이전 상태에서 계산한다 —
   * 그러지 않으면 +/- 를 연타했을 때 같은 값에서 계산해 증가분이 유실된다.
   */
  const updateSeats = (compute: (prev: number) => number) => {
    setDraft((prev) => {
      const count = Math.max(MIN_SEATS, Math.floor(compute(prev.seatCount)) || MIN_SEATS);
      const slots = count - 1;
      const emails = prev.memberEmails.slice(0, slots);
      while (emails.length < slots) emails.push('');
      return { ...prev, seatCount: count, memberEmails: emails };
    });
    setErrors((prev) => ({ ...prev, seatCount: '', memberEmails: '' }));
  };

  const amount = useMemo(() => {
    if (!isPlanId(draft.planId)) return 0;
    try {
      return calcPrice(draft.planId, draft.seatCount);
    } catch {
      return 0;
    }
  }, [draft.planId, draft.seatCount]);

  const validateStep = (target: number): Record<string, string> => {
    const next: Record<string, string> = {};
    if (target === 1 && !isPlanId(draft.planId)) next.planId = '요금제를 선택해주세요.';

    if (target === 2 && (!Number.isInteger(draft.seatCount) || draft.seatCount < MIN_SEATS)) {
      next.seatCount = `이용 인원은 ${MIN_SEATS}명 이상이어야 합니다.`;
    }

    if (target === 3) {
      if (!draft.companyName.trim()) next.companyName = '회사명을 입력해주세요.';
      if (!/^[0-9]{10}$/.test(draft.bizRegNo.replace(/[^0-9]/g, '')))
        next.bizRegNo = '사업자등록번호 10자리를 입력해주세요.';
      if (!draft.ceoName.trim()) next.ceoName = '대표자명을 입력해주세요.';
      if (!draft.industry) next.industry = '업종을 선택해주세요.';
      if (!draft.managerName.trim()) next.managerName = '담당자명을 입력해주세요.';
      if (!/^\+?[0-9]{9,15}$/.test(draft.managerPhone.replace(/[^0-9+]/g, '')))
        next.managerPhone = '숫자 9~15자리의 연락 가능한 번호를 입력해주세요.';
      if (!EMAIL_RE.test(draft.managerEmail.trim())) next.managerEmail = '담당자 이메일 형식을 확인해주세요.';
      if (!EMAIL_RE.test(draft.taxInvoiceEmail.trim()))
        next.taxInvoiceEmail = '세금계산서 이메일 형식을 확인해주세요.';
    }

    if (target === 4) {
      const filled = draft.memberEmails.map((v) => v.trim().toLowerCase());
      if (filled.some((v) => !EMAIL_RE.test(v))) {
        next.memberEmails = '초대할 멤버 이메일을 모두 올바르게 입력해주세요.';
      } else if (new Set(filled).size !== filled.length) {
        next.memberEmails = '같은 이메일을 두 번 초대할 수 없습니다.';
      } else if (user.email && filled.includes(user.email.toLowerCase())) {
        next.memberEmails = '대표 계정은 이미 좌석을 사용하므로 초대 목록에서 빼주세요.';
      }
    }

    return next;
  };

  const goNext = () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`field-${Object.keys(found)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setStep((s) => Math.min(STEP_LABELS.length, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goPrev = () => {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    setSubmitError('');

    // 마지막 단계에서 앞 단계 값이 비어 있으면 그 단계로 되돌린다.
    for (const target of [1, 2, 3, 4]) {
      const found = validateStep(target);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        setStep(target);
        return;
      }
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);

    try {
      const { createSupabaseBrowserClient } = await import('@/lib/supabase-browser');
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;

      const res = await fetch('/api/org/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          planId: draft.planId,
          seatCount: draft.seatCount,
          amount,
          companyName: draft.companyName,
          bizRegNo: draft.bizRegNo,
          ceoName: draft.ceoName,
          industry: draft.industry,
          managerName: draft.managerName,
          managerPhone: draft.managerPhone,
          managerEmail: draft.managerEmail,
          taxInvoiceEmail: draft.taxInvoiceEmail,
          memberEmails: draft.memberEmails.map((v) => v.trim().toLowerCase()),
          agreeTos: true,
          agreePrivacy: true,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body?.error?.message || '가입 신청에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      router.push(`/enterprise/checkout?order=${encodeURIComponent(body.orderId)}`);
    } catch {
      setSubmitError('네트워크 오류로 신청하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (isLoading || !restored) {
    return (
      <div className="bg-bg px-4 py-24 text-center text-sm text-dim md:py-32">불러오는 중…</div>
    );
  }

  // 백엔드 일시 장애를 "비회원"으로 확정해 로그인 화면으로 튕기지 않는다.
  if (isError) {
    return (
      <div className="bg-bg px-4 py-24 md:py-32">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="font-title mb-3 text-lg text-text">잠시 후 다시 시도해주세요</h1>
          <p className="text-sm leading-relaxed text-text-2">
            로그인 상태를 확인하지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침해주세요.
          </p>
        </div>
      </div>
    );
  }

  if (!user.id) {
    return (
      <div className="bg-bg px-4 py-24 md:py-32">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="font-title mb-3 text-lg text-text">로그인이 필요합니다</h1>
          <p className="mb-6 text-sm leading-relaxed text-text-2">
            기업 계정을 만들려면 먼저 로그인해주세요. 로그인한 계정이 기업의 대표 계정이 됩니다.
          </p>
          <Link
            href={`/auth/login?redirect=${encodeURIComponent('/enterprise/signup')}`}
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            로그인하러 가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg px-4 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <span className="font-title text-xs font-semibold tracking-[0.18em] text-accent">FOR BUSINESS</span>
          <h1 className="font-editorial mt-3 text-2xl leading-tight text-text md:text-3xl">기업용 가입</h1>
          <p className="mt-3 text-sm leading-relaxed text-text-2">
            좌석 수만큼 팀원을 초대해 함께 이용합니다. 결제가 완료되면 초대 메일이 발송됩니다.
          </p>
        </div>

        {/* ── 단계 표시 ── */}
        <ol className="mb-8 flex items-center justify-between gap-1">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <li key={label} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                    active
                      ? 'bg-accent text-white'
                      : done
                        ? 'bg-accent/15 text-accent'
                        : 'bg-surface text-dim ring-1 ring-border'
                  }`}
                >
                  {n}
                </span>
                <span className={`text-center text-[11px] ${active ? 'font-bold text-text' : 'text-dim'}`}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
          {/* ── S1 요금제 ── */}
          {step === 1 && (
            <div id="field-planId">
              <h2 className="font-title mb-1 text-lg text-text">요금제를 선택해주세요</h2>
              <p className="mb-5 text-xs text-dim">좌석 1개당 월 요금이며 VAT가 포함된 금액입니다.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(PLANS) as PlanId[]).map((id) => {
                  const selected = draft.planId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => set('planId', id)}
                      aria-pressed={selected}
                      className={`rounded-xl border p-5 text-left transition ${
                        selected
                          ? 'border-accent bg-accent/5 ring-1 ring-accent/30'
                          : 'border-border bg-bg hover:border-accent/40'
                      }`}
                    >
                      <p className="font-title text-sm font-bold text-text">{PLAN_LABEL[id]}</p>
                      <p className="mt-1.5 text-lg font-bold text-accent">
                        {formatKRW(PLANS[id].seatPrice)}
                        <span className="ml-1 text-xs font-normal text-dim">/ 좌석 · 월</span>
                      </p>
                      <ul className="mt-3 space-y-1">
                        {PLAN_FEATURES[id].map((f) => (
                          <li key={f} className="text-xs leading-relaxed text-text-2">
                            · {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
              {errors.planId && <p className="mt-3 text-xs text-down">{errors.planId}</p>}
            </div>
          )}

          {/* ── S2 이용 인원 ── */}
          {step === 2 && (
            <div id="field-seatCount">
              <h2 className="font-title mb-1 text-lg text-text">몇 명이 이용하나요?</h2>
              <p className="mb-5 text-xs text-dim">
                대표 계정({user.email})도 좌석 하나를 사용합니다. 인원 상한은 없습니다.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => updateSeats((n) => n - 1)}
                  disabled={draft.seatCount <= MIN_SEATS}
                  aria-label="인원 줄이기"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-bg text-lg text-text transition hover:border-accent/40 disabled:opacity-40"
                >
                  −
                </button>
                <input
                  id="seatCount"
                  type="number"
                  inputMode="numeric"
                  min={MIN_SEATS}
                  value={draft.seatCount}
                  onChange={(e) => updateSeats(() => Number(e.target.value))}
                  className="w-28 rounded-xl border border-border bg-bg px-4 py-3 text-center text-lg font-bold text-text tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => updateSeats((n) => n + 1)}
                  aria-label="인원 늘리기"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-bg text-lg text-text transition hover:border-accent/40"
                >
                  +
                </button>
              </div>
              {errors.seatCount && <p className="mt-3 text-center text-xs text-down">{errors.seatCount}</p>}

              <div className="mt-6 rounded-xl border border-border bg-bg p-5 text-center">
                <p className="text-xs text-dim tabular-nums">
                  {PLAN_LABEL[draft.planId as PlanId]} · {formatKRW(PLANS[draft.planId as PlanId]?.seatPrice ?? 0)} ×{' '}
                  {draft.seatCount}좌석
                </p>
                <p className="mt-1.5 text-2xl font-bold text-accent tabular-nums">{formatKRW(amount)}</p>
                <p className="mt-1 text-xs text-dim">월 결제 · VAT 포함</p>
                <p className="mt-2.5 border-t border-border pt-2.5 text-xs text-text-2 tabular-nums">
                  초대 가능 인원 {invitableSeats(draft.seatCount)}명
                </p>
              </div>
            </div>
          )}

          {/* ── S3 기업 정보 ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-title mb-1 text-lg text-text">기업 정보를 입력해주세요</h2>
                <p className="text-xs text-dim">세금계산서 발행에 사용되므로 사업자등록증과 동일하게 입력해주세요.</p>
              </div>

              <Field id="companyName" label="회사명" error={errors.companyName}>
                <input
                  id="companyName"
                  value={draft.companyName}
                  onChange={(e) => set('companyName', e.target.value)}
                  placeholder="(주)엔인플"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field id="bizRegNo" label="사업자등록번호" error={errors.bizRegNo} hint="숫자 10자리 (- 없이 입력해도 됩니다)">
                <input
                  id="bizRegNo"
                  inputMode="numeric"
                  value={draft.bizRegNo}
                  onChange={(e) => set('bizRegNo', e.target.value)}
                  placeholder="1234567890"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field id="ceoName" label="대표자명" error={errors.ceoName}>
                <input
                  id="ceoName"
                  value={draft.ceoName}
                  onChange={(e) => set('ceoName', e.target.value)}
                  className={INPUT_CLASS}
                />
              </Field>

              <Field id="industry" label="업종" error={errors.industry}>
                <select
                  id="industry"
                  value={draft.industry}
                  onChange={(e) => set('industry', e.target.value as CompanyType)}
                  className={INPUT_CLASS}
                >
                  <option value="">선택해주세요</option>
                  {COMPANY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="border-t border-border pt-5">
                <p className="mb-4 text-sm font-bold text-text">담당자</p>
                <div className="space-y-5">
                  <Field id="managerName" label="담당자명" error={errors.managerName}>
                    <input
                      id="managerName"
                      value={draft.managerName}
                      onChange={(e) => set('managerName', e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field id="managerPhone" label="담당자 연락처" error={errors.managerPhone}>
                    <input
                      id="managerPhone"
                      inputMode="tel"
                      value={draft.managerPhone}
                      onChange={(e) => set('managerPhone', e.target.value)}
                      placeholder="010-1234-5678"
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field id="managerEmail" label="담당자 이메일" error={errors.managerEmail}>
                    <input
                      id="managerEmail"
                      type="email"
                      value={draft.managerEmail}
                      onChange={(e) => set('managerEmail', e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </Field>

                  <Field
                    id="taxInvoiceEmail"
                    label="세금계산서 이메일"
                    error={errors.taxInvoiceEmail}
                    hint="담당자 이메일과 달라도 됩니다."
                  >
                    <input
                      id="taxInvoiceEmail"
                      type="email"
                      value={draft.taxInvoiceEmail}
                      onChange={(e) => set('taxInvoiceEmail', e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* ── S4 멤버 초대 ── */}
          {step === 4 && (
            <div id="field-memberEmails">
              <h2 className="font-title mb-1 text-lg text-text">함께 이용할 멤버를 입력해주세요</h2>
              <p className="mb-5 text-xs leading-relaxed text-dim">
                대표 계정을 뺀 {draft.seatCount - 1}개 좌석의 이메일을 모두 입력해주세요. 초대 메일은{' '}
                <b className="text-text-2">결제가 완료된 뒤</b> 발송되며 7일 안에 수락해야 합니다.
              </p>

              {draft.memberEmails.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-bg p-5 text-center text-sm text-text-2">
                  1좌석으로 가입하셔서 초대할 멤버가 없습니다. 다음 단계로 진행해주세요.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {draft.memberEmails.map((value, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-12 shrink-0 text-xs text-dim">{i + 2}번째</span>
                      <input
                        type="email"
                        value={value}
                        onChange={(e) => {
                          const next = [...draft.memberEmails];
                          next[i] = e.target.value;
                          set('memberEmails', next);
                        }}
                        placeholder="member@company.co.kr"
                        className={INPUT_CLASS}
                      />
                    </div>
                  ))}
                </div>
              )}
              {errors.memberEmails && <p className="mt-3 text-xs text-down">{errors.memberEmails}</p>}
            </div>
          )}

          {/* ── S5 확인 · 결제 ── */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h2 className="font-title mb-1 text-lg text-text">입력하신 내용을 확인해주세요</h2>
                <p className="text-xs text-dim">확인 후 결제를 진행하면 기업 계정이 만들어집니다.</p>
              </div>

              <dl className="divide-y divide-border rounded-xl border border-border bg-bg text-sm">
                {[
                  ['요금제', PLAN_LABEL[draft.planId as PlanId]],
                  ['이용 인원', `${draft.seatCount}명 (대표 포함)`],
                  ['회사명', draft.companyName],
                  ['사업자등록번호', draft.bizRegNo.replace(/[^0-9]/g, '')],
                  ['대표자명', draft.ceoName],
                  ['업종', COMPANY_TYPES.find((t) => t.value === draft.industry)?.label ?? '-'],
                  ['담당자', `${draft.managerName} · ${draft.managerPhone}`],
                  ['담당자 이메일', draft.managerEmail],
                  ['세금계산서 이메일', draft.taxInvoiceEmail],
                  ['대표 계정', user.email ?? '-'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-4 px-4 py-3">
                    <dt className="w-28 shrink-0 text-xs text-dim">{label}</dt>
                    <dd className="break-all text-text-2">{value}</dd>
                  </div>
                ))}
              </dl>

              {draft.memberEmails.length > 0 && (
                <div className="rounded-xl border border-border bg-bg px-4 py-3">
                  <p className="mb-2 text-xs text-dim">초대할 멤버 {draft.memberEmails.length}명</p>
                  <ul className="space-y-1">
                    {draft.memberEmails.map((e) => (
                      <li key={e} className="break-all text-sm text-text-2">
                        {e.trim().toLowerCase()}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 text-center">
                <p className="text-xs text-dim">
                  {formatKRW(PLANS[draft.planId as PlanId]?.seatPrice ?? 0)} × {draft.seatCount}좌석
                </p>
                <p className="mt-1.5 text-2xl font-bold text-accent">{formatKRW(amount)}</p>
                <p className="mt-1 text-xs text-dim">월 결제 · VAT 포함</p>
              </div>

              <p className="text-xs leading-relaxed text-dim">
                결제하기를 누르면{' '}
                <Link href="/terms" className="underline underline-offset-2 hover:text-accent">
                  이용약관
                </Link>
                과{' '}
                <Link href="/privacy" className="underline underline-offset-2 hover:text-accent">
                  개인정보 수집 및 이용
                </Link>
                에 동의하는 것으로 봅니다. 자동 청구는 하지 않으며, 다음 달 이용은 만료 전 안내 메일을 받고 직접
                결제하시면 됩니다.
              </p>

              {submitError && (
                <p className="rounded-xl border border-down/30 bg-down/5 px-4 py-3 text-sm text-down">{submitError}</p>
              )}
            </div>
          )}

          {/* ── 이동 버튼 ── */}
          <div className="mt-8 flex gap-2.5">
            {step > 1 && (
              <button
                type="button"
                onClick={goPrev}
                disabled={submitting}
                className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-text-2 transition hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                이전
              </button>
            )}
            {step < STEP_LABELS.length ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
              >
                다음
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover disabled:opacity-60"
              >
                {submitting ? '처리 중…' : `${formatKRW(amount)} 결제하기`}
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-dim">
          기업 맞춤 기능이나 견적이 필요하시면{' '}
          <a href={buildInquiryMailto(CONTACT_EMAIL)} className="underline underline-offset-2 hover:text-accent">
            {CONTACT_EMAIL}
          </a>
          으로 문의해주세요.
        </p>
      </div>
    </div>
  );
}
