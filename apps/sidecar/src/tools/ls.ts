/**
 * LS tool — list directory contents.
 */

import { z } from 'zod';
import { readdirSync, statSync, lstatSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import type { ToolContext } from './index.js';

const TEXT_EXTS = [
  '.txt', '.md', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt',
  '.sh', '.bash', '.zsh',
  '.html', '.css', '.scss',
  '.sql', '.graphql',
  '.env', '.gitignore',
  '.csv', '.tsv',
  '.xml', '.svg',
];

export function lsTool(ctx: ToolContext) {
  return {
    description: 'List directory contents. Returns entries with name, type, size, mtime.',
    parameters: z.object({
      path: z.string().describe('Directory path'),
      ignore: z.array(z.string()).optional(),
    }),
    execute: async (args: { path: string; ignore?: string[] }) => {
      const dir = isAbsolute(args.path) ? args.path : resolve(ctx.workspace, args.path);
      try {
        const entries = readdirSync(dir).filter((name) => !name.startsWith('.'));
        const ignore = args.ignore ?? ['node_modules', '.git', '__pycache__', '.venv'];
        const filtered = entries.filter((n) => !ignore.includes(n));
        const result = filtered.map((name) => {
          const fullPath = join(dir, name);
          try {
            const stat = lstatSync(fullPath);
            const isSymlink = stat.isSymbolicLink();
            const isDir = stat.isDirectory();
            const realStat = isSymlink ? statSync(fullPath) : stat;
            return {
              name,
              path: fullPath,
              type: isDir ? 'directory' : isSymlink ? 'symlink' : 'file',
              size: realStat.size,
              mtime: realStat.mtimeMs,
              isText: !isDir && TEXT_EXTS.some((e) => name.toLowerCase().endsWith(e)),
            };
          } catch {
            return { name, path: fullPath, type: 'file' as const, size: 0, mtime: 0 };
          }
        });
        result.sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });
        return { entries: result, count: result.length };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
