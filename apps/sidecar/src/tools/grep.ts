/**
 * Grep tool — ripgrep-powered search.
 */

import { z } from 'zod';
import { execSync } from 'node:child_process';
import { resolvePath } from './read.js';
import type { ToolContext } from './index.js';

export function grepTool(ctx: ToolContext) {
  return {
    description: 'Search file contents using ripgrep. Supports regex, glob filters, multiline.',
    parameters: z.object({
      pattern: z.string().describe('Regex pattern (ripgrep syntax)'),
      path: z.string().optional().describe('Directory or file to search (default: workspace)'),
      glob: z.string().optional().describe('File glob filter (e.g. "*.ts")'),
      type: z.string().optional().describe('File type filter (e.g. "py", "ts")'),
      output_mode: z.enum(['files_with_matches', 'content', 'count']).optional(),
      '-A': z.number().optional().describe('Lines after match'),
      '-B': z.number().optional().describe('Lines before match'),
      '-C': z.number().optional().describe('Lines around match'),
      '-n': z.boolean().optional().describe('Show line numbers (default: true for content mode)'),
      '-i': z.boolean().optional().describe('Case insensitive'),
      multiline: z.boolean().optional(),
      head_limit: z.number().optional(),
    }),
    execute: async (args: {
      pattern: string;
      path?: string;
      glob?: string;
      type?: string;
      output_mode?: 'files_with_matches' | 'content' | 'count';
      '-A'?: number; '-B'?: number; '-C'?: number;
      '-n'?: boolean; '-i'?: boolean; multiline?: boolean;
      head_limit?: number;
    }) => {
      const searchPath = resolvePath(args.path ?? ctx.workspace, ctx.workspace);
      const mode = args.output_mode ?? 'files_with_matches';

      const cmd = ['rg'];
      if (mode === 'files_with_matches') cmd.push('--files-with-matches');
      else if (mode === 'count') cmd.push('--count-matches');
      else cmd.push('--line-number');
      if (args['-i']) cmd.push('-i');
      if (args.multiline) cmd.push('-U', '--multiline-dotall');
      if (args['-A']) cmd.push('-A', String(args['-A']));
      if (args['-B']) cmd.push('-B', String(args['-B']));
      if (args['-C']) cmd.push('-C', String(args['-C']));
      if (args.glob) cmd.push('-g', args.glob);
      if (args.type) cmd.push('-t', args.type);
      cmd.push('--', args.pattern, searchPath);

      try {
        const out = execSync(cmd.join(' '), {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
        });
        let lines = out.split('\n').filter(Boolean);
        if (args.head_limit) lines = lines.slice(0, args.head_limit);
        if (mode === 'files_with_matches') {
          return { files: lines, count: lines.length };
        }
        if (mode === 'count') {
          return { counts: lines, total: lines.length };
        }
        return { matches: lines, count: lines.length };
      } catch (e: any) {
        // ripgrep exit 1 = no matches (not an error)
        if (e.status === 1 && (e.stdout === '' || e.stdout === undefined)) {
          return { files: [], count: 0 };
        }
        return { error: e.message ?? String(e) };
      }
    },
  };
}
