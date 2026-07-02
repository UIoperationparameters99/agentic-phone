/**
 * Session types — sandbox lifecycle + workspace state.
 */

export type SessionStatus =
  | 'idle'
  | 'spawning'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'failed';

export interface SandboxSession {
  id: string;
  sandboxId: string;
  previewUrl: string;
  status: SessionStatus;
  createdAt: number;
  lastActiveAt: number;
  /** Snapshot id if we restored from one. */
  restoredFromSnapshotId?: string;
  /** Workspace git remote, if configured. */
  gitRemote?: string;
}

export interface SessionSummary {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  status: SessionStatus;
  previewUrl?: string;
  sandboxId?: string;
  /** First user prompt — used as the session title. */
  title: string;
}

export interface WorkspaceState {
  /** Absolute path of the workspace root inside the sandbox. */
  rootPath: string;
  /** Files in `download/` that the user can grab. */
  downloads: string[];
  /** Skills currently installed. */
  skills: string[];
  /** Active todo list. */
  todos: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
  }>;
}
