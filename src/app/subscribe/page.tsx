'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { subscriptionPlan, FREE_FEATURES, LOCKED_FEATURES } from '@/data/subscription-config';

export default function SubscribePage() {
  const [subscribed, setSubscribed] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ email?: string } | null>(null);

  useEffect(() => {
    async function loadStatus() {
      const supabase = createSupabaseBrowserClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser) {
        setUser({ email: authUser.email });
        const { data: profile } = await supabase
          .from('users')
          .select('subscription_status, subscription_expires_at')
          .eq('auth_id', authUser.id)
          .single();

        if (profile) {
          const isActive =
            profile.subscription_status === 'active' &&
            !!profile.subscription_expires_at &&
            new Date(profile.subscription_expires_at) > new Date();
          setSubscribed(isActive);
          if (isActive) setExpiresAt(profile.subscription_expires_at);
        }
      }
      setLoading(false);
    }
    loadStatus();
  }, []);

  const handleSubscribe = () => {
    if (!user) {
      window.location.href = '/auth/login';
      return;
    }
    // TODO: 토스페이먼츠 결제 연동
    alert('토스페이먼츠 결제 연동 준비 중입니다.');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* 구독 상태 (구독 중일 때) */}
      {subscribed && (
        <div className="bg-gradient-to-r from-up to-up/70 rounded-2xl p-8 text-white text-center">
          <div className="text-sm font-semibold opacity-80 mb-2">현재 구독 상태</div>
          <div className="text-4xl font-extrabold mb-2">구독 중</div>
          <div className="text-sm opacity-80">
            만료일: {new Date(expiresAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="text-xs opacity-60 mt-2">모든 기능을 무제한으로 이용하실 수 있습니다</div>
        </div>
      )}

      {/* 구독 히어로 (미구독 시) */}
      {!subscribed && (
        <div className="bg-gradient-to-r from-accent to-accent2 rounded-2xl p-8 text-white text-center">
          <div className="text-sm font-semibold opacity-80 mb-2">월간 구독</div>
          <div className="text-5xl font-extrabold mb-1 font-rank">
            {subscriptionPlan.price_krw.toLocaleString()}<span className="text-xl font-bold">원/월</span>
          </div>
          <div className="text-sm opacity-80 mt-3">{subscriptionPlan.description}</div>
        </div>
      )}

      {/* 구독 기능 목록 */}
      <section>
        <h2 className="text-lg font-extrabold mb-4">구독하면 이런 기능을 이용하세요</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {subscriptionPlan.features.map((feature, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/12 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <span className="text-sm font-semibold">{feature}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 무료 vs 구독 비교 */}
      <section>
        <h2 className="text-lg font-extrabold mb-4">무료 vs 구독 비교</h2>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left py-3 px-4 font-semibold text-dim text-xs">기능</th>
                <th className="text-center py-3 px-4 font-semibold text-dim text-xs w-20">무료</th>
                <th className="text-center py-3 px-4 font-semibold text-accent text-xs w-20">구독</th>
              </tr>
            </thead>
            <tbody>
              {FREE_FEATURES.map(f => (
                <tr key={f} className="border-b border-border/50">
                  <td className="py-3 px-4 font-medium">{f}</td>
                  <td className="py-3 px-4 text-center text-up font-bold">O</td>
                  <td className="py-3 px-4 text-center text-up font-bold">O</td>
                </tr>
              ))}
              {LOCKED_FEATURES.map(f => (
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

      {/* CTA 버튼 */}
      {!subscribed ? (
        <div className="text-center space-y-3">
          <button
            onClick={handleSubscribe}
            className="w-full max-w-md mx-auto block py-4 bg-accent text-white text-lg font-extrabold rounded-xl hover:bg-accent-hover transition-colors cursor-pointer shadow-lg shadow-accent/20"
          >
            월 {subscriptionPlan.price_krw.toLocaleString()}원으로 구독하기
          </button>
          <p className="text-xs text-dim">
            결제는 토스페이먼츠를 통해 안전하게 처리됩니다.
          </p>
        </div>
      ) : (
        <div className="text-center space-y-3">
          <Link href="/"
            className="inline-block px-8 py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover transition-colors">
            대시보드로 이동
          </Link>
        </div>
      )}

      {/* FAQ */}
      <section className="pb-8">
        <h2 className="text-lg font-extrabold mb-4">자주 묻는 질문</h2>
        <div className="space-y-3">
          {[
            { q: '구독은 어떻게 결제하나요?', a: '토스페이먼츠를 통해 카드, 간편결제 등으로 안전하게 결제됩니다.' },
            { q: '언제든지 해지할 수 있나요?', a: '네, 구독 기간 중 언제든 해지 가능합니다. 해지 후에도 남은 기간까지 이용 가능합니다.' },
            { q: '환불은 가능한가요?', a: '구독 시작 후 7일 이내 미이용 시 전액 환불 가능합니다.' },
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
