"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ToastOptions {
  error?: boolean;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, options?: ToastOptions) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface AppToastProps {
  message: string;
  error?: boolean;
  duration?: number;
  onDismiss: () => void;
}

function AppToast({ message, error, duration = 4000, onDismiss }: AppToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div
      className={`app-toast ${error ? "app-toast--error" : "app-toast--success"}`}
      role="status"
    >
      <span className="app-toast__message">{message}</span>
      <button
        type="button"
        className="app-toast__dismiss"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error?: boolean;
    duration?: number;
  } | null>(null);

  const dismiss = useCallback(() => setToast(null), []);

  const showToast = useCallback((message: string, options?: ToastOptions) => {
    setToast({
      message,
      error: options?.error,
      duration: options?.duration ?? 4000,
    });
  }, []);

  const showSuccess = useCallback(
    (message: string) => showToast(message, { error: false }),
    [showToast],
  );

  const showError = useCallback(
    (message: string) => showToast(message, { error: true, duration: 6000 }),
    [showToast],
  );

  const value = useMemo(
    () => ({ showToast, showSuccess, showError }),
    [showToast, showSuccess, showError],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="app-toast-host">
          <AppToast
            message={toast.message}
            duration={toast.duration}
            error={toast.error}
            onDismiss={dismiss}
          />
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}
