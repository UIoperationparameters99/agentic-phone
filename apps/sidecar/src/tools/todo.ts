/**
 * Todo tools — TodoWrite (update plan) + TodoRead (read current plan).
 *
 * Persists to {workspace}/.todo.json (in-workspace, so it's in snapshots).
 */

import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentRuntime } from '../agent.js';

const TODO_FILE = '.todo.json';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

function loadTodos(workspace: string): TodoItem[] {
  const path = join(workspace, TODO_FILE);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return [];
  }
}

function saveTodos(workspace: string, todos: TodoItem[]): void {
  writeFileSync(join(workspace, TODO_FILE), JSON.stringify(todos, null, 2), 'utf-8');
}

export function todoWriteTool(agent: AgentRuntime) {
  const workspace = agent.context.workspace;
  return {
    description: 'Update the todo/plan list. Only one item can be in_progress at a time.',
    parameters: z.object({
      todos: z.array(z.object({
        id: z.string(),
        content: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed']),
        priority: z.enum(['high', 'medium', 'low']),
      })),
    }),
    execute: async (args: { todos: TodoItem[] }) => {
      const inProgress = args.todos.filter((t) => t.status === 'in_progress');
      if (inProgress.length > 1) {
        return { error: 'Only one todo can be in_progress at a time' };
      }
      saveTodos(workspace, args.todos);
      agent.context.emit({
        type: 'todo_updated',
        todos: args.todos,
      });
      return { count: args.todos.length };
    },
  };
}

export function todoReadTool() {
  return {
    description: 'Read the current todo/plan list.',
    parameters: z.object({}),
    execute: async () => {
      const workspace = process.env.AGENTIC_WORKSPACE ?? '/home/daytona/workspace';
      return { todos: loadTodos(workspace) };
    },
  };
}
