'use client';

import * as React from 'react';
import { ToastContextProvider } from '@/components/ui/use-toast';

/**
 * App-wide providers — wraps children in the Toast context so useToast() works on every page.
 * Also loads the Capacitor StatusBar plugin (no-op in web dev).
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastContextProvider>
      {children}
      <StatusBarLoader />
    </ToastContextProvider>
  );
}

/** Loads Capacitor StatusBar plugin (no-op in web dev). */
function StatusBarLoader() {
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      import('@capacitor/status-bar')
        .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Dark }))
        .catch(() => {/* not running in Capacitor (web dev) */});
    }
  }, []);
  return null;
}
