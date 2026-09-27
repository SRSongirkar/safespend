'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

export interface ToastOptions {
  message: string;
  kind?: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (t: ToastOptions) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { ...t, id }]);
      window.setTimeout(() => dismiss(id), t.durationMs ?? (t.action ? 8000 : 4500));
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast-error' : ''}`}>
            <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'info' ? 'info' : 'check'} size={18} />
            <span className="toast-msg">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} style={{ textDecoration: 'none' }}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
