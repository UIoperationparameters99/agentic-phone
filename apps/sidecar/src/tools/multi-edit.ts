/**
 * MultiEdit tool — multiple find-and-replaces in one file (atomic).
 */

import { z } from 'zod';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolvePath } from './read.js';
import type { ToolContext } from './index.js';

export function multiEditTool(ctx: ToolContext) {
  return {
    description: 'Apply multiple find-and-replace edits to a single file atomically. Edits apply in sequence.',
    parameters: z.object({
      filepath: z.string(),
      edits: z.array(z.object({
        old_str: z.string(),
        new_str: z.string(),
      })),
    }),
    execute: async (args: { filepath: string; edits: Array<{ old_str: string; new_str: string }> }) => {
      const path = resolvePath(args.filepath, ctx.workspace);
      try {
        let content = readFileSync(path, 'utf-8');
        for (let i = 0; i < args.edits.length; i++) {
          const { old_str, new_str } = args.edits[i];
          if (!content.includes(old_str)) {
            return { error: `Edit ${i + 1}: old_str not found (no changes applied — atomic)` };
          }
          content = content.replace(old_str, new_str);
        }
        writeFileSync(path, content, 'utf-8');
        return { path, editsApplied: args.edits.length };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
