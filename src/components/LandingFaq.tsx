import { FAQ_DATA, FAQ_CATEGORIES } from '@/data/faq-data';

// 모든 카테고리 다크핑크(#BF8C80) 통일
const PINK = {
  accent: 'text-[#BF8C80]',
  chip: 'bg-[#BF8C80]/10 text-[#BF8C80] border-[#BF8C80]/40',
};
const CATEGORY_COLORS: Record<string, { accent: string; chip: string }> = {
  '서비스 이용': PINK,
  '키워드 분석': PINK,
  '경쟁자 분석': PINK,
  '결제·플랜': PINK,
  '계정': PINK,
};

export default function LandingFaq() {
  const categories = FAQ_CATEGORIES.filter(c => c !== '전체');

  return (
    <div className="max-w-3xl mx-auto px-4">
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

      {/* 카테고리별 그룹 (배경색 없이) */}
      <div className="space-y-12">
        {categories.map(category => {
          const items = FAQ_DATA.filter(item => item.category === category);
          if (items.length === 0) return null;
          const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS['서비스 이용'];

          return (
            <section key={category}>
              <div className="flex items-center justify-center mb-6">
                <span
                  className={`text-[11px] font-bold tracking-wider px-3 py-1 rounded-full border ${colors.chip}`}
                >
                  {category}
                </span>
              </div>

              <div className="space-y-3">
                {items.map((item, idx) => (
                  <details
                    key={`${category}-${idx}`}
                    className="group bg-surface border border-border rounded-2xl overflow-hidden transition-all hover:border-accent/30"
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
            </section>
          );
        })}
      </div>

      {/* 하단 안내 */}
      <div className="text-center pt-12 pb-4">
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
