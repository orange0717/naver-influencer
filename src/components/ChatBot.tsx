'use client';

import { useState, useEffect } from 'react';
import { FAQ_DATA, FAQ_CATEGORIES } from '@/data/faq-data';

interface Message {
  type: 'bot' | 'user';
  text: string;
}

// Tawk.to 실시간 상담원 연결
const TAWK_PROPERTY_ID = '69e45c7bb7e2101c33b3cd82';
const TAWK_WIDGET_ID = '1jmi0igtn';

declare global {
  interface Window {
    Tawk_API?: {
      maximize?: () => void;
      showWidget?: () => void;
      hideWidget?: () => void;
      onLoad?: () => void;
      visitor?: { name?: string; email?: string };
    };
    Tawk_LoadStart?: Date;
  }
}

function loadTawkOnce() {
  if (typeof window === 'undefined') return;
  if (window.Tawk_API && window.Tawk_API.maximize) return;
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();
  // 로드 완료 즉시 플로팅 버튼 숨기기 (N인플 챗봇과 겹치지 않도록)
  window.Tawk_API.onLoad = function () {
    try { window.Tawk_API?.hideWidget?.(); } catch { /* ignore */ }
  };
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
  s.charset = 'UTF-8';
  s.setAttribute('crossorigin', '*');
  document.head.appendChild(s);
}

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { type: 'bot', text: '안녕하세요! N인플 고객센터입니다.\n궁금한 카테고리를 선택해주세요.' },
  ]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showLiveAgentCta, setShowLiveAgentCta] = useState(false);

  // 컴포넌트 마운트 즉시 Tawk.to 백그라운드 로드 시작 (상담원 연결 시 지연 최소화)
  useEffect(() => {
    loadTawkOnce();
  }, []);

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
    setMessages(prev => [
      ...prev,
      { type: 'user', text: cat },
      { type: 'bot', text: '궁금한 질문을 선택해주세요.' },
    ]);
    setShowLiveAgentCta(false);
  };

  const handleQuestionSelect = (q: string, a: string) => {
    setMessages(prev => [
      ...prev,
      { type: 'user', text: q },
      { type: 'bot', text: a },
      { type: 'bot', text: '답변이 도움이 되셨나요?\n추가로 궁금한 점이 있으시면 고객센터 직원으로 연결해드릴까요?' },
    ]);
    setShowLiveAgentCta(true);
  };

  const handleConnectAgent = () => {
    loadTawkOnce();
    setMessages(prev => [
      ...prev,
      { type: 'user', text: '상담원 연결하기' },
      { type: 'bot', text: '상담원 채팅창을 열었습니다. 잠시만 기다려주세요!' },
    ]);
    setShowLiveAgentCta(false);
    // 위젯 로드 대기 후 열기 (최대 12초)
    const tryOpen = (attempt = 0) => {
      const api = window.Tawk_API;
      if (api && typeof api.maximize === 'function') {
        try { api.showWidget?.(); } catch { /* ignore */ }
        try { api.maximize?.(); } catch { /* ignore */ }
        // 챗봇 패널은 닫아서 Tawk.to 창에 집중
        setOpen(false);
      } else if (attempt < 80) {
        setTimeout(() => tryOpen(attempt + 1), 300);
      } else {
        setMessages(prev => [
          ...prev,
          { type: 'bot', text: '상담원 채팅을 여는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
        ]);
      }
    };
    tryOpen();
  };

  const handleReset = () => {
    setSelectedCategory(null);
    setShowLiveAgentCta(false);
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

            {/* 상담원 연결 — 항상 노출 (강조 CTA는 답변 후 표시) */}
            <button
              onClick={handleConnectAgent}
              className={
                showLiveAgentCta
                  ? "w-full px-3 py-2 text-xs font-bold bg-accent text-white rounded-lg hover:bg-accent-hover transition cursor-pointer flex items-center justify-center gap-1.5"
                  : "w-full px-3 py-2 text-xs font-semibold bg-white border border-accent text-accent rounded-lg hover:bg-accent/5 transition cursor-pointer flex items-center justify-center gap-1.5 mt-2"
              }
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              상담원 연결하기
            </button>

            {/* 네이버 톡톡 연결 */}
            <a
              href="https://talk.naver.com/w4bz2x"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-3 py-2 text-xs font-semibold text-white rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5"
              style={{ backgroundColor: '#03C75A' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#02B351'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#03C75A'; }}
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-sm bg-white text-[9px] font-black" style={{ color: '#03C75A' }}>N</span>
              네이버 톡톡으로 문의하기
            </a>
          </div>
        </div>
      )}
    </>
  );
}
