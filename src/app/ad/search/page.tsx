'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { formatCount } from '@/lib/format';

interface AdInfluencer {
  naverId: string;
  displayName: string;
  imageUrl: string;
  introduction: string;
  category: string;
  categoryType: string;
  myKeyword: string;
  subscriberCount: number;
  totalKeywords: number;
  integratedTop3Count: number;
  top3Ratio: number;
  top1Count: number;
  top2Count: number;
  top3Count: number;
  bestRank: number | null;
  adFeeAmount: number | null;
  adFeeText: string | null;
  lastChallengedAt: string | null;
  ninflScore: number;
  activityLevel: 'active' | 'recent' | 'inactive';
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  influencers?: AdInfluencer[];
}

const EXAMPLE_QUERIES = [
  '뷰티 팬수 1만명 이상 추천해줘',
  '여행 분야 TOP3 비율 높은 인플루언서',
  '푸드 키챌 30건 이상 활동중인 인플루언서',
  '부동산 분야 인플루언서 추천',
  '육아 분야 팬수 많은 순으로',
];

export default function AdSearchPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleSubmit = async (query?: string) => {
    const q = (query || input).trim();
    if (!q || loading) return;

    // 사용자 메시지 추가
    const userMsg: ChatMessage = { role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    // AI 응답 메시지 (스트리밍으로 업데이트)
    const aiMsg: ChatMessage = { role: 'ai', text: '', influencers: [] };

    try {
      const res = await fetch('/api/ad/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '오류 발생' }));
        aiMsg.text = err.error || 'AI 응답에 실패했습니다.';
        setMessages(prev => [...prev, aiMsg]);
        setLoading(false);
        scrollToBottom();
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        aiMsg.text = '응답을 읽을 수 없습니다.';
        setMessages(prev => [...prev, aiMsg]);
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentText = '';
      let currentInfluencers: AdInfluencer[] = [];

      // 스트리밍 읽기 시작 — messages에 aiMsg 추가
      setMessages(prev => [...prev, { ...aiMsg }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'influencers') {
              currentInfluencers = event.data;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'ai', text: currentText, influencers: currentInfluencers };
                return next;
              });
            } else if (event.type === 'text') {
              currentText += event.data;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'ai', text: currentText, influencers: currentInfluencers };
                return next;
              });
              scrollToBottom();
            } else if (event.type === 'error') {
              currentText += event.data;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'ai', text: currentText, influencers: currentInfluencers };
                return next;
              });
            }
          } catch { /* skip invalid JSON */ }
        }
      }
    } catch {
      aiMsg.text = '네트워크 오류가 발생했습니다. 다시 시도해주세요.';
      setMessages(prev => {
        if (prev[prev.length - 1]?.role === 'ai' && !prev[prev.length - 1].text) {
          const next = [...prev];
          next[next.length - 1] = aiMsg;
          return next;
        }
        return [...prev, aiMsg];
      });
    } finally {
      setLoading(false);
      scrollToBottom();
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const activityBadge = (level: string) => {
    if (level === 'active') return <span className="text-[10px] font-bold text-up bg-up/12 px-1.5 py-0.5 rounded-full">활동중</span>;
    if (level === 'recent') return <span className="text-[10px] font-bold text-gold bg-gold/12 px-1.5 py-0.5 rounded-full">최근활동</span>;
    return <span className="text-[10px] font-bold text-dim bg-bg px-1.5 py-0.5 rounded-full">비활동</span>;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-56px-48px)]">
      {/* 헤더 */}
      <div className="shrink-0 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Link href="/ad" className="text-xs text-dim hover:text-accent transition">광고주</Link>
          <span className="text-xs text-dim">/</span>
          <span className="text-xs text-accent font-semibold">AI 자연어 검색</span>
        </div>
        <h1 className="text-xl font-extrabold">AI 인플루언서 추천</h1>
        <p className="text-sm text-dim mt-1">자연어로 질문하면 데이터 기반으로 인플루언서를 추천합니다</p>
      </div>

      {/* 채팅 영역 */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
            </div>
            <h2 className="font-bold text-lg mb-2">무엇이든 물어보세요</h2>
            <p className="text-sm text-dim text-center mb-6 max-w-sm leading-relaxed">
              찾고 싶은 인플루언서를 자연어로 설명해주세요.<br />
              N인플 데이터를 분석해서 추천해드립니다.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {EXAMPLE_QUERIES.map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); handleSubmit(q); }}
                  className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-dim hover:border-accent/40 hover:text-accent transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-accent text-white px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[80%] text-sm">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* AI 텍스트 응답 */}
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent font-bold text-[10px] shrink-0 mt-0.5">
                    AI
                  </div>
                  <div className="bg-surface border border-border px-4 py-3 rounded-2xl rounded-tl-sm max-w-[85%]">
                    {msg.text ? (
                      <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* 인플루언서 카드 */}
                {msg.influencers && msg.influencers.length > 0 && (
                  <div className="ml-9">
                    <div className="grid md:grid-cols-2 gap-3">
                      {msg.influencers.map(inf => (
                        <div key={inf.naverId} className="bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition">
                          <div className="flex items-start gap-3 mb-3">
                            {inf.imageUrl ? (
                              <img src={inf.imageUrl} alt={inf.displayName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold shrink-0">
                                {inf.displayName.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-sm text-text truncate">{inf.displayName}</span>
                                {activityBadge(inf.activityLevel)}
                              </div>
                              <p className="text-[11px] text-dim truncate">
                                {inf.category}{inf.categoryType ? ` · ${inf.categoryType}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-1 mb-3">
                            <div className="text-center">
                              <p className="text-[9px] text-dim">팬수</p>
                              <p className="text-xs font-extrabold font-rank">{formatCount(inf.subscriberCount)}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[9px] text-dim">챌린지</p>
                              <p className="text-xs font-extrabold font-rank">{inf.totalKeywords}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[9px] text-dim">TOP3</p>
                              <p className="text-xs font-extrabold font-rank text-accent">{inf.integratedTop3Count}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[9px] text-dim">최고순위</p>
                              <p className="text-xs font-extrabold font-rank text-up">{inf.bestRank ? `${inf.bestRank}위` : '-'}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            {inf.adFeeAmount ? (
                              <span className="text-[11px] text-accent font-semibold">원고료 {inf.adFeeAmount.toLocaleString()}원</span>
                            ) : (
                              <span className="text-[11px] text-dim">원고료 미등록</span>
                            )}
                            <Link
                              href={`/influencers/${inf.naverId}`}
                              className="text-[11px] text-accent font-semibold hover:underline"
                            >
                              프로필 보기 →
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-accent font-bold text-[10px] shrink-0">
              AI
            </div>
            <div className="bg-surface border border-border px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-accent/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* 입력 영역 */}
      <div className="shrink-0 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="인플루언서에 대해 자유롭게 질문하세요..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || loading}
            className="shrink-0 px-4 py-3 bg-accent text-white rounded-xl text-sm font-bold hover:bg-accent/90 transition disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-dim mt-1.5 text-center">
          N인플 데이터 기반 AI 추천 -- 결과는 참고용이며, 실제 광고 효과는 다를 수 있습니다
        </p>
      </div>
    </div>
  );
}
