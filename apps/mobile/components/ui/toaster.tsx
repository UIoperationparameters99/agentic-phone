'use client';

import { ToastContextProvider } from './use-toast';

export function Toaster() {
  return <ToastContextProvider>{null}</ToastContextProvider>;
}

export { useToast } from './use-toast';
