import { FAQ_DATA, FAQ_CATEGORIES } from '@/data/faq-data';

export default function LandingFaq() {
  // '전체' 제외한 실제 카테고리만
  const categories = FAQ_CATEGORIES.filter(c => c !== '전체');

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="font-title text-2xl md:text-4xl font-extrabold text-text mb-3">
          자주 묻는 질문
        </h2>
        <p className="text-sm text-dim">
          궁금한 점을 빠르게 확인해 보세요. 답변이 부족하다면 고객센터로 문의 주세요.
        </p>
      </div>

      <div className="space-y-10">
        {categories.map(category => {
          const items = FAQ_DATA.filter(item => item.category === category);
          if (items.length === 0) return null;

          return (
            <section key={category}>
              <h3 className="text-xs font-bold text-accent uppercase tracking-wider mb-3 px-1">
                {category}
              </h3>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <details
                    key={`${category}-${idx}`}
                    className="group bg-surface border border-border rounded-xl overflow-hidden transition-colors hover:border-accent/30"
                  >
                    <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <span className="text-sm md:text-base font-semibold text-text flex-1">
                        Q. {item.question}
                      </span>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className="shrink-0 text-dim transition-transform group-open:rotate-180"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </summary>
                    <div className="px-5 pb-5 pt-1 text-sm text-dim leading-relaxed border-t border-border/40">
                      <p className="pt-3">{item.answer}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-center text-xs text-dim mt-12">
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
  );
}
