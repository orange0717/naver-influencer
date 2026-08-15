'use client';

import { MAX_KEYWORDS_PER_POST } from './constants';

/* ═══════════════════════════════════════════════════════════════
   '＋ 키워드 추가' 컨트롤 — 이 포스팅에서 추적·확인할 키워드를 직접 등록한다.

   키워드 순위와 AI 브리핑이 같은 저장소(saved_search_keywords)에 쓰므로
   한쪽에서 추가한 키워드가 다른 쪽에도 그대로 나타난다(스펙 #10).
   같은 위젯을 화면마다(그리고 데스크톱/모바일마다) 손으로 다시 그리던 것을
   여기 하나로 모았다 — 접힘/펼침, 저장 중 표시, 상한 안내가 전부 같은 규칙을 탄다.
   ═══════════════════════════════════════════════════════════════ */

export default function AddKeywordControl({
  open,
  value,
  error,
  atLimit,
  saving = false,
  onOpen,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  value: string;
  error: string;
  atLimit: boolean;
  /** 등록 요청 진행 중 — 버튼을 잠그고 '등록 중…' 을 보여준다. */
  saving?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        disabled={atLimit}
        className="text-[11px] font-bold text-accent hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline"
        title={atLimit
          ? `이 포스팅은 키워드 ${MAX_KEYWORDS_PER_POST}개를 모두 사용했습니다`
          : '이 포스팅에서 추적할 키워드를 직접 등록합니다'}
      >
        ＋ 키워드 추가
      </button>
    );
  }

  return (
    <div className="space-y-1.5 text-left">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          // 한글 조합 중 Enter 는 확정 입력이 아니라 조합 종료라 제출로 보지 않는다.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); }
          if (e.key === 'Escape') onClose();
        }}
        maxLength={40}
        placeholder="예: 짧고 좋은 글귀"
        className={`w-full px-2 py-1 text-xs bg-surface border rounded-lg outline-none ${error ? 'border-down' : 'border-border focus:border-accent'}`}
      />
      {error && <p className="text-[10px] text-down leading-snug">{error}</p>}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving || !value.trim()}
          className="px-2.5 py-1 rounded-lg bg-accent text-white text-[11px] font-bold hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
        >
          {saving ? '등록 중…' : '등록'}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-2.5 py-1 rounded-lg border border-border text-dim text-[11px] font-bold hover:bg-bg transition cursor-pointer disabled:opacity-50"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
