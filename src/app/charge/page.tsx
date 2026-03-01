'use client';
import { mockPackages, mockPricing } from '@/data/mock-packages';

export default function ChargePage() {
  const currentBalance = 1200;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* 현재 잔액 */}
      <div className="bg-gradient-to-r from-accent to-accent2 rounded-2xl p-8 text-white text-center">
        <div className="text-sm font-semibold opacity-80 mb-2">현재 보유 포인트</div>
        <div className="text-5xl font-extrabold mb-1 font-rank">{currentBalance.toLocaleString()} <span className="text-2xl">P</span></div>
        <div className="text-xs opacity-70 mt-2">포인트로 키워드 상세, 순위, 트렌드 분석을 열람하세요</div>
      </div>

      {/* 충전 패키지 */}
      <section>
        <h2 className="text-lg font-extrabold mb-4">포인트 충전</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {mockPackages.map(pkg => (
            <div key={pkg.id}
              className={`relative bg-surface rounded-xl border-2 p-5 text-center transition-all hover:shadow-lg cursor-pointer ${
                pkg.is_popular ? 'border-accent shadow-accent/10' : 'border-border hover:border-accent/40'
              }`}>
              {pkg.is_popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-[10px] font-bold px-3 py-0.5 rounded-full">인기</div>
              )}
              <div className="text-sm font-bold text-dim mb-2">{pkg.name}</div>
              <div className="text-3xl font-extrabold font-rank mb-1">{pkg.point_amount.toLocaleString()}<span className="text-sm font-bold text-accent ml-0.5">P</span></div>
              {pkg.bonus_points > 0 && (
                <div className="text-xs font-bold text-up bg-up/12 inline-block px-2 py-0.5 rounded mb-2">+{pkg.bonus_points}P 보너스</div>
              )}
              <div className="text-lg font-extrabold text-accent mt-2 font-rank">{pkg.price_krw.toLocaleString()}원</div>
              <div className="text-[10px] text-dim mt-1">실질 {pkg.unit_price}원/P</div>
              <button className="mt-4 w-full py-2.5 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition-colors cursor-pointer">
                충전하기
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 가격표 */}
      <section>
        <h2 className="text-lg font-extrabold mb-4">소모 기준</h2>
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="text-left py-3 px-4 font-semibold text-dim text-xs">행동</th>
                <th className="text-right py-3 px-4 font-semibold text-dim text-xs">포인트</th>
                <th className="text-right py-3 px-4 font-semibold text-dim text-xs hidden sm:table-cell">비고</th>
              </tr>
            </thead>
            <tbody>
              {mockPricing.map(p => (
                <tr key={p.action_type} className="border-b border-border/50">
                  <td className="py-3 px-4 font-semibold">{p.description}</td>
                  <td className="py-3 px-4 text-right">
                    {p.is_free ? (
                      <span className="text-xs font-bold text-up bg-up/12 px-2 py-0.5 rounded-full">무료</span>
                    ) : (
                      <span className="font-bold text-accent font-rank">{p.point_cost}P</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-dim hidden sm:table-cell">
                    {p.action_type === 'keyword_detail' && '24시간 내 재열람 무료'}
                    {p.action_type === 'ranking_view' && '24시간 내 재열람 무료'}
                    {p.action_type === 'daily_recommendation_free' && '매일 리셋'}
                    {p.action_type === 'daily_recommendation_full' && '당일 한정'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-center text-xs text-dim py-4">
        결제는 토스페이먼츠를 통해 안전하게 처리됩니다.<br />
        충전된 포인트는 환불이 불가합니다.
      </div>
    </div>
  );
}
