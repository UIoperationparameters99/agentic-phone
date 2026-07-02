/**
 * Write tool — create or overwrite a file.
 */

import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolvePath } from './read.js';
import type { ToolContext } from './index.js';

export function writeTool(ctx: ToolContext) {
  return {
    description: 'Write content to a file (creates or overwrites).',
    parameters: z.object({
      filepath: z.string().describe('Absolute or workspace-relative path'),
      content: z.string().describe('The content to write'),
    }),
    execute: async (args: { filepath: string; content: string }) => {
      const path = resolvePath(args.filepath, ctx.workspace);
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, args.content, 'utf-8');
        return { path, bytes: args.content.length };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
