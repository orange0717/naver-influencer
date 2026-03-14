'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

/* ── 토스페이먼츠 설정 ── */
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gmeYBlrqG';
const PRICE = 9900;

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

export default function LicensePage() {
  const [user, setUser] = useState<UserInfo>({ type: null, id: null, name: null });
  const [licenseCode, setLicenseCode] = useState('');
  const [activeLicense, setActiveLicense] = useState<ActiveLicense | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

      const orderId = `NINFL_${user.id}_${Date.now()}`;
      const origin = window.location.origin;

      await payment.requestPayment({
        method: 'CARD',
        amount: { currency: 'KRW', value: PRICE },
        orderId,
        orderName: 'N인플 PRO 이용권 (30일)',
        customerName: user.name || user.id,
        successUrl: `${origin}/payment/success`,
        failUrl: `${origin}/payment/fail`,
      });
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      // 사용자가 결제 창을 닫은 경우
      if (error.code === 'USER_CANCEL') {
        setMessage({ type: 'error', text: '결제가 취소되었습니다.' });
      } else {
        setMessage({ type: 'error', text: error.message || '결제 요청 중 오류가 발생했습니다.' });
      }
    } finally {
      setPaying(false);
    }
  }, [user]);

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
    <div className="max-w-3xl mx-auto">

      {/* ═══════════ 이용권 상태 / 히어로 ═══════════ */}
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

      {!activeLicense && (
        <div className="bg-gradient-to-r from-accent to-accent2 rounded-2xl p-8 text-white text-center mb-6">
          <div className="text-sm font-semibold opacity-80 mb-2">N인플 이용권</div>
          <div className="text-5xl font-extrabold mb-1 font-rank">
            {PRICE.toLocaleString()}<span className="text-xl font-bold">원</span>
          </div>
          <div className="text-sm opacity-80 mt-3">30일 동안 모든 프리미엄 기능을 이용하세요</div>
        </div>
      )}

      {/* ═══════════ 결제하기 ═══════════ */}
      {!activeLicense && (
        <section className="space-y-4 mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-5 bg-accent rounded-full" />
            <h2 className="text-lg font-extrabold">결제하기</h2>
          </div>

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
                  {PRICE.toLocaleString()}원 결제하기
                </>
              )}
            </button>
          )}

          {/* 메시지 */}
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

      {/* ═══════════ 이용권 기능 ═══════════ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-5 bg-up rounded-full" />
          <h2 className="text-lg font-extrabold">이용권으로 이런 기능을 이용하세요</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            '키워드 상세 분석 무제한',
            '인플루언서 순위 전체 열람',
            '검색량 트렌드 분석',
            '일일 추천 키워드 전체',
            '내 대시보드 + 경쟁자 비교',
            '실시간 데이터 업데이트',
          ].map((feature, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/12 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <span className="text-sm font-semibold">{feature}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ 구분선 ═══════════ */}
      <div className="border-t-2 border-border my-8" />

      {/* ═══════════ 무료 vs 이용권 비교 ═══════════ */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-5 bg-blue rounded-full" />
          <h2 className="text-lg font-extrabold">무료 vs 이용권 비교</h2>
        </div>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left py-3 px-4 font-semibold text-dim text-xs">기능</th>
                <th className="text-center py-3 px-4 font-semibold text-dim text-xs w-20">무료</th>
                <th className="text-center py-3 px-4 font-semibold text-accent text-xs w-20">이용권</th>
              </tr>
            </thead>
            <tbody>
              {['키워드 목록 열람', '커뮤니티', '검색량 조회', '블로그 등급 위젯'].map(f => (
                <tr key={f} className="border-b border-border/50">
                  <td className="py-3 px-4 font-medium">{f}</td>
                  <td className="py-3 px-4 text-center text-up font-bold">O</td>
                  <td className="py-3 px-4 text-center text-up font-bold">O</td>
                </tr>
              ))}
              {['키워드 상세 (검색량, 트렌드)', '인플루언서 순위 전체', '인플루언서 프로필 상세', '내 대시보드 전체 기능', '경쟁자 비교 분석'].map(f => (
                <tr key={f} className="border-b border-border/50">
                  <td className="py-3 px-4 font-medium">{f}</td>
                  <td className="py-3 px-4 text-center text-dim">X</td>
                  <td className="py-3 px-4 text-center text-up font-bold">O</td>
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
            { q: '이용권 유효기간은 얼마인가요?', a: '결제 시점부터 30일간 유효합니다. 기간 만료 전 재결제하면 남은 기간에 30일이 추가됩니다.' },
            { q: '환불은 가능한가요?', a: '결제 후 7일 이내 미이용 시 전액 환불 가능합니다. 고객센터로 문의해주세요.' },
            { q: '이용권 코드는 무엇인가요?', a: '이벤트, 선물 등으로 받은 이용권 코드가 있다면 코드 입력란에 등록하여 이용권을 활성화할 수 있습니다.' },
            { q: '데이터는 얼마나 자주 업데이트되나요?', a: '매일 새벽에 네이버 키워드챌린지 데이터를 자동 수집합니다.' },
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
