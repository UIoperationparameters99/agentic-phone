/**
 * Read tool — read a file (text only).
 */

import { z } from 'zod';
import { readFileSync, statSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import type { ToolContext } from './index.js';

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

export function readTool(ctx: ToolContext) {
  return {
    description: `Read a text file. Defaults to first ${MAX_LINES} lines. Lines >${MAX_LINE_LENGTH} chars are truncated.`,
    parameters: z.object({
      filepath: z.string().describe('Absolute or workspace-relative path'),
      offset: z.number().optional().describe('Line to start reading from (1-indexed)'),
      limit: z.number().optional().describe(`Max lines to read (default ${MAX_LINES})`),
    }),
    execute: async (args: { filepath: string; offset?: number; limit?: number }) => {
      const path = resolvePath(args.filepath, ctx.workspace);
      try {
        const stat = statSync(path);
        if (!stat.isFile()) return { error: 'Not a file' };
        const content = readFileSync(path, 'utf-8');
        const lines = content.split('\n');
        const offset = args.offset ?? 1;
        const limit = args.limit ?? MAX_LINES;
        const sliced = lines.slice(offset - 1, offset - 1 + limit);
        const truncated = sliced.map((l) => (l.length > MAX_LINE_LENGTH ? l.slice(0, MAX_LINE_LENGTH) + '…' : l));
        return {
          path,
          content: truncated.join('\n'),
          totalLines: lines.length,
          shownLines: truncated.length,
          startLine: offset,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

export function resolvePath(p: string, workspace: string): string {
  if (isAbsolute(p)) return p;
  return resolve(workspace, p);
}
