/**
 * Task tool — launch a typed subagent for complex, multi-step work.
 *
 * Mirrors z.ai's subagent delegation pattern. The subagent runs in its own
 * context with a focused prompt, and returns a single result back to the
 * parent agent. Subagents cannot call tools that the parent can't.
 *
 * Types:
 *   - Explore         — fast, read-only codebase exploration
 *   - Plan            — design implementation plans
 *   - general-purpose — research + multi-step tasks
 *
 * Implementation note: for v1, subagents are NOT separate processes —
 * they're a recursive call to the same agent loop with a fresh message
 * history and a focused system prompt. This is simpler and avoids the
 * complexity of IPC. True process isolation can come in a later phase.
 */

import { z } from 'zod';
import type { AgentRuntime } from '../agent.js';
import type { ToolContext } from './index.js';

const SUBAGENT_SYSTEM_PROMPTS: Record<string, string> = {
  Explore: `You are an exploration subagent. Your job is to quickly explore a codebase or workspace and report findings.

Rules:
- Use Read, Grep, Glob, LS to investigate.
- Do NOT modify any files (no Write, Edit, Bash commands that mutate state).
- Be fast and targeted — find the relevant files, read the key parts, summarize.
- Return a structured report: file paths, key functions, gotchas, suggestions.
- Keep your final answer under 500 words.`,

  Plan: `You are a planning subagent. Your job is to design an implementation plan.

Rules:
- Use Read, Grep, Glob, LS to understand the codebase.
- Do NOT modify any files.
- Produce a step-by-step plan: ordered tasks, files to touch, risks, alternatives.
- Be concrete — name specific files, functions, line numbers where possible.
- Keep your final answer under 800 words.`,

  'general-purpose': `You are a general-purpose subagent. You can research, explore, and execute multi-step tasks.

Rules:
- Use any tool available to you.
- Be thorough but efficient.
- Return a clear summary of what you did and what you found.
- If you hit a blocker, report it clearly rather than thrashing.`,

  'frontend-styling-expert': `You are a frontend styling expert. You specialize in CSS, Tailwind, responsive design, animations, and visual polish.

Rules:
- Use Read, Edit, MultiEdit, Bash (for builds/tests) to make targeted improvements.
- Focus on visual quality, accessibility, and responsive behavior.
- Don't refactor unrelated code.
- Return a summary of changes made.`,

  'full-stack-developer': `You are a full-stack developer subagent. You build complete features across frontend + backend + database.

Rules:
- Use any tool available.
- Follow existing patterns in the codebase.
- Test your changes (run the build, run tests if they exist).
- Return a summary of what was built + how to verify it.`,
};

export function taskTool(agent: AgentRuntime, ctx: ToolContext) {
  return {
    description: 'Launch a typed subagent to handle a complex, multi-step task autonomously. The subagent runs with its own context and returns a single result.',
    parameters: z.object({
      description: z.string().describe('Short 3-5 word description of the task'),
      prompt: z.string().describe('Highly detailed task description for the subagent. Include all context it needs.'),
      subagent_type: z.enum(['Explore', 'Plan', 'general-purpose', 'frontend-styling-expert', 'full-stack-developer']).describe('Type of subagent to launch'),
      model: z.enum(['sonnet', 'opus', 'haiku']).optional().describe('Model to use (default: inherits parent)'),
    }),
    execute: async (args: {
      description: string;
      prompt: string;
      subagent_type: 'Explore' | 'Plan' | 'general-purpose' | 'frontend-styling-expert' | 'full-stack-developer';
      model?: 'sonnet' | 'opus' | 'haiku';
    }) => {
      const systemPrompt = SUBAGENT_SYSTEM_PROMPTS[args.subagent_type] ?? SUBAGENT_SYSTEM_PROMPTS['general-purpose'];

      // Emit a tool_started event for the parent's UI.
      const toolCallId = `task_${Date.now()}`;
      agent.context.emit({
        type: 'tool_started',
        runId: agent.context.runId,
        turnId: agent.context.turnId,
        toolCallId,
        toolName: 'Task',
        args: {
          description: args.description,
          subagent_type: args.subagent_type,
          prompt: args.prompt.slice(0, 200) + (args.prompt.length > 200 ? '…' : ''),
        },
        timestamp: Date.now(),
      });

      try {
        // Run the subagent synchronously. For v1, this is a blocking call.
        // In a future version, this could spawn a separate process or even
        // a separate sandbox for true isolation.
        const subResult = await runSubagent(agent, ctx, {
          systemPrompt,
          userPrompt: args.prompt,
          subagentType: args.subagent_type,
        });

        agent.context.emit({
          type: 'tool_finished',
          runId: agent.context.runId,
          toolCallId,
          output: { summary: subResult.slice(0, 500) },
          isError: false,
          durationMs: 0,
        });

        return {
          subagent_type: args.subagent_type,
          description: args.description,
          result: subResult,
        };
      } catch (e: any) {
        agent.context.emit({
          type: 'tool_finished',
          runId: agent.context.runId,
          toolCallId,
          output: { error: e.message ?? String(e) },
          isError: true,
          durationMs: 0,
        });
        return {
          subagent_type: args.subagent_type,
          description: args.description,
          error: e.message ?? String(e),
        };
      }
    },
  };
}

async function runSubagent(
  parent: AgentRuntime,
  ctx: ToolContext,
  opts: { systemPrompt: string; userPrompt: string; subagentType: string },
): Promise<string> {
  // For v1, the subagent reuses the parent's model + tools but with a fresh
  // message history. This is a "logical" subagent, not a process isolation.
  //
  // We use streamText directly with maxSteps to let the subagent call tools
  // autonomously, then collect the final text.
  const { streamText } = await import('ai');

  const result = streamText({
    model: parent.model,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: opts.userPrompt }],
    tools: parent.tools,
    maxSteps: 10, // subagent can take up to 10 steps
  });

  // Consume the stream and collect the final text + tool results.
  let finalText = '';
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      finalText += part.textDelta;
      // Stream subagent text as a tool_updated event (so the parent UI sees progress).
      parent.context.emit({
        type: 'tool_updated',
        runId: parent.context.runId,
        toolCallId: `task_${Date.now()}`,
        partialOutput: finalText.slice(-500),
      });
    }
    // Tool calls within the subagent are silent — they don't bubble up to the parent UI.
    // This keeps the parent's tool-call list clean.
  }

  return finalText || '(subagent returned no text)';
}
