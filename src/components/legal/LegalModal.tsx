'use client';

import Modal from '@/components/ui/Modal';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function LegalModal({ open, title, onClose, children }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnEscape
      lockBodyScroll
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <div className="bg-surface w-full max-w-2xl max-h-[85vh] rounded-lg border border-border shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full hover:bg-bg flex items-center justify-center text-dim hover:text-text transition cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">
          {children}
        </div>
        <div className="px-6 py-3 border-t border-border shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-xl transition cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
