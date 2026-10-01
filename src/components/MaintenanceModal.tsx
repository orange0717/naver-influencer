'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';

export default function MaintenanceModal() {
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);

  return (
    <Modal
      open={open}
      onClose={close}
      closeOnBackdrop={false}
      closeOnEscape
      lockBodyScroll
      role="alertdialog"
      ariaModal
      ariaLabelledBy="maintenance-modal-title"
      ariaDescribedBy="maintenance-modal-description"
      zIndex={250}
      overlayClassName="fixed inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-bg p-7 shadow-2xl sm:p-8">
        <div className="mb-5 flex justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4m0 4h.01" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>
        </div>
        <p className="mb-2 text-center text-xs font-semibold tracking-wide text-accent">
          서비스 점검 안내
        </p>
        <h2 id="maintenance-modal-title" className="mb-3 text-center text-xl font-bold text-text">
          현재 서버 점검 중입니다
        </h2>
        <p id="maintenance-modal-description" className="mb-7 text-center text-sm leading-6 text-dim">
          보다 안정적인 서비스 제공을 위해 점검을 진행하고 있습니다.
          점검이 끝날 때까지 일부 기능 이용이 원활하지 않을 수 있습니다.
          불편을 드려 죄송합니다.
        </p>
        <button
          type="button"
          onClick={close}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
        >
          확인
        </button>
      </div>
    </Modal>
  );
}
