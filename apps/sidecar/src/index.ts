/**
 * Sidecar — simplified tool executor.
 *
 * The mobile app owns the agent loop and calls the LLM directly.
 * The sidecar just:
 *   1. Receives tool execution requests via WS
 *   2. Executes them (bash, file ops, etc.)
 *   3. Returns the results
 *
 * Much simpler than the old relay architecture.
 */

import { WebSocketServer } from 'ws';
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, lstatSync, statSync } from 'node:fs';
import { resolve, join, isAbsolute, dirname } from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';
const WORKSPACE = process.env.AGENTIC_WORKSPACE ?? '/home/daytona/workspace';

console.log(`[sidecar] starting on ${HOST}:${PORT}, workspace=${WORKSPACE}`);

mkdirSync(WORKSPACE, { recursive: true });
mkdirSync(`${WORKSPACE}/download`, { recursive: true });
mkdirSync(`${WORKSPACE}/upload`, { recursive: true });
mkdirSync(`${WORKSPACE}/skills`, { recursive: true });

// Tool executors
const tools: Record<string, (args: any) => Promise<unknown>> = {
  Bash: async (args) => {
    const timeout = Math.min(args.timeout ?? 120_000, 600_000);
    const cwd = args.runIn ?? WORKSPACE;
    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', args.command], {
        cwd, env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000); }, timeout);
      child.stdout.on('data', (d) => stdout += d.toString());
      child.stderr.on('data', (d) => stderr += d.toString());
      child.on('close', (code) => { clearTimeout(timer); resolve({ stdout: stdout.slice(0, 30000), stderr: stderr.slice(0, 30000), exitCode: code ?? -1 }); });
      child.on('error', (e) => { clearTimeout(timer); resolve({ error: e.message, exitCode: -1 }); });
    });
  },

  Read: async (args) => {
    const path = isAbsolute(args.filepath) ? args.filepath : resolve(WORKSPACE, args.filepath);
    try {
      const content = readFileSync(path, 'utf-8');
      const lines = content.split('\n');
      const offset = args.offset ?? 1;
      const limit = args.limit ?? 2000;
      return { path, content: lines.slice(offset - 1, offset - 1 + limit).join('\n'), totalLines: lines.length };
    } catch (e: any) { return { error: e.message }; }
  },

  Write: async (args) => {
    const path = isAbsolute(args.filepath) ? args.filepath : resolve(WORKSPACE, args.filepath);
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, args.content, 'utf-8');
      return { path, bytes: args.content.length };
    } catch (e: any) { return { error: e.message }; }
  },

  Edit: async (args) => {
    const path = isAbsolute(args.filepath) ? args.filepath : resolve(WORKSPACE, args.filepath);
    try {
      const content = readFileSync(path, 'utf-8');
      const count = content.split(args.old_str).length - 1;
      if (count === 0) return { error: 'old_str not found' };
      if (count > 1 && !args.replace_all) return { error: `old_str found ${count} times` };
      const newContent = args.replace_all ? content.split(args.old_str).join(args.new_str) : content.replace(args.old_str, args.new_str);
      writeFileSync(path, newContent, 'utf-8');
      return { path, replaced: args.replace_all ? count : 1 };
    } catch (e: any) { return { error: e.message }; }
  },

  Grep: async (args) => {
    const searchPath = isAbsolute(args.path ?? WORKSPACE) ? args.path : resolve(WORKSPACE, args.path ?? WORKSPACE);
    try {
      const cmd = ['rg', '--files-with-matches'];
      if (args['-i']) cmd.push('-i');
      if (args.glob) cmd.push('-g', args.glob);
      cmd.push('--', args.pattern, searchPath);
      const out = execSync(cmd.join(' '), { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 30_000 });
      return { files: out.split('\n').filter(Boolean), count: out.split('\n').filter(Boolean).length };
    } catch (e: any) {
      if (e.status === 1) return { files: [], count: 0 };
      return { error: e.message };
    }
  },

  Glob: async (args) => {
    const basePath = isAbsolute(args.path ?? WORKSPACE) ? args.path : resolve(WORKSPACE, args.path ?? WORKSPACE);
    try {
      const { glob } = await import('node:fs/promises');
      const matches: string[] = [];
      for await (const entry of glob(args.pattern, { cwd: basePath })) { matches.push(entry); if (matches.length >= 1000) break; }
      return { matches: matches.sort(), count: matches.length };
    } catch (e: any) { return { error: e.message }; }
  },

  LS: async (args) => {
    const dir = isAbsolute(args.path) ? args.path : resolve(WORKSPACE, args.path);
    try {
      const entries = readdirSync(dir).filter(n => !n.startsWith('.')).map(name => {
        const fullPath = join(dir, name);
        try {
          const stat = lstatSync(fullPath);
          return { name, path: fullPath, type: stat.isDirectory() ? 'directory' : 'file', size: stat.size, mtime: stat.mtimeMs };
        } catch { return { name, path: fullPath, type: 'file', size: 0, mtime: 0 }; }
      });
      entries.sort((a, b) => a.type === 'directory' && b.type !== 'directory' ? -1 : a.type !== 'directory' && b.type === 'directory' ? 1 : a.name.localeCompare(b.name));
      return { entries, count: entries.length };
    } catch (e: any) { return { error: e.message }; }
  },

  TodoWrite: async (args) => {
    writeFileSync(join(WORKSPACE, '.todo.json'), JSON.stringify(args.todos, null, 2), 'utf-8');
    return { count: args.todos.length };
  },

  WebSearch: async (args) => {
    try {
      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(args.query)}`;
      const html = execSync(`curl -sSL --max-time 15 -A "Mozilla/5.0 (compatible; AgenticBot/1.0)" "${url}"`, { encoding: 'utf-8', maxBuffer: 500_000, timeout: 20_000 });
      const results: any[] = [];
      const linkRegex = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = linkRegex.exec(html)) !== null) {
        results.push({ title: m[2].replace(/<[^>]+>/g, '').trim(), url: m[1], snippet: '' });
        if (results.length >= (args.num ?? 8)) break;
      }
      return { query: args.query, results, count: results.length };
    } catch (e: any) { return { query: args.query, error: e.message, results: [], count: 0 }; }
  },

  WebFetch: async (args) => {
    try {
      const raw = execSync(`curl -sSL --max-time 30 -A "Mozilla/5.0 (compatible; AgenticBot/1.0)" "${args.url}"`, { encoding: 'utf-8', maxBuffer: 500_000, timeout: 35_000 });
      const text = raw.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      return { url: args.url, content: text.slice(0, 50000) };
    } catch (e: any) { return { url: args.url, error: e.message }; }
  },
};

// HTTP + WS server
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[sidecar] client connected');

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'hello') {
        ws.send(JSON.stringify({ type: 'hello', serverId: 'sidecar-1', protocolVersion: 1, sandboxId: process.env.DAYTONA_SANDBOX_ID ?? 'unknown' }));
        return;
      }

      if (msg.type === 'execute_tool') {
        const { requestId, toolName, args } = msg;
        const tool = tools[toolName];
        if (!tool) {
          ws.send(JSON.stringify({ type: 'tool_result', requestId, error: `Unknown tool: ${toolName}` }));
          return;
        }
        try {
          const result = await tool(args);
          ws.send(JSON.stringify({ type: 'tool_result', requestId, result }));
        } catch (e: any) {
          ws.send(JSON.stringify({ type: 'tool_result', requestId, error: e.message }));
        }
        return;
      }

      if (msg.type === 'list_dir') {
        try {
          const dir = isAbsolute(msg.path) ? msg.path : resolve(WORKSPACE, msg.path);
          const entries = readdirSync(dir).filter(n => !n.startsWith('.')).map(name => {
            const fullPath = join(dir, name);
            try {
              const stat = lstatSync(fullPath);
              return { name, path: fullPath, type: stat.isDirectory() ? 'directory' : 'file', size: stat.size, mtime: stat.mtimeMs };
            } catch { return { name, path: fullPath, type: 'file', size: 0, mtime: 0 }; }
          });
          entries.sort((a, b) => a.type === 'directory' && b.type !== 'directory' ? -1 : 1);
          ws.send(JSON.stringify({ type: 'dir_listed', path: dir, entries }));
        } catch (e: any) {
          ws.send(JSON.stringify({ type: 'dir_listed', path: msg.path, entries: [], error: e.message }));
        }
        return;
      }

      if (msg.type === 'read_file') {
        try {
          const filePath = isAbsolute(msg.path) ? msg.path : resolve(WORKSPACE, msg.path);
          const content = readFileSync(filePath, 'utf-8');
          ws.send(JSON.stringify({ type: 'file_read', path: filePath, content }));
        } catch (e: any) {
          ws.send(JSON.stringify({ type: 'file_read', path: msg.path, content: '', error: e.message }));
        }
        return;
      }

      if (msg.type === 'list_skills') {
        ws.send(JSON.stringify({ type: 'skills_listed', skills: [] }));
        return;
      }
    } catch (e) {
      console.error('[sidecar] message error:', e);
    }
  });

  ws.on('close', () => console.log('[sidecar] client disconnected'));
});

server.listen(PORT, HOST, () => {
  console.log(`[sidecar] listening on http://${HOST}:${PORT}`);
  console.log(`[sidecar] WS: ws://${HOST}:${PORT}/ws`);
  console.log(`[sidecar] health: http://${HOST}:${PORT}/health`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
