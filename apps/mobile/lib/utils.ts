import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind class merge helper (shadcn/ui standard). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a timestamp as a relative "x minutes ago" string. */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

/** Format bytes as a human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format token count with thousand separators. */
export function formatTokens(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format USD cost — show 4 decimal places for small amounts. */
export function formatCost(usd?: number): string {
  if (usd === undefined) return '';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/** Truncate a string to N chars, with ellipsis. */
export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

/** Pretty-print JSON, with a fallback for non-JSON. */
export function prettyJson(v: unknown): string {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

/** Detect if a file path is likely text (for tap-to-preview). */
export function isTextFile(path: string): boolean {
  const exts = [
    '.txt', '.md', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
    '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt',
    '.sh', '.bash', '.zsh', '.fish',
    '.html', '.css', '.scss', '.less',
    '.sql', '.graphql', '.gql',
    '.env', '.gitignore', '.dockerignore',
    '.csv', '.tsv',
    '.xml', '.svg',
  ];
  return exts.some((e) => path.toLowerCase().endsWith(e));
}

/** Generate a UUID v4 (no external dep). */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (older browsers / WebView)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
