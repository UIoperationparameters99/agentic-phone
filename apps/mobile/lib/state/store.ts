/**
 * Zustand store — single source of truth for mobile UI state.
 *
 * Holds: chat messages, tool calls, todos, file tree, sessions, BYOK config.
 * Subscribes to the WS client + session manager + secure storage.
 */

import { create } from 'zustand';
import type {
  AgentEvent,
  DirEntry,
  SkillInfo,
  TodoItem,
  ByokConfig,
  SandboxSession,
} from '@agentic/shared-types';
import type { ChatMessage } from '../agent/event-renderer';
import { reduceEvent, type ToolCallState } from '../agent/event-renderer';
import { AgentWsClient, type ConnectionStatus } from '../agent/ws-client';
import { SessionManager } from '../sandbox/session';
import { secureStorage } from '../byok/storage';

export interface PendingApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

interface MobileState {
  // ─── BYOK config ──────────────────────────────────────────────────────
  byok: ByokConfig | null;
  byokLoaded: boolean;
  loadByok: () => Promise<void>;
  saveByok: (config: ByokConfig) => Promise<void>;
  clearByok: () => Promise<void>;

  // ─── Session ──────────────────────────────────────────────────────────
  session: SandboxSession | null;
  sessionManager: SessionManager | null;
  spawnSession: () => Promise<void>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  destroySession: () => Promise<void>;

  // ─── WS connection ────────────────────────────────────────────────────
  wsClient: AgentWsClient | null;
  connStatus: ConnectionStatus;

  // ─── Chat ─────────────────────────────────────────────────────────────
  messages: ChatMessage[];
  isRunning: boolean;
  sendPrompt: (prompt: string) => void;
  cancelRun: () => void;
  respondApproval: (approvalId: string, decision: 'approve' | 'deny', feedback?: string) => void;
  pendingApprovals: PendingApproval[];

  // ─── Todos ────────────────────────────────────────────────────────────
  todos: TodoItem[];

  // ─── File browser ────────────────────────────────────────────────────
  fileTree: Record<string, DirEntry[]>; // path → entries
  currentPath: string;
  loadDir: (path: string) => Promise<void>;
  setCurrentPath: (path: string) => void;
  filePreview: { path: string; content: string } | null;
  previewFile: (path: string) => Promise<void>;
  closePreview: () => void;

  // ─── Skills ───────────────────────────────────────────────────────────
  skills: SkillInfo[];
  loadSkills: () => Promise<void>;
  installSkill: (name: string) => Promise<void>;

  // ─── Sessions history ────────────────────────────────────────────────
  sessions: Array<{ id: string; title: string; createdAt: number; lastActiveAt: number }>;
  loadSessions: () => Promise<void>;
}

export const useStore = create<MobileState>((set, get) => ({
  // ─── BYOK config ──────────────────────────────────────────────────────
  byok: null,
  byokLoaded: false,

  async loadByok() {
    const cfg = await secureStorage.load();
    set({ byok: cfg, byokLoaded: true });
  },

  async saveByok(config) {
    await secureStorage.save(config);
    set({ byok: config });
    // Re-create the session manager with the new keys.
    const sm = new SessionManager(config);
    set({ sessionManager: sm });
  },

  async clearByok() {
    await secureStorage.clear();
    set({ byok: null, sessionManager: null });
  },

  // ─── Session ──────────────────────────────────────────────────────────
  session: null,
  sessionManager: null,

  async spawnSession() {
    const { sessionManager, byok } = get();
    if (!sessionManager || !byok) throw new Error('No BYOK config — call saveByok first.');
    const session = await sessionManager.spawn();

    // Wire up WS client.
    const wsClient = new AgentWsClient(`wss://${new URL(session.previewUrl).host}/ws`, {
      onStatusChange: (status) => set({ connStatus: status }),
      onEvent: (event) => handleEvent(event, set, get),
      onMessage: (msg) => handleMessage(msg, set, get),
    });
    await wsClient.connect();

    set({ session, wsClient, connStatus: 'connected' });
  },

  async pauseSession() {
    const { sessionManager } = get();
    if (sessionManager) await sessionManager.pause();
    const { wsClient } = get();
    if (wsClient) await wsClient.disconnect();
    set({ session: get().session ? { ...get().session!, status: 'paused' } : null });
  },

  async resumeSession() {
    const { sessionManager } = get();
    if (sessionManager) await sessionManager.resume();
    const { session } = get();
    if (!session) return;
    const wsClient = new AgentWsClient(`wss://${new URL(session.previewUrl).host}/ws`, {
      onStatusChange: (status) => set({ connStatus: status }),
      onEvent: (event) => handleEvent(event, set, get),
      onMessage: (msg) => handleMessage(msg, set, get),
    });
    await wsClient.connect();
    set({ wsClient, connStatus: 'connected' });
  },

  async destroySession() {
    const { sessionManager, wsClient } = get();
    if (wsClient) await wsClient.disconnect();
    if (sessionManager) await sessionManager.destroy();
    set({ session: null, wsClient: null, connStatus: 'disconnected', messages: [], todos: [] });
  },

  // ─── WS connection ────────────────────────────────────────────────────
  wsClient: null,
  connStatus: 'disconnected',

  // ─── Chat ─────────────────────────────────────────────────────────────
  messages: [],
  isRunning: false,
  pendingApprovals: [],

  sendPrompt(prompt) {
    const { wsClient } = get();
    if (!wsClient) return;
    set({ isRunning: true });
    wsClient.run(prompt);
  },

  cancelRun() {
    const { wsClient } = get();
    if (!wsClient) return;
    wsClient.cancel();
    set({ isRunning: false });
  },

  respondApproval(approvalId, decision, feedback) {
    const { wsClient } = get();
    if (!wsClient) return;
    wsClient.respondToolApproval(approvalId, decision, feedback);
    set({
      pendingApprovals: get().pendingApprovals.filter((a) => a.approvalId !== approvalId),
    });
  },

  // ─── Todos ────────────────────────────────────────────────────────────
  todos: [],

  // ─── File browser ────────────────────────────────────────────────────
  fileTree: {},
  currentPath: '/home/daytona/workspace',
  filePreview: null,

  async loadDir(path) {
    const { wsClient } = get();
    if (!wsClient) return;
    // Request a dir listing — response comes back via onMessage.
    wsClient.send({ type: 'list_dir', path });
  },

  setCurrentPath(path) {
    set({ currentPath: path });
    get().loadDir(path);
  },

  async previewFile(path) {
    const { wsClient } = get();
    if (!wsClient) return;
    wsClient.send({ type: 'read_file', path });
  },

  closePreview() {
    set({ filePreview: null });
  },

  // ─── Skills ───────────────────────────────────────────────────────────
  skills: [],

  async loadSkills() {
    const { wsClient } = get();
    if (!wsClient) return;
    wsClient.send({ type: 'list_skills' });
  },

  async installSkill(name) {
    const { wsClient } = get();
    if (!wsClient) return;
    wsClient.send({ type: 'install_skill', skillName: name });
  },

  // ─── Sessions history ────────────────────────────────────────────────
  sessions: [],

  async loadSessions() {
    // Sessions are stored locally on-device (not in the sandbox) via SessionManager.
    // No secrets — just metadata (id, title, timestamps, sandboxId, snapshotId).
    const { SessionManager } = await import('../sandbox/session');
    const sessions = SessionManager.listSaved();
    set({ sessions: sessions.map((s) => ({ id: s.id, title: s.title, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt })) });
  },
}));

// ─── Helpers (outside the store creator) ──────────────────────────────────

function handleEvent(
  event: AgentEvent,
  set: (partial: Partial<MobileState>) => void,
  get: () => MobileState,
) {
  const { messages, todos } = reduceEvent(get().messages, event);
  const patch: Partial<MobileState> = { messages };
  if (todos) patch.todos = todos;

  if (event.type === 'run_started') {
    patch.isRunning = true;
  } else if (event.type === 'run_finished' || event.type === 'run_failed') {
    patch.isRunning = false;
  } else if (event.type === 'tool_approval_requested') {
    patch.pendingApprovals = [
      ...get().pendingApprovals,
      {
        approvalId: event.approvalId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        riskLevel: event.riskLevel,
        summary: event.summary,
      },
    ];
  }

  set(patch);
}

function handleMessage(
  msg: import('@agentic/shared-types').ServerMessage,
  set: (partial: Partial<MobileState>) => void,
  get: () => MobileState,
) {
  switch (msg.type) {
    case 'dir_listed':
      set({ fileTree: { ...get().fileTree, [msg.path]: msg.entries } });
      break;
    case 'file_read':
      if (msg.error) {
        console.error('[file_read error]', msg.error);
      } else {
        set({ filePreview: { path: msg.path, content: msg.content } });
      }
      break;
    case 'skills_listed':
      set({ skills: msg.skills });
      break;
    case 'skill_installed':
      // Refresh the list.
      get().loadSkills();
      break;
    case 'file_changed':
      // Re-list the dir if we're viewing it.
      if (get().currentPath === msg.path || get().currentPath === msg.path.replace(/\/[^/]+$/, '')) {
        get().loadDir(get().currentPath);
      }
      break;
    case 'error':
      console.error('[sidecar error]', msg.message);
      break;
  }
}
