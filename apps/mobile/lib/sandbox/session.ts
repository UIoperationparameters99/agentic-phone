/**
 * Session lifecycle — spawn / connect / pause / resume / destroy.
 *
 * Coordinates Daytona REST API (sandbox lifecycle) with the WS client
 * (event stream from the sidecar running inside the sandbox).
 *
 * Persistence model:
 *   - On destroy: snapshot the workspace via Daytona snapshot API, save snapshot id locally.
 *   - On spawn: if a snapshot id exists, restore from it; else fresh sandbox.
 *   - Sessions list: persisted to localStorage on mobile (no secrets — just metadata).
 */

import { DaytonaClient, type DaytonaSandbox, type CreateSandboxOptions } from './daytona';
import { envVarsForConfig } from '../byok/providers';
import type { ByokConfig, SandboxSession, SessionStatus } from '@agentic/shared-types';

interface SavedSession {
  id: string;
  title: string;
  createdAt: number;
  lastActiveAt: number;
  sandboxId?: string;
  previewUrl?: string;
  snapshotId?: string;
  status: SessionStatus;
}

const SESSIONS_KEY = 'agentic_sessions_v1';

function loadSavedSessions(): SavedSession[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: SavedSession[]): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/**
 * Manages a single sandbox session.
 *
 * Lifecycle:
 *   idle → spawning → running ⇄ paused → stopping → stopped
 *                            └→ failed
 */
export class SessionManager {
  private daytona: DaytonaClient;
  private session: SandboxSession | null = null;
  private listeners = new Set<(s: SandboxSession | null) => void>();
  private snapshotId: string | null = null;

  constructor(private byok: ByokConfig) {
    this.daytona = new DaytonaClient(byok.sandbox.apiKey);
  }

  /** Subscribe to session state changes. Returns an unsubscribe fn. */
  subscribe(cb: (s: SandboxSession | null) => void): () => void {
    this.listeners.add(cb);
    cb(this.session);
    return () => this.listeners.delete(cb);
  }

  private setStatus(status: SessionStatus, patch: Partial<SandboxSession> = {}) {
    if (!this.session) return;
    this.session = { ...this.session, status, lastActiveAt: Date.now(), ...patch };
    this.listeners.forEach((cb) => cb(this.session));
    this.persistSession();
  }

  private persistSession() {
    if (!this.session) return;
    const sessions = loadSavedSessions();
    const idx = sessions.findIndex((s) => s.id === this.session!.id);
    const entry: SavedSession = {
      id: this.session.id,
      title: 'Session ' + new Date(this.session.createdAt).toLocaleString(),
      createdAt: this.session.createdAt,
      lastActiveAt: this.session.lastActiveAt,
      sandboxId: this.session.sandboxId,
      previewUrl: this.session.previewUrl,
      snapshotId: this.snapshotId ?? undefined,
      status: this.session.status,
    };
    if (idx >= 0) sessions[idx] = entry;
    else sessions.unshift(entry);
    saveSessions(sessions);
  }

  /** Spawn a fresh sandbox + bootstrap the sidecar + wait for it to be reachable. */
  async spawn(): Promise<SandboxSession> {
    if (this.session) throw new Error('Session already exists — call destroy() first.');

    const envVars = envVarsForConfig(this.byok);
    // NOTE: When using Daytona's default snapshot (daytonaio/sandbox:0.8.0),
    // resource overrides are not allowed — the snapshot fixes them at 1 vCPU / 1 GB / 3 GB.
    // To get more resources, create a custom snapshot first.
    const opts: CreateSandboxOptions = {
      envVars,
      autoStop: 0, // indefinite — agent may run long
      public: true, // need a preview URL for WS
    };

    const sandbox = await this.daytona.create(opts);

    // Get the signed preview URL for port 3000 (where the sidecar runs).
    // This URL has an embedded auth token, so the WS connection doesn't need extra headers.
    const previewUrl = await this.daytona.getSignedPreviewUrl(sandbox.id, 3000);

    this.session = {
      id: `sess_${Date.now()}`,
      sandboxId: sandbox.id,
      previewUrl,
      status: 'spawning',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.listeners.forEach((cb) => cb(this.session));

    // Bootstrap the sidecar inside the sandbox.
    // This installs Bun, downloads the sidecar bundle, and starts it in the background.
    // Takes ~15-30s on first run (Bun install), ~5s on subsequent runs (Bun cached).
    await this.bootstrapSidecar(sandbox.id);

    // Wait for the sidecar's /health endpoint to respond via the public preview URL.
    await this.waitForSidecar(previewUrl, 60_000);
    this.setStatus('running');

    return this.session;
  }

  /**
   * Bootstrap the sidecar inside a fresh sandbox.
   *
   * Fetches bootstrap.sh from the GitHub repo and runs it via Daytona's
   * toolbox execute API. The script:
   *   1. Installs Bun (if not already installed)
   *   2. Downloads the sidecar bundle (sidecar.js) from GitHub raw
   *   3. Starts it in the background
   *   4. Waits for /health (up to 30s)
   *
   * The script's own wait-for-health is a backup — we also poll from the
   * mobile side via waitForSidecar() below.
   */
  private async bootstrapSidecar(sandboxId: string): Promise<void> {
    const bootstrapUrl = 'https://raw.githubusercontent.com/UIoperationparameters99/agentic-phone/main/apps/sidecar/bootstrap.sh';
    // Run bootstrap.sh via curl pipe to bash. Timeout: 90s (Bun install + sidecar start).
    const command = `curl -fsSL '${bootstrapUrl}' | bash`;
    try {
      const res = await this.daytona.execute(sandboxId, command, '/home/daytona', 90);
      if (res.exitCode !== 0) {
        throw new Error(`Bootstrap failed (exit ${res.exitCode}):\n${res.result}`);
      }
      console.log('[session] bootstrap output:', res.result);
    } catch (e) {
      // If the execute itself times out (90s + 15s grace = 105s HTTP timeout),
      // the sidecar may still be starting in the background. Let waitForSidecar
      // make the final call.
      console.warn('[session] bootstrap execute error (sidecar may still be starting):', e);
    }
  }

  /** Pause the sandbox (snapshot saved, no compute burn). */
  async pause(): Promise<void> {
    if (!this.session) return;
    this.setStatus('stopping');
    // Create a snapshot before stopping so we can restore state.
    try {
      const snap = await this.daytona.snapshot(this.session.sandboxId, `agentic-${this.session.id}`);
      this.snapshotId = snap.id;
    } catch (e) {
      console.warn('[session] snapshot failed (continuing with stop):', e);
    }
    await this.daytona.stop(this.session.sandboxId);
    this.setStatus('paused');
  }

  /** Resume a paused sandbox. */
  async resume(): Promise<void> {
    if (!this.session) return;
    this.setStatus('spawning');
    await this.daytona.start(this.session.sandboxId);
    await this.waitForSidecar(this.session.previewUrl, 60_000);
    this.setStatus('running');
  }

  /** Destroy the sandbox — env vars (incl. LLM keys) are wiped. */
  async destroy(): Promise<void> {
    if (!this.session) return;
    this.setStatus('stopping');
    // Snapshot before destroy so the session can be re-spawned later.
    try {
      if (!this.snapshotId) {
        const snap = await this.daytona.snapshot(this.session.sandboxId, `agentic-${this.session.id}-final`);
        this.snapshotId = snap.id;
      }
    } catch (e) {
      console.warn('[session] final snapshot failed:', e);
    }
    try {
      await this.daytona.delete(this.session.sandboxId);
    } catch (e) {
      console.warn('[session] destroy failed:', e);
    }
    this.session = null;
    this.listeners.forEach((cb) => cb(null));
  }

  /** Get the current session (or null). */
  current(): SandboxSession | null {
    return this.session;
  }

  /** List all saved sessions (from localStorage). */
  static listSaved(): SavedSession[] {
    return loadSavedSessions();
  }

  /** Clear all saved sessions from localStorage. */
  static clearSaved(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(SESSIONS_KEY);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async waitForSidecar(previewUrl: string, timeoutMs: number): Promise<void> {
    const healthUrl = `${previewUrl}/health`;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(healthUrl);
        if (res.ok) return;
      } catch {
        // Sidecar not up yet — retry.
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Sidecar did not become healthy within ${timeoutMs / 1000}s`);
  }
}
