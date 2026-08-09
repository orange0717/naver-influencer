'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 배경 클릭으로 닫힘 (기본 true) */
  closeOnBackdrop?: boolean;
  /** ESC 키로 닫힘 (기본 false) */
  closeOnEscape?: boolean;
  /** Tab 포커스를 모달 내부로 가둠. closeOnEscape가 false면 ESC는 소비만 하고 닫지 않음 (기본 false) */
  trapFocus?: boolean;
  /** 열려있는 동안 배경 스크롤 잠금 (기본 false) */
  lockBodyScroll?: boolean;
  /** 모달 내부 첫 번째 input에 자동 포커스 (기본 false) */
  autoFocusFirstInput?: boolean;
  /** 오버레이 z-index (기본 50) */
  zIndex?: number;
  role?: 'dialog' | 'alertdialog' | 'presentation';
  ariaModal?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  /**
   * 오버레이(배경) 래퍼 클래스 — 정렬/패딩/backdrop-blur 등이 모달마다 달라 커스텀 지정.
   * fixed inset-0 류의 포지셔닝은 항상 포함해야 함.
   */
  overlayClassName?: string;
  /** 오버레이 안쪽 컨테이너(포커스 트랩/클릭 전파 차단 대상)에 추가할 클래스 (선택) */
  containerClassName?: string;
}

/**
 * 모든 모달이 공유하는 오버레이 셸(배경+동작)만 제공한다.
 * 내부 박스 마크업(헤더/버튼/폼 등)은 각 모달이 children으로 그대로 유지 —
 * 시각적 통일이 아니라 반복되던 배경/키보드/스크롤 처리 보일러플레이트만 통합.
 * 포탈을 쓰지 않는다: 일부 모달(AuthModal 안의 LegalModal 등)은 CSS stacking
 * context 중첩에 의존해 z-index가 낮아도 부모 위에 겹쳐 보이므로, 포탈로 감싸면
 * 이 레이어링이 깨진다.
 */
export default function Modal({
  open,
  onClose,
  children,
  closeOnBackdrop = true,
  closeOnEscape = false,
  trapFocus = false,
  lockBodyScroll = false,
  autoFocusFirstInput = false,
  zIndex = 50,
  role,
  ariaModal,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  overlayClassName = 'fixed inset-0 flex items-center justify-center bg-black/40 p-4',
  // display:contents — 포커스 트랩/클릭 전파 차단용 래퍼가 실제 박스 레이아웃에
  // 전혀 관여하지 않게 해서, 기존에는 오버레이의 직계 자식이었던 모달 박스가
  // 래퍼 한 겹 추가로 인해 centering/sizing이 달라지는 일을 막는다.
  containerClassName = 'contents',
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;

    const getFocusable = () =>
      container
        ? Array.from(container.querySelectorAll<HTMLElement>('input, button, select, textarea, a[href]'))
            .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
        : [];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (closeOnEscape) {
          onClose();
        } else if (trapFocus) {
          // 강제 모달(예: 닉네임 등록)은 ESC를 소비만 하고 닫지 않는다
          e.preventDefault();
        }
        return;
      }
      if (!trapFocus || e.key !== 'Tab') return;
      const focusables = getFocusable();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    let prevOverflow: string | undefined;
    if (lockBodyScroll) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (lockBodyScroll && prevOverflow !== undefined) {
        document.body.style.overflow = prevOverflow;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose/closeOnEscape 등은
    // 부모에서 매 렌더 재생성되는 콜백일 수 있어(예: AuthModal의 handleClose) deps에 넣으면
    // 매 리렌더(=매 키 입력)마다 effect가 재실행되어 버린다. open 전환 시에만 리스너를
    // (재)등록하면 충분하고, 콜백들은 클로저로 최신 값을 참조하지 않아도 되는 값들이 아니라
    // 실제로는 이 effect 내부에서만 쓰이므로 open 하나로 충분하다.
  }, [open]);

  useEffect(() => {
    if (!open || !autoFocusFirstInput) return;
    // 모달이 "열릴 때" 한 번만 첫 input에 포커스한다. open 이외의 값(예: onClose)에
    // 의존하면 부모 리렌더마다(폼 입력 등으로 인한 매 키 입력마다) 다시 실행되어
    // 사용자가 타이핑 중인 필드에서 포커스를 첫 input으로 강제로 되돌려 버린다.
    containerRef.current?.querySelector<HTMLElement>('input')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={overlayClassName}
      style={{ zIndex }}
      onClick={closeOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
      role={role}
      aria-modal={ariaModal}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    >
      <div ref={containerRef} className={containerClassName} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
