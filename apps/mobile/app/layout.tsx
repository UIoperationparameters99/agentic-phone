import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Agentic',
  description: 'BYOK AI agentic workspace for Android',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-fg min-h-screen safe-top safe-bottom">
        {children}
        <Toaster />
        <StatusBarLoader />
      </body>
    </html>
  );
}

/** Loads Capacitor StatusBar plugin (no-op in web dev). */
function StatusBarLoader() {
  if (typeof window !== 'undefined') {
    import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Dark }))
      .catch(() => {/* not running in Capacitor (web dev) */});
  }
  return null;
}
