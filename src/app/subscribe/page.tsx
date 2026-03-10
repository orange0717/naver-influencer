'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ── 스마트스토어 상품 URL (추후 실제 URL로 교체) ── */
const SMARTSTORE_URL = 'https://smartstore.naver.com/orangelibrary';

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

function getUserFromCookies(): UserInfo {
  const cookies = document.cookie;
  const naverMatch = cookies.match(/(?:^|;\s*)naver_id=([^;]*)/);
  const blogMatch = cookies.match(/(?:^|;\s*)blog_id=([^;]*)/);
  const blogNameMatch = cookies.match(/(?:^|;\s*)blog_name=([^;]*)/);

  if (naverMatch) {
    return { type: 'influencer', id: decodeURIComponent(naverMatch[1]), name: null };
  }
  if (blogMatch) {
    const name = blogNameMatch ? decodeURIComponent(blogNameMatch[1]) : null;
    return { type: 'blogger', id: decodeURIComponent(blogMatch[1]), name };
  }
  return { type: null, id: null, name: null };
}

export default function LicensePage() {
  const [user, setUser] = useState<UserInfo>({ type: null, id: null, name: null });
  const [licenseCode, setLicenseCode] = useState('');
  const [activeLicense, setActiveLicense] = useState<ActiveLicense | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const u = getUserFromCookies();
    setUser(u);

    // 활성 이용권 확인
    if (u.id) {
      fetch(`/api/license?userId=${encodeURIComponent(u.id)}`)
        .then(res => res.json())
        .then(data => {
          if (data.has_active && data.active_license) {
            setActiveLicense(data.active_license);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

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

  // 코드 입력 포맷팅 (NINFL-XXXX-XXXX-XXXX)
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
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
    <div className="space-y-8 max-w-3xl mx-auto">

      {/* ── 활성 이용권 상태 ── */}
      {activeLicense && (
        <div className="bg-gradient-to-r from-up to-up/70 rounded-2xl p-8 text-white text-center">
          <div className="text-sm font-semibold opacity-80 mb-2">현재 이용권 상태</div>
          <div className="text-4xl font-extrabold mb-2">{activeLicense.plan_name} 이용 중</div>
          <div className="text-sm opacity-80">
            만료일: {new Date(activeLicense.expires_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="text-xs opacity-60 mt-2">모든 프리미엄 기능을 이용하실 수 있습니다</div>
        </div>
      )}

      {/* ── 이용권 히어로 (미보유 시) ── */}
      {!activeLicense && (
        <div className="bg-gradient-to-r from-accent to-accent2 rounded-2xl p-8 text-white text-center">
          <div className="text-sm font-semibold opacity-80 mb-2">N인플 이용권</div>
          <div className="text-4xl font-extrabold mb-1 font-rank">
            PRO
          </div>
          <div className="text-sm opacity-80 mt-3">스마트스토어에서 이용권을 구매하고 코드를 등록하세요</div>
        </div>
      )}

      {/* ── 이용권 등록 폼 ── */}
      <section className="bg-surface rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/12 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M7 15h0M2 9.5h20" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-extrabold">이용권 코드 등록</h2>
            <p className="text-xs text-dim">스마트스토어에서 구매한 이용권 코드를 입력하세요</p>
          </div>
        </div>

        {!user.id && (
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 text-center">
            <p className="text-sm text-dim mb-2">이용권을 등록하려면 먼저 로그인하세요</p>
            <Link href="/auth/login" className="text-sm font-bold text-accent hover:underline">
              로그인하기 →
            </Link>
          </div>
        )}

        {user.id && (
          <div className="space-y-3">
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
          </div>
        )}
      </section>

      {/* ── 구매 방법 ── */}
      <section className="bg-surface rounded-2xl border border-border p-6 space-y-5">
        <h2 className="text-lg font-extrabold">이용권 구매 방법</h2>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-accent font-black text-sm shrink-0">1</div>
            <div>
              <p className="font-bold text-sm">네이버 스마트스토어에서 이용권 구매</p>
              <p className="text-xs text-dim mt-1">아래 버튼을 클릭하여 스마트스토어에서 원하는 이용권을 구매하세요.</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-accent font-black text-sm shrink-0">2</div>
            <div>
              <p className="font-bold text-sm">이용권 코드 확인</p>
              <p className="text-xs text-dim mt-1">구매 완료 후 이용권 코드가 발송됩니다. (네이버 톡톡 또는 주문 상세)</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-accent font-black text-sm shrink-0">3</div>
            <div>
              <p className="font-bold text-sm">위에서 코드 등록</p>
              <p className="text-xs text-dim mt-1">이 페이지 상단의 이용권 코드 입력란에 코드를 입력하면 바로 활성화됩니다.</p>
            </div>
          </div>
        </div>

        {/* 스마트스토어 바로가기 */}
        <a
          href={SMARTSTORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-4 bg-[#03C75A] text-white text-sm font-extrabold rounded-xl hover:bg-[#02b351] transition-colors shadow-lg shadow-[#03C75A]/20"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727z"/>
          </svg>
          네이버 스마트스토어에서 구매하기
        </a>
      </section>

      {/* ── 이용권 상세 ── */}
      <section>
        <h2 className="text-lg font-extrabold mb-4">이용권으로 이런 기능을 이용하세요</h2>
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

      {/* ── 무료 vs 이용권 비교 ── */}
      <section>
        <h2 className="text-lg font-extrabold mb-4">무료 vs 이용권 비교</h2>
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

      {/* ── FAQ ── */}
      <section className="pb-8">
        <h2 className="text-lg font-extrabold mb-4">자주 묻는 질문</h2>
        <div className="space-y-3">
          {[
            { q: '이용권은 어디서 구매하나요?', a: '네이버 스마트스토어(오렌지도서관)에서 구매하실 수 있습니다. 추후 사이트 내 직접 결제도 지원 예정입니다.' },
            { q: '이용권 코드는 어떻게 받나요?', a: '스마트스토어에서 구매 완료 후 네이버 톡톡 또는 주문 상세에서 이용권 코드를 확인할 수 있습니다.' },
            { q: '이용권 유효기간은 얼마인가요?', a: '이용권 종류에 따라 다릅니다. 코드 등록 시점부터 유효기간이 시작됩니다.' },
            { q: '환불은 가능한가요?', a: '미사용 이용권은 스마트스토어 정책에 따라 환불 가능합니다. 이미 등록한 이용권은 환불이 불가합니다.' },
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
