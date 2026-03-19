'use client';

import { useState } from 'react';
import Link from 'next/link';

const FREE_FEATURES = [
  { text: '키워드 목록 검색', included: true },
  { text: '인플루언서 목록 검색', included: true },
  { text: '커뮤니티 이용', included: true },
  { text: '키워드 상세 정보 (참여자, 경쟁도)', included: true },
];

const PRO_FEATURES = [
  { text: '내 키워드 순위 실시간 추적', highlight: true },
  { text: '스마트 알림 (하락 위험 / TOP3 기회)', highlight: true },
  { text: '성장 리포트 (주간/월간 비교)', highlight: true },
  { text: '종합 점수 추이 차트', highlight: false },
  { text: '경쟁자 비교 분석 + 변동 감지', highlight: true },
  { text: '순위 추이 차트 (7/15/30일)', highlight: false },
  { text: '포스팅별 키워드 순위 분석', highlight: false },
  { text: '맞춤 추천 키워드', highlight: false },
  { text: '인플루언서 종합 점수 (6차원)', highlight: false },
  { text: '키워드 순위 위젯 (블로그 삽입)', highlight: false },
];

const MONTHLY_PRICE = 19800;
const YEARLY_PRICE = 178200; // 연 25% 할인 (공급가 162,000 + VAT 16,200)
const YEARLY_MONTHLY = Math.round(YEARLY_PRICE / 12);
const YEARLY_DISCOUNT = Math.round((1 - YEARLY_PRICE / (MONTHLY_PRICE * 12)) * 100);

export default function SubscribePage() {
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');

  const monthlyEquiv = billing === 'monthly' ? MONTHLY_PRICE : YEARLY_MONTHLY;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-12">

      {/* ─── 히어로 ─── */}
      <div className="text-center space-y-3">
        <h1 className="text-3xl md:text-4xl font-extrabold">
          내 순위를 지키는 가장 빠른 방법
        </h1>
        <p className="text-dim text-sm md:text-base max-w-lg mx-auto leading-relaxed">
          키워드 순위가 떨어지고 있는데 모르고 계신가요?
          <br />
          N인플 PRO로 하락 전에 대응하고, 기회를 포착하세요.
        </p>
      </div>

      {/* ─── 결제 주기 선택 ─── */}
      <div className="flex justify-center">
        <div className="flex bg-bg rounded-xl p-1 border border-border">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
              billing === 'monthly' ? 'bg-surface text-text shadow-sm' : 'text-dim hover:text-text'
            }`}
          >
            월간 결제
          </button>
          <button
            onClick={() => setBilling('yearly')}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              billing === 'yearly' ? 'bg-surface text-text shadow-sm' : 'text-dim hover:text-text'
            }`}
          >
            연간 결제
            <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
              -{YEARLY_DISCOUNT}%
            </span>
          </button>
        </div>
      </div>

      {/* ─── 무료 vs PRO 비교 ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* 무료 */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <div>
            <span className="text-xs font-bold text-dim bg-border/30 px-2.5 py-1 rounded-full">무료</span>
            <p className="text-2xl font-extrabold mt-3">0원</p>
            <p className="text-xs text-dim mt-1">기본 검색 기능</p>
          </div>
          <div className="space-y-2.5">
            {FREE_FEATURES.map(f => (
              <div key={f.text} className="flex items-center gap-2.5 text-sm">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-dim shrink-0">
                  <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-dim">{f.text}</span>
              </div>
            ))}
            <div className="pt-2 space-y-2.5">
              {PRO_FEATURES.slice(0, 4).map(f => (
                <div key={f.text} className="flex items-center gap-2.5 text-sm">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-border shrink-0">
                    <path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className="text-border line-through">{f.text}</span>
                </div>
              ))}
            </div>
          </div>
          <Link href="/auth/login"
            className="block w-full text-center py-3 border border-border text-dim font-semibold rounded-xl hover:bg-bg transition text-sm">
            무료로 시작하기
          </Link>
        </div>

        {/* PRO */}
        <div className="bg-surface rounded-2xl border-2 border-accent p-6 space-y-5 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="text-[11px] font-bold text-white bg-accent px-4 py-1 rounded-full shadow-sm">
              추천
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-full">PRO</span>
            <div className="flex items-baseline gap-1.5 mt-3">
              <p className="text-2xl font-extrabold">{monthlyEquiv.toLocaleString()}원</p>
              <span className="text-sm text-dim">/월</span>
            </div>
            {billing === 'yearly' && (
              <p className="text-xs text-dim mt-1">
                연간 {YEARLY_PRICE.toLocaleString()}원 (월 {MONTHLY_PRICE.toLocaleString()}원 대비 {YEARLY_DISCOUNT}% 할인)
              </p>
            )}
            {billing === 'monthly' && (
              <p className="text-xs text-dim mt-1">매월 자동 결제</p>
            )}
          </div>
          <div className="space-y-2.5">
            {FREE_FEATURES.map(f => (
              <div key={f.text} className="flex items-center gap-2.5 text-sm">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-up shrink-0">
                  <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>{f.text}</span>
              </div>
            ))}
            {PRO_FEATURES.map(f => (
              <div key={f.text} className="flex items-center gap-2.5 text-sm">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent shrink-0">
                  <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className={f.highlight ? 'font-semibold' : ''}>{f.text}</span>
              </div>
            ))}
          </div>
          <button
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer text-sm"
          >
            PRO 시작하기
          </button>
        </div>
      </div>

      {/* ─── 왜 PRO인가 ─── */}
      <div className="space-y-6">
        <h2 className="text-xl font-extrabold text-center">PRO가 필요한 이유</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ReasonCard
            title="순위 하락, 알아야 막는다"
            description="키워드 순위가 2일 연속 떨어지면 자동으로 알려드립니다. 하락을 인지하고 즉시 대응하면 순위 회복이 빠릅니다."
          />
          <ReasonCard
            title="TOP 3 기회를 놓치지 마세요"
            description="현재 4~6위인 키워드 중 상승 추세인 것을 자동으로 찾아드립니다. 콘텐츠 하나만 더 올리면 TOP 3에 진입할 수 있습니다."
          />
          <ReasonCard
            title="경쟁자보다 한 발 앞서기"
            description="경쟁자가 내 키워드에 진입하면 바로 감지됩니다. 누가 나를 추월했는지, 어디서 밀리는지 한눈에 파악하세요."
          />
        </div>
      </div>

      {/* ─── 가격 요약 CTA ─── */}
      <div className="bg-bg rounded-2xl border border-border p-6 md:p-8 text-center space-y-4">
        <p className="text-dim text-sm">
          {billing === 'yearly'
            ? `연간 ${YEARLY_PRICE.toLocaleString()}원 · 하루 약 ${Math.round(YEARLY_PRICE / 365).toLocaleString()}원`
            : `월 ${MONTHLY_PRICE.toLocaleString()}원 · 하루 약 ${Math.round(MONTHLY_PRICE / 30).toLocaleString()}원`}
        </p>
        <p className="text-lg font-bold">
          커피 한 잔 값으로 내 순위를 지키세요
        </p>
        <button
          className="px-8 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer text-sm"
        >
          {billing === 'yearly'
            ? `연간 PRO 시작하기 · ${YEARLY_PRICE.toLocaleString()}원`
            : `월간 PRO 시작하기 · ${MONTHLY_PRICE.toLocaleString()}원`}
        </button>
        <p className="text-[10px] text-dim">
          언제든지 해지할 수 있습니다 · Stripe 안전 결제
        </p>
      </div>

      {/* ─── FAQ ─── */}
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold text-center">자주 묻는 질문</h2>
        <div className="space-y-3">
          <FaqItem
            question="무료로는 어디까지 이용할 수 있나요?"
            answer="키워드 목록 검색, 인플루언서 목록 검색, 커뮤니티는 무료로 이용할 수 있습니다. 내 순위 추적, 알림, 경쟁자 비교 등 대시보드 기능은 PRO 전용입니다."
          />
          <FaqItem
            question="결제는 어떻게 이루어지나요?"
            answer="Stripe를 통한 안전한 해외결제로 진행됩니다. 신용카드, 체크카드 모두 사용 가능합니다."
          />
          <FaqItem
            question="연간 결제 시 환불이 가능한가요?"
            answer="결제 후 7일 이내 전액 환불이 가능합니다. 7일 이후에는 잔여 기간에 비례하여 환불됩니다."
          />
          <FaqItem
            question="해지는 어떻게 하나요?"
            answer="마이페이지에서 언제든지 구독을 해지할 수 있습니다. 해지해도 남은 기간까지는 정상 이용 가능합니다."
          />
        </div>
      </div>
    </div>
  );
}

function ReasonCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 space-y-2">
      <h3 className="font-bold text-sm">{title}</h3>
      <p className="text-xs text-dim leading-relaxed">{description}</p>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer"
      >
        <span className="text-sm font-semibold">{question}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
          className={`text-dim shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4">
          <p className="text-xs text-dim leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}
