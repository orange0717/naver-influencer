'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MarketingSchoolCard from '@/components/MarketingSchoolCard';
import { AI_CONSULTANT_CATALOG } from '@/lib/ai-consultant-catalog';
import { useMemberOnlyGate } from '@/contexts/MemberOnlyGateContext';
import { useTrialEndedGate } from '@/contexts/TrialEndedGateContext';

interface Recommendation {
  featureId: string;
  label: string;
  href: string;
  authOnly: boolean;
  /** 네이버 비즈니스 스쿨처럼 N인플 밖 공식 사이트로 연결되는 항목 — 새 탭으로 열어야 한다.
   *  optional인 이유: 이 필드 추가 이전에 저장된 "최근 분석" 이력에는 값이 없을 수 있음. */
  external?: boolean;
  score: number;
  reason: string;
}

interface ConsultResult {
  interpretation: string;
  recommendations: Recommendation[];
  /** 이번 답변이 N인플 실제 데이터를 근거로 했는지 (§17 데이터 근거 뱃지용). */
  dataUsed?: boolean;
  /** 사용된 N인플 데이터 출처 라벨 (예: "인플루언서 랭킹", "미노출 분석"). */
  dataSources?: string[];
}

/** 멀티턴 맥락 — 같은 세션에서 오간 대화. 서버로 함께 보내 앞선 업종·타깃 등을 기억하게 한다. */
interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface RecentQuery {
  id: string;
  query: string;
  interpretation: string;
  recommendations: Recommendation[];
  created_at: string;
}

// "추천 분석" 칩 = N인플에 이미 만들어진 기능 전체 목록 (src/lib/ai-consultant-catalog.ts 그대로 재사용).
// AI에게 물어보지 않고 바로 해당 기능 페이지로 이동하는 직행 바로가기 — 카탈로그에 기능이 추가되면
// 이 목록도 자동으로 늘어난다. 외부 링크(네이버 비즈니스 스쿨)는 아래 MarketingSchoolCard가 이미
// 전용 카드로 안내하고 있어 중복을 피하려고 제외.
const FEATURE_SHORTCUTS = AI_CONSULTANT_CATALOG.filter((f) => !f.external);

// 대화목록의 "상단 고정"·"이름 변경"·"패널 접기" 상태는 서버 컬럼이 없어 기기별 localStorage에 보관한다.
// (질문 이력 ai_consultant_queries 에는 pinned/custom_title 컬럼이 없음 — 삭제만 서버 반영)
const LS_PINS = 'ninfle_ai_pins';
const LS_TITLES = 'ninfle_ai_titles';
const LS_COLLAPSED = 'ninfle_ai_panel_collapsed';

/** created_at 을 오늘/어제/지난 7일/이전 대화 4구간으로 나눈다. */
function dateBucket(iso: string): '오늘' | '어제' | '지난 7일' | '이전 대화' {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '이전 대화';
  const dayMs = 86400000;
  if (t >= todayStart) return '오늘';
  if (t >= todayStart - dayMs) return '어제';
  if (t >= todayStart - dayMs * 7) return '지난 7일';
  return '이전 대화';
}

const BUCKET_ORDER = ['오늘', '어제', '지난 7일', '이전 대화'] as const;

export default function AiConsultantClient() {
  // AI 질문은 게스트·무료회원 모두 하루 3회까지 무료. 초과(402)하면 유료가입을 유도한다.
  // 게스트는 회원가입 모달, 로그인 무료회원은 이용권 구매 모달로 분기 (needsSignup 플래그 기준).
  const { openGate: openMemberGate } = useMemberOnlyGate();
  const { openGate: openUpgradeGate } = useTrialEndedGate();

  const [input, setInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [result, setResult] = useState<ConsultResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentQuery[] | null>(null);
  const [activeRecentId, setActiveRecentId] = useState<string | null>(null);
  // 세션 내 멀티턴 맥락. 화면에는 최신 답변만 보여주되, 서버에는 이전 대화를 함께 보내
  // 사용자가 앞서 밝힌 업종·타깃을 기억하게 한다(§8·§15). "새 대화" 시 초기화.
  const [turns, setTurns] = useState<ConversationTurn[]>([]);

  // ── 대화목록(보조 사이드바) 상태 ──
  const [collapsed, setCollapsed] = useState(false); // 패널 접힘 여부
  const [search, setSearch] = useState(''); // 대화 검색어
  const [pins, setPins] = useState<string[]>([]); // 상단 고정된 질문 id
  const [titles, setTitles] = useState<Record<string, string>>({}); // id → 사용자 지정 제목
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null); // ⋯ 메뉴 열린 항목
  const [renamingId, setRenamingId] = useState<string | null>(null); // 이름 변경 중인 항목
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const loadRecent = async () => {
    try {
      const res = await fetch('/api/ai-consultant');
      const data = await res.json();
      if (res.ok) setRecent(data.items || []);
    } catch {
      // 최근 분석 목록은 부가 기능 — 실패해도 조용히 무시
    }
  };

  useEffect(() => {
    loadRecent();
    // 기기별 저장 상태 복원 (SSR 불일치 방지를 위해 마운트 후 로드)
    try {
      const p = JSON.parse(localStorage.getItem(LS_PINS) || '[]');
      if (Array.isArray(p)) setPins(p.filter((x) => typeof x === 'string'));
      const t = JSON.parse(localStorage.getItem(LS_TITLES) || '{}');
      if (t && typeof t === 'object') setTitles(t);
      setCollapsed(localStorage.getItem(LS_COLLAPSED) === '1');
    } catch {
      // 저장값 파싱 실패는 무시하고 기본값 사용
    }
  }, []);

  // 이름 변경 인풋이 뜨면 포커스
  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  // ⋯ 메뉴 바깥 클릭 시 닫기 (sticky aside가 별도 stacking context라 투명 백드롭 대신 문서 리스너 사용)
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpenId]);

  const persistPins = (next: string[]) => {
    setPins(next);
    try {
      localStorage.setItem(LS_PINS, JSON.stringify(next));
    } catch {}
  };
  const persistTitles = (next: Record<string, string>) => {
    setTitles(next);
    try {
      localStorage.setItem(LS_TITLES, JSON.stringify(next));
    } catch {}
  };
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(LS_COLLAPSED, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const runConsult = async (query: string) => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setActiveRecentId(null);
    setSubmittedQuery(q);

    try {
      const res = await fetch('/api/ai-consultant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, history: turns }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 하루 무료 3회 소진 → 유료가입 유도. 게스트는 회원가입, 무료회원은 이용권 구매 모달.
        if (res.status === 402 && data.quotaExceeded) {
          if (data.needsSignup) openMemberGate('/');
          else openUpgradeGate('/');
        } else {
          setError(data.error || '추천을 불러오지 못했습니다.');
        }
      } else {
        setResult(data);
        if (data.id) setActiveRecentId(data.id);
        // 이번 질문/답변을 세션 맥락에 누적 (다음 질문이 이 맥락을 기억하도록)
        setTurns((prev) => [...prev, { role: 'user', content: q }, { role: 'assistant', content: data.interpretation || '' }]);
        loadRecent();
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const openRecent = (item: RecentQuery) => {
    setError(null);
    setSubmittedQuery(item.query);
    setInput(item.query);
    setResult({ interpretation: item.interpretation, recommendations: item.recommendations });
    setActiveRecentId(item.id);
    setMenuOpenId(null);
    // 저장된 이력을 열면 그 질문/답변을 새 세션 맥락의 시작점으로 삼는다.
    setTurns([{ role: 'user', content: item.query }, { role: 'assistant', content: item.interpretation }]);
  };

  const startNew = () => {
    setResult(null);
    setError(null);
    setInput('');
    setSubmittedQuery('');
    setActiveRecentId(null);
    setTurns([]);
    setMenuOpenId(null);
  };

  // ── ⋯ 메뉴 액션 ──
  const startRename = (item: RecentQuery) => {
    setRenamingId(item.id);
    setRenameValue(titles[item.id] || item.query);
    setMenuOpenId(null);
  };
  const commitRename = () => {
    if (!renamingId) return;
    const v = renameValue.trim();
    const next = { ...titles };
    if (v) next[renamingId] = v.slice(0, 80);
    else delete next[renamingId]; // 빈 값이면 원래 질문 텍스트로 되돌림
    persistTitles(next);
    setRenamingId(null);
  };
  const togglePin = (id: string) => {
    persistPins(pins.includes(id) ? pins.filter((x) => x !== id) : [id, ...pins]);
    setMenuOpenId(null);
  };
  const deleteQuery = async (id: string) => {
    setMenuOpenId(null);
    if (!confirm('이 대화를 삭제할까요? 되돌릴 수 없습니다.')) return;
    // 낙관적 제거 후, 실패하면 목록 재조회로 복구
    const prev = recent;
    setRecent((r) => (r ? r.filter((x) => x.id !== id) : r));
    if (activeRecentId === id) startNew();
    if (pins.includes(id)) persistPins(pins.filter((x) => x !== id));
    if (titles[id]) {
      const nt = { ...titles };
      delete nt[id];
      persistTitles(nt);
    }
    try {
      const res = await fetch(`/api/ai-consultant/queries/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setRecent(prev); // 실패 시 롤백
      setError('대화를 삭제하지 못했습니다.');
    }
  };

  const displayTitle = (item: RecentQuery) => titles[item.id]?.trim() || item.query;

  // 결과/로딩/에러가 없는 초기 화면은 ChatGPT·Claude처럼 화면 중앙에 오도록,
  // 질문을 하고 나면(결과가 생기면) 다시 일반적인 위→아래 흐름으로 전환한다.
  const isIdle = !result && !loading && !error;

  // 대화 목록(최근 분석)이 있는 로그인 사용자에게만 ChatGPT식 좌측 전용 패널을 띄운다.
  // 게스트·신규(이력 없음)는 패널 없이 기존 중앙 정렬 레이아웃 그대로. 모바일에서는
  // 좁은 화면 눌림을 피하려 패널 대신 본문 하단의 최근 대화 목록을 유지한다(아래 lg:hidden).
  const hasConversationList = !!(recent && recent.length > 0);
  // 데스크톱에서 패널을 실제로 렌더링하는지 (목록 있음 + 접힘 아님)
  const showPanel = hasConversationList && !collapsed;

  // 검색 + 고정 분리. 검색어는 제목(사용자 지정 또는 원문)에 대해 부분일치.
  const q = search.trim().toLowerCase();
  const filtered = (recent || []).filter((item) => !q || displayTitle(item).toLowerCase().includes(q));
  const pinnedItems = filtered.filter((item) => pins.includes(item.id));
  const unpinned = filtered.filter((item) => !pins.includes(item.id));
  const buckets = BUCKET_ORDER.map((label) => ({
    label,
    items: unpinned.filter((item) => dateBucket(item.created_at) === label),
  })).filter((b) => b.items.length > 0);

  // 목록 한 항목 렌더 (패널·모바일 공용)
  const renderItem = (item: RecentQuery) => {
    const isRenaming = renamingId === item.id;
    const isActive = activeRecentId === item.id;
    const isPinned = pins.includes(item.id);
    return (
      <div key={item.id} className="group relative">
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenamingId(null);
            }}
            onBlur={commitRename}
            maxLength={80}
            className="w-full px-3 py-2 rounded-lg border border-accent bg-bg text-xs text-text focus:outline-none"
          />
        ) : (
          <button
            onClick={() => openRecent(item)}
            title={displayTitle(item)}
            className={`w-full flex items-center gap-1.5 pl-3 pr-7 py-2 rounded-lg border text-xs transition-colors cursor-pointer text-left ${
              isActive
                ? 'border-accent text-accent bg-accent/5'
                : 'border-border text-dim hover:border-accent hover:text-accent'
            }`}
          >
            {isPinned && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0 opacity-70">
                <path d="M9 4v6l-2 4v2h10v-2l-2-4V4h1V2H8v2h1zm2 14h2v4h-2v-4z" />
              </svg>
            )}
            <span className="min-w-0 flex-1 truncate">{displayTitle(item)}</span>
          </button>
        )}

        {!isRenaming && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === item.id ? null : item.id);
              }}
              aria-label="대화 옵션"
              className={`absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-dim hover:text-accent hover:bg-accent/10 transition-opacity ${
                menuOpenId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            {menuOpenId === item.id && (
              <div className="absolute right-1 top-9 z-30 w-32 py-1 rounded-lg border border-border bg-surface shadow-lg">
                <button
                  onClick={() => startRename(item)}
                  className="w-full text-left px-3 py-2 text-xs text-text hover:bg-bg transition-colors"
                >
                  이름 변경
                </button>
                <button
                  onClick={() => togglePin(item.id)}
                  className="w-full text-left px-3 py-2 text-xs text-text hover:bg-bg transition-colors"
                >
                  {isPinned ? '고정 해제' : '상단 고정'}
                </button>
                <button
                  onClick={() => deleteQuery(item.id)}
                  className="w-full text-left px-3 py-2 text-xs text-down hover:bg-down/10 transition-colors"
                >
                  삭제
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // 헤더(56px) + 페이지 상하 여백을 뺀 나머지 뷰포트 안에서 정중앙에 오도록.
  // 65vh는 화면 위쪽 65%에서만 중앙 정렬돼 오히려 위로 쏠려 보였음 (2026-08-08).
  return (
    <div className={hasConversationList ? 'w-full lg:flex lg:items-start lg:gap-6' : ''}>
      {/* ── 보조 사이드바: AI 대화목록 (데스크톱, 펼침 상태) ── */}
      {showPanel && (
        <aside className="hidden lg:flex lg:flex-col lg:w-[260px] lg:shrink-0 gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)]">
          <div className="flex items-center gap-2">
            <button
              onClick={startNew}
              className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-bold text-accent border border-accent/40 hover:bg-accent/10 transition-colors cursor-pointer"
            >
              <span className="text-sm leading-none">+</span> 새 대화
            </button>
            <button
              onClick={toggleCollapsed}
              aria-label="대화목록 접기"
              title="대화목록 접기"
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border border-border text-dim hover:text-accent hover:border-accent transition-colors cursor-pointer"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>

          {/* 대화 검색 */}
          <div className="relative shrink-0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="대화 검색"
              className="w-full pl-8 pr-3 py-2 bg-bg border border-border rounded-lg text-xs text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* 목록 */}
          <div className="space-y-3 overflow-y-auto pr-1 -mr-1">
            {filtered.length === 0 && (
              <p className="text-xs text-dim/70 px-1 py-2">
                {q ? '검색 결과가 없습니다.' : '아직 대화가 없습니다.'}
              </p>
            )}

            {pinnedItems.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-dim px-1">고정됨</p>
                {pinnedItems.map(renderItem)}
              </div>
            )}

            {buckets.map((bucket) => (
              <div key={bucket.label} className="space-y-1.5">
                <p className="text-[11px] font-bold text-dim px-1">{bucket.label}</p>
                {bucket.items.map(renderItem)}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* ── AI 메인 영역: 대화목록을 제외한 남은 너비 전체(flex-1) ── */}
      <div className={`${hasConversationList ? 'flex-1 min-w-0' : ''} ${isIdle && !hasConversationList ? 'min-h-[calc(100dvh-8rem)] flex flex-col justify-center' : ''}`}>
        {/* 메인 콘텐츠는 AI 메인 영역(flex-1) 기준으로 중앙 정렬 + 최대폭 제한 */}
        <div className="max-w-[960px] mx-auto w-full space-y-6">
          <div className="relative flex items-center justify-center gap-3 pt-2">
            {/* 패널 접힘 상태일 때만 노출되는 펼치기 버튼 (중앙 정렬을 깨지 않도록 absolute) */}
            {hasConversationList && collapsed && (
              <button
                onClick={toggleCollapsed}
                aria-label="대화목록 펼치기"
                title="대화목록 펼치기"
                className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-dim hover:text-accent hover:border-accent transition-colors cursor-pointer"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M9 4v16" />
                </svg>
                <span className="text-xs font-bold">대화목록</span>
              </button>
            )}
            <div className="text-center space-y-1.5">
              <h1 className="font-title text-[30px] font-normal text-[#222222]">N인플 AI</h1>
              <p className="font-title text-[17px] font-normal text-[#777777]">무엇을 도와드릴까요?</p>
            </div>
            {(result || error) && (
              <button
                onClick={startNew}
                className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-bold text-accent border border-accent/40 hover:bg-accent/10 transition-colors cursor-pointer ${hasConversationList ? 'lg:hidden' : ''}`}
              >
                + 새 대화
              </button>
            )}
          </div>

          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 shadow-sm space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runConsult(input);
                }}
                placeholder="예: 요즘 블로그 방문자가 줄었는데 무엇부터 확인해야 할까요?"
                className="flex-1 w-full px-4 py-3.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => runConsult(input)}
                disabled={loading || !input.trim()}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-sm font-normal bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default shrink-0"
              >
                {loading ? '분석 중...' : 'AI에게 물어보기'}
              </button>
            </div>
            <p className="text-[11px] text-dim/70 leading-relaxed">
              마케팅, 콘텐츠, 블로그, 검색 노출에 대한 고민을 입력하면 AI가 바로 답변해드리고, 관련된 N인플 기능도 함께 추천해드립니다. (무료 하루 3회)
            </p>
          </div>

          {!result && !loading && (
            <div className="space-y-2.5 pt-3 mt-2 border-t border-border/60">
              <p className="text-xs font-medium text-dim">추천 분석 — N인플 기능 바로가기</p>
              <div className="flex flex-wrap gap-2">
                {FEATURE_SHORTCUTS.map((f) => (
                  <Link
                    key={f.id}
                    href={f.href}
                    className="px-3.5 py-2 rounded-full border border-border bg-surface text-xs text-text hover:border-accent hover:text-accent transition-colors"
                  >
                    {f.label}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* AI 호출 없이 항상 노출 — 크레딧/로그인과 무관한 단순 외부 링크 안내 */}
          {!result && !loading && <MarketingSchoolCard />}

          {loading && (
            <div className="flex items-center justify-center py-14 bg-surface border border-border rounded-lg">
              <div className="text-center">
                <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
                <p className="text-xs text-dim">&ldquo;{submittedQuery}&rdquo; 답변 생성 중...</p>
                <p className="text-[11px] text-dim/60 mt-1">질문 분석 → AI 답변 작성 중</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
              <p className="text-sm text-down font-semibold">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="bg-surface border border-border rounded-2xl p-5 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[11px] font-bold text-accent">N인플 AI 답변</p>
                  {result.dataUsed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-up/10 text-up text-[10px] font-bold">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      N인플 데이터 근거
                      {result.dataSources && result.dataSources.length > 0 && (
                        <span className="font-medium opacity-80">· {result.dataSources.join(', ')}</span>
                      )}
                    </span>
                  )}
                </div>
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{result.interpretation}</p>
              </div>

              {result.recommendations.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-dim">함께 보면 좋은 N인플 기능</p>
                  {result.recommendations.map((rec) => (
                    <div
                      key={rec.featureId}
                      className="flex items-center justify-between gap-3 bg-surface border border-border rounded-xl p-4"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-text">{rec.label}</span>
                          <span className="text-accent text-xs tracking-tight" aria-label={`관련도 ${rec.score}/5`}>
                            {'★'.repeat(rec.score)}
                            <span className="text-border">{'★'.repeat(5 - rec.score)}</span>
                          </span>
                        </div>
                        <p className="text-xs text-dim leading-relaxed">{rec.reason}</p>
                      </div>
                      {rec.external ? (
                        <a
                          href={rec.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${rec.label} 바로가기`}
                          className="shrink-0 inline-flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition-colors"
                        >
                          바로가기
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M7 17L17 7" />
                            <path d="M7 7h10v10" />
                          </svg>
                        </a>
                      ) : (
                        <Link
                          href={rec.href}
                          className="shrink-0 px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition-colors"
                        >
                          이동
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 데스크톱은 좌측 대화 목록 패널로 이동 — 여기서는 모바일 화면에서만 하단 목록 노출 */}
          {hasConversationList && (
            <div className="lg:hidden space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-bold text-dim pt-3">최근 대화</p>
              <div className="space-y-1.5">
                {(recent || []).map(renderItem)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
