'use client';

import { useState } from 'react';
import { FAQ_DATA, FAQ_CATEGORIES } from '@/data/faq-data';

interface Message {
  type: 'bot' | 'user';
  text: string;
}

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { type: 'bot', text: '안녕하세요! N인플 고객센터입니다.\n궁금한 카테고리를 선택해주세요.' },
  ]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    setMessages(prev => [
      ...prev,
      { type: 'user', text: cat },
      { type: 'bot', text: '궁금한 질문을 선택해주세요.' },
    ]);
  };

  const handleQuestionSelect = (q: string, a: string) => {
    setMessages(prev => [
      ...prev,
      { type: 'user', text: q },
      { type: 'bot', text: a },
    ]);
  };

  const handleReset = () => {
    setSelectedCategory(null);
    setMessages([
      { type: 'bot', text: '안녕하세요! N인플 고객센터입니다.\n궁금한 카테고리를 선택해주세요.' },
    ]);
  };

  const filteredFaq = selectedCategory
    ? FAQ_DATA.filter(f => selectedCategory === '전체' || f.category === selectedCategory)
    : [];

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 bg-accent text-white rounded-full shadow-lg hover:bg-accent-hover hover:scale-105 transition-all z-50 flex items-center cursor-pointer font-semibold text-sm ${
          open ? 'w-14 h-14 justify-center' : 'h-13 pl-4 pr-5 gap-2'
        }`}
        style={!open ? { height: '52px' } : undefined}
        aria-label="고객센터"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <span>문의하기</span>
          </>
        )}
      </button>

      {/* 챗봇 패널 */}
      {open && (
        <div className="fixed bottom-24 right-6 w-80 max-h-[70vh] bg-surface border border-border rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden">
          {/* 헤더 */}
          <div className="bg-accent px-4 py-3 flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-sm">N</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-white">N인플 고객센터</p>
              <p className="text-[10px] text-white/70">자주 묻는 질문에 답변해드려요</p>
            </div>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('open-feedback'))}
              className="text-[11px] font-semibold text-white/90 hover:text-white bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-1 flex items-center gap-1 transition cursor-pointer"
              title="피드백 보내기"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              피드백
            </button>
          </div>

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[40vh]">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-line ${
                  msg.type === 'user'
                    ? 'bg-accent text-white rounded-br-sm'
                    : 'bg-bg text-text rounded-bl-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* 선택지 영역 */}
          <div className="border-t border-border p-3 space-y-2">
            {!selectedCategory ? (
              <div className="flex flex-wrap gap-1.5">
                {FAQ_CATEGORIES.filter(c => c !== '전체').map(cat => (
                  <button
                    key={cat}
                    onClick={() => handleCategorySelect(cat)}
                    className="px-3 py-1.5 text-xs font-medium bg-bg border border-border rounded-full hover:border-accent/40 hover:text-accent transition cursor-pointer"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {filteredFaq.map((faq, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuestionSelect(faq.question, faq.answer)}
                      className="w-full text-left px-3 py-2 text-xs bg-bg border border-border rounded-lg hover:border-accent/40 hover:text-accent transition cursor-pointer"
                    >
                      {faq.question}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleReset}
                  className="w-full text-center text-[11px] text-dim hover:text-accent transition cursor-pointer pt-1"
                >
                  처음으로 돌아가기
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
