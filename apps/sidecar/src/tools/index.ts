/**
 * Tool registry — implements the z.ai-style tool surface.
 *
 * Each tool is a Vercel AI SDK `Tool` (zod schema + execute fn).
 * Tools emit events via the agent's context.emit().
 */

import type { AgentRuntime } from '../agent.js';
import { bashTool } from './bash.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { editTool } from './edit.js';
import { multiEditTool } from './multi-edit.js';
import { grepTool } from './grep.js';
import { globTool } from './glob.js';
import { lsTool } from './ls.js';
import { todoWriteTool, todoReadTool } from './todo.js';
import { skillTool } from './skill.js';

export interface ToolContext {
  workspace: string;
}

export function registerTools(agent: AgentRuntime, ctx: ToolContext) {
  agent.registerTool('Bash', bashTool(agent, ctx));
  agent.registerTool('Read', readTool(ctx));
  agent.registerTool('Write', writeTool(ctx));
  agent.registerTool('Edit', editTool(ctx));
  agent.registerTool('MultiEdit', multiEditTool(ctx));
  agent.registerTool('Grep', grepTool(ctx));
  agent.registerTool('Glob', globTool(ctx));
  agent.registerTool('LS', lsTool(ctx));
  agent.registerTool('TodoWrite', todoWriteTool(agent));
  agent.registerTool('TodoRead', todoReadTool());
  agent.registerTool('Skill', skillTool(ctx));
}
