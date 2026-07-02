/**
 * Glob tool — file pattern matching.
 */

import { z } from 'zod';
import { glob } from 'node:fs/promises';
import { resolvePath } from './read.js';
import type { ToolContext } from './index.js';

export function globTool(ctx: ToolContext) {
  return {
    description: 'Find files matching a glob pattern (e.g. "**/*.ts").',
    parameters: z.object({
      pattern: z.string(),
      path: z.string().optional().describe('Base directory (default: workspace)'),
    }),
    execute: async (args: { pattern: string; path?: string }) => {
      const basePath = resolvePath(args.path ?? ctx.workspace, ctx.workspace);
      try {
        const matches: string[] = [];
        for await (const entry of glob(args.pattern, { cwd: basePath })) {
          matches.push(entry);
          if (matches.length >= 1000) break;
        }
        matches.sort();
        return { matches, count: matches.length };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
