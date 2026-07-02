/**
 * WebFetch tool — fetch a URL and extract main content.
 *
 * Uses curl + simple HTML parsing. For v1, returns raw text (stripped of tags).
 */

import { z } from 'zod';
import { execSync } from 'node:child_process';
import type { ToolContext } from './index.js';

const MAX_BYTES = 500_000; // 500KB max per fetch

export function webFetchTool(ctx: ToolContext) {
  return {
    description: 'Fetch a web page and extract its main text content. Returns up to 500KB of cleaned text.',
    parameters: z.object({
      url: z.string().url().describe('The URL to fetch'),
      format: z.enum(['text', 'html', 'markdown']).optional().describe('Output format (default: text)'),
      maxLength: z.number().optional().describe('Max chars to return (default: 50000)'),
    }),
    execute: async (args: { url: string; format?: 'text' | 'html' | 'markdown'; maxLength?: number }) => {
      const maxLength = args.maxLength ?? 50_000;
      try {
        // Use curl with a sane user agent, follow redirects, fail on 4xx/5xx.
        const raw = execSync(`curl -sSL --max-time 30 -A "Mozilla/5.0 (compatible; AgenticBot/1.0)" "${args.url}"`, {
          encoding: 'utf-8',
          maxBuffer: MAX_BYTES,
          timeout: 35_000,
        });

        if (args.format === 'html') {
          return { url: args.url, content: raw.slice(0, maxLength), bytes: raw.length };
        }

        // Strip HTML to text
        const text = stripHtml(raw);
        return {
          url: args.url,
          content: text.slice(0, maxLength),
          bytes: text.length,
          truncated: text.length > maxLength,
        };
      } catch (e: any) {
        return {
          url: args.url,
          error: e.message ?? String(e),
          exitCode: e.status,
        };
      }
    },
  };
}

function stripHtml(html: string): string {
  return html
    // Remove scripts and styles entirely
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Convert common block elements to newlines
    .replace(/<\/(p|div|section|article|header|footer|nav|aside|h[1-6]|li|tr|table|br)>/gi, '\n')
    .replace(/<(p|div|section|article|header|footer|nav|aside|h[1-6]|li|tr|table|br)[^>]*>/gi, '\n')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    // Collapse whitespace
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
