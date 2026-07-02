/**
 * WebSearch tool — search the web for current information.
 *
 * Strategy (in order):
 *   1. If the LLM provider has a native web search tool (OpenAI, Anthropic, Google), use it.
 *   2. Fallback: scrape DuckDuckGo Lite HTML and parse results.
 *
 * For v1, we use the DuckDuckGo fallback — it's free, no API key, works from any sandbox.
 */

import { z } from 'zod';
import { execSync } from 'node:child_process';
import type { ToolContext } from './index.js';

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function webSearchTool(ctx: ToolContext) {
  return {
    description: 'Search the web. Returns up to 10 results with title, URL, and snippet. Uses DuckDuckGo (no API key required).',
    parameters: z.object({
      query: z.string().describe('The search query'),
      num: z.number().optional().describe('Max results (default: 8, max: 10)'),
    }),
    execute: async (args: { query: string; num?: number }) => {
      const num = Math.min(args.num ?? 8, 10);
      try {
        const results = await duckDuckGoSearch(args.query, num);
        return {
          query: args.query,
          results,
          count: results.length,
        };
      } catch (e: any) {
        return {
          query: args.query,
          error: e.message ?? String(e),
          results: [],
          count: 0,
        };
      }
    },
  };
}

async function duckDuckGoSearch(query: string, num: number): Promise<SearchResult[]> {
  // DuckDuckGo Lite HTML endpoint — simple to parse, no JS required.
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const html = execSync(`curl -sSL --max-time 15 -A "Mozilla/5.0 (compatible; AgenticBot/1.0)" "${url}"`, {
    encoding: 'utf-8',
    maxBuffer: 500_000,
    timeout: 20_000,
  });

  // Parse the results table. DDG Lite uses <a class="result-link" href="...">Title</a>
  // and snippets in <td class="result-snippet">...</td>
  const results: SearchResult[] = [];
  const linkRegex = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(html)) !== null) {
    links.push({
      url: decodeHref(m[1]),
      title: stripTags(m[2]).trim(),
    });
  }

  const snippets: string[] = [];
  while ((m = snippetRegex.exec(html)) !== null) {
    snippets.push(stripTags(m[1]).trim());
  }

  for (let i = 0; i < Math.min(links.length, num); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? '',
    });
  }

  return results;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function decodeHref(href: string): string {
  // DDG Lite sometimes wraps URLs in a redirect like //duckduckgo.com/l/?uddg=ENCODED
  const match = href.match(/uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return href;
    }
  }
  return href;
}
