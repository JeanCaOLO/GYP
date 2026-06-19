import type { ToastMessage } from '@/types';
import { createContext, useContext, useCallback, useState } from 'react';

interface ToastContextType {
  toasts: ToastMessage[];
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg transition-all animate-in slide-in-from-bottom-4 fade-in ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : toast.type === 'error'
                ? 'bg-red-50 text-red-900 border border-red-200'
                : toast.type === 'warning'
                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                : 'bg-slate-50 text-slate-900 border border-slate-200'
            }`}
          >
            <i className={`ri-${
              toast.type === 'success' ? 'check-line' :
              toast.type === 'error' ? 'error-warning-line' :
              toast.type === 'warning' ? 'alert-line' : 'information-line'
            } text-lg`}></i>
            <span className="text-sm font-medium">{toast.message}</span>
            <button onClick={() => removeToast(toast.id)} className="ml-2">
              <i className="ri-close-line text-lg opacity-60 hover:opacity-100"></i>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}