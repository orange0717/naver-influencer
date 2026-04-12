import Link from 'next/link';

export default function AdvertiserPage() {
  return (
    <div className="space-y-10">

      {/* ── 히어로 ── */}
      <section className="text-center py-12 px-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-accent/10 rounded-full mb-4">
          <span className="text-accent text-sm font-bold">ORANGE CONNECT</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black mb-4 leading-tight">
          검증된 <span className="text-accent">인플루언서</span>와<br />
          <span className="text-accent">블로거</span>를 만나보세요
        </h1>
        <p className="text-dim text-base md:text-lg max-w-xl mx-auto leading-relaxed">
          N인플에 등록된 인플루언서·블로거의 실제 순위 데이터를 기반으로<br className="hidden md:block" />
          광고 효과가 높은 크리에이터를 직접 찾을 수 있습니다.
        </p>
      </section>

      {/* ── 광고주가 할 수 있는 것 ── */}
      <section className="max-w-4xl mx-auto px-4">
        <h2 className="text-xl font-bold text-center mb-8">오렌지커넥트에서 할 수 있는 것</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-surface border border-border rounded-2xl p-6 text-center hover:border-accent/40 transition-colors">
            <div className="w-12 h-12 mx-auto rounded-xl bg-accent/10 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2">AI 자연어 검색</h3>
            <p className="text-sm text-dim leading-relaxed">
              &quot;뷰티 팬수 1만명 이상&quot; 같은 자연어로 인플루언서를 검색하세요.
              95,000개 키워드 매칭으로 원하는 분야의 크리에이터를 찾아드립니다.
            </p>
            <Link href="/orangeconnect/search" className="inline-block mt-4 text-sm text-accent font-semibold hover:underline">
              AI 검색 시작 →
            </Link>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 text-center hover:border-accent/40 transition-colors">
            <div className="w-12 h-12 mx-auto rounded-xl bg-accent/10 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2">키워드 트렌드</h3>
            <p className="text-sm text-dim leading-relaxed">
              어떤 키워드가 뜨고 있는지, 경쟁도는 어떤지 데이터로 확인하세요.
              마케팅 전략 수립에 활용할 수 있습니다.
            </p>
            <Link href="/keywords" className="inline-block mt-4 text-sm text-accent font-semibold hover:underline">
              키워드 분석 →
            </Link>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 text-center relative overflow-hidden hover:border-accent/40 transition-colors">
            <div className="absolute top-3 right-3 text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full font-bold">COMING SOON</div>
            <div className="w-12 h-12 mx-auto rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2">캠페인 등록</h3>
            <p className="text-sm text-dim leading-relaxed">
              체험단·리뷰 캠페인을 등록하면 N인플의 블로거·인플루언서들에게 자동으로 노출됩니다.
            </p>
            <span className="inline-block mt-4 text-sm text-dim font-semibold">
              준비 중입니다
            </span>
          </div>
        </div>
      </section>

      {/* ── 왜 N인플인가 ── */}
      <section className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-xl font-bold text-center mb-8">왜 N인플에서 찾아야 할까요?</h2>
        <div className="space-y-4">
          {[
            { num: '01', title: '실제 순위 데이터 기반', desc: '가짜 팔로워가 아닌, 네이버 키워드챌린지 실제 순위 데이터로 영향력을 검증합니다.' },
            { num: '02', title: '카테고리별 정밀 검색', desc: '도서, 뷰티, 여행, 맛집 등 20개 카테고리에서 원하는 분야의 전문가를 찾을 수 있습니다.' },
            { num: '03', title: '합리적인 비용', desc: '소상공인도 부담 없는 합리적인 가격으로 인플루언서 마케팅을 시작할 수 있습니다.' },
            { num: '04', title: '성과 추적 가능', desc: '캠페인 진행 후 키워드 순위 변동과 노출 효과를 데이터로 확인할 수 있습니다.' },
          ].map(item => (
            <div key={item.num} className="flex gap-4 bg-surface border border-border rounded-xl p-5 hover:border-accent/30 transition-colors">
              <span className="text-2xl font-black text-accent/30 shrink-0">{item.num}</span>
              <div>
                <h3 className="font-bold text-sm mb-1">{item.title}</h3>
                <p className="text-sm text-dim">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 문의 CTA ── */}
      <section className="text-center py-10 px-4">
        <div className="max-w-md mx-auto bg-surface border border-border rounded-2xl p-8">
          <h3 className="font-bold text-lg mb-2">광고 문의</h3>
          <p className="text-sm text-dim mb-5 leading-relaxed">
            캠페인 등록, 대행사 제휴, 대량 의뢰 등<br />
            광고 관련 문의는 아래로 연락해주세요.
          </p>
          <a href="mailto:orange@orangelibrary.co.kr"
            className="inline-block px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent/90 transition text-sm">
            orange@orangelibrary.co.kr
          </a>
          <p className="text-[11px] text-dim mt-3">영업일 기준 1~2일 내 답변드립니다</p>
        </div>
      </section>

    </div>
  );
}
