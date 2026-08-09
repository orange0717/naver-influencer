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
  owner_user_id?: string | null;
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
  const [myCharacters, setMyCharacters] = useState<Character[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  // 캐릭터 생성 모달
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
        if (!cancelled && charData.mine) setMyCharacters(charData.mine);

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

  /* ── 캐릭터 생성 ───────────────────────────────── */
  const reloadCharacters = useCallback(async () => {
    try {
      const res = await fetch('/api/chatbook/characters', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (data.characters) setCharacters(data.characters);
      if (data.mine) setMyCharacters(data.mine);
    } catch (err) {
      console.error('[chatbook] reload characters failed', err);
    }
  }, []);

  const submitCreate = useCallback(
    async (ev?: React.FormEvent) => {
      if (ev) ev.preventDefault();
      if (creating) return;
      const name = createName.trim();
      const description = createDesc.trim();
      if (!name) {
        setCreateError('캐릭터 이름을 입력해주세요.');
        return;
      }
      if (!description) {
        setCreateError('캐릭터 설정을 입력해주세요.');
        return;
      }
      setCreating(true);
      setCreateError(null);
      try {
        const res = await fetch('/api/chatbook/characters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setCreateError(data.error || '캐릭터를 만들지 못했습니다.');
          return;
        }
        // 성공 → 모달 닫고 목록 새로고침
        setCreateName('');
        setCreateDesc('');
        setShowCreateModal(false);
        await reloadCharacters();
      } catch (err) {
        console.error('[chatbook] create failed', err);
        setCreateError('네트워크 오류가 발생했습니다.');
      } finally {
        setCreating(false);
      }
    },
    [createName, createDesc, creating, reloadCharacters],
  );

  const deleteCharacter = useCallback(
    async (character: Character, ev?: React.MouseEvent) => {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (!confirm(`"${character.name}" 캐릭터를 삭제할까요? 관련 대화 기록도 모두 삭제됩니다.`)) return;
      try {
        const res = await fetch(`/api/chatbook/characters?id=${encodeURIComponent(character.id)}`, {
          method: 'DELETE',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorMsg(data.error || '삭제에 실패했습니다.');
          return;
        }
        await reloadCharacters();
      } catch (err) {
        console.error('[chatbook] delete failed', err);
        setErrorMsg('삭제 중 오류가 발생했습니다.');
      }
    },
    [reloadCharacters],
  );

  /* ── 사이드: 최근 세션 + 캐릭터 매핑 ───────────────── */
  const sessionChars = useMemo(() => {
    const map = new Map<string, Character>();
    characters.forEach((c) => map.set(c.id, c));
    myCharacters.forEach((c) => map.set(c.id, c));
    return map;
  }, [characters, myCharacters]);

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
          {/* 내가 만든 캐릭터 */}
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-foreground">
                내가 만든 캐릭터 <span className="text-muted font-normal">({myCharacters.length}/20)</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setShowCreateModal(true);
                }}
                className="rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold px-4 py-2"
              >
                + 새 캐릭터 만들기
              </button>
            </div>
            {myCharacters.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface/40 px-4 py-6 text-center text-xs text-muted">
                아직 만든 캐릭터가 없습니다. 위 버튼을 눌러 나만의 캐릭터를 만들어보세요.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {myCharacters.map((c) => (
                  <div
                    key={c.id}
                    className="relative group rounded-lg border border-border bg-surface hover:border-accent hover:shadow-md transition-all"
                    style={{ borderTop: `3px solid ${c.accent_color || '#BF8C80'}` }}
                  >
                    <button
                      type="button"
                      onClick={(e) => deleteCharacter(c, e)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="캐릭터 삭제"
                      aria-label="캐릭터 삭제"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      onClick={() => openCharacter(c)}
                      className="w-full p-4 text-left flex flex-col gap-2"
                    >
                      <div className="text-center pt-1">
                        <div className="text-sm font-bold text-foreground">{c.name}</div>
                        <div className="text-[11px] text-muted mt-1 leading-snug min-h-[32px]">{c.origin}</div>
                      </div>
                      <p className="text-[12px] text-muted leading-relaxed text-center min-h-[48px]">{c.short_bio}</p>
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
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 기본 제공 캐릭터 */}
          <section>
            <h2 className="text-base font-bold text-foreground mb-3">기본 제공 캐릭터 (저작권 만료 고전)</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openCharacter(c)}
                  className="group rounded-lg border border-border bg-surface hover:border-accent hover:shadow-md transition-all p-4 text-left flex flex-col gap-2"
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
          </section>

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
        <div className="rounded-lg border border-border bg-surface overflow-hidden flex flex-col" style={{ minHeight: '540px' }}>
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
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
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

      {/* 캐릭터 생성 모달 */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
          onClick={() => !creating && setShowCreateModal(false)}
        >
          <div
            className="bg-surface border border-border rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-foreground mb-1">새 캐릭터 만들기</h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              이름과 한 줄 설정을 입력하면 AI가 말투·배경·인사말을 자동으로 완성합니다.
              저작권이 살아있는 캐릭터·실존 인물·유해 컨셉은 거절될 수 있습니다.
            </p>

            <form onSubmit={submitCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  캐릭터 이름 <span className="text-muted font-normal">(40자 이내)</span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  maxLength={40}
                  disabled={creating}
                  placeholder="예: 베테랑 여행작가 김지혜"
                  className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  캐릭터 설정 <span className="text-muted font-normal">(400자 이내)</span>
                </label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  maxLength={400}
                  rows={5}
                  disabled={creating}
                  placeholder="예: 30년 경력 여행기자. 동남아·유럽·중동을 주로 취재. 블로그 글감을 발굴해주고 구성과 제목을 조언."
                  className="w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted/60 resize-y focus:outline-none focus:border-accent"
                />
                <div className="text-[10px] text-muted mt-1 text-right">{createDesc.length} / 400</div>
              </div>

              {createError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="rounded-xl border border-border bg-surface hover:border-accent text-foreground text-xs font-semibold px-4 py-2 disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creating || !createName.trim() || !createDesc.trim()}
                  className="rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-bold px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {creating ? 'AI가 캐릭터 만드는 중…' : '캐릭터 만들기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
