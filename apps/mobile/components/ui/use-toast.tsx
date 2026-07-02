'use client';

// Minimal toast hook — we don't need the full shadcn toast state machine for v1.

import * as React from 'react';
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from './toast';

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
}

const ToastContext = React.createContext<{
  toast: (t: Omit<ToastItem, 'id'>) => void;
}>({ toast: () => {} });

export function ToastContextProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setItems((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastProvider duration={5000}>
        {children}
        {items.map((item) => (
          <Toast key={item.id} variant={item.variant}>
            <div className="grid gap-1">
              {item.title && <ToastTitle>{item.title}</ToastTitle>}
              {item.description && <ToastDescription>{item.description}</ToastDescription>}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return React.useContext(ToastContext);
}
