/**
 * Edit tool — find-and-replace in a file (must be unique).
 */

import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolvePath } from './read.js';
import type { ToolContext } from './index.js';

export function editTool(ctx: ToolContext) {
  return {
    description: 'Find-and-replace in a file. old_str must be unique unless replace_all is true.',
    parameters: z.object({
      filepath: z.string(),
      old_str: z.string(),
      new_str: z.string(),
      replace_all: z.boolean().optional().describe('Replace all occurrences (default: false)'),
    }),
    execute: async (args: { filepath: string; old_str: string; new_str: string; replace_all?: boolean }) => {
      const path = resolvePath(args.filepath, ctx.workspace);
      try {
        const content = readFileSync(path, 'utf-8');
        const count = countOccurrences(content, args.old_str);
        if (count === 0) return { error: 'old_str not found in file' };
        if (count > 1 && !args.replace_all) {
          return { error: `old_str found ${count} times — set replace_all=true or use MultiEdit` };
        }
        const newContent = args.replace_all
          ? content.split(args.old_str).join(args.new_str)
          : content.replace(args.old_str, args.new_str);
        writeFileSync(path, newContent, 'utf-8');
        return { path, replaced: args.replace_all ? count : 1 };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}
