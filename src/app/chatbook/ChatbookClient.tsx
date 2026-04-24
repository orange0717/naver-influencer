'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * 캐릭터챗북 — N인플 버전
 * 블로거·인플루언서가 고전 캐릭터와 대화하며 콘텐츠 아이디어를 얻는 기능.
 * 서버 라우트: /api/chatbook/*
 */

interface Character {
  id: string;
  name: string;
  origin: string | null;
  avatar_emoji: string | null;
  accent_color: string | null;
  short_bio: string | null;
  greeting: string | null;
  tags: string[] | null;
  platform: 'both' | 'ninfl' | 'orangerefine';
  sort_order: number;
}

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface SessionSummary {
  id: string;
  character_id: string;
  title: string | null;
  message_count: number;
  updated_at: string;
}

const DISCLAIMER = (
  <>
    기본 제공 캐릭터는 모두 저작권이 만료된 공유저작물(public domain) 입니다.
    이 기능의 응답은 Claude AI로 생성되며 실제 인물·전문가가 아닙니다.
    의료·법률·금융 등 전문적 판단은 반드시 전문가에게 확인하세요.
    위기 상황이라면 <b>자살예방상담전화 1393</b>(24시간 무료)에 도움을 요청하세요.
  </>
);

export default function ChatbookClient() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  /* ── 초기 로드 ───────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [charRes, sessRes] = await Promise.all([
          fetch('/api/chatbook/characters', { cache: 'no-store' }),
          fetch('/api/chatbook/sessions', { cache: 'no-store' }),
        ]);
        const charData = await charRes.json().catch(() => ({}));
        if (!cancelled && charData.characters) setCharacters(charData.characters);

        if (sessRes.ok) {
          const sessData = await sessRes.json().catch(() => ({}));
          if (!cancelled && sessData.sessions) setSessions(sessData.sessions);
        }
      } catch (err) {
        console.error('[chatbook] load failed', err);
        if (!cancelled) setErrorMsg('데이터를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── 스크롤 하단 고정 ─────────────────────────── */
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  /* ── 세션 시작 ───────────────────────────────── */
  const openCharacter = useCallback(
    async (character: Character) => {
      setErrorMsg(null);
      try {
        const res = await fetch('/api/chatbook/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: character.id }),
        });
        if (res.status === 401) {
          setErrorMsg('로그인이 필요합니다. 먼저 로그인해 주세요.');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.session) {
          setErrorMsg(data.error || '세션을 시작하지 못했습니다.');
          return;
        }
        const newSessionId = data.session.id as string;
        setActiveCharacter(character);
        setSessionId(newSessionId);

        // 기존 세션이었다면 메시지 이력 로드
        if (!data.created) {
          const histRes = await fetch(`/api/chatbook/sessions/${newSessionId}/messages`, { cache: 'no-store' });
          if (histRes.ok) {
            const histData = await histRes.json().catch(() => ({}));
            const loaded = (histData.messages || []) as ChatMessage[];
            if (loaded.length > 0) {
              setMessages(loaded);
              return;
            }
          }
        }
        // 새 세션이거나 메시지가 없으면 인사말만
        if (character.greeting) {
          setMessages([{ role: 'assistant', content: character.greeting }]);
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error('[chatbook] open character failed', err);
        setErrorMsg('세션을 시작하지 못했습니다.');
      }
    },
    [],
  );

  const openSession = useCallback(
    async (session: SessionSummary) => {
      const character = characters.find((c) => c.id === session.character_id);
      if (!character) return;
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/chatbook/sessions/${session.id}/messages`, { cache: 'no-store' });
        if (res.status === 401) {
          setErrorMsg('로그인이 필요합니다.');
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorMsg(data.error || '대화를 불러오지 못했습니다.');
          return;
        }
        setActiveCharacter(character);
        setSessionId(session.id);
        const loaded = (data.messages || []) as ChatMessage[];
        if (loaded.length > 0) {
          setMessages(loaded);
        } else if (character.greeting) {
          setMessages([{ role: 'assistant', content: character.greeting }]);
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error('[chatbook] open session failed', err);
        setErrorMsg('대화를 불러오지 못했습니다.');
      }
    },
    [characters],
  );

  const backToGallery = useCallback(() => {
    setActiveCharacter(null);
    setSessionId(null);
    setMessages([]);
    setInput('');
    // 최근 세션 새로고침
    fetch('/api/chatbook/sessions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.sessions) setSessions(d.sessions);
      })
      .catch(() => {});
  }, []);

  /* ── 메시지 전송 ──────────────────────────────── */
  const sendMessage = useCallback(
    async (ev?: React.FormEvent) => {
      if (ev) ev.preventDefault();
      if (sending) return;
      const text = input.trim();
      if (!text || !sessionId || !activeCharacter) return;
      if (text.length > 2000) {
        setErrorMsg('메시지는 2,000자 이내로 입력해주세요.');
        return;
      }

      setSending(true);
      setErrorMsg(null);
      const userMsg: ChatMessage = { role: 'user', content: text };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');

      try {
        const res = await fetch(`/api/chatbook/sessions/${sessionId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: text }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.reply) {
          const msg = data.error || '응답을 받지 못했습니다.';
          setMessages((prev) => [...prev, { role: 'assistant', content: `(오류) ${msg}` }]);
        } else {
          setMessages((prev) => [...prev, data.reply as ChatMessage]);
        }
      } catch (err) {
        console.error('[chatbook] send failed', err);
        setMessages((prev) => [...prev, { role: 'assistant', content: '(오류) 통신에 실패했습니다.' }]);
      } finally {
        setSending(false);
      }
    },
    [activeCharacter, input, sending, sessionId],
  );

  const handleKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void sendMessage();
    }
  };

  /* ── 사이드: 최근 세션 + 캐릭터 매핑 ───────────────── */
  const sessionChars = useMemo(() => {
    const map = new Map<string, Character>();
    characters.forEach((c) => map.set(c.id, c));
    return map;
  }, [characters]);

  /* ── 렌더 ──────────────────────────────────── */
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="text-center text-muted text-sm py-20">캐릭터를 불러오는 중…</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">캐릭터챗북</h1>
        <p className="text-sm text-muted leading-relaxed">
          저작권 만료 고전 캐릭터와 대화하며 블로그 콘텐츠 아이디어·주제·관점을 발굴하세요. 예비인플루언서 플랜 전용 기능입니다.
        </p>
      </header>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {errorMsg}
        </div>
      )}

      {!activeCharacter ? (
        <>
          {/* 캐릭터 갤러리 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {characters.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openCharacter(c)}
                className="group rounded-2xl border border-border bg-surface hover:border-accent hover:shadow-md transition-all p-4 text-left flex flex-col gap-2"
                style={{ borderTop: `3px solid ${c.accent_color || '#BF8C80'}` }}
              >
                <div className="text-center pt-1">
                  <div className="text-sm font-bold text-foreground">{c.name}</div>
                  <div className="text-[11px] text-muted mt-1 leading-snug min-h-[32px]">
                    {c.origin}
                  </div>
                </div>
                <p className="text-[12px] text-muted leading-relaxed text-center min-h-[48px]">
                  {c.short_bio}
                </p>
                <div className="flex flex-wrap justify-center gap-1 mt-1">
                  {(c.tags || []).slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="text-[10px] font-semibold text-accent bg-accent/10 rounded-full px-2 py-0.5"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* 최근 대화 */}
          {sessions.length > 0 && (
            <section className="mt-10">
              <h2 className="text-base font-bold text-foreground mb-3">이어서 대화하기</h2>
              <div className="space-y-2">
                {sessions.slice(0, 5).map((s) => {
                  const c = sessionChars.get(s.character_id);
                  if (!c) return null;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openSession(s)}
                      className="w-full flex items-center gap-3 rounded-xl border border-border bg-surface hover:border-accent px-4 py-3 text-left transition-colors"
                      style={{ borderLeft: `3px solid ${c.accent_color || '#BF8C80'}` }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground">{c.name}</div>
                        <div className="text-[11px] text-muted mt-0.5">
                          {new Date(s.updated_at).toLocaleString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-accent flex-shrink-0">
                        {s.message_count} 메시지
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      ) : (
        /* 채팅 패널 */
        <div className="rounded-2xl border border-border bg-surface overflow-hidden flex flex-col" style={{ minHeight: '540px' }}>
          {/* 상단 바 */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background/40">
            <button
              type="button"
              onClick={backToGallery}
              className="text-xs text-muted hover:text-foreground rounded-lg border border-border bg-surface px-3 py-1.5"
            >
              ← 캐릭터 목록
            </button>
            <div
              className="flex items-center gap-2 flex-1 min-w-0 pl-3"
              style={{ borderLeft: `3px solid ${activeCharacter.accent_color || '#BF8C80'}` }}
            >
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground truncate">{activeCharacter.name}</div>
                <div className="text-[11px] text-muted truncate">{activeCharacter.origin}</div>
              </div>
            </div>
          </div>

          {/* 메시지 */}
          <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3" style={{ maxHeight: '520px' }}>
            {messages.map((m, idx) => (
              <div
                key={m.id || idx}
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'ml-auto bg-accent text-white rounded-br-sm'
                    : 'mr-auto bg-background/60 text-foreground border border-border rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
            ))}
            {sending && (
              <div className="mr-auto text-xs text-muted italic px-2 py-1">
                {activeCharacter.name}이(가) 생각 중입니다…
              </div>
            )}
          </div>

          {/* 입력 */}
          <form onSubmit={sendMessage} className="border-t border-border px-4 py-3 bg-surface">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="궁금한 콘텐츠 아이디어나 주제를 물어보세요 (2,000자 이내)"
              rows={2}
              maxLength={2000}
              disabled={sending}
              className="w-full rounded-xl border border-border bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted/60 resize-y focus:outline-none focus:border-accent"
            />
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="text-[11px] text-muted">예비인플루언서 플랜 전용</span>
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? '전송 중…' : '보내기'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-border bg-surface/50 px-4 py-3 text-xs text-muted leading-relaxed">
        {DISCLAIMER}
      </div>
    </div>
  );
}
