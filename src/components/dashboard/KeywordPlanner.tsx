'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface KeywordOption {
  id: string;
  keyword: string;
}

interface PlanItem {
  id: string;
  keyword_id: string | null;
  keyword: string;
  category: string;
  memo: string;
  status: 'planned' | 'writing' | 'done';
  sort_order: number;
}

type StatusFilter = 'all' | 'planned' | 'writing' | 'done';

const STATUS_CONFIG = {
  planned: { label: '예정', bg: 'bg-border/40', text: 'text-dim', next: 'writing' as const },
  writing: { label: '작성중', bg: 'bg-accent/15', text: 'text-accent', next: 'done' as const },
  done: { label: '완료', bg: 'bg-up/15', text: 'text-up', next: 'planned' as const },
};

export default function KeywordPlanner({
  existingKeywords = [],
}: {
  existingKeywords?: KeywordOption[];
}) {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [editingMemo, setEditingMemo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);

  // 데이터 로드
  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/my/keyword-plans');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } catch {
      // 조회 실패 무시
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // 자동완성 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 필터링된 자동완성 목록
  const suggestions = inputValue.trim()
    ? existingKeywords.filter(kw =>
        kw.keyword.toLowerCase().includes(inputValue.toLowerCase()) &&
        !plans.some(p => p.keyword_id === kw.id || p.keyword === kw.keyword)
      ).slice(0, 8)
    : [];

  // 키워드 추가
  const addPlan = async (keywordId?: string, keywordName?: string) => {
    const name = keywordName || inputValue.trim();
    if (!name && !keywordId) return;

    // 중복 체크
    if (plans.some(p => p.keyword === name || (keywordId && p.keyword_id === keywordId))) {
      setInputValue('');
      setShowSuggestions(false);
      return;
    }

    const body: Record<string, unknown> = {};
    if (keywordId) {
      body.keyword_id = keywordId;
    } else {
      body.custom_keyword = name;
    }

    try {
      const res = await fetch('/api/my/keyword-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        const kw = existingKeywords.find(k => k.id === keywordId);
        setPlans(prev => [...prev, {
          id: data.plan.id,
          keyword_id: keywordId || null,
          keyword: kw?.keyword || name,
          category: '',
          memo: '',
          status: 'planned',
          sort_order: data.plan.sort_order,
        }]);
      }
    } catch {
      // 추가 실패 무시
    }

    setInputValue('');
    setShowSuggestions(false);
  };

  // 상태 변경 (클릭 시 순환)
  const cycleStatus = async (plan: PlanItem) => {
    const nextStatus = STATUS_CONFIG[plan.status].next;
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, status: nextStatus } : p));

    try {
      await fetch('/api/my/keyword-plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: plan.id, status: nextStatus }),
      });
    } catch {
      // 실패 시 롤백
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, status: plan.status } : p));
    }
  };

  // 메모 저장 (blur)
  const saveMemo = async (planId: string, memo: string) => {
    setEditingMemo(null);
    const original = plans.find(p => p.id === planId)?.memo;
    if (original === memo) return;

    setPlans(prev => prev.map(p => p.id === planId ? { ...p, memo } : p));

    try {
      await fetch('/api/my/keyword-plans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: planId, memo }),
      });
    } catch {
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, memo: original || '' } : p));
    }
  };

  // 삭제
  const deletePlan = async (planId: string) => {
    const original = plans.find(p => p.id === planId);
    setPlans(prev => prev.filter(p => p.id !== planId));

    try {
      await fetch(`/api/my/keyword-plans?id=${planId}`, { method: 'DELETE' });
    } catch {
      if (original) setPlans(prev => [...prev, original]);
    }
  };

  // 필터링
  const filtered = filter === 'all' ? plans : plans.filter(p => p.status === filter);

  // 상태별 카운트
  const counts = {
    all: plans.length,
    planned: plans.filter(p => p.status === 'planned').length,
    writing: plans.filter(p => p.status === 'writing').length,
    done: plans.filter(p => p.status === 'done').length,
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'planned', label: '예정' },
    { key: 'writing', label: '작성중' },
    { key: 'done', label: '완료' },
  ];

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[15px]">포스팅 플래너</h3>
        {plans.length > 0 && (
          <span className="text-[11px] text-dim">
            {counts.done}/{counts.all} 완료
          </span>
        )}
      </div>

      {/* 키워드 추가 입력 */}
      <div className="relative mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => inputValue.trim() && setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addPlan();
                }
              }}
              placeholder="포스팅할 키워드 입력..."
              className="w-full px-3 py-2 text-sm bg-bg border border-border rounded-lg outline-none focus:border-accent/40 transition-colors"
            />

            {/* 자동완성 드롭다운 */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestRef}
                className="absolute z-20 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto"
              >
                {suggestions.map(kw => (
                  <button
                    key={kw.id}
                    onClick={() => addPlan(kw.id, kw.keyword)}
                    className="w-full px-3 py-2 text-sm text-left hover:bg-accent/5 transition-colors cursor-pointer"
                  >
                    {kw.keyword}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => addPlan()}
            disabled={!inputValue.trim()}
            className="shrink-0 px-4 py-2 text-sm font-bold text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            추가
          </button>
        </div>
      </div>

      {/* 상태 필터 탭 */}
      {plans.length > 0 && (
        <div className="flex gap-1 mb-4 border-b border-border/50 pb-2">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 text-xs rounded-full transition-colors cursor-pointer ${
                filter === f.key
                  ? 'bg-accent/15 text-accent font-bold'
                  : 'text-dim hover:bg-border/30'
              }`}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span className="ml-1 font-rank">{counts[f.key]}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 플랜 목록 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-dim">
            {plans.length === 0
              ? '포스팅할 키워드를 추가해보세요'
              : '해당 상태의 키워드가 없습니다'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(plan => {
            const cfg = STATUS_CONFIG[plan.status];
            return (
              <div
                key={plan.id}
                className={`group rounded-xl border border-border/50 p-3 transition-colors ${
                  plan.status === 'done' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {/* 상태 뱃지 (클릭 시 순환) */}
                  <button
                    onClick={() => cycleStatus(plan)}
                    className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${cfg.bg} ${cfg.text}`}
                    title="클릭하여 상태 변경"
                  >
                    {cfg.label}
                  </button>

                  {/* 키워드 이름 */}
                  <span className={`flex-1 text-sm font-semibold truncate ${
                    plan.status === 'done' ? 'line-through text-dim' : 'text-text'
                  }`}>
                    {plan.keyword}
                  </span>

                  {/* 메모 토글 */}
                  <button
                    onClick={() => setEditingMemo(editingMemo === plan.id ? null : plan.id)}
                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                      plan.memo ? 'bg-accent/10 text-accent' : 'bg-border/30 text-dim lg:opacity-0 lg:group-hover:opacity-100'
                    }`}
                    title="메모"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  {/* 삭제 */}
                  <button
                    onClick={() => deletePlan(plan.id)}
                    className="shrink-0 w-6 h-6 rounded-full bg-border/30 text-dim hover:bg-down/15 hover:text-down flex items-center justify-center lg:opacity-0 lg:group-hover:opacity-100 transition-all cursor-pointer"
                    title="삭제"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* 메모 영역 */}
                {(editingMemo === plan.id || plan.memo) && (
                  <div className="mt-2">
                    {editingMemo === plan.id ? (
                      <textarea
                        defaultValue={plan.memo}
                        onBlur={(e) => saveMemo(plan.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditingMemo(null);
                        }}
                        autoFocus
                        rows={2}
                        placeholder="포스팅 주제, 아이디어 등 메모..."
                        className="w-full px-3 py-2 text-xs bg-bg border border-border rounded-lg outline-none focus:border-accent/40 resize-none transition-colors"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingMemo(plan.id)}
                        className="w-full text-left text-xs text-dim bg-bg/50 rounded-lg px-3 py-2 hover:bg-bg transition-colors cursor-pointer"
                      >
                        {plan.memo}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
