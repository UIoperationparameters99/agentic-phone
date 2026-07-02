/**
 * Daytona REST API client.
 *
 * Uses Capacitor's HTTP plugin (native layer) when running in the APK —
 * this bypasses CORS and keeps the Daytona API key out of the WebView JS
 * context. Falls back to `fetch()` in web dev mode (with a CORS proxy
 * note).
 *
 * See: docs/sandbox-setup.md
 * API docs: https://docs.daytona.io/
 */

import type { SandboxProviderConfig } from '@agentic/shared-types';

const DAYTONA_API_BASE = 'https://app.daytona.io/api';

export interface DaytonaSandbox {
  id: string;
  name: string;
  state: 'started' | 'stopped' | 'creating' | 'error';
  target?: string;
  snapshot?: string;
  user?: string;
  env?: Record<string, string>;
  cpu: number;
  memory: number;
  disk: number;
  public?: boolean;
  /** Public preview URL — derived from sandbox id + target region. */
  previewUrl?: string;
}

export interface CreateSandboxOptions {
  /** Snapshot/image to use. Defaults to 'daytonaio/sandbox:0.8.0'. */
  snapshot?: string;
  /** Env vars to inject (LLM keys, etc.). */
  envVars?: Record<string, string>;
  /** Resources. Default: 1 vCPU, 1 GB RAM, 3 GB disk. */
  cpu?: number;
  memory?: number;
  disk?: number;
  /** Auto-stop after N seconds idle (0 = never). Default: 0 (indefinite). */
  autoStop?: number;
  /** Volumes to mount. */
  volumes?: Array<{ name: string; path: string }>;
  /** Public preview URL — mobile connects WS to this. */
  public?: boolean;
}

export class DaytonaClient {
  constructor(private apiKey: string, private baseUrl: string = DAYTONA_API_BASE) {}

  /**
   * Spawn a new sandbox. Returns the sandbox + preview URL.
   *
   * Calls `POST /sandbox` (v1).
   *
   * Note: when using the default 'daytonaio/sandbox:0.8.0' snapshot,
   * resource overrides (cpu/memory/disk) are NOT allowed — the snapshot
   * fixes them. To customize resources, create a custom snapshot first.
   */
  async create(opts: CreateSandboxOptions = {}): Promise<DaytonaSandbox> {
    // Build body — only include resource fields if a custom snapshot is provided.
    const usingCustomSnapshot = !!opts.snapshot;
    const body: Record<string, unknown> = {
      autoStop: opts.autoStop ?? 0,
      env: opts.envVars ?? {},
      volumes: opts.volumes ?? [],
      public: opts.public ?? true,
    };
    if (usingCustomSnapshot) {
      body.snapshot = opts.snapshot;
      body.cpu = opts.cpu ?? 1;
      body.memory = opts.memory ?? 1;
      body.disk = opts.disk ?? 3;
    }
    const res = await this.request('POST', '/sandbox', body);
    const sb = res as DaytonaSandbox;
    // Compute preview URL — Daytona exposes preview URLs as https://{sandboxId}-3000.{target}.daytona.io
    if (!sb.previewUrl) {
      const target = sb.target ?? 'us';
      sb.previewUrl = `https://${sb.id}-3000.${target}.daytona.io`;
    }
    return sb;
  }

  /**
   * List all sandboxes for this API key.
   */
  async list(): Promise<DaytonaSandbox[]> {
    const res = await this.request('GET', '/sandbox');
    return res as DaytonaSandbox[];
  }

  /**
   * Get one sandbox by id.
   */
  async get(sandboxId: string): Promise<DaytonaSandbox> {
    return (await this.request('GET', `/sandbox/${sandboxId}`)) as DaytonaSandbox;
  }

  /**
   * Start a stopped sandbox.
   */
  async start(sandboxId: string): Promise<void> {
    await this.request('POST', `/sandbox/${sandboxId}/start`);
  }

  /**
   * Stop a running sandbox (snapshot is saved).
   */
  async stop(sandboxId: string): Promise<void> {
    await this.request('POST', `/sandbox/${sandboxId}/stop`);
  }

  /**
   * Delete a sandbox (irreversible — env vars wiped).
   */
  async delete(sandboxId: string): Promise<void> {
    await this.request('DELETE', `/sandbox/${sandboxId}`);
  }

  /**
   * Execute a command in the sandbox (non-interactive).
   * Uses `POST /toolbox/{id}/toolbox/process/execute` (correct path as of July 2026).
   */
  async execute(sandboxId: string, command: string, cwd = '/home/daytona'): Promise<{
    exitCode: number;
    result: string;
  }> {
    return (await this.request('POST', `/toolbox/${sandboxId}/toolbox/process/execute`, {
      command,
      cwd,
      timeout: 60,
    })) as { exitCode: number; result: string };
  }

  /**
   * Create a snapshot of the sandbox's filesystem.
   */
  async snapshot(sandboxId: string, name?: string): Promise<{ id: string; name: string }> {
    return (await this.request('POST', `/sandbox/${sandboxId}/snapshot`, {
      name: name ?? `agentic-${Date.now()}`,
    })) as { id: string; name: string };
  }

  /**
   * Get the public preview URL for the sandbox.
   * Mobile connects its WebSocket to this URL.
   */
  getPreviewUrl(sandbox: DaytonaSandbox): string {
    if (sandbox.previewUrl) return sandbox.previewUrl;
    const target = sandbox.target ?? 'us';
    return `https://${sandbox.id}-3000.${target}.daytona.io`;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Use Capacitor HTTP plugin in native, fetch in web dev.
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNative) {
      const { Http } = await import('@capacitor-community/http');
      const res = await Http.request({
        method,
        url,
        headers,
        data: body,
        responseType: 'json',
      });
      if (res.status >= 400) {
        const msg = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        throw new Error(`Daytona ${method} ${path} → ${res.status}: ${msg}`);
      }
      return res.data;
    }

    // Web dev — direct fetch. Daytona CORS may block this; user can use a CORS proxy.
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Daytona ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json();
  }
}
