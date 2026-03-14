'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import {
  PLANS, PERIODS, calculatePrice, calculateMonthlyPrice, calculateSaving,
  type PlanKey, type PeriodOption,
} from '@/lib/plans';

/* ── 토스페이먼츠 설정 ── */
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gmeYBlrqG';

type UserInfo = {
  type: 'influencer' | 'blogger' | null;
  id: string | null;
  name: string | null;
};

type ActiveLicense = {
  plan_name: string;
  activated_at: string;
  expires_at: string;
  duration_days: number;
};

export default function SubscribePage() {
  const [user, setUser] = useState<UserInfo>({ type: null, id: null, name: null });
  const [licenseCode, setLicenseCode] = useState('');
  const [activeLicense, setActiveLicense] = useState<ActiveLicense | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 플랜 & 기간 선택 상태
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('PRO');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>(PERIODS[0]);

  const plan = PLANS[selectedPlan];
  const totalPrice = calculatePrice(plan.basePrice, selectedPeriod.months, selectedPeriod.discount);
  const monthlyPrice = calculateMonthlyPrice(totalPrice, selectedPeriod.months);
  const saving = calculateSaving(plan.basePrice, selectedPeriod.months, selectedPeriod.discount);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(async (data) => {
        const u: UserInfo = { type: data.type || null, id: data.id || null, name: data.name || null };
        setUser(u);
        if (u.id) {
          try {
            const res = await fetch('/api/license');
            const licenseData = await res.json();
            if (licenseData.has_active && licenseData.active_license) {
              setActiveLicense(licenseData.active_license);
            }
          } catch { /* ignore */ }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  /* ── 토스페이먼츠 결제 ── */
  const handlePayment = useCallback(async () => {
    if (!user.id) {
      window.location.href = '/auth/login';
      return;
    }

    setPaying(true);
    setMessage(null);

    try {
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: user.id });

      const orderId = `NINFL_${selectedPlan}_${selectedPeriod.months}M_${user.id}_${Date.now()}`;
      const origin = window.location.origin;
      const orderName = `N인플 ${plan.label} 이용권 (${selectedPeriod.label})`;

      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: totalPrice },
        orderId,
        orderName,
        customerName: user.name || user.id,
        successUrl: `${origin}/payment/success`,
        failUrl: `${origin}/payment/fail`,
      });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'USER_CANCEL') {
        setMessage({ type: 'error', text: '결제가 취소되었습니다.' });
      } else {
        setMessage({ type: 'error', text: error.message || '결제 요청 중 오류가 발생했습니다.' });
      }
    } finally {
      setPaying(false);
    }
  }, [user, selectedPlan, selectedPeriod, plan, totalPrice]);

  /* ── 이용권 코드 등록 ── */
  const handleActivate = async () => {
    if (!licenseCode.trim()) {
      setMessage({ type: 'error', text: '이용권 코드를 입력해주세요.' });
      return;
    }
    if (!user.id) {
      setMessage({ type: 'error', text: '먼저 로그인해주세요.' });
      return;
    }

    setActivating(true);
    setMessage(null);

    try {
      const res = await fetch('/api/license', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_code: licenseCode.trim(),
          buyer_id: user.id,
          buyer_name: user.name || user.id,
          buyer_type: user.type,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '활성화에 실패했습니다.' });
        return;
      }

      setActiveLicense({
        plan_name: data.plan_name,
        activated_at: data.activated_at,
        expires_at: data.expires_at,
        duration_days: data.duration_days,
      });
      setLicenseCode('');
      setMessage({ type: 'success', text: '이용권이 성공적으로 등록되었습니다!' });
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류가 발생했습니다.' });
    } finally {
      setActivating(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    setLicenseCode(val);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">

      {/* ═══════════ 이용권 상태 ═══════════ */}
      {activeLicense && (
        <div className="bg-gradient-to-r from-up to-up/70 rounded-2xl p-8 text-white text-center mb-6">
          <div className="text-sm font-semibold opacity-80 mb-2">현재 이용권 상태</div>
          <div className="text-4xl font-extrabold mb-2">{activeLicense.plan_name} 이용 중</div>
          <div className="text-sm opacity-80">
            만료일: {new Date(activeLicense.expires_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="text-xs opacity-60 mt-2">모든 프리미엄 기능을 이용하실 수 있습니다</div>
        </div>
      )}

      {/* ═══════════ 플랜 선택 ═══════════ */}
      {!activeLicense && (
        <>
          <div className="text-center mb-8">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">PRICING</p>
            <h1 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-2">
              이용권 선택
            </h1>
            <p className="text-sm text-dim">
              필요에 맞는 플랜과 기간을 선택하세요
            </p>
          </div>

          {/* 플랜 카드 2개 */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {(Object.keys(PLANS) as PlanKey[]).map((key) => {
              const p = PLANS[key];
              const isSelected = selectedPlan === key;
              const isAgency = key === 'AGENCY';
              return (
                <button
                  key={key}
                  onClick={() => setSelectedPlan(key)}
                  className={`relative text-left p-6 rounded-2xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-accent bg-accent/5 shadow-lg shadow-accent/10'
                      : 'border-border bg-surface hover:border-accent/30'
                  }`}
                >
                  {isAgency && (
                    <span className="absolute -top-2.5 right-4 px-3 py-0.5 bg-blue text-white text-[10px] font-bold rounded-full">
                      대행사 추천
                    </span>
                  )}

                  {/* 선택 인디케이터 */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className={`text-xs font-bold tracking-wide mb-1 ${isSelected ? 'text-accent' : 'text-dim'}`}>
                        {p.name}
                      </p>
                      <p className="text-lg font-extrabold text-text">{p.label}</p>
                      <p className="text-xs text-dim mt-0.5">{p.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1 ${
                      isSelected ? 'border-accent' : 'border-border'
                    }`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-accent" />}
                    </div>
                  </div>

                  <div className="mb-4">
                    <span className="text-2xl font-extrabold text-text">
                      {p.basePrice.toLocaleString()}
                    </span>
                    <span className="text-sm text-dim">원/월</span>
                  </div>

                  <div className="space-y-1.5">
                    {p.features.slice(0, 4).map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-dim">
                        <span className={isSelected ? 'text-accent' : 'text-up'}>&#10003;</span>
                        {f}
                      </div>
                    ))}
                    {p.features.length > 4 && (
                      <p className="text-[10px] text-dim/60 mt-1">
                        +{p.features.length - 4}개 더...
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 기간 선택 */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-5 bg-accent rounded-full" />
              <h2 className="text-lg font-extrabold">기간 선택</h2>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {PERIODS.map((period) => {
                const isSelected = selectedPeriod.months === period.months;
                const periodPrice = calculatePrice(plan.basePrice, period.months, period.discount);
                return (
                  <button
                    key={period.months}
                    onClick={() => setSelectedPeriod(period)}
                    className={`relative p-3 rounded-xl border-2 text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-surface hover:border-accent/30'
                    }`}
                  >
                    {period.discount > 0 && (
                      <span className={`absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[9px] font-bold rounded-full whitespace-nowrap ${
                        isSelected ? 'bg-accent text-white' : 'bg-down/10 text-down'
                      }`}>
                        {Math.round(period.discount * 100)}% 할인
                      </span>
                    )}
                    <p className={`text-sm font-bold mt-1 ${isSelected ? 'text-accent' : 'text-text'}`}>
                      {period.label}
                    </p>
                    <p className="text-[10px] text-dim mt-1">
                      {periodPrice.toLocaleString()}원
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 가격 요약 */}
          <div className="bg-surface rounded-2xl border border-border p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-dim">선택 플랜</span>
              <span className="text-sm font-bold text-text">{plan.label} ({plan.name})</span>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-dim">이용 기간</span>
              <span className="text-sm font-bold text-text">{selectedPeriod.label} ({selectedPeriod.days}일)</span>
            </div>
            {saving > 0 && (
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-dim">할인 금액</span>
                <span className="text-sm font-bold text-down">-{saving.toLocaleString()}원</span>
              </div>
            )}
            <div className="border-t border-border my-3" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-text">결제 금액</span>
              <div className="text-right">
                <span className="text-2xl font-extrabold text-accent">{totalPrice.toLocaleString()}</span>
                <span className="text-sm text-dim">원</span>
                {selectedPeriod.months > 1 && (
                  <p className="text-[10px] text-dim">월 {monthlyPrice.toLocaleString()}원</p>
                )}
              </div>
            </div>
          </div>

          {/* 결제 버튼 */}
          <section className="space-y-4 mb-10">
            {!user.id ? (
              <div className="bg-surface rounded-2xl border border-border p-6 text-center space-y-3">
                <p className="text-sm text-dim">이용권을 구매하려면 먼저 로그인하세요</p>
                <Link href="/auth/login" className="inline-block px-8 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-sm">
                  로그인하기
                </Link>
              </div>
            ) : (
              <button
                onClick={handlePayment}
                disabled={paying}
                className="w-full py-4 bg-[#0064FF] text-white text-lg font-extrabold rounded-xl hover:bg-[#0050CC] transition-colors shadow-lg shadow-[#0064FF]/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {paying ? (
                  <>
                    <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                    결제 준비 중...
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" />
                      <path d="M1 10h22" />
                    </svg>
                    {totalPrice.toLocaleString()}원 결제하기
                  </>
                )}
              </button>
            )}

            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl ${
                message.type === 'success'
                  ? 'bg-up/10 text-up border border-up/20'
                  : 'bg-down/10 text-down border border-down/20'
              }`}>
                {message.text}
              </div>
            )}

            <p className="text-center text-xs text-dim">
              토스페이먼츠를 통해 안전하게 결제됩니다 · 카드, 간편결제 지원
            </p>
          </section>
        </>
      )}

      {/* ═══════════ 구분선 ═══════════ */}
      <div className="border-t-2 border-border my-8" />

      {/* ═══════════ 이용권 코드 등록 ═══════════ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-5 bg-accent rounded-full" />
          <h2 className="text-lg font-extrabold">이용권 코드 등록</h2>
        </div>
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
          <p className="text-sm text-dim">이벤트나 선물 받은 이용권 코드가 있다면 아래에 입력하세요</p>

          {user.id ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={licenseCode}
                onChange={handleCodeChange}
                placeholder="NINFL-XXXX-XXXX-XXXX"
                maxLength={19}
                className="flex-1 px-4 py-3 bg-bg border border-border rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent placeholder:text-dim/50"
              />
              <button
                onClick={handleActivate}
                disabled={activating || !licenseCode.trim()}
                className="px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm whitespace-nowrap"
              >
                {activating ? '등록 중...' : '등록'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-dim">코드를 등록하려면 먼저 <Link href="/auth/login" className="text-accent font-semibold hover:underline">로그인</Link>하세요</p>
          )}
        </div>
      </section>

      {/* ═══════════ 구분선 ═══════════ */}
      <div className="border-t-2 border-border my-8" />

      {/* ═══════════ 플랜 상세 비교 ═══════════ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-5 bg-blue rounded-full" />
          <h2 className="text-lg font-extrabold">플랜 비교</h2>
        </div>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left py-3 px-4 font-semibold text-dim text-xs">기능</th>
                <th className="text-center py-3 px-4 font-semibold text-dim text-xs w-20">무료</th>
                <th className="text-center py-3 px-4 font-semibold text-accent text-xs w-20">PRO</th>
                <th className="text-center py-3 px-4 font-semibold text-blue text-xs w-20">AGENCY</th>
              </tr>
            </thead>
            <tbody>
              {[
                { f: '키워드 목록 열람', free: true, pro: true, agency: true },
                { f: '커뮤니티', free: true, pro: true, agency: true },
                { f: '검색량 조회', free: true, pro: true, agency: true },
                { f: '블로그 등급 위젯', free: true, pro: true, agency: true },
                { f: '키워드 상세 (검색량, 트렌드)', free: false, pro: true, agency: true },
                { f: '인플루언서 순위 전체', free: false, pro: true, agency: true },
                { f: '내 대시보드 전체 기능', free: false, pro: true, agency: true },
                { f: '경쟁자 비교 분석', free: false, pro: true, agency: true },
                { f: '다중 블로그 관리 (10개)', free: false, pro: false, agency: true },
                { f: '대행사 전용 대시보드', free: false, pro: false, agency: true },
                { f: '블로그 성과 비교', free: false, pro: false, agency: true },
              ].map(({ f, free, pro, agency }) => (
                <tr key={f} className="border-b border-border/50">
                  <td className="py-3 px-4 font-medium">{f}</td>
                  <td className="py-3 px-4 text-center">
                    {free ? <span className="text-up font-bold">O</span> : <span className="text-dim">X</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {pro ? <span className="text-accent font-bold">O</span> : <span className="text-dim">X</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {agency ? <span className="text-blue font-bold">O</span> : <span className="text-dim">X</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══════════ 구분선 ═══════════ */}
      <div className="border-t-2 border-border my-8" />

      {/* ═══════════ FAQ ═══════════ */}
      <section className="pb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-5 bg-gold rounded-full" />
          <h2 className="text-lg font-extrabold">자주 묻는 질문</h2>
        </div>
        <div className="space-y-3">
          {[
            { q: '결제는 어떻게 하나요?', a: '토스페이먼츠를 통해 카드, 간편결제 등으로 안전하게 결제됩니다. 결제 완료 즉시 이용권이 활성화됩니다.' },
            { q: '이용권 유효기간은 얼마인가요?', a: '선택한 기간(1~12개월)만큼 유효합니다. 기간 만료 전 재결제하면 남은 기간에 추가됩니다.' },
            { q: '대행사 플랜은 무엇인가요?', a: '마케팅 대행사를 위한 플랜으로, 최대 10개 블로그를 동시에 등록하고 각각의 점수와 순위를 관리할 수 있습니다.' },
            { q: '장기 결제 할인은 어떻게 되나요?', a: '3개월 5%, 6개월 7%, 10개월 9%, 12개월 11% 할인이 적용됩니다. 기간이 길수록 월 환산 비용이 저렴합니다.' },
            { q: '환불은 가능한가요?', a: '결제 후 7일 이내 미이용 시 전액 환불 가능합니다. 고객센터로 문의해주세요.' },
            { q: '이용권 코드는 무엇인가요?', a: '이벤트, 선물 등으로 받은 이용권 코드가 있다면 코드 입력란에 등록하여 이용권을 활성화할 수 있습니다.' },
          ].map((faq, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border p-4">
              <div className="text-sm font-bold mb-1">{faq.q}</div>
              <div className="text-xs text-dim leading-relaxed">{faq.a}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
