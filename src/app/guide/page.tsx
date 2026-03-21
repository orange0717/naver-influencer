import Link from 'next/link';
import { MONTHLY_PRICE, YEARLY_PRICE } from '@/lib/plans';

/* ── 브라우저 프레임 ── */
function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50 bg-border/20">
        <span className="w-2.5 h-2.5 rounded-full bg-down/40" />
        <span className="w-2.5 h-2.5 rounded-full bg-gold/40" />
        <span className="w-2.5 h-2.5 rounded-full bg-up/40" />
        <span className="ml-2 text-[10px] text-dim/60 truncate">{url}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ── 기능 카드 데이터 ── */
const FEATURES = [
  {
    url: 'ninfl.co.kr/my',
    title: '키워드 순위 추적',
    description: '내가 참여한 키워드챌린지 순위를 매일 자동으로 수집합니다. 순위 변동을 한눈에 파악하세요.',
    link: '/my',
    linkText: '대시보드 보기',
    mockup: 'ranking',
  },
  {
    url: 'ninfl.co.kr/my#alerts',
    title: '스마트 알림',
    description: '하락 위험 키워드와 TOP 3 진입 기회 키워드를 자동으로 감지하여 알려드립니다.',
    link: '/subscribe',
    linkText: 'PRO 시작하기',
    mockup: 'alerts',
  },
  {
    url: 'ninfl.co.kr/keywords',
    title: '키워드 분석',
    description: '11만 개 이상의 키워드에서 참여자 수, 검색량, 경쟁도를 분석합니다. 블루오션을 발굴하세요.',
    link: '/keywords',
    linkText: '무료로 검색하기',
    mockup: 'keywords',
  },
  {
    url: 'ninfl.co.kr/my#competitors',
    title: '경쟁자 비교',
    description: '경쟁 인플루언서를 등록하면 겹치는 키워드에서 누가 앞서는지 실시간으로 비교합니다.',
    link: '/subscribe',
    linkText: 'PRO 시작하기',
    mockup: 'competitors',
  },
  {
    url: 'ninfl.co.kr/my#score',
    title: '종합 점수 분석',
    description: '영향력, 전문성, 노출도, 성장성, 활동성, 경쟁력 6가지 차원으로 역량을 분석합니다.',
    link: '/my',
    linkText: '내 점수 확인',
    mockup: 'score',
  },
];

/* ── 목업 컴포넌트들 ── */
function RankingMockup() {
  const rows = [
    { kw: '제주도맛집', rank: 2, change: 1, tag: 'top3' },
    { kw: '부산여행', rank: 5, change: -2, tag: 'down' },
    { kw: '서울카페', rank: 1, change: 0, tag: 'top3' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">실시간</span>
        <span className="text-[10px] text-dim">3개 키워드 참여 중</span>
      </div>
      {rows.map(r => (
        <div key={r.kw} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2 border border-border/50">
          <span className="text-xs font-semibold">{r.kw}</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${r.tag === 'top3' ? 'text-accent' : 'text-text'}`}>{r.rank}위</span>
            <span className={`text-[10px] font-bold ${r.change > 0 ? 'text-up' : r.change < 0 ? 'text-down' : 'text-dim'}`}>
              {r.change > 0 ? `+${r.change}` : r.change < 0 ? r.change : '-'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertsMockup() {
  return (
    <div className="space-y-2">
      <div className="bg-down/10 border border-down/20 rounded-lg px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold text-down bg-down/15 px-1.5 py-0.5 rounded">하락 위험</span>
        </div>
        <p className="text-[11px] text-dim"><span className="font-semibold text-text">부산여행</span> 2일 연속 하락 중 (3위 → 5위)</p>
      </div>
      <div className="bg-up/10 border border-up/20 rounded-lg px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-bold text-up bg-up/15 px-1.5 py-0.5 rounded">TOP 3 기회</span>
        </div>
        <p className="text-[11px] text-dim"><span className="font-semibold text-text">강남맛집</span> 4위에서 상승 추세 감지</p>
      </div>
    </div>
  );
}

function GrowthMockup() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold text-dim">최근 7일 vs 이전 7일</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-bg rounded-lg p-2 text-center border border-border/50">
          <p className="text-[10px] text-dim">평균 순위</p>
          <p className="text-sm font-extrabold text-up">3.2위</p>
          <p className="text-[9px] text-up">+1.5</p>
        </div>
        <div className="bg-bg rounded-lg p-2 text-center border border-border/50">
          <p className="text-[10px] text-dim">TOP 3</p>
          <p className="text-sm font-extrabold text-accent">5개</p>
          <p className="text-[9px] text-up">+2</p>
        </div>
        <div className="bg-bg rounded-lg p-2 text-center border border-border/50">
          <p className="text-[10px] text-dim">키워드</p>
          <p className="text-sm font-extrabold text-text">12개</p>
          <p className="text-[9px] text-dim">-</p>
        </div>
      </div>
    </div>
  );
}

function KeywordsMockup() {
  const rows = [
    { kw: '제주도맛집', participants: 342, volume: '12,400', competition: '낮음' },
    { kw: '서울카페', participants: 891, volume: '45,200', competition: '높음' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 bg-bg rounded-lg border border-border/50 px-2.5 py-1.5 text-[10px] text-dim">키워드를 검색하세요...</div>
      </div>
      {rows.map(r => (
        <div key={r.kw} className="bg-bg rounded-lg px-3 py-2 border border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{r.kw}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${r.competition === '낮음' ? 'text-up bg-up/10' : 'text-down bg-down/10'}`}>{r.competition}</span>
          </div>
          <div className="flex gap-3 mt-1">
            <span className="text-[10px] text-dim">참여 {r.participants}명</span>
            <span className="text-[10px] text-dim">검색량 {r.volume}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompetitorsMockup() {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold text-dim mb-2">겹치는 키워드 3개</div>
      <div className="bg-bg rounded-lg px-3 py-2 border border-border/50">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold">제주도맛집</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-accent font-semibold">나</span>
              <span className="font-bold">2위</span>
            </div>
            <div className="h-1.5 bg-accent/20 rounded-full"><div className="h-full bg-accent rounded-full" style={{ width: '85%' }} /></div>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-dim font-semibold">경쟁자A</span>
              <span className="font-bold">4위</span>
            </div>
            <div className="h-1.5 bg-border rounded-full"><div className="h-full bg-dim/40 rounded-full" style={{ width: '60%' }} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreMockup() {
  const dims = [
    { label: '영향력', value: 82, color: 'bg-accent' },
    { label: '전문성', value: 75, color: 'bg-up' },
    { label: '노출도', value: 90, color: 'bg-accent' },
    { label: '성장성', value: 68, color: 'bg-gold' },
    { label: '활동성', value: 85, color: 'bg-up' },
    { label: '경쟁력', value: 72, color: 'bg-accent' },
  ];
  return (
    <div className="space-y-2">
      <div className="text-center mb-2">
        <span className="text-2xl font-black text-accent">78</span>
        <span className="text-xs text-dim ml-1">/ 100</span>
      </div>
      <div className="space-y-1.5">
        {dims.map(d => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="text-[10px] text-dim w-12 text-right">{d.label}</span>
            <div className="flex-1 h-1.5 bg-border/50 rounded-full">
              <div className={`h-full ${d.color} rounded-full`} style={{ width: `${d.value}%` }} />
            </div>
            <span className="text-[10px] font-bold w-6">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MOCKUP_MAP: Record<string, () => React.ReactNode> = {
  ranking: RankingMockup,
  alerts: AlertsMockup,
  growth: GrowthMockup,
  keywords: KeywordsMockup,
  competitors: CompetitorsMockup,
  score: ScoreMockup,
};

/* ── FAQ ── */
const FAQS = [
  {
    q: '가입하면 바로 순위를 볼 수 있나요?',
    a: '네, 인플루언서 계정을 연결하면 이미 수집된 키워드 순위 데이터를 바로 확인할 수 있습니다.',
  },
  {
    q: '무료와 PRO의 차이는 무엇인가요?',
    a: '무료로 키워드 검색, 인플루언서 검색, 커뮤니티를 이용할 수 있습니다. PRO에서는 대시보드 전체 기능(알림, 리포트, 경쟁자 비교)을 이용할 수 있습니다.',
  },
  {
    q: '데이터는 어떻게 수집되나요?',
    a: '네이버 키워드챌린지 순위를 매일 자동으로 수집합니다. 내 인플루언서 계정에 연결된 키워드의 순위, 경쟁자 정보 등을 크롤링합니다.',
  },
  {
    q: '해지는 어떻게 하나요?',
    a: '마이페이지에서 언제든지 구독을 해지할 수 있습니다. 해지해도 남은 기간까지 정상 이용 가능합니다.',
  },
];

export default function GuidePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-16">

      {/* ─── 히어로 ─── */}
      <div className="text-center space-y-4">
        <p className="text-xs text-accent font-semibold tracking-widest">SERVICE GUIDE</p>
        <h1 className="text-3xl md:text-4xl font-extrabold">서비스 미리보기</h1>
        <p className="text-dim text-sm md:text-base max-w-lg mx-auto leading-relaxed">
          N인플의 핵심 기능을 확인하세요.
        </p>
      </div>

      {/* ─── 기능 카드 그리드 ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map(f => {
          const MockupComponent = MOCKUP_MAP[f.mockup];
          return (
            <div key={f.title} className="space-y-4">
              <BrowserFrame url={f.url}>
                {MockupComponent && <MockupComponent />}
              </BrowserFrame>
              <div>
                <h3 className="font-bold text-base">{f.title}</h3>
                <p className="text-xs text-dim leading-relaxed mt-1">{f.description}</p>
                <Link href={f.link} className="inline-block text-sm text-accent font-semibold hover:underline mt-2">
                  {f.linkText} →
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── 요금 안내 ─── */}
      <div className="bg-bg rounded-2xl border border-border p-8 space-y-6">
        <h2 className="text-xl font-extrabold text-center">요금 안내</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 무료 */}
          <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
            <div className="text-center">
              <span className="text-xs font-bold text-dim bg-border/30 px-2.5 py-1 rounded-full">무료</span>
              <p className="text-2xl font-extrabold mt-2">0원</p>
              <p className="text-xs text-dim mt-1">기본 검색 기능</p>
            </div>
            <div className="space-y-1.5">
              {['키워드 목록 검색', '인플루언서 목록 검색', '커뮤니티 이용', '키워드 상세 정보'].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-dim shrink-0"><path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span className="text-dim">{f}</span>
                </div>
              ))}
            </div>
            <Link href="/auth/login" className="block w-full text-center py-2 border border-border text-dim font-semibold rounded-lg hover:bg-bg transition text-xs">
              무료로 시작하기
            </Link>
          </div>

          {/* 월간 */}
          <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
            <div className="text-center">
              <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-full">월간</span>
              <p className="text-2xl font-extrabold mt-2">{MONTHLY_PRICE.toLocaleString()}원<span className="text-sm font-normal text-dim">/월</span></p>
              <p className="text-xs text-dim mt-1">매월 자동 결제</p>
            </div>
            <div className="space-y-1.5">
              {['내 키워드 순위 실시간 추적', '스마트 알림 (하락/TOP3)', '경쟁자 비교 분석', '순위 추이 차트', '맞춤 추천 키워드'].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-accent shrink-0"><path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Link href="/subscribe" className="block w-full text-center py-2 bg-accent hover:bg-accent-hover text-white font-bold rounded-lg transition text-xs">
                월간 시작하기
              </Link>
              <p className="text-[10px] text-center text-dim">1일 무료 체험 후 결제</p>
            </div>
          </div>

          {/* 연간 */}
          <div className="bg-surface rounded-xl border-2 border-accent/30 p-5 space-y-4 relative">
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-accent text-white text-[9px] font-bold rounded-full">25% 할인</div>
            <div className="text-center">
              <span className="text-xs font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-full">연간</span>
              <p className="text-2xl font-extrabold mt-2">{YEARLY_PRICE.toLocaleString()}원<span className="text-sm font-normal text-dim">/연</span></p>
              <p className="text-xs text-dim mt-1">월 14,850원</p>
            </div>
            <div className="space-y-1.5">
              {['내 키워드 순위 실시간 추적', '스마트 알림 (하락/TOP3)', '경쟁자 비교 분석', '순위 추이 차트', '맞춤 추천 키워드'].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-accent shrink-0"><path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Link href="/subscribe" className="block w-full text-center py-2 bg-accent hover:bg-accent-hover text-white font-bold rounded-lg transition text-xs">
                연간 시작하기
              </Link>
              <p className="text-[10px] text-center text-dim">1일 무료 체험 후 결제</p>
            </div>
          </div>
        </div>
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
