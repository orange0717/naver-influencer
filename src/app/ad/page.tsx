import Link from 'next/link';

export default function AdCenterPage() {
  return (
    <div className="space-y-10">

      {/* ── 히어로 ── */}
      <section className="text-center py-12 px-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 rounded-full mb-4">
          <span className="text-blue-500 text-sm font-bold">AD CENTER</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-black mb-4 leading-tight">
          검증된 <span className="text-blue-500">인플루언서</span>와<br />
          <span className="text-accent">블로거</span>를 찾아보세요
        </h1>
        <p className="text-dim text-base md:text-lg max-w-xl mx-auto leading-relaxed">
          N인플에 등록된 인플루언서·블로거의 실제 순위 데이터를 기반으로<br className="hidden md:block" />
          광고 효과가 높은 크리에이터를 빠르게 찾을 수 있습니다.
        </p>
      </section>

      {/* ── 광고주가 할 수 있는 것 ── */}
      <section className="max-w-4xl mx-auto px-4">
        <h2 className="text-xl font-bold text-center mb-8">광고주·대행사를 위한 기능</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-surface border border-border rounded-2xl p-6 text-center hover:border-blue-400/40 transition-colors">
            <div className="w-12 h-12 mx-auto rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2">인플루언서 검색</h3>
            <p className="text-sm text-dim leading-relaxed">
              카테고리·키워드별 TOP 순위 인플루언서를 한눈에 확인하세요.
              실제 순위 데이터 기반으로 영향력을 검증할 수 있습니다.
            </p>
            <Link href="/influencers" className="inline-block mt-4 text-sm text-blue-500 font-semibold hover:underline">
              인플루언서 검색 →
            </Link>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 text-center hover:border-blue-400/40 transition-colors">
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

          <div className="bg-surface border border-border rounded-2xl p-6 text-center relative overflow-hidden hover:border-blue-400/40 transition-colors">
            <div className="absolute top-3 right-3 text-[10px] text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full font-bold">COMING SOON</div>
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
            <div key={item.num} className="flex gap-4 bg-surface border border-border rounded-xl p-5 hover:border-blue-400/30 transition-colors">
              <span className="text-2xl font-black text-blue-500/30 shrink-0">{item.num}</span>
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
            className="inline-block px-6 py-3 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition text-sm">
            orange@orangelibrary.co.kr
          </a>
          <p className="text-[11px] text-dim mt-3">영업일 기준 1~2일 내 답변드립니다</p>
        </div>
      </section>

    </div>
  );
}
