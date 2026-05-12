'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import BillingButton from '@/components/BillingButton';
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

export default function SubscribeClient() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const [callbackStatus, setCallbackStatus] = useState<'processing' | 'success' | 'error' | null>(null);
  const [period, setPeriod] = useState<BillingPeriod>('monthly');

  // 모바일 리다이렉트 콜백 처리 — Stage 6 빌링키 구현 후 재작성 예정
  useEffect(() => {
    // 결제 모듈 재구성 중 (2026-05-03)
  }, [searchParams]);

  const price = PRICE_TABLE[period];
  const bloggerPlanKey = PLAN_KEY[period].blogger;
  const influencerPlanKey = PLAN_KEY[period].influencer;
  // 월 환산 (1개월 제외)
  const bloggerMonthly = period === 'monthly' ? null : Math.round(price.blogger / price.months);
  const influencerMonthly = period === 'monthly' ? null : Math.round(price.influencer / price.months);
  const periodBadge = PERIOD_OPTIONS.find((o) => o.value === period)?.badge;

  // 데모 재시작 차단 — /subscribe?demo_used=1 로 리다이렉트되었을 때 안내
  const isDemoUsed = searchParams.get('demo_used') === '1';

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {/* 무료 체험 종료 안내 */}
      {isDemoUsed && (
        <div className="bg-accent/10 border border-accent/30 rounded-2xl p-5 flex items-start gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent shrink-0 mt-0.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <p className="text-sm font-bold text-accent">무료 체험 기간이 종료되었습니다</p>
            <p className="text-xs text-text/80 mt-1 leading-relaxed">
              이미 3일 무료 체험을 사용하셨습니다. 계속 이용하시려면 아래에서 이용권을 구독해주세요.
            </p>
          </div>
        </div>
      )}

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
            회원가입(무료)으로 기본 기능을 자유롭게 이용하세요.
          </p>
          <Link
            href="/auth/signup"
            className="block text-center py-3 bg-bg border border-border text-text font-bold text-sm rounded-xl hover:border-accent/40 transition"
          >
            무료로 시작하기
          </Link>
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 블로그</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>인플루언서 리스트</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>연도별 인플루언서 선정 현황</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 검색 (검색량 포함)</span></li>
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
            <BillingButton
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
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 검색순위</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>실시간 상승 키워드</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>맞춤법 검사 <span className="text-[10px] text-dim">(데모 제외)</span></span></li>
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
            <BillingButton
              planKey={influencerPlanKey}
              label={`${formatKRW(price.influencer)}원 결제하기`}
              className="w-full block text-center py-3 bg-accent/10 text-accent font-bold text-sm rounded-xl hover:bg-accent/20 transition disabled:opacity-50"
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
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 키워드 챌린지</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 챌린지 리스트</span></li>
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
                <td className="py-2.5 px-2">연도별 인플루언서 선정 현황</td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>

              {/* 키워드 카테고리 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim pt-5" colSpan={4}>키워드</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">키워드 검색 <span className="text-[10px] text-dim">(검색량 포함)</span></td>
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

              {/* 글쓰기 카테고리 */}
              <tr>
                <td className="py-2.5 px-2 font-semibold text-dim pt-5" colSpan={4}>글쓰기</td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">맞춤법 검사 <span className="text-[10px] text-dim">(데모 제외)</span></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
                <td className="text-center"><div className="flex justify-center">{CHECK}</div></td>
              </tr>
              <tr>
                <td className="py-2.5 px-2">블로그 글 피드백 (Claude AI) <span className="text-[10px] text-dim">(데모 제외)</span></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
                <td className="text-center"><div className="flex justify-center">{DASH}</div></td>
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
              <p className="font-semibold">신용/체크카드 단건 결제 (PortOne)</p>
            </div>
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-dim">무료 체험</p>
              <p className="font-semibold">3일 (가입 전 인플루언서/블로그 주소 입력)</p>
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
