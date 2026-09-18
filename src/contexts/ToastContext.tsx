'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastOptions {
  /** Override the default TOAST_DURATION (4000 ms) for this toast only. */
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string, options?: ToastOptions) => void;
    error: (message: string, options?: ToastOptions) => void;
    warning: (message: string, options?: ToastOptions) => void;
    info: (message: string, options?: ToastOptions) => void;
  };
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let nextId = 0;

const TOAST_DURATION = 4000;

const typeStyles: Record<ToastType, { bg: string; icon: string }> = {
  success: { bg: '#16a34a', icon: '✓' },
  error: { bg: '#dc2626', icon: '✕' },
  warning: { bg: '#d97706', icon: '⚠' },
  info: { bg: '#2563eb', icon: 'ℹ' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType, options?: ToastOptions) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    const duration = options?.duration ?? TOAST_DURATION;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const toast = {
    success: useCallback(
      (msg: string, options?: ToastOptions) => addToast(msg, 'success', options),
      [addToast]
    ),
    error: useCallback(
      (msg: string, options?: ToastOptions) => addToast(msg, 'error', options),
      [addToast]
    ),
    warning: useCallback(
      (msg: string, options?: ToastOptions) => addToast(msg, 'warning', options),
      [addToast]
    ),
    info: useCallback(
      (msg: string, options?: ToastOptions) => addToast(msg, 'info', options),
      [addToast]
    ),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => {
          const style = typeStyles[t.type];
          return (
            <div
              key={t.id}
              style={{
                background: style.bg,
                color: '#fff',
                padding: '12px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxWidth: 400,
                pointerEvents: 'auto',
                animation: 'toast-slide-in 0.2s ease-out',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{style.icon}</span>
              {t.message}
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context.toast;
}
