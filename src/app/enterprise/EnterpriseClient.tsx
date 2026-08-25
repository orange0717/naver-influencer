'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import LegalModal from '@/components/legal/LegalModal';
import PrivacyContent from '@/components/legal/PrivacyContent';
import {
  COMPANY_TYPES,
  INTEREST_OPTIONS,
  TEAM_SIZES,
  type CompanyType,
  type TeamSize,
} from '@/lib/enterprise-inquiry';

const INPUT_CLASS =
  'w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30';

const OFFERINGS = [
  {
    title: '기업 전용 계정',
    body: '기업 단위로 N인플을 이용할 수 있도록 계정과 이용 범위를 구성합니다.',
  },
  {
    title: '다중 사용자 관리',
    body: '관리자·마케팅 담당자·콘텐츠 담당자 등 여러 구성원이 함께 쓰는 구조를 상담합니다.',
  },
  {
    title: '기업 맞춤형 기능',
    body: '대량 키워드 분석, 다수 블로그 관리, 기업용 리포트 등 필요한 기능의 제공 가능 여부를 상담을 통해 검토합니다.',
  },
  {
    title: '기업 전용 요금',
    body: '개인 요금제와 별도로, 사용 인원과 필요한 기능을 확인한 후 견적을 안내드립니다.',
  },
  {
    title: '기업 맞춤형 서비스',
    body: '기업의 사용 목적과 업무 환경을 확인한 후 필요한 기능과 이용 범위를 함께 구성합니다.',
  },
];

const STEPS = ['문의 접수', '담당자 확인', '요구사항 상담', '이용 조건 안내', '기업 전용 계정 개설'];

type FieldKey = 'companyName' | 'contactName' | 'email' | 'phone' | 'companyType' | 'teamSize' | 'message' | 'agreePrivacy';

function RequiredMark() {
  return <span className="ml-0.5 text-down">*</span>;
}

export default function EnterpriseClient() {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyType, setCompanyType] = useState<CompanyType | ''>('');
  const [teamSize, setTeamSize] = useState<TeamSize | ''>('');
  const [interests, setInterests] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  // 버튼 disabled 만으로는 빠른 연타에서 두 번 나갈 수 있어 ref 로도 잠근다.
  const inFlight = useRef(false);

  const toggleInterest = (item: string) => {
    setInterests(prev => (prev.includes(item) ? prev.filter(v => v !== item) : [...prev, item]));
  };

  const validate = (): Partial<Record<FieldKey, string>> => {
    const next: Partial<Record<FieldKey, string>> = {};
    if (!companyName.trim()) next.companyName = '회사명을 입력해주세요.';
    if (!contactName.trim()) next.contactName = '담당자 성함을 입력해주세요.';
    if (!email.trim()) next.email = '이메일을 입력해주세요.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = '올바른 이메일 형식을 입력해주세요.';
    const phoneDigits = phone.replace(/[^0-9+]/g, '');
    if (!phone.trim()) next.phone = '연락처를 입력해주세요.';
    else if (!/^\+?[0-9]{9,15}$/.test(phoneDigits)) next.phone = '숫자 9~15자리의 연락 가능한 번호를 입력해주세요.';
    if (!companyType) next.companyType = '기업 유형을 선택해주세요.';
    if (!teamSize) next.teamSize = '예상 사용 인원을 선택해주세요.';
    if (message.trim().length < 10) next.message = '문의 내용을 10자 이상 입력해주세요.';
    if (!agreePrivacy) next.agreePrivacy = '개인정보 수집 및 이용에 동의해주세요.';
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`field-${Object.keys(found)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);

    try {
      const res = await fetch('/api/enterprise-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          contactName,
          contactTitle: contactTitle || undefined,
          email,
          phone,
          companyType,
          teamSize,
          interests,
          message,
          agreePrivacy: true,
          sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error || '문의 접수에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('네트워크 오류로 접수하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="bg-bg px-4 py-24 md:py-32">
        <div className="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-8 text-center md:p-12">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="font-title mb-4 text-xl text-text md:text-2xl">기업용 문의가 접수되었습니다</h1>
          <p className="mb-2 text-sm leading-relaxed text-text-2">
            보내주신 내용을 확인한 후 담당자가 연락드리겠습니다.
          </p>
          <p className="mb-8 text-sm leading-relaxed text-dim">
            N인플은 기업의 사용 목적과 필요한 기능을 확인한 후<br className="hidden sm:block" />
            기업 환경에 맞는 이용 방법을 안내해드립니다.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Link
              href="/intro"
              className="rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
            >
              N인플 둘러보기
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-text-2 transition hover:border-accent/40 hover:text-accent"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg">
      {/* ── 상단 메시지 ── */}
      <section className="px-4 pt-16 pb-12 text-center md:pt-24 md:pb-16">
        <span className="font-title text-xs font-semibold tracking-[0.18em] text-accent">FOR BUSINESS</span>
        <h1 className="font-editorial mx-auto mt-4 max-w-2xl text-2xl leading-tight text-text md:text-4xl">
          기업이라면 N인플을 더 크게 활용할 수 있습니다
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-text-2 md:text-base">
          기업의 마케팅 환경과 사용 목적에 맞춰 필요한 기능을 구성하고 기업 전용 서비스를 제공합니다.
          기업의 마케팅 데이터를 더 체계적으로 분석하고 관리할 수 있도록 도와드립니다.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-xs leading-relaxed text-dim md:text-sm">
          사용 인원, 관리 대상, 필요한 기능에 따라 맞춤형으로 상담해드립니다.
        </p>
        <a
          href="#inquiry-form"
          className="mt-8 inline-block rounded-xl bg-accent px-6 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
        >
          기업용 문의하기
        </a>
      </section>

      {/* ── 상담 가능 영역 ── */}
      <section className="px-4 py-14 md:py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-title mb-2 text-center text-xl text-text md:text-2xl">이런 내용을 상담할 수 있습니다</h2>
          <p className="mb-8 text-center text-xs text-dim md:text-sm">
            아래 항목은 상담 주제이며, 제공 가능 여부는 기업의 사용 환경을 확인한 후 검토해 안내드립니다.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {OFFERINGS.map((item, i) => (
              <div
                key={item.title}
                className={`rounded-xl border border-border bg-surface p-5 ${i === OFFERINGS.length - 1 && OFFERINGS.length % 2 === 1 ? 'sm:col-span-2' : ''}`}
              >
                <h3 className="mb-1.5 text-sm font-bold text-text">{item.title}</h3>
                <p className="text-xs leading-relaxed text-text-2 md:text-sm">{item.body}</p>
              </div>
            ))}
          </div>

          {/* 가격은 공개하지 않는다 */}
          <div className="mt-6 rounded-xl border border-dashed border-border bg-surface p-5 text-center">
            <p className="text-sm font-bold text-text">기업용 요금</p>
            <p className="mt-1.5 text-xs leading-relaxed text-text-2 md:text-sm">
              사용자 수·이용 범위·필요한 기능·데이터 규모에 따라 달라지므로,
              기업용 요금은 사용 환경과 필요한 기능을 확인한 후 안내드립니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 진행 흐름 ── */}
      <section className="px-4 pb-14 md:pb-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-title mb-6 text-center text-xl text-text md:text-2xl">진행 절차</h2>
          <ol className="grid gap-3 sm:grid-cols-5">
            {STEPS.map((step, i) => (
              <li key={step} className="rounded-xl border border-border bg-surface px-4 py-4 text-center">
                <span className="font-title block text-xs font-bold text-accent">STEP {i + 1}</span>
                <span className="mt-1.5 block text-xs text-text-2 md:text-[13px]">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 문의 폼 ── */}
      <section id="inquiry-form" className="scroll-mt-20 px-4 pb-20 md:pb-28">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 md:p-8">
          <h2 className="font-title mb-1.5 text-xl text-text md:text-2xl">기업용 문의하기</h2>
          <p className="mb-7 text-xs leading-relaxed text-dim md:text-sm">
            상담에 필요한 최소한의 정보만 받습니다. 접수 후 담당자가 이메일 또는 연락처로 회신드립니다.
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <Field id="field-companyName" label="회사명" required error={errors.companyName}>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="회사명을 입력해주세요."
                maxLength={100}
                className={INPUT_CLASS}
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="field-contactName" label="담당자명" required error={errors.contactName}>
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="담당자 성함을 입력해주세요."
                  maxLength={50}
                  className={INPUT_CLASS}
                />
              </Field>

              <Field id="field-contactTitle" label="직함/직책">
                <input
                  type="text"
                  value={contactTitle}
                  onChange={e => setContactTitle(e.target.value)}
                  placeholder="예: 대표, 마케팅팀장, 대리"
                  maxLength={50}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="field-email" label="이메일" required error={errors.email}>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="상담 내용을 받을 이메일 주소를 입력해주세요."
                  maxLength={100}
                  className={INPUT_CLASS}
                />
              </Field>

              <Field id="field-phone" label="연락처" required error={errors.phone}>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="연락 가능한 전화번호를 입력해주세요."
                  maxLength={20}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="field-companyType" label="기업 유형" required error={errors.companyType}>
                <select
                  value={companyType}
                  onChange={e => setCompanyType(e.target.value as CompanyType)}
                  className={`${INPUT_CLASS} cursor-pointer appearance-auto ${companyType ? 'text-text' : 'text-dim'}`}
                >
                  <option value="">선택해주세요</option>
                  {COMPANY_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>

              <Field id="field-teamSize" label="예상 사용 인원" required error={errors.teamSize}>
                <select
                  value={teamSize}
                  onChange={e => setTeamSize(e.target.value as TeamSize)}
                  className={`${INPUT_CLASS} cursor-pointer appearance-auto ${teamSize ? 'text-text' : 'text-dim'}`}
                >
                  <option value="">선택해주세요</option>
                  {TEAM_SIZES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field id="field-interests" label="관심 기능" hint="복수 선택 가능 · 상담 주제이며 제공 확정 기능은 아닙니다.">
              <div className="flex flex-wrap gap-2">
                {INTEREST_OPTIONS.map(item => {
                  const active = interests.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleInterest(item)}
                      aria-pressed={active}
                      className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                        active
                          ? 'border-accent bg-accent text-white'
                          : 'border-border bg-bg text-text-2 hover:border-accent/40 hover:text-accent'
                      }`}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field id="field-message" label="문의 내용" required error={errors.message}>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={6}
                maxLength={3000}
                placeholder="N인플을 어떤 목적으로 이용하고 싶으신지 자유롭게 작성해주세요."
                className={`${INPUT_CLASS} resize-y`}
              />
              <p className="mt-1 text-right text-[11px] text-dim">{message.length}/3000</p>
            </Field>

            {/* 개인정보 동의 */}
            <div id="field-agreePrivacy" className="rounded-xl border border-border bg-bg p-4">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={e => setAgreePrivacy(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                />
                <span className="text-xs leading-relaxed text-text-2">
                  <span className="font-bold text-text">[필수]</span> 개인정보 수집 및 이용에 동의합니다.
                </span>
              </label>
              <p className="mt-2 pl-[26px] text-[11px] leading-relaxed text-dim">
                수집 항목: 회사명, 담당자명, 직함, 이메일, 연락처 · 수집 목적: 기업용 문의 상담 및 회신 ·
                보유 기간: 상담 종료 후 1년.{' '}
                <button
                  type="button"
                  onClick={() => setShowPrivacy(true)}
                  className="cursor-pointer underline hover:text-accent"
                >
                  개인정보처리방침
                </button>
              </p>
              {errors.agreePrivacy && <p className="mt-2 text-xs text-down">{errors.agreePrivacy}</p>}
            </div>

            {submitError && (
              <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-center text-sm text-down">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full cursor-pointer rounded-xl bg-accent py-3.5 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  접수 중...
                </span>
              ) : (
                '문의 접수하기'
              )}
            </button>

            <p className="text-center text-xs text-dim">
              개인으로 이용하실 계획이라면{' '}
              <Link href="/intro" className="text-accent underline hover:text-accent-hover">
                개인 요금제 안내
              </Link>
              를 확인해주세요.
            </p>
          </form>
        </div>
      </section>

      <LegalModal open={showPrivacy} title="개인정보처리방침" onClose={() => setShowPrivacy(false)}>
        <PrivacyContent />
      </LegalModal>
    </div>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24">
      <label className="mb-1.5 block text-xs font-semibold text-dim">
        {label}
        {required && <RequiredMark />}
      </label>
      {hint && <p className="mb-2 text-[11px] leading-relaxed text-dim">{hint}</p>}
      {children}
      {error && <p className="mt-1.5 text-xs text-down">{error}</p>}
    </div>
  );
}
