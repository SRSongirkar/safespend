'use client';

import { useEffect, useRef } from 'react';

/** Accessible modal dialog: Escape closes, focus moves inside, backdrop click closes. */
export default function Dialog({
  title,
  children,
  onClose,
  footer,
  labelledBy = 'dialog-title',
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <h2 id={labelledBy} style={{ fontSize: 18 }}>
          {title}
        </h2>
        {children}
        {footer ? <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>{footer}</div> : null}
      </div>
    </>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} data-close>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{message}</div>
    </Dialog>
  );
}
