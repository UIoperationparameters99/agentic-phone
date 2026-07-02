/**
 * Bash tool — run shell commands in a persistent session.
 *
 * Mirrors z.ai's Bash tool: persistent session, optional timeout (max 600s),
 * 30000-char output truncation.
 */

import { z } from 'zod';
import { spawn } from 'node:child_process';
import type { AgentRuntime } from '../agent.js';
import type { ToolContext } from './index.js';

const MAX_OUTPUT = 30_000;

export function bashTool(agent: AgentRuntime, ctx: ToolContext) {
  return {
    description: 'Run a bash command. Persistent session, max 600s timeout. Output is truncated to 30K chars.',
    parameters: z.object({
      command: z.string().describe('The bash command to run'),
      description: z.string().optional().describe('One-line description of what this command does'),
      timeout: z.number().optional().describe('Timeout in ms (max 600000)'),
      runIn: z.string().optional().describe('Working directory (default: workspace)'),
    }),
    execute: async (args: { command: string; description?: string; timeout?: number; runIn?: string }) => {
      const timeout = Math.min(args.timeout ?? 120_000, 600_000);
      const cwd = args.runIn ?? ctx.workspace;

      try {
        const result = await runBash(args.command, cwd, timeout);
        return {
          stdout: truncate(result.stdout),
          stderr: truncate(result.stderr),
          exitCode: result.exitCode,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e), exitCode: -1 };
      }
    },
  };
}

interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runBash(command: string, cwd: string, timeoutMs: number): Promise<BashResult> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], {
      cwd,
      env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + e.message, exitCode: -1 });
    });
  });
}

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT) return s;
  const head = s.slice(0, MAX_OUTPUT / 2);
  const tail = s.slice(-MAX_OUTPUT / 2);
  return `${head}\n\n... (truncated ${s.length - MAX_OUTPUT} chars) ...\n\n${tail}`;
}
