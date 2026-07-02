import type { NextConfig } from 'next';

/**
 * Static export — Capacitor wraps this in a native Android container.
 * No server features (API routes, RSC data-fetching) work in the APK.
 * The agent runs in the cloud sandbox, not in a Next.js server.
 */
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  // Capacitor serves from a local file:// origin in dev, and from
  // https://localhost in the APK. Allow images from any origin.
  images: {
    unoptimized: true,
  },
  // Avoid SSR — we want pure client-side rendering in the APK.
  // (output: 'export' already implies this, but be explicit.)
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // Transpile the local workspace package (TypeScript source) — Next.js doesn't
  // transpile node_modules by default, but local workspace packages need it.
  transpilePackages: ['@agentic/shared-types'],
};

export default nextConfig;
