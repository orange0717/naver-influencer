import Link from 'next/link';

const STEPS = [
  {
    step: '01',
    title: '회원가입',
    description: '이메일로 가입하고 네이버 인플루언서 계정을 연결하세요. 가입 즉시 키워드 분석을 시작할 수 있습니다.',
    link: '/auth/signup',
    linkText: '가입하기',
  },
  {
    step: '02',
    title: '대시보드 확인',
    description: '내 키워드 순위, 종합 점수, 경쟁자 분석까지 한눈에 확인하세요. 매일 자동으로 데이터가 업데이트됩니다.',
    link: '/my',
    linkText: '대시보드 보기',
  },
  {
    step: '03',
    title: '알림으로 대응',
    description: '순위 하락 위험 키워드, TOP 3 기회 키워드를 자동으로 감지합니다. 알림에 따라 콘텐츠를 전략적으로 작성하세요.',
    link: '/subscribe',
    linkText: 'PRO 시작하기',
  },
];

const FEATURES = [
  {
    title: '키워드 순위 실시간 추적',
    description: '내가 참여한 키워드챌린지의 순위를 매일 자동으로 수집합니다. 7일/15일/30일 추이 차트로 변동을 한눈에 파악하세요.',
    category: '핵심',
  },
  {
    title: '스마트 알림',
    description: '2일 연속 하락 중인 키워드는 "하락 위험"으로, 4~6위에서 상승 중인 키워드는 "TOP 3 기회"로 자동 분류합니다.',
    category: 'PRO',
  },
  {
    title: '성장 리포트',
    description: '지난 7일/30일간의 성과를 이전 기간과 비교합니다. 평균 순위, TOP 3 수, 키워드 수 변화를 한눈에 확인하세요.',
    category: 'PRO',
  },
  {
    title: '종합 점수',
    description: '영향력, 전문성, 노출도, 성장성, 활동성, 경쟁력 6가지 차원으로 인플루언서 역량을 분석합니다.',
    category: '핵심',
  },
  {
    title: '경쟁자 비교',
    description: '경쟁 인플루언서를 등록하면 겹치는 키워드에서 누가 앞서는지, 경쟁자가 내 키워드에 진입했는지 추적합니다.',
    category: 'PRO',
  },
  {
    title: '키워드 분석',
    description: '11만 개 이상의 키워드에서 참여자 수, 검색량, 경쟁도를 분석합니다. 블루오션 키워드를 발굴하세요.',
    category: '무료',
  },
  {
    title: '포스팅 분석',
    description: '내 포스팅별로 어떤 키워드에서 몇 위인지 분석합니다. 하나의 포스팅이 여러 키워드에 영향을 주는 구조를 파악하세요.',
    category: 'PRO',
  },
  {
    title: '순위 위젯',
    description: '내 블로그에 키워드 순위 위젯을 삽입할 수 있습니다. HTML 코드를 복사해서 블로그 사이드바에 붙여넣기만 하면 됩니다.',
    category: '핵심',
  },
];

const FAQS = [
  {
    q: '가입하면 바로 순위를 볼 수 있나요?',
    a: '네, 가입 시 인플루언서 계정을 연결하면 이미 수집된 키워드 순위 데이터를 바로 확인할 수 있습니다. 신규 키워드는 다음 날부터 수집됩니다.',
  },
  {
    q: '무료와 PRO의 차이는 무엇인가요?',
    a: '무료로 키워드 검색, 인플루언서 검색, 커뮤니티를 이용할 수 있습니다. PRO에서는 내 순위 추적, 스마트 알림, 성장 리포트, 경쟁자 비교 등 대시보드 전체 기능을 이용할 수 있습니다.',
  },
  {
    q: '데이터는 어떻게 수집되나요?',
    a: '네이버 키워드챌린지 순위를 매일 자동으로 크롤링합니다. 내 인플루언서 계정에 연결된 키워드의 순위, 경쟁자 정보, 검색량 등을 수집합니다.',
  },
  {
    q: '경쟁자는 몇 명까지 등록할 수 있나요?',
    a: '제한 없이 등록할 수 있습니다. 같은 키워드에 참여하는 인플루언서를 등록하면 겹치는 키워드에서 순위를 비교할 수 있습니다.',
  },
  {
    q: '해지는 어떻게 하나요?',
    a: '마이페이지에서 언제든지 구독을 해지할 수 있습니다. 해지해도 남은 기간까지 정상적으로 이용 가능합니다.',
  },
];

export default function GuidePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-16">

      {/* ─── 히어로 ─── */}
      <div className="text-center space-y-4">
        <p className="text-xs text-accent font-semibold tracking-widest">SERVICE GUIDE</p>
        <h1 className="text-3xl md:text-4xl font-extrabold">
          N인플 서비스 가이드
        </h1>
        <p className="text-dim text-sm md:text-base max-w-lg mx-auto leading-relaxed">
          키워드챌린지 순위를 추적하고, 하락에 대응하고, TOP 3 기회를 포착하세요.
          <br />
          N인플이 데이터로 도와드립니다.
        </p>
      </div>

      {/* ─── 3단계 시작 ─── */}
      <div className="space-y-6">
        <h2 className="text-xl font-extrabold text-center">3단계로 시작하세요</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map(s => (
            <div key={s.step} className="bg-surface rounded-2xl border border-border p-6 space-y-3">
              <span className="text-3xl font-extrabold text-accent/20">{s.step}</span>
              <h3 className="font-bold text-lg">{s.title}</h3>
              <p className="text-sm text-dim leading-relaxed">{s.description}</p>
              <Link href={s.link} className="inline-block text-sm text-accent font-semibold hover:underline">
                {s.linkText} →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 주요 기능 ─── */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-extrabold">주요 기능</h2>
          <p className="text-sm text-dim mt-1">인플루언서를 위한 데이터 분석 도구</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-surface rounded-xl border border-border p-5 space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">{f.title}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  f.category === 'PRO' ? 'bg-accent/10 text-accent' :
                  f.category === '무료' ? 'bg-up/10 text-up' :
                  'bg-border/50 text-dim'
                }`}>{f.category}</span>
              </div>
              <p className="text-xs text-dim leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── 요금 안내 ─── */}
      <div className="bg-bg rounded-2xl border border-border p-8 text-center space-y-4">
        <h2 className="text-xl font-extrabold">요금 안내</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
          <div className="bg-surface rounded-xl border border-border p-5">
            <p className="text-xs text-dim font-semibold mb-1">무료</p>
            <p className="text-2xl font-extrabold">0원</p>
            <p className="text-xs text-dim mt-1">키워드 검색 / 인플루언서 검색 / 커뮤니티</p>
          </div>
          <div className="bg-surface rounded-xl border-2 border-accent p-5">
            <p className="text-xs text-accent font-semibold mb-1">PRO</p>
            <p className="text-2xl font-extrabold">19,800원<span className="text-sm font-normal text-dim">/월</span></p>
            <p className="text-xs text-dim mt-1">대시보드 전체 기능 / 알림 / 경쟁자 분석</p>
          </div>
        </div>
        <p className="text-xs text-dim">연간 결제 시 25% 할인 (월 14,850원) · VAT 포함</p>
        <Link href="/subscribe" className="inline-block px-8 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition text-sm">
          PRO 시작하기
        </Link>
      </div>

      {/* ─── FAQ ─── */}
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold text-center">자주 묻는 질문</h2>
        <div className="space-y-3">
          {FAQS.map(faq => (
            <details key={faq.q} className="bg-surface rounded-xl border border-border overflow-hidden group">
              <summary className="px-5 py-4 text-sm font-semibold cursor-pointer list-none flex items-center justify-between">
                {faq.q}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
                  className="text-dim shrink-0 transition-transform group-open:rotate-180">
                  <path d="M4 6l4 4 4-4"/>
                </svg>
              </summary>
              <div className="px-5 pb-4">
                <p className="text-xs text-dim leading-relaxed">{faq.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>

      {/* ─── 하단 CTA ─── */}
      <div className="text-center space-y-4">
        <h2 className="text-xl font-extrabold">지금 시작하세요</h2>
        <p className="text-sm text-dim">무료 가입으로 키워드 분석을 바로 시작할 수 있습니다.</p>
        <div className="flex justify-center gap-3">
          <Link href="/auth/signup" className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition text-sm">
            무료 회원가입
          </Link>
          <Link href="/subscribe" className="px-6 py-3 border border-accent text-accent font-bold rounded-xl hover:bg-accent/5 transition text-sm">
            PRO 요금 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
