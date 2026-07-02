/**
 * Event renderer — reduces a stream of AgentEvents into UI state.
 *
 * This is the single source of truth for "what to show in the chat".
 * The Zustand store subscribes to the WS client's onEvent and feeds
 * each event here.
 */

import type {
  AgentEvent,
  ToolStartedEvent,
  ToolUpdatedEvent,
  ToolFinishedEvent,
  TodoItem,
  RunOptions,
} from '@agentic/shared-types';

/** A single tool-call card's UI state. */
export interface ToolCallState {
  id: string;            // toolCallId
  toolName: string;
  args: unknown;
  status: 'running' | 'done' | 'error';
  partialOutput?: string;
  finalOutput?: unknown;
  durationMs?: number;
  startedAt: number;
}

/** A single chat message (user or assistant). */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** For user: the prompt. For assistant: streamed text (final). */
  content: string;
  /** Reasoning tokens (Claude/o1-style). */
  reasoning?: string;
  /** Tool calls made during this message. */
  toolCalls: ToolCallState[];
  /** Token usage for this message. */
  usage?: { input: number; output: number; reasoning?: number; costUsd?: number };
  /** Run lifecycle. */
  runId?: string;
  turnId?: string;
  startedAt: number;
  finishedAt?: number;
  isError?: boolean;
}

/** Append an event to a list of messages. Returns the new list (immutable). */
export function reduceEvent(
  messages: ChatMessage[],
  event: AgentEvent,
): { messages: ChatMessage[]; todos: TodoItem[] | null } {
  let todos: TodoItem[] | null = null;

  switch (event.type) {
    case 'run_started': {
      // User message (the prompt) + a fresh assistant message (will fill in).
      const userMsg: ChatMessage = {
        id: `u_${event.runId}`,
        role: 'user',
        content: event.prompt,
        toolCalls: [],
        startedAt: event.timestamp,
        runId: event.runId,
      };
      const aiMsg: ChatMessage = {
        id: `a_${event.runId}`,
        role: 'assistant',
        content: '',
        toolCalls: [],
        runId: event.runId,
        startedAt: event.timestamp,
      };
      return { messages: [...messages, userMsg, aiMsg], todos: null };
    }

    case 'run_finished': {
      const updated = messages.map((m) =>
        m.runId === event.runId && m.role === 'assistant'
          ? { ...m, finishedAt: event.timestamp }
          : m,
      );
      return { messages: updated, todos: null };
    }

    case 'run_failed': {
      const updated = messages.map((m) =>
        m.runId === event.runId && m.role === 'assistant'
          ? { ...m, finishedAt: event.timestamp, isError: true, content: m.content + `\n\n**Error:** ${event.error}` }
          : m,
      );
      return { messages: updated, todos: null };
    }

    case 'turn_started': {
      // New assistant turn — append a fresh assistant message if this turn doesn't have one yet.
      const exists = messages.some((m) => m.turnId === event.turnId && m.role === 'assistant');
      if (exists) return { messages, todos: null };
      const aiMsg: ChatMessage = {
        id: `a_${event.turnId}`,
        role: 'assistant',
        content: '',
        toolCalls: [],
        runId: event.runId,
        turnId: event.turnId,
        startedAt: event.timestamp,
      };
      return { messages: [...messages, aiMsg], todos: null };
    }

    case 'turn_finished': {
      const updated = messages.map((m) =>
        m.turnId === event.turnId && m.role === 'assistant'
          ? { ...m, finishedAt: event.timestamp }
          : m,
      );
      return { messages: updated, todos: null };
    }

    case 'text_delta': {
      const updated = messages.map((m) =>
        m.turnId === event.turnId && m.role === 'assistant'
          ? { ...m, content: m.content + event.delta }
          : m,
      );
      return { messages: updated, todos: null };
    }

    case 'reasoning_delta': {
      const updated = messages.map((m) =>
        m.turnId === event.turnId && m.role === 'assistant'
          ? { ...m, reasoning: (m.reasoning ?? '') + event.delta }
          : m,
      );
      return { messages: updated, todos: null };
    }

    case 'tool_started': {
      // Find the current assistant message (most recent, not finished).
      const updated = messages.map((m, i) => {
        if (i !== messages.length - 1 || m.role !== 'assistant') return m;
        const tc: ToolCallState = {
          id: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          status: 'running',
          startedAt: event.timestamp,
        };
        return { ...m, toolCalls: [...m.toolCalls, tc] };
      });
      return { messages: updated, todos: null };
    }

    case 'tool_updated': {
      const updated = messages.map((m) => {
        if (m.role !== 'assistant') return m;
        const tcs = m.toolCalls.map((tc) =>
          tc.id === event.toolCallId
            ? { ...tc, partialOutput: event.partialOutput ?? tc.partialOutput, progress: event.progress }
            : tc,
        );
        return { ...m, toolCalls: tcs };
      });
      return { messages: updated, todos: null };
    }

    case 'tool_finished': {
      const newStatus: ToolCallState['status'] = event.isError ? 'error' : 'done';
      const updated = messages.map((m) => {
        if (m.role !== 'assistant') return m;
        const tcs = m.toolCalls.map((tc) =>
          tc.id === event.toolCallId
            ? {
                ...tc,
                status: newStatus,
                finalOutput: event.output,
                durationMs: event.durationMs,
              }
            : tc,
        );
        return { ...m, toolCalls: tcs };
      });
      return { messages: updated, todos: null };
    }

    case 'usage': {
      const updated = messages.map((m) =>
        m.runId === event.runId && m.role === 'assistant'
          ? {
              ...m,
              usage: {
                input: event.inputTokens,
                output: event.outputTokens,
                reasoning: event.reasoningTokens,
                costUsd: event.costUsd,
              },
            }
          : m,
      );
      return { messages: updated, todos: null };
    }

    case 'todo_updated': {
      return { messages, todos: event.todos };
    }

    case 'skill_invoked': {
      // We could surface this as a badge in the transcript. For now, no-op.
      return { messages, todos: null };
    }

    case 'tool_approval_requested': {
      // The chat UI shows an inline approval card.
      // For simplicity, we add it as a special "tool call" with status 'pending_approval'.
      const updated = messages.map((m, i) => {
        if (i !== messages.length - 1 || m.role !== 'assistant') return m;
        const tc: ToolCallState = {
          id: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          status: 'running', // visually "awaiting approval" — UI handles via approvalId
          startedAt: Date.now(),
        };
        return { ...m, toolCalls: [...m.toolCalls, tc] };
      });
      return { messages: updated, todos: null };
    }

    default: {
      // Exhaustive check — if AgentEvent gets new variants, TS will error here.
      const _exhaustive: never = event;
      return { messages, todos: null };
    }
  }
}

/** Reduce a sequence of events (used for replay on session resume). */
export function reduceEvents(events: AgentEvent[]): { messages: ChatMessage[]; todos: TodoItem[] } {
  let messages: ChatMessage[] = [];
  let todos: TodoItem[] = [];
  for (const e of events) {
    const r = reduceEvent(messages, e);
    messages = r.messages;
    if (r.todos) todos = r.todos;
  }
  return { messages, todos };
}
