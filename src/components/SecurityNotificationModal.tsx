'use client';

import { useEffect, useRef } from 'react';

interface Notification {
  id: string;
  notification_type: 'PASSWORD_RENEWAL' | 'PRIVACY_POLICY';
  title: string;
  body: string;
  action_url?: string;
}

interface Props {
  notification: Notification;
  onClose: () => void;
  onAction?: () => void;
}

export function SecurityNotificationModal({
  notification,
  onClose,
  onAction,
}: Props) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus management & ESC key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleAction = () => {
    if (onAction) {
      onAction();
    } else if (notification.action_url) {
      window.location.href = notification.action_url;
    }
    onClose();
  };

  const getButtonText = () => {
    if (notification.notification_type === 'PASSWORD_RENEWAL') {
      return 'Change Password Now →';
    }
    return 'View Policy →';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        ref={modalRef}
        className="bg-surface/90 backdrop-blur-md border border-border/50 rounded-2xl shadow-lg max-w-md w-full p-6 animate-in fade-in slide-in-from-bottom-4 duration-300"
        role="alertdialog"
        aria-labelledby="modal-title"
        aria-describedby="modal-body"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h2
            id="modal-title"
            className="text-lg font-semibold text-text leading-tight"
          >
            {notification.title}
          </h2>
          <button
            onClick={onClose}
            className="text-dim hover:text-text transition-colors p-1 -m-1"
            aria-label="Close"
          >
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        {/* Body */}
        <p
          id="modal-body"
          className="text-sm text-dim leading-relaxed mb-6"
        >
          {notification.body}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          {/* Dismiss Button */}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-border/50 text-sm font-medium text-dim hover:bg-surface transition-colors duration-200"
          >
            Later
          </button>

          {/* Action Button */}
          <button
            onClick={handleAction}
            className="flex-1 px-4 py-2 rounded-lg border border-accent/30 text-sm font-semibold text-accent hover:bg-accent/5 transition-all duration-200 hover:border-accent/50"
          >
            {getButtonText()}
          </button>
        </div>

        {/* Security Badge */}
        <div className="mt-4 flex justify-center">
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs font-medium text-green-700 dark:text-green-400">
            <span>🔒</span>
            <span>Security Alert</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default SecurityNotificationModal;
