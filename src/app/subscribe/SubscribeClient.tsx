'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PaymentButton, { completePayment } from '@/components/PaymentButton';
import { useAuth } from '@/hooks/useAuth';

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
);

const DASH = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim/30 shrink-0"><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

type BillingPeriod = 'monthly' | '3m' | '6m' | '9m' | 'annual';

const PERIOD_OPTIONS: { value: BillingPeriod; label: string; badge?: string }[] = [
  { value: 'monthly', label: '1개월' },
  { value: '3m', label: '3개월', badge: '5% 할인' },
  { value: '6m', label: '6개월', badge: '10% 할인' },
  { value: '9m', label: '9개월', badge: '15% 할인' },
  { value: 'annual', label: '12개월', badge: '2개월 무료' },
];

// 할인 정책: 3m -5%, 6m -10%, 9m -15%, 12m 2개월 무료(=10개월치)
const PRICE_TABLE: Record<BillingPeriod, { blogger: number; influencer: number; suffix: string; months: number }> = {
  monthly: { blogger: 5500,  influencer: 9900,   suffix: '/월',     months: 1  },
  '3m':    { blogger: 15700, influencer: 28200,  suffix: '/3개월',  months: 3  },
  '6m':    { blogger: 29700, influencer: 53500,  suffix: '/6개월',  months: 6  },
  '9m':    { blogger: 42100, influencer: 75700,  suffix: '/9개월',  months: 9  },
  annual:  { blogger: 55000, influencer: 99000,  suffix: '/년',     months: 12 },
};

const PLAN_KEY: Record<BillingPeriod, { blogger: string; influencer: string }> = {
  monthly: { blogger: 'BLOGGER_MONTHLY', influencer: 'INFLUENCER_MONTHLY' },
  '3m':    { blogger: 'BLOGGER_3M',      influencer: 'INFLUENCER_3M' },
  '6m':    { blogger: 'BLOGGER_6M',      influencer: 'INFLUENCER_6M' },
  '9m':    { blogger: 'BLOGGER_9M',      influencer: 'INFLUENCER_9M' },
  annual:  { blogger: 'BLOGGER_ANNUAL',  influencer: 'INFLUENCER_ANNUAL' },
};

const formatKRW = (v: number) => v.toLocaleString('ko-KR');

// ─────────── FAQ 데이터 ───────────
type FaqItem = { q: string; a: string };

const HIGHLIGHT_FAQ: FaqItem[] = [
  { q: '무료 체험 기간이 있나요?', a: '회원가입 시 3일 무료 체험이 자동으로 적용됩니다. 인플루언서 플랜 기능을 모두 사용해보실 수 있습니다.' },
  { q: '환불은 어떻게 받나요?', a: '구매일로부터 7일 이내 미이용 시 전액 환불, 이용한 경우 잔여 일수 기준 일할 계산으로 환불해 드립니다. 마이페이지 또는 orange@orangelibrary.co.kr 로 신청해 주세요.' },
  { q: '여러 기기에서 동시 로그인 가능한가요?', a: '전 플랜 공통 1대만 가능합니다. 다른 기기에서 로그인하면 기존 기기는 자동 로그아웃됩니다. 계정 공유는 사실상 불가능합니다.' },
  { q: '인플루언서·키워드 데이터는 얼마나 자주 갱신되나요?', a: '키워드 데이터는 일 1회, 인플루언서 데이터는 주 1회 갱신됩니다. 현재 인플루언서 19,980명 / 블로거 83,933명 데이터를 보유 중입니다.' },
  { q: '예비 인플루언서와 인플루언서 플랜 차이는?', a: '예비 인플루언서는 블로거 단계에 필요한 도구(키워드 순위·포스팅 분석·블로그 순위 등)를 제공합니다. 인플루언서 플랜은 여기에 키워드 챌린지 리스트, 인플루언서 공식·자체 순위, AI 심층 피드백, 블로그 글 피드백(Claude AI)까지 포함됩니다.' },
];

const ALL_FAQ_GROUPS: { category: string; items: FaqItem[] }[] = [
  {
    category: '결제·환불',
    items: [
      { q: '유료 결제는 언제부터 가능한가요?', a: '카드사·PG(PortOne) 승인 완료 후 순차 오픈 예정입니다. 오픈 일정은 공지사항에서 안내드립니다.' },
      { q: '무료 체험 기간이 있나요?', a: '회원가입 시 3일 무료 체험이 자동으로 적용됩니다.' },
      { q: '환불은 어떻게 받나요?', a: '구매일로부터 7일 이내 미이용 시 전액 환불, 이용한 경우 잔여 일수 기준 일할 계산으로 환불됩니다.' },
      { q: '결제 주기를 길게 하면 얼마나 할인되나요?', a: '3개월 5%, 6개월 10%, 9개월 15%, 12개월은 2개월 무료(=10개월치) 가격으로 결제됩니다.' },
    ],
  },
  {
    category: '계정·보안',
    items: [
      { q: '여러 기기에서 동시 로그인 가능한가요?', a: '전 플랜 공통 1대만 가능합니다. 다른 기기에서 로그인하면 기존 기기는 자동 로그아웃됩니다.' },
      { q: '계정을 가족·동료와 공유해도 되나요?', a: '동시 로그인 1대 제한으로 사실상 공유가 불가능합니다. 1인 1계정 원칙을 따라주세요.' },
      { q: '회원 탈퇴는 어떻게 하나요?', a: '마이페이지에서 탈퇴 가능하며, 결제 내역은 환불 정책에 따라 처리됩니다.' },
    ],
  },
  {
    category: '데이터·기능',
    items: [
      { q: '인플루언서·키워드 데이터는 얼마나 자주 갱신되나요?', a: '키워드 일 1회, 인플루언서 주 1회 갱신됩니다. 현재 인플루언서 19,980명, 블로거 83,933명 데이터를 보유 중입니다.' },
      { q: '블로거 순위 데이터는 어디서 가져오나요?', a: 'Naver Open API 기반 자체 크롤러로 수집합니다. 크롤러 정보는 /bot-info 페이지에서 투명하게 공개하고 있습니다.' },
      { q: 'AI 심층 피드백은 어떤 모델을 쓰나요?', a: 'Anthropic의 Claude Opus 4.6 모델을 사용합니다. 4영역(기능·구조·언어·가독성) 품질 평가와 강점·개선점을 제공합니다.' },
      { q: '데이터 다운로드는 어떤 형식인가요?', a: 'CSV 형식으로 제공됩니다. 포스팅 데이터는 예비 1회 500건 / 인플 무제한, 키워드 데이터는 인플 1회 500건입니다.' },
    ],
  },
  {
    category: '플랜·기능',
    items: [
      { q: '예비 인플루언서와 인플루언서 차이는?', a: '예비 인플루언서는 블로거 단계 도구(키워드 순위·포스팅 분석·블로그 순위 등)를, 인플루언서 플랜은 추가로 키워드 챌린지 리스트·공식 및 자체 인플루언서 순위·AI 심층 피드백·Claude AI 피드백까지 포함합니다.' },
      { q: '무료로도 충분히 쓸 수 있나요?', a: '인플루언서 검색·키워드 검색·검색량 조회·구글 트렌드 등 기본 기능은 무료로 무제한 이용 가능합니다.' },
      { q: '"개발 중" 표시는 언제 풀리나요?', a: 'MY 캠페인·MY 정산내역·블로그 품질지수·캐릭터챗북은 순차적으로 출시될 예정입니다. 출시 시 공지사항으로 안내드립니다.' },
    ],
  },
];

export default function SubscribeClient() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const [callbackStatus, setCallbackStatus] = useState<'processing' | 'success' | 'error' | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(null);
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [openModalKey, setOpenModalKey] = useState<string | null>(null);

  // 모달 열림 시 ESC 키로 닫기 + body 스크롤 잠금
  useEffect(() => {
    if (!faqModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFaqModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [faqModalOpen]);

  // 모바일 리다이렉트 콜백 처리
  useEffect(() => {
    const payment = searchParams.get('payment');
    const paymentId = searchParams.get('paymentId');

    if (payment === 'portone' && paymentId) {
      setCallbackStatus('processing');
      completePayment(paymentId).then((success) => {
        setCallbackStatus(success ? 'success' : 'error');
        window.history.replaceState({}, '', '/subscribe');
      });
    }
  }, [searchParams]);

  const price = PRICE_TABLE[period];
  const bloggerPlanKey = PLAN_KEY[period].blogger;
  const influencerPlanKey = PLAN_KEY[period].influencer;
  // 월 환산 (1개월 제외)
  const bloggerMonthly = period === 'monthly' ? null : Math.round(price.blogger / price.months);
  const influencerMonthly = period === 'monthly' ? null : Math.round(price.influencer / price.months);
  const periodBadge = PERIOD_OPTIONS.find((o) => o.value === period)?.badge;

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {/* 콜백 상태 */}
      {callbackStatus === 'processing' && (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-dim">결제를 확인하고 있습니다...</p>
        </div>
      )}
      {callbackStatus === 'success' && (
        <div className="bg-up/10 rounded-2xl border border-up/30 p-8 text-center">
          <p className="text-sm text-up font-bold">결제가 완료되었습니다. 이용권이 활성화되었습니다.</p>
          <Link href="/my" className="text-xs text-accent mt-2 inline-block hover:underline">대시보드로 이동</Link>
        </div>
      )}
      {callbackStatus === 'error' && (
        <div className="bg-down/10 rounded-2xl border border-down/30 p-8 text-center">
          <p className="text-sm text-down font-bold">결제 확인에 실패했습니다. 관리자에게 문의해주세요.</p>
        </div>
      )}

      {/* 헤더 */}
      <div className="text-center space-y-3">
        <p className="text-sm text-accent font-semibold tracking-wide">PRICING</p>
        <h1 className="font-title text-3xl font-extrabold">이용권 안내</h1>
        <p className="text-sm text-dim">나에게 맞는 플랜을 선택하세요</p>
      </div>

      {/* 결제 주기 토글 (5개) */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap gap-1 bg-surface border border-border rounded-xl p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                period === opt.value ? 'bg-accent text-white' : 'text-dim hover:text-text'
              }`}
            >
              {opt.label}
              {opt.badge && (
                <span className={`text-[10px] ml-1 ${period === opt.value ? 'text-white/80' : 'text-accent'}`}>
                  ({opt.badge})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 3열 플랜 카드 */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* 무료 */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <div>
            <p className="text-xs text-dim font-semibold">FREE</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-black">0</span>
              <span className="text-sm text-dim">원</span>
            </div>
          </div>
          <p className="text-sm text-dim leading-relaxed">
            회원가입 없이 기본 기능을 자유롭게 이용하세요.
          </p>
          <Link
            href="/influencers"
            className="block text-center py-3 bg-bg border border-border text-text font-bold text-sm rounded-xl hover:border-accent/40 transition"
          >
            무료로 시작하기
          </Link>
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 블로그</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>인플루언서 리스트</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>연도별 선정 현황</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 검색</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>검색량 조회</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 구글 트렌드</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>경쟁자 분석 (1일 1회)</span></li>
          </ul>
        </div>

        {/* 예비 인플루언서 */}
        <div className="bg-surface rounded-2xl border-2 border-accent p-6 space-y-5 relative">
          <div className="absolute -top-3 left-6 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-full">
            추천
          </div>
          <div>
            <p className="text-xs text-accent font-semibold">예비 인플루언서</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-black">{formatKRW(price.blogger)}</span>
              <span className="text-sm text-dim">원{price.suffix}</span>
            </div>
            {bloggerMonthly && (
              <p className="text-[11px] text-accent font-semibold">월 {formatKRW(bloggerMonthly)}원{periodBadge ? ` (${periodBadge})` : ''}</p>
            )}
          </div>
          <p className="text-sm text-dim leading-relaxed">
            인플루언서를 준비하는 블로거를 위한 플랜
          </p>

          {isLoggedIn ? (
            <PaymentButton
              planKey={bloggerPlanKey}
              label={`${formatKRW(price.blogger)}원 결제하기`}
            />
          ) : (
            <Link
              href="/auth/signup"
              className="block text-center py-3 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition"
            >
              3일 무료체험
            </Link>
          )}

          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">{CHECK}<span>무료 플랜 전체 포함</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 키워드순위</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 포스팅 분석</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 캠페인 (개발 중)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 검색순위</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>실시간 상승 키워드</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>블로그 순위</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>블로그 품질지수 (개발 중)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>맞춤법 검사</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>캐릭터챗북 (개발 중)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>커뮤니티</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>포스팅 데이터 다운로드 (1회 500건)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>경쟁자 분석 (1일 5회)</span></li>
          </ul>
        </div>

        {/* 인플루언서 */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <div>
            <p className="text-xs text-accent font-semibold">INFLUENCER</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-black">{formatKRW(price.influencer)}</span>
              <span className="text-sm text-dim">원{price.suffix}</span>
            </div>
            {influencerMonthly && (
              <p className="text-[11px] text-accent font-semibold">월 {formatKRW(influencerMonthly)}원{periodBadge ? ` (${periodBadge})` : ''}</p>
            )}
          </div>
          <p className="text-sm text-dim leading-relaxed">
            네이버 인플루언서를 위한 프리미엄 플랜
          </p>

          {isLoggedIn ? (
            <PaymentButton
              planKey={influencerPlanKey}
              label={`${formatKRW(price.influencer)}원 결제하기`}
              className="!bg-accent/10 !text-accent hover:!bg-accent/20"
            />
          ) : (
            <Link
              href="/auth/signup"
              className="block text-center py-3 bg-accent/10 text-accent font-bold text-sm rounded-xl hover:bg-accent/20 transition"
            >
              3일 무료체험
            </Link>
          )}

          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">{CHECK}<span>예비 인플루언서 플랜 전체 포함</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 정산내역 (개발 중)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 키워드 챌린지</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 챌린지 리스트</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>인플루언서 순위 — 공식</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>인플루언서 순위 — 자체</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>AI 심층 피드백</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>블로그 글 피드백 (Claude AI)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>포스팅 데이터 다운로드 (무제한)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 데이터 다운로드 (1회 500건)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>경쟁자 분석 (무제한)</span></li>
          </ul>
        </div>
      </div>

      {/* 안내 */}
      <div className="text-center space-y-2">
        <p className="text-sm text-dim">사용처 — 서버비, 네이버 API, 클로드 API 비용에 사용됩니다.</p>
      </div>

      {/* 기능과 스펙 비교표 */}
      <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-bold">기능과 스펙</h2>
          <p className="text-xs text-dim">플랜별 제공 기능을 한눈에 비교하세요</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-2 font-semibold text-dim w-2/5">기능</th>
                <th className="text-center py-3 px-2 font-semibold">무료</th>
                <th className="text-center py-3 px-2 font-semibold text-accent">예비 인플루언서</th>
                <th className="text-center py-3 px-2 font-semibold text-accent">인플루언서</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* 계정 카테고리 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim" colSpan={4}>계정</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">동시 로그인 기기</td>
                <td className="text-center text-[11px] text-dim">1대</td>
                <td className="text-center text-[11px] text-dim">1대</td>
                <td className="text-center text-[11px] text-dim">1대</td>
              </tr>

              {/* MY 카테고리 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim pt-5" colSpan={4}>MY</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">MY 블로그</td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">MY 키워드순위</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">MY 포스팅 분석</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">포스팅 데이터 다운로드</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center text-[11px] text-accent font-semibold">1회 500건</td>
                <td className="text-center text-[11px] text-accent font-semibold">무제한</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">MY 캠페인 <span className="text-[10px] text-dim">(개발 중)</span></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">MY 정산내역 <span className="text-[10px] text-dim">(개발 중)</span></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">MY 키워드 챌린지</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>

              {/* 인플루언서 카테고리 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim pt-5" colSpan={4}>인플루언서</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">인플루언서 리스트</td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">연도별 선정 현황</td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>

              {/* 키워드 카테고리 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim pt-5" colSpan={4}>키워드</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">키워드 검색</td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">검색량 조회</td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">키워드 구글 트렌드</td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">키워드 검색순위</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">실시간 상승 키워드</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">키워드 챌린지 리스트</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">키워드 데이터 다운로드</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center text-[11px] text-accent font-semibold">1회 500건</td>
              </tr>

              {/* 랭킹 카테고리 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim pt-5" colSpan={4}>랭킹</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">블로그 순위</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">블로그 품질지수 <span className="text-[10px] text-dim">(개발 중)</span></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">인플루언서 순위 — 공식</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">인플루언서 순위 — 자체</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>

              {/* 글쓰기 카테고리 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim pt-5" colSpan={4}>글쓰기</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">맞춤법 검사</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">블로그 글 피드백 (Claude AI)</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">AI 심층 피드백</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">캐릭터챗북 <span className="text-[10px] text-dim">(개발 중)</span></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>

              {/* 도구 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim pt-5" colSpan={4}>도구</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">경쟁자 분석</td>
                <td className="text-center text-[11px] text-dim">1일 1회</td>
                <td className="text-center text-[11px] text-accent font-semibold">1일 5회</td>
                <td className="text-center text-[11px] text-accent font-semibold">무제한</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">커뮤니티</td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 운영 스펙 */}
        <div className="border-t border-border pt-5 space-y-3">
          <h3 className="text-sm font-bold">운영 스펙</h3>
          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-dim">데이터 갱신 주기</p>
              <p className="font-semibold">키워드 일 1회 / 인플루언서 주 1회</p>
            </div>
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-dim">수집 인플루언서</p>
              <p className="font-semibold">전체 19,980명 (활동 13,104명)</p>
            </div>
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-dim">결제 방식</p>
              <p className="font-semibold">신용/체크카드, 간편결제 (PortOne)</p>
            </div>
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-dim">무료 체험</p>
              <p className="font-semibold">3일 (회원가입 시 자동 적용)</p>
            </div>
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-dim">결제 주기</p>
              <p className="font-semibold">1 / 3(-5%) / 6(-10%) / 9(-15%) / 12개월(2개월 무료)</p>
            </div>
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-dim">고객 지원</p>
              <p className="font-semibold">네이버 톡톡 / 이메일</p>
            </div>
          </div>
        </div>
      </div>

      {/* 자주 묻는 질문 (핵심 5개 아코디언) */}
      <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">자주 묻는 질문</h2>
          <button
            onClick={() => setFaqModalOpen(true)}
            className="text-xs text-accent font-semibold hover:underline cursor-pointer"
          >
            전체 FAQ 보기
          </button>
        </div>
        <ul className="divide-y divide-border">
          {HIGHLIGHT_FAQ.map((item, idx) => {
            const open = openFaqIdx === idx;
            return (
              <li key={idx} className="py-3">
                <button
                  onClick={() => setOpenFaqIdx(open ? null : idx)}
                  className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <span className="text-sm font-semibold">{item.q}</span>
                  <span className={`text-dim transition-transform ${open ? 'rotate-180' : ''}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </span>
                </button>
                {open && (
                  <p className="mt-2 text-xs text-dim leading-relaxed whitespace-pre-line">{item.a}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* 전체 FAQ 모달 */}
      {faqModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setFaqModalOpen(false)}
        >
          <div
            className="bg-surface w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[80vh] rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-base font-bold">전체 FAQ</h3>
              <button
                onClick={() => setFaqModalOpen(false)}
                className="text-dim hover:text-text cursor-pointer"
                aria-label="닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-6">
              {ALL_FAQ_GROUPS.map((group) => (
                <section key={group.category} className="space-y-2">
                  <h4 className="text-xs font-bold text-accent">{group.category}</h4>
                  <ul className="divide-y divide-border">
                    {group.items.map((item, idx) => {
                      const key = `${group.category}-${idx}`;
                      const open = openModalKey === key;
                      return (
                        <li key={key} className="py-3">
                          <button
                            onClick={() => setOpenModalKey(open ? null : key)}
                            className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
                          >
                            <span className="text-sm font-semibold">{item.q}</span>
                            <span className={`text-dim transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                            </span>
                          </button>
                          {open && (
                            <p className="mt-2 text-xs text-dim leading-relaxed whitespace-pre-line">{item.a}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border text-center">
              <p className="text-[11px] text-dim">추가 문의는 네이버 톡톡 또는 orange@orangelibrary.co.kr</p>
            </div>
          </div>
        </div>
      )}

      {/* 환불 정책 */}
      <div className="bg-surface rounded-2xl border border-border p-6 space-y-3">
        <h2 className="text-sm font-bold">환불 정책</h2>
        <ul className="space-y-1.5 text-xs text-dim leading-relaxed">
          <li>- 구매일로부터 7일 이내 미이용 시 전액 환불</li>
          <li>- 이용한 경우: 잔여 일수 기준 일할 계산으로 환불</li>
          <li>- 환불 신청: 마이페이지 또는 orange@orangelibrary.co.kr</li>
          <li>- 처리 기간: 영업일 기준 3~5일 이내</li>
        </ul>
        <Link href="/terms" className="text-[11px] text-accent hover:underline inline-block">
          전체 이용약관 보기
        </Link>
      </div>
    </div>
  );
}
