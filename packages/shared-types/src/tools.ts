/**
 * Tool definitions — what the agent can call.
 *
 * Mirrors z.ai's stable tool core (Bash, Read, Write, Edit, MultiEdit,
 * Grep, Glob, LS, TodoWrite, Skill). Each tool is implemented in
 * `apps/sidecar/src/tools/` and registered with @cline/sdk's AgentRuntime.
 */

export type ToolName =
  | 'Bash'
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'MultiEdit'
  | 'Grep'
  | 'Glob'
  | 'LS'
  | 'TodoWrite'
  | 'TodoRead'
  | 'Skill'
  | 'WebSearch'
  | 'WebFetch'
  | 'Task';

export interface ToolDefinition {
  name: ToolName;
  description: string;
  /** JSON schema for the tool's args. */
  inputSchema: JSONSchema;
  /** Risk level — drives the approval flow. */
  riskLevel: 'low' | 'medium' | 'high';
}

// Minimal JSON schema type (avoid pulling in additional deps).
export interface JSONSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: (string | number)[];
  additionalProperties?: boolean | JSONSchema;
  oneOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
}

// ─── Tool arg shapes ────────────────────────────────────────────────────────

export interface BashArgs {
  command: string;
  description?: string;
  timeout?: number; // ms, max 600_000
  runIn?: string;   // working directory
}

export interface ReadArgs {
  filepath: string;
  offset?: number;
  limit?: number;
}

export interface WriteArgs {
  filepath: string;
  content: string;
}

export interface EditArgs {
  filepath: string;
  old_str: string;
  new_str: string;
  replace_all?: boolean;
}

export interface MultiEditArgs {
  filepath: string;
  edits: Array<{ old_str: string; new_str: string }>;
}

export interface GrepArgs {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  output_mode?: 'files_with_matches' | 'content' | 'count';
  '-A'?: number;
  '-B'?: number;
  '-C'?: number;
  '-n'?: boolean;
  '-i'?: boolean;
  multiline?: boolean;
  head_limit?: number;
}

export interface GlobArgs {
  pattern: string;
  path?: string;
}

export interface LSArgs {
  path: string;
  ignore?: string[];
}

export interface TodoWriteArgs {
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
  }>;
}

export interface SkillArgs {
  command: string; // skill name, e.g. "pdf" or "docx"
}

export interface TaskArgs {
  description: string;
  prompt: string;
  subagent_type: 'Explore' | 'Plan' | 'general-purpose' | 'frontend-styling-expert' | 'full-stack-developer';
  model?: 'sonnet' | 'opus' | 'haiku';
}
