import Link from 'next/link';

// ─── 주제별 강점 통계 (키워드 텍스트 기반 세부 분류) ───
const TOPIC_RULES: [string, RegExp][] = [
  ['소설/문학', /소설|문학|시집|에세이|단편|장편|작가|문예|동화|시인|수필/i],
  ['자기계발', /자기계발|성장|습관|마인드|동기부여|멘탈|성공|목표|리더십|자존감/i],
  ['경제/재테크', /경제|재테크|투자|주식|부동산|금융|돈|자산|펀드|ETF|창업|사업|마케팅|경영/i],
  ['육아/교육', /육아|교육|아이|유아|초등|학습|엄마|아빠|자녀|태교|임신|출산|중학|고등/i],
  ['건강/운동', /건강|운동|다이어트|헬스|요가|필라테스|식단|영양|의학|병원|약|한의|치료/i],
  ['요리/음식', /요리|레시피|음식|베이킹|식재료|밥|반찬|디저트|카페|브런치|맛집/i],
  ['여행', /여행|관광|숙소|호텔|투어|해외|국내여행|캠핑|백패킹|제주|유럽|일본여행/i],
  ['패션/뷰티', /패션|뷰티|화장품|메이크업|스킨케어|옷|코디|스타일|향수|네일|헤어/i],
  ['IT/과학', /IT|프로그래밍|코딩|AI|인공지능|과학|기술|개발|컴퓨터|앱|데이터|로봇/i],
  ['역사/인문', /역사|인문|철학|사회|문화|심리|정치|세계사|한국사/i],
  ['만화/웹툰', /만화|웹툰|애니|캐릭터|그림|일러스트/i],
  ['외국어', /영어|일본어|중국어|외국어|토익|어학|단어|회화|영단어|TOEIC|IELTS/i],
  ['종교/명상', /종교|명상|기도|불교|기독교|성경|마음|영성|법문/i],
  ['인테리어/리빙', /인테리어|가구|홈|리빙|수납|정리|집꾸미기|데코/i],
  ['반려동물', /강아지|고양이|반려|펫|동물|애견|애묘/i],
  ['예술/음악', /예술|음악|그림|미술|전시|공연|클래식|피아노|영화|드라마/i],
];

export function classifyKeyword(keyword: string, category: string): string {
  const c = (category || '').trim();
  // 챌린지 DB 주제가 정해져 있으면 제목 정규식으로 덮어쓰지 않음 (도서 챌린지인데 제목에 '투자' 등이 있어 경제로 분류되는 문제 방지)
  if (c && c !== '기타') return c;
  for (const [topic, regex] of TOPIC_RULES) {
    if (regex.test(keyword)) return topic;
  }
  return c || '기타';
}

/** 비로그인 게스트용 MY 대시보드 빈 상태 — 레이아웃은 유지하되 데이터 자리는 플레이스홀더로 채우고 로그인 CTA 노출 */
export function GuestDashboard() {
  const placeholderStats = [
    { label: '참여 키워드', suffix: '개' },
    { label: 'TOP 3 키워드', suffix: '개' },
    { label: '순위 변동', suffix: '건' },
    { label: '토픽', suffix: '개' },
    { label: '카테고리 순위', suffix: '위' },
    { label: 'AI브리핑 인용', suffix: '건' },
  ];

  return (
    <div className="space-y-10">
      {/* ─── 로그인 유도 배너 ─── */}
      <div className="rounded-lg border border-accent/20 bg-accent/5 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="type-page-title text-text">내 대시보드</h1>
            <p className="text-sm text-dim leading-relaxed">
              로그인하시면 본인의 작업 데이터를 저장하고 다른 기기에서도 이어서 작업할 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href="/auth/login?redirect=/my"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg border border-border bg-surface font-semibold text-sm hover:border-accent transition-colors"
            >
              홈으로
            </Link>
          </div>
        </div>
      </div>

      {/* ─── 빈 상태 통계 카드 (레이아웃 미리보기) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {placeholderStats.map((c) => (
          <div key={c.label} className="h-[142px] flex flex-col bg-surface rounded-lg border border-border shadow-xs p-5">
            <div className="w-8 h-8 rounded-full bg-sunken shrink-0" />
            <p className="stat-title mt-2 mb-0.5 shrink-0">{c.label}</p>
            <p className="stat-value stat-value-kpi text-dim mt-auto pt-1">{`-${c.suffix}`}</p>
          </div>
        ))}
      </div>

      {/* ─── 빈 상태 안내 ─── */}
      <div className="rounded-lg border border-dashed border-border bg-surface/50 p-8 lg:p-12 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-accent/10 flex items-center justify-center text-accent mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <p className="text-sm lg:text-base text-text font-semibold mb-1.5">아직 표시할 데이터가 없습니다</p>
        <p className="text-xs lg:text-sm text-dim leading-relaxed max-w-md mx-auto">
          로그인 후 블로그·인플루언서를 연결하면 키워드 순위, 순위 추이, 추천 키워드를 이곳에서 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
