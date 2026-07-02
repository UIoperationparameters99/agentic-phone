/**
 * Event protocol — the WebSocket envelope between mobile and sidecar.
 *
 * Inspired by @cline/sdk's `CoreSessionEvent` + the `desktop-app/sidecar/`
 * WS envelope (`{command, response, event}`). Simplified for v1.
 *
 * See: docs/architecture.md § "The event protocol"
 */

// ─── WS envelope ────────────────────────────────────────────────────────────

/**
 * Client → server message. Always has a `type` discriminator.
 */
export type ClientMessage =
  | { type: 'hello'; clientId: string; protocolVersion: number }
  | { type: 'run'; prompt: string; options?: RunOptions }
  | { type: 'cancel'; runId?: string }
  | { type: 'tool_approval'; approvalId: string; decision: 'approve' | 'deny'; feedback?: string }
  | { type: 'subscribe_file_events'; path: string }
  | { type: 'read_file'; path: string }
  | { type: 'write_file'; path: string; content: string }
  | { type: 'list_dir'; path: string }
  | { type: 'install_skill'; skillName: string }
  | { type: 'list_skills' };

/**
 * Server → client message. Always has a `type` discriminator.
 */
export type ServerMessage =
  | { type: 'hello'; serverId: string; protocolVersion: number; sandboxId: string }
  | { type: 'event'; event: AgentEvent }
  | { type: 'file_changed'; path: string }
  | { type: 'file_read'; path: string; content: string; error?: string }
  | { type: 'file_written'; path: string; error?: string }
  | { type: 'dir_listed'; path: string; entries: DirEntry[]; error?: string }
  | { type: 'skills_listed'; skills: SkillInfo[] }
  | { type: 'skill_installed'; skillName: string; error?: string }
  | { type: 'error'; message: string; code?: string };

// ─── Agent events (the stream mobile renders) ───────────────────────────────

/**
 * Union of all agent events. Mirrors @cline/sdk's AgentRuntimeEvent (14 variants),
 * simplified to the ones mobile actually renders.
 *
 * Each variant maps to a UI element:
 *   - run_started/finished/failed      → top-level status bar
 *   - turn_started/finished            → per-turn separator
 *   - text_delta                       → streaming token append
 *   - reasoning_delta                  → collapsible "thinking" block
 *   - tool_started/updated/finished    → collapsible tool-call card
 *   - usage                             → token/cost chip
 *   - todo_updated                     → todo panel update
 *   - skill_invoked                    → skill badge in transcript
 *   - tool_approval_requested          → inline approval card
 */
export type AgentEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunFailedEvent
  | TurnStartedEvent
  | TurnFinishedEvent
  | TextDeltaEvent
  | ReasoningDeltaEvent
  | ToolStartedEvent
  | ToolUpdatedEvent
  | ToolFinishedEvent
  | UsageEvent
  | TodoUpdatedEvent
  | SkillInvokedEvent
  | ToolApprovalRequestedEvent;

export interface RunStartedEvent {
  type: 'run_started';
  runId: string;
  prompt: string;
  timestamp: number;
}

export interface RunFinishedEvent {
  type: 'run_finished';
  runId: string;
  timestamp: number;
}

export interface RunFailedEvent {
  type: 'run_failed';
  runId: string;
  error: string;
  timestamp: number;
}

export interface TurnStartedEvent {
  type: 'turn_started';
  runId: string;
  turnId: string;
  timestamp: number;
}

export interface TurnFinishedEvent {
  type: 'turn_finished';
  runId: string;
  turnId: string;
  timestamp: number;
}

export interface TextDeltaEvent {
  type: 'text_delta';
  runId: string;
  turnId: string;
  delta: string;
}

export interface ReasoningDeltaEvent {
  type: 'reasoning_delta';
  runId: string;
  turnId: string;
  delta: string;
}

export interface ToolStartedEvent {
  type: 'tool_started';
  runId: string;
  turnId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  timestamp: number;
}

export interface ToolUpdatedEvent {
  type: 'tool_updated';
  runId: string;
  toolCallId: string;
  partialOutput?: string;
  progress?: string;
}

export interface ToolFinishedEvent {
  type: 'tool_finished';
  runId: string;
  toolCallId: string;
  output: unknown;
  isError: boolean;
  durationMs: number;
}

export interface UsageEvent {
  type: 'usage';
  runId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  costUsd?: number;
}

export interface TodoUpdatedEvent {
  type: 'todo_updated';
  todos: TodoItem[];
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export interface SkillInvokedEvent {
  type: 'skill_invoked';
  skillName: string;
  description: string;
}

export interface ToolApprovalRequestedEvent {
  type: 'tool_approval_requested';
  approvalId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface RunOptions {
  /** Override the model for this run (e.g., 'gpt-4o', 'claude-3-5-sonnet', 'glm-4.5'). */
  model?: string;
  /** Max turns before auto-stopping. */
  maxTurns?: number;
  /** Max tokens for the final response. */
  maxTokens?: number;
  /** Whether to require approval before each tool call. */
  requireApproval?: boolean | 'auto';
  /** Workspace-relative path to focus the agent on. */
  cwd?: string;
}

// ─── Filesystem ──────────────────────────────────────────────────────────────

export interface DirEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mtime: number;
  isText?: boolean;
}

export interface SkillInfo {
  name: string;
  description: string;
  argumentHint?: string;
  installed: boolean;
}
