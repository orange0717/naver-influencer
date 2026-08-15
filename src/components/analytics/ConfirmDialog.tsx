'use client';

import type { ReactNode } from 'react';
import Modal from '@/components/ui/Modal';

/* ═══════════════════════════════════════════════════════════════
   분석 화면의 확인 모달 — "제목 · 설명 · (본문) · 취소/실행" 한 벌.

   키워드 순위·AI 브리핑이 실행 전 확인 창을 각자 손으로 그리면서
   배경(fixed inset-0 …)·박스(rounded-2xl max-w-sm p-5)·버튼 두 개를
   파일마다 복사해 두고 있었다. 그 과정에서 공용 ui/Modal 이 이미 제공하는
   ESC 닫기·포커스 트랩·aria 속성이 전부 빠져 있었다 → 껍데기를 여기로 모으고
   내용(대상 수·체크박스·입력창)만 children 으로 받는다.

   busy(실행 중)일 때는 배경 클릭·ESC 로 닫히지 않는다 — 진행 중인 작업을
   실수로 덮지 않기 위해 기존 모달들이 쓰던 규칙을 그대로 옮긴 것.
   ═══════════════════════════════════════════════════════════════ */

export default function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
  busy = false,
  cancelLabel = '취소',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  /** 실행 중 — 닫기를 막고 두 버튼을 잠근다 */
  busy?: boolean;
  cancelLabel?: string;
  /** 제목·설명과 버튼 사이에 들어갈 화면별 내용 */
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      trapFocus
      role="dialog"
      ariaModal
      ariaLabel={title}
      overlayClassName="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-sm p-5">
        <h3 className="text-base font-bold mb-1">{title}</h3>
        {description && <p className="text-xs text-dim mb-4">{description}</p>}
        {children}
        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 px-4 py-2 rounded-xl border border-border text-dim font-bold text-sm hover:bg-bg transition cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className="flex-1 px-4 py-2 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
