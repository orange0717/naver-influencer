'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type Conversation = {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
  created_at: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

type Plan = 'admin' | 'influencer' | 'free_trial';

const INPUT_LIMIT = 8000;

const GREETING: Message = {
  id: 'greeting',
  role: 'assistant',
  content:
    '안녕하세요! 블로그 글의 방향이나 흐름이 궁금할 때 가볍게 보여 주세요.\n\n쓰던 글을 그대로 붙여넣으셔도 좋고, "이 글이 너무 평범한 것 같아요" 같은 고민을 던져 주셔도 좋습니다.\n\n맞춤법·띄어쓰기는 별도 검사 도구가 따로 있으니, 여기서는 글의 방향성만 함께 살펴볼게요.',
  created_at: new Date(0).toISOString(),
};

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ClaudeChatClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // 모바일용
  const [plan, setPlan] = useState<Plan>('free_trial');
  const [freeTrialUsed, setFreeTrialUsed] = useState(0);
  const [freeTrialLimit, setFreeTrialLimit] = useState(3);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 모바일/터치 디바이스 감지: Enter 키 동작 분기에 사용
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // textarea 자동 높이 조절: 입력 길이에 따라 1줄~10줄, 그 이상은 내부 스크롤
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, 240); // 약 10줄
    ta.style.height = next + 'px';
  }, [input]);

  // 페이지 진입 시 자동 포커스 (모바일에서는 키보드 자동 노출 방지하려 데스크톱만)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    inputRef.current?.focus();
  }, []);

  const fetchConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/dashboard/claude/conversations', { headers });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        if (data.plan) setPlan(data.plan as Plan);
        if (typeof data.freeTrialUsed === 'number') setFreeTrialUsed(data.freeTrialUsed);
        if (typeof data.freeTrialLimit === 'number') setFreeTrialLimit(data.freeTrialLimit);
      }
    } catch {
      /* 무시 */
    } finally {
      setLoadingList(false);
    }
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/dashboard/claude/conversations/${conversationId}/messages`, {
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        const msgs: Message[] = data.messages || [];
        setMessages(msgs.length > 0 ? msgs : [GREETING]);
      } else {
        setMessages([GREETING]);
      }
    } catch {
      setMessages([GREETING]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (activeId) fetchMessages(activeId);
    else setMessages([GREETING]);
  }, [activeId, fetchMessages]);

  // 새 메시지 추가 시 스크롤 하단 고정
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const handleNewChat = () => {
    setActiveId(null);
    setMessages([GREETING]);
    setErrorText(null);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 대화를 삭제할까요? (복구할 수 없습니다)')) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/dashboard/claude/conversations/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) handleNewChat();
      }
    } catch {
      /* 무시 */
    }
  };

  const handleRename = async (id: string, currentTitle: string) => {
    const next = prompt('새 제목을 입력하세요.', currentTitle)?.trim();
    if (!next || next === currentTitle) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/dashboard/claude/conversations/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title: next }),
      });
      if (res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, title: next } : c)),
        );
      }
    } catch {
      /* 무시 */
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;
    if (content.length > INPUT_LIMIT) {
      setErrorText(`메시지는 ${INPUT_LIMIT}자 이내로 입력해주세요.`);
      return;
    }

    setSending(true);
    setErrorText(null);

    let conversationId = activeId;

    // 첫 메시지면 conversation 먼저 생성
    if (!conversationId) {
      try {
        const headers = await authHeaders();
        const res = await fetch('/api/dashboard/claude/conversations', {
          method: 'POST',
          headers,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErrorText(data.error || '대화를 생성하지 못했습니다.');
          setSending(false);
          return;
        }
        const data = await res.json();
        conversationId = data.conversation.id;
        setActiveId(conversationId);
        setConversations((prev) => [data.conversation, ...prev]);
      } catch {
        setErrorText('네트워크 오류가 발생했습니다.');
        setSending(false);
        return;
      }
    }

    // 사용자 메시지를 화면에 즉시 추가 (낙관적)
    const optimisticUser: Message = {
      id: 'tmp-' + Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => {
      // greeting 만 있는 경우 비우고 시작
      if (prev.length === 1 && prev[0].id === 'greeting') return [optimisticUser];
      return [...prev, optimisticUser];
    });
    setInput('');

    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/dashboard/claude/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ content }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorText(data.error || '응답을 받지 못했습니다.');
        // 낙관 메시지 롤백
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
        return;
      }
      const data = await res.json();
      if (data.plan) setPlan(data.plan as Plan);
      if (typeof data.freeTrialUsed === 'number') setFreeTrialUsed(data.freeTrialUsed);
      if (typeof data.freeTrialLimit === 'number') setFreeTrialLimit(data.freeTrialLimit);
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optimisticUser.id);
        const next = [...without];
        if (data.userMessage) next.push(data.userMessage as Message);
        else next.push(optimisticUser);
        if (data.reply) next.push(data.reply as Message);
        return next;
      });
      // 사이드바 갱신 (제목·갱신시간)
      fetchConversations();
    } catch {
      setErrorText('네트워크 오류가 발생했습니다.');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 모바일/터치 디바이스에서는 Enter = 줄바꿈 (전송은 우측 버튼만)
    // 데스크톱에서는 Enter = 전송, Shift+Enter = 줄바꿈
    if (isTouchDevice) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const remaining = useMemo(() => INPUT_LIMIT - input.length, [input.length]);
  const isFreeTrial = plan === 'free_trial';
  const freeTrialRemaining = Math.max(0, freeTrialLimit - freeTrialUsed);
  const freeTrialExhausted = isFreeTrial && freeTrialRemaining <= 0;
  const planLabel =
    plan === 'admin' ? '관리자' : plan === 'influencer' ? '인플루언서 플랜' : '무료 체험';

  return (
    <div className="flex h-[calc(100vh-64px)] bg-bg">
      {/* ── 모바일 백드롭 ── */}
      {sidebarOpen && (
        <button
          aria-label="사이드바 닫기"
          className="md:hidden fixed inset-0 bg-black/30 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── 사이드바 ── */}
      <aside
        className={`
          fixed md:static z-40 top-0 left-0 h-full md:h-auto
          w-72 shrink-0 bg-surface border-r border-border
          flex flex-col transition-transform
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="px-4 py-4 border-b border-border flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <span aria-hidden>＋</span>
            <span>새 대화</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-2 rounded-lg border border-border text-dim hover:border-accent/40 cursor-pointer"
            aria-label="사이드바 닫기"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loadingList ? (
            <div className="px-4 py-6 text-center text-xs text-dim">불러오는 중…</div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-dim leading-relaxed">
              아직 대화가 없습니다.
              <br />
              아래에 글이나 고민을 적어 보세요.
            </div>
          ) : (
            <ul className="space-y-1 px-2">
              {conversations.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id}>
                    <div
                      className={`
                        group flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer transition-colors
                        ${active ? 'bg-accent/10 border border-accent/30' : 'hover:bg-bg border border-transparent'}
                      `}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveId(c.id);
                          setSidebarOpen(false);
                        }}
                        className="flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <p
                          className={`text-sm font-semibold truncate ${active ? 'text-accent' : 'text-fg'}`}
                          title={c.title}
                        >
                          {c.title || '새 대화'}
                        </p>
                        <p className="text-[10px] text-dim mt-0.5">
                          {formatDate(c.updated_at)} · {c.message_count}개
                        </p>
                      </button>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRename(c.id, c.title);
                          }}
                          className="p-1 text-[11px] text-dim hover:text-accent cursor-pointer"
                          aria-label="제목 변경"
                          title="제목 변경"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c.id);
                          }}
                          className="p-1 text-[11px] text-dim hover:text-down cursor-pointer"
                          aria-label="대화 삭제"
                          title="대화 삭제"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border space-y-2">
          {isFreeTrial ? (
            <div className="rounded-lg bg-accent/10 border border-accent/30 px-3 py-2">
              <p className="text-[11px] font-bold text-accent">
                무료 체험 {freeTrialRemaining}/{freeTrialLimit}회 남음
              </p>
              {freeTrialExhausted ? (
                <a
                  href="/subscribe?highlight=influencer"
                  className="block mt-1.5 text-[11px] text-accent hover:underline"
                >
                  인플루언서 플랜으로 계속 이용하기 →
                </a>
              ) : (
                <p className="text-[10px] text-dim mt-0.5 leading-relaxed">
                  메시지 1회 = 체험 1회 차감
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-up/10 border border-up/30 px-3 py-2">
              <p className="text-[11px] font-bold text-up">{planLabel} · 무제한 이용 가능</p>
            </div>
          )}
          <p className="text-[11px] text-dim leading-relaxed">
            맞춤법은{' '}
            <a href="/dashboard/writing/spellcheck" className="text-accent hover:underline">
              맞춤법 검사
            </a>
            에서 확인하세요.
          </p>
        </div>
      </aside>

      {/* ── 메인 채팅 ── */}
      <section className="flex-1 flex flex-col min-w-0">
        {/* 헤더 */}
        <header className="px-4 md:px-6 py-3 border-b border-border bg-surface flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 rounded-lg border border-border text-dim hover:border-accent/40 cursor-pointer"
            aria-label="사이드바 열기"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-extrabold truncate">
              {activeId
                ? conversations.find((c) => c.id === activeId)?.title || '대화'
                : '블로그 글 피드백(클로드 AI)'}
            </h1>
            <p className="text-[11px] text-dim truncate">
              방향성 위주 가벼운 조언 · 맞춤법은 별도 도구 사용
            </p>
          </div>
        </header>

        {/* 메시지 영역 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-6 bg-bg">
          {loadingMessages ? (
            <div className="text-center py-12 text-dim text-sm">불러오는 중…</div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`
                      max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words
                      ${m.role === 'user'
                        ? 'bg-accent text-white'
                        : 'bg-surface border border-border text-fg'}
                    `}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-surface border border-border rounded-2xl px-4 py-3 text-sm text-dim flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse [animation-delay:120ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse [animation-delay:240ms]" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 에러 토스트 */}
        {errorText && (
          <div className="px-4 md:px-6 py-2 bg-down/10 border-t border-down/30 text-down text-xs text-center">
            {errorText}
          </div>
        )}

        {/* 입력 영역 */}
        <div className="px-4 md:px-6 py-3 border-t border-border bg-surface">
          <div className="max-w-2xl mx-auto">
            {freeTrialExhausted ? (
              <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-center">
                <p className="text-sm font-bold text-accent mb-1">
                  무료 체험 {freeTrialLimit}회를 모두 사용했어요
                </p>
                <p className="text-[12px] text-dim mb-3 leading-relaxed">
                  인플루언서 플랜으로 업그레이드하면 블로그 글 피드백을 무제한으로 사용할 수 있어요.
                </p>
                <a
                  href="/subscribe?highlight=influencer"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors"
                >
                  인플루언서 플랜 보러가기 →
                </a>
              </div>
            ) : (
              <>
                <div className="relative bg-bg border border-border rounded-2xl focus-within:border-accent/50 transition-colors shadow-sm">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="블로그 글이나 고민을 자유롭게 적어 주세요"
                    className="block w-full bg-transparent rounded-2xl pl-4 pr-24 py-3 text-sm leading-relaxed resize-none outline-none placeholder:text-dim min-h-[52px] max-h-[240px] overflow-y-auto"
                    disabled={sending}
                    maxLength={INPUT_LIMIT + 200}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-3 h-9 rounded-full bg-accent hover:bg-accent-hover text-white text-xs font-bold disabled:bg-dim/40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    aria-label="전송"
                    title={isTouchDevice ? '전송' : '전송 (Enter)'}
                  >
                    <span>전송</span>
                    <span aria-hidden>↑</span>
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-dim">
                  <span className="truncate">
                    Claude Haiku 4.5 · 빠른 피드백 모드
                    {isFreeTrial && (
                      <span className="ml-2 text-accent font-semibold">
                        체험 {freeTrialRemaining}/{freeTrialLimit}회
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 flex items-center gap-2">
                    <span className="hidden sm:inline">
                      {isTouchDevice ? '전송 버튼으로 보내세요' : 'Enter 전송 · Shift+Enter 줄바꿈'}
                    </span>
                    {input.length >= INPUT_LIMIT * 0.5 && (
                      <span className={remaining < 0 ? 'text-down' : ''}>
                        {input.length.toLocaleString()} / {INPUT_LIMIT.toLocaleString()}
                      </span>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
