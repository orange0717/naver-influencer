import { FAQ_DATA, FAQ_CATEGORIES } from '@/data/faq-data';

// 카테고리별 색상 팔레트 (배경 + 카드 + 강조)
const CATEGORY_COLORS: Record<
  string,
  { bg: string; card: string; border: string; accent: string; chip: string }
> = {
  '서비스 이용': {
    bg: 'bg-rose-50',
    card: 'bg-white',
    border: 'border-rose-200',
    accent: 'text-rose-500',
    chip: 'bg-rose-100 text-rose-600',
  },
  '키워드 분석': {
    bg: 'bg-sky-50',
    card: 'bg-white',
    border: 'border-sky-200',
    accent: 'text-sky-500',
    chip: 'bg-sky-100 text-sky-600',
  },
  '경쟁자 분석': {
    bg: 'bg-amber-50',
    card: 'bg-white',
    border: 'border-amber-200',
    accent: 'text-amber-600',
    chip: 'bg-amber-100 text-amber-700',
  },
  '결제·플랜': {
    bg: 'bg-emerald-50',
    card: 'bg-white',
    border: 'border-emerald-200',
    accent: 'text-emerald-600',
    chip: 'bg-emerald-100 text-emerald-700',
  },
  '계정': {
    bg: 'bg-violet-50',
    card: 'bg-white',
    border: 'border-violet-200',
    accent: 'text-violet-500',
    chip: 'bg-violet-100 text-violet-600',
  },
};

export default function LandingFaq() {
  const categories = FAQ_CATEGORIES.filter(c => c !== '전체');

  return (
    <div className="space-y-0">
      {/* 상단 헤더 */}
      <div className="text-center pb-12">
        <p className="text-xs font-bold tracking-[0.3em] text-accent mb-4">FAQ</p>
        <h2 className="font-title text-3xl md:text-5xl font-extrabold text-text mb-4">
          자주 묻는 질문
        </h2>
        <p className="text-sm md:text-base text-dim">
          궁금하신 점을 확인해 보세요.
        </p>
      </div>

      {/* 카테고리별 섹션 (각 다른 배경색) */}
      {categories.map(category => {
        const items = FAQ_DATA.filter(item => item.category === category);
        if (items.length === 0) return null;
        const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS['서비스 이용'];

        return (
          <section
            key={category}
            className={`${colors.bg} px-4 py-12 md:py-16`}
          >
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-center gap-2 mb-8">
                <span
                  className={`text-[11px] font-bold tracking-wider px-3 py-1 rounded-full ${colors.chip}`}
                >
                  {category}
                </span>
              </div>

              <div className="space-y-3">
                {items.map((item, idx) => (
                  <details
                    key={`${category}-${idx}`}
                    className={`group ${colors.card} border ${colors.border} rounded-2xl overflow-hidden transition-all hover:shadow-sm`}
                  >
                    <summary className="flex items-center gap-4 px-5 md:px-7 py-4 md:py-5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <span
                        className={`shrink-0 text-sm md:text-base font-extrabold font-rank ${colors.accent}`}
                      >
                        Q{idx + 1}.
                      </span>
                      <span className="text-sm md:text-base font-semibold text-text flex-1">
                        {item.question}
                      </span>
                      <span
                        className={`shrink-0 text-xl md:text-2xl font-light ${colors.accent} transition-transform group-open:rotate-45 leading-none`}
                      >
                        +
                      </span>
                    </summary>
                    <div className="px-5 md:px-7 pb-5 md:pb-6 text-sm md:text-[15px] text-dim leading-relaxed">
                      <div className="pl-7 md:pl-9">
                        <p>{item.answer}</p>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* 하단 안내 */}
      <div className="text-center py-12 px-4">
        <p className="text-sm text-dim">
          더 궁금하신 점은{' '}
          <a
            href="https://talk.naver.com/w4bz2x"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent font-semibold underline"
          >
            네이버 톡톡 고객센터
          </a>
          로 문의해 주세요.
        </p>
      </div>
    </div>
  );
}
