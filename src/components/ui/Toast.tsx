import { createPortal } from "react-dom";
import { useState, useEffect, useCallback } from "react";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let globalAddToast: ((msg: string, type: ToastType) => void) | null = null;

export function showToast(message: string, type: ToastType = "info") {
  if (globalAddToast) globalAddToast(message, type);
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    globalAddToast = addToast;
    return () => { globalAddToast = null; };
  }, [addToast]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>,
    document.getElementById("toast-root") ?? document.body
  );
}
