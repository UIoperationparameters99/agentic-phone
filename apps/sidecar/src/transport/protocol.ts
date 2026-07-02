/**
 * Transport layer — WebSocket server + event envelope.
 *
 * The WS server is set up in index.ts. This module handles:
 *   - Command dispatch (incoming ClientMessage → handler)
 *   - Event broadcasting (outgoing AgentEvent → all clients)
 *   - File/dir operations (read, write, list) for the mobile file browser
 */

import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, AgentEvent } from '@agentic/shared-types';
import type { AgentRuntime } from '../agent.js';
import { listInstalledSkills } from '../tools/skill.js';
import { readFileSync, writeFileSync, readdirSync, lstatSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve } from 'node:path';

export interface CommandContext {
  agent: AgentRuntime;
  workspace: string;
  clientId: string;
}

const clients = new Set<WebSocket>();

export function broadcastEvent(event: AgentEvent): void {
  const msg: ServerMessage = { type: 'event', event };
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

export async function handleCommand(
  ws: WebSocket,
  msg: ClientMessage,
  ctx: CommandContext,
): Promise<void> {
  clients.add(ws);

  // Wire the agent's emit() to broadcast.
  ctx.agent.context.emit = (event: any) => broadcastEvent(event);

  switch (msg.type) {
    case 'hello':
      return;

    case 'run':
      await ctx.agent.run(msg.prompt, msg.options);
      return;

    case 'cancel':
      ctx.agent.cancel();
      return;

    case 'tool_approval':
      // TODO: route to the agent's approval flow.
      return;

    case 'list_dir':
      handleListDir(ws, msg.path, ctx.workspace);
      return;

    case 'read_file':
      handleReadFile(ws, msg.path, ctx.workspace);
      return;

    case 'write_file':
      handleWriteFile(ws, msg.path, msg.content, ctx.workspace);
      return;

    case 'list_skills':
      handleListSkills(ws, ctx.workspace);
      return;

    case 'install_skill':
      handleInstallSkill(ws, msg.skillName, ctx.workspace);
      return;

    case 'subscribe_file_events':
      return;

    default: {
      const _exhaustive: never = msg;
      ws.send(JSON.stringify({ type: 'error', message: `Unknown command: ${(msg as any).type}` }));
    }
  }
}

function handleListDir(ws: WebSocket, path: string, workspace: string) {
  try {
    const dir = isAbsolute(path) ? path : resolve(workspace, path);
    const entries = readdirSync(dir).filter((n) => !n.startsWith('.')).map((name) => {
      const fullPath = join(dir, name);
      try {
        const stat = lstatSync(fullPath);
        const realStat = stat.isSymbolicLink() ? statSync(fullPath) : stat;
        return {
          name,
          path: fullPath,
          type: stat.isDirectory() ? 'directory' as const : stat.isSymbolicLink() ? 'symlink' as const : 'file' as const,
          size: realStat.size,
          mtime: realStat.mtimeMs,
        };
      } catch {
        return { name, path: fullPath, type: 'file' as const, size: 0, mtime: 0 };
      }
    });
    entries.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    ws.send(JSON.stringify({ type: 'dir_listed', path: dir, entries }));
  } catch (e) {
    ws.send(JSON.stringify({ type: 'dir_listed', path, entries: [], error: e instanceof Error ? e.message : String(e) }));
  }
}

function handleReadFile(ws: WebSocket, path: string, workspace: string) {
  try {
    const filePath = isAbsolute(path) ? path : resolve(workspace, path);
    const content = readFileSync(filePath, 'utf-8');
    ws.send(JSON.stringify({ type: 'file_read', path: filePath, content }));
  } catch (e) {
    ws.send(JSON.stringify({ type: 'file_read', path, content: '', error: e instanceof Error ? e.message : String(e) }));
  }
}

function handleWriteFile(ws: WebSocket, path: string, content: string, workspace: string) {
  try {
    const filePath = isAbsolute(path) ? path : resolve(workspace, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
    ws.send(JSON.stringify({ type: 'file_written', path: filePath }));
  } catch (e) {
    ws.send(JSON.stringify({ type: 'file_written', path, error: e instanceof Error ? e.message : String(e) }));
  }
}

function handleListSkills(ws: WebSocket, workspace: string) {
  const installed = listInstalledSkills(workspace);
  const available = DEFAULT_SKILL_PACK;
  const skills = [
    ...installed.map((s) => ({ ...s, installed: true })),
    ...available.filter((a) => !installed.some((i) => i.name === a.name)).map((s) => ({ ...s, installed: false })),
  ];
  ws.send(JSON.stringify({ type: 'skills_listed', skills }));
}

function handleInstallSkill(ws: WebSocket, name: string, workspace: string) {
  const skillDef = DEFAULT_SKILL_PACK.find((s) => s.name === name);
  if (!skillDef) {
    ws.send(JSON.stringify({ type: 'skill_installed', skillName: name, error: 'Skill not found in registry' }));
    return;
  }
  const skillDir = join(workspace, 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${skillDef.description}\nargument-hint: ${skillDef.argumentHint ?? ''}\nlicense: MIT\n---\n\n${skillDef.instructions ?? '(no instructions)'}\n`,
    'utf-8',
  );
  ws.send(JSON.stringify({ type: 'skill_installed', skillName: name }));
}

// ─── Default skill pack ─────────────────────────────────────────────────────

interface SkillDef {
  name: string;
  description: string;
  argumentHint?: string;
  instructions?: string;
}

const DEFAULT_SKILL_PACK: SkillDef[] = [
  {
    name: 'web-search',
    description: 'Search the web for current information. Returns URLs + snippets.',
    argumentHint: 'Search query',
    instructions: 'Use the Bash tool with `curl` to call a search API (e.g. DuckDuckGo Lite), or use the LLM\'s built-in web search if available.',
  },
  {
    name: 'web-reader',
    description: 'Fetch a web page and extract its main content (title, text, metadata).',
    argumentHint: 'URL to read',
    instructions: 'Use `curl <url>` in Bash to fetch the page, then parse the HTML to extract the main content.',
  },
  {
    name: 'charts',
    description: 'Create charts and diagrams (bar, line, pie, flowchart, mind map, etc.).',
    argumentHint: 'Describe the chart to create',
    instructions: 'Use Python with matplotlib for data charts, or Mermaid for structural diagrams. Save PNGs to download/.',
  },
  {
    name: 'pdf',
    description: 'Generate PDF documents (reports, posters, academic papers).',
    argumentHint: 'Describe the PDF to generate',
    instructions: 'Use Python with reportlab (reports) or tectonic/LaTeX (academic). Save to download/.',
  },
  {
    name: 'docx',
    description: 'Generate Word documents (.docx).',
    argumentHint: 'Describe the document to generate',
    instructions: 'Use Python with python-docx. Save to download/.',
  },
  {
    name: 'xlsx',
    description: 'Generate Excel spreadsheets (.xlsx).',
    argumentHint: 'Describe the spreadsheet to generate',
    instructions: 'Use Python with openpyxl. Save to download/.',
  },
  {
    name: 'pptx',
    description: 'Generate PowerPoint presentations (.pptx).',
    argumentHint: 'Describe the presentation to generate',
    instructions: 'Use Python with python-pptx or pptxgenjs (Node). Save to download/.',
  },
  {
    name: 'image-generation',
    description: 'Generate images from text descriptions.',
    argumentHint: 'Describe the image to create',
    instructions: 'Use the LLM provider\'s image API (OpenAI DALL-E, etc.) via Bash+curl. Save to download/.',
  },
  {
    name: 'coding-agent',
    description: 'Build a software project (web app, CLI tool, library) end-to-end.',
    argumentHint: 'Describe the project to build',
    instructions: 'Plan with TodoWrite, scaffold with Bash, implement with Write/Edit, test with Bash. Save deliverables to download/.',
  },
  {
    name: 'fullstack-dev',
    description: 'Build a fullstack Next.js web app (TypeScript + Tailwind + Prisma).',
    argumentHint: 'Describe the fullstack feature',
    instructions: 'Use `npx create-next-app` to scaffold, then implement features. Test with `npm run dev`.',
  },
];
