'use client';

import { useState } from 'react';
import { FAQ_DATA, FAQ_CATEGORIES } from '@/data/faq-data';

const PINK = '#BF8C80';

export default function LandingFaq() {
  const categories = FAQ_CATEGORIES.filter(c => c !== '전체');
  const [activeTab, setActiveTab] = useState<string>(categories[0] ?? '');

  const items = FAQ_DATA.filter(item => item.category === activeTab);

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-10 lg:gap-16 items-start">
        {/* 좌측 헤더 */}
        <div className="lg:sticky lg:top-24">
          <span
            className="inline-block text-[11px] font-bold tracking-[0.2em] px-3 py-1.5 rounded-full mb-5"
            style={{ background: '#F8ECE6', color: PINK }}
          >
            FAQ
          </span>
          <h2 className="font-title text-3xl md:text-4xl font-extrabold text-text leading-[1.2] mb-4">
            자주 묻는
            <br />
            질문
          </h2>
          <p className="text-sm text-dim leading-relaxed mb-6">
            원하는 답변을 찾지 못하셨나요?
            <br />
            고객지원팀에 문의하세요.
          </p>
          <a
            href="https://talk.naver.com/w4bz2x"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-text text-white text-sm font-semibold hover:opacity-90 active:translate-y-px transition"
          >
            고객지원팀 문의
            <span aria-hidden>→</span>
          </a>
        </div>

        {/* 우측: 카테고리 탭 + 아코디언 */}
        <div>
          <div
            className="flex gap-6 overflow-x-auto border-b border-border mb-2"
            style={{ scrollbarWidth: 'none' }}
            role="tablist"
          >
            {categories.map(cat => {
              const active = cat === activeTab;
              return (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(cat)}
                  className="shrink-0 py-3.5 -mb-px text-sm font-semibold whitespace-nowrap border-b-2 transition-colors"
                  style={{
                    color: active ? PINK : '#B0A099',
                    borderBottomColor: active ? PINK : 'transparent',
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div role="tabpanel">
            {items.map((item, idx) => (
              <details
                key={`${activeTab}-${idx}`}
                className="group border-b border-border [&:first-of-type]:border-t"
              >
                <summary className="flex items-center gap-4 py-4 md:py-5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <span className="text-sm md:text-[15px] font-semibold text-text flex-1">
                    {item.question}
                  </span>
                  <span
                    className="shrink-0 inline-block w-2.5 h-2.5 rotate-45 group-open:rotate-[225deg] transition-transform duration-200"
                    style={{
                      borderRight: `2px solid ${PINK}`,
                      borderBottom: `2px solid ${PINK}`,
                    }}
                    aria-hidden
                  />
                </summary>
                <div className="pb-5 text-sm md:text-[14.5px] text-dim leading-relaxed whitespace-pre-line">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
