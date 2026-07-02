import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/components/app-providers';

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
      <body className="bg-bg text-fg min-h-dvh">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
