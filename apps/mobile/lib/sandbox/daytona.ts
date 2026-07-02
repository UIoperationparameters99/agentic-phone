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

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { SandboxProviderConfig } from '@agentic/shared-types';

const DAYTONA_API_BASE = process.env.NEXT_PUBLIC_DEV_DAYTONA_BASE ?? 'https://app.daytona.io/api';

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
  /** Snapshot name/id to use. Defaults to the agentic-sidecar-v1 custom snapshot. */
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

/**
 * The custom Daytona snapshot with Bun + the agentic sidecar pre-installed.
 *
 * Built by `scripts/build-snapshot.py`. Using this snapshot eliminates the
 * ~15s Bun install + sidecar download time on each session spawn — the
 * sandbox boots with the sidecar ready to run.
 *
 * To rebuild: `python3 scripts/build-snapshot.py`
 * To use the default Daytona image instead (requires bootstrap on each spawn):
 * pass `snapshot: undefined` in CreateSandboxOptions.
 */
export const AGENTIC_SNAPSHOT = 'agentic-sidecar-v1';

export class DaytonaClient {
  constructor(private apiKey: string, private baseUrl: string = DAYTONA_API_BASE) {}

  /**
   * Spawn a new sandbox. Returns the sandbox + preview URL.
   *
   * Calls `POST /sandbox` (v1).
   *
   * By default, uses the custom `agentic-sidecar-v1` snapshot which has
   * Bun + the sidecar pre-installed (instant spawn, no bootstrap needed).
   * Pass `snapshot: ''` or `undefined` explicitly to use the default image.
   */
  async create(opts: CreateSandboxOptions = {}): Promise<DaytonaSandbox> {
    const snapshot = opts.snapshot ?? AGENTIC_SNAPSHOT;
    const body: Record<string, unknown> = {
      snapshot,
      autoStop: opts.autoStop ?? 0,
      env: opts.envVars ?? {},
      volumes: opts.volumes ?? [],
      public: opts.public ?? true,
    };
    // Resource overrides (only include if explicitly set)
    if (opts.cpu !== undefined) body.cpu = opts.cpu;
    if (opts.memory !== undefined) body.memory = opts.memory;
    if (opts.disk !== undefined) body.disk = opts.disk;

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
   *
   * Note: timeout is server-side. The HTTP client timeout should be at least
   * 10s longer than the command timeout to allow for network latency.
   */
  async execute(
    sandboxId: string,
    command: string,
    cwd = '/home/daytona',
    timeout = 60,
  ): Promise<{ exitCode: number; result: string }> {
    return (await this.request(
      'POST',
      `/toolbox/${sandboxId}/toolbox/process/execute`,
      { command, cwd, timeout },
      timeout * 1000 + 15_000, // HTTP timeout = command timeout + 15s grace
    )) as { exitCode: number; result: string };
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
   * Get the public preview URL for a specific port on the sandbox.
   *
   * Uses `GET /sandbox/{id}/ports/{port}/signed-preview-url` which returns a
   * URL with an embedded auth token — no separate auth header needed.
   *
   * The URL format is: `https://{port}-{token}.daytonaproxy01.{region}`
   * (note: port is a PREFIX, not a suffix).
   *
   * Mobile connects its WebSocket to this URL's /ws path.
   */
  async getSignedPreviewUrl(sandboxId: string, port = 3000): Promise<string> {
    const res = (await this.request(
      'GET',
      `/sandbox/${sandboxId}/ports/${port}/signed-preview-url`,
    )) as { url: string; token: string; port: number; sandboxId: string };
    return res.url;
  }

  /**
   * Get the public preview URL for the sandbox (port 3000 by default).
   * Mobile connects its WebSocket to this URL.
   *
   * @deprecated Use getSignedPreviewUrl() instead — the unsigned URL requires
   * an Authorization header which the WebView can't easily provide for WS.
   */
  getPreviewUrl(sandbox: DaytonaSandbox): string {
    if (sandbox.previewUrl) return sandbox.previewUrl;
    const target = sandbox.target ?? 'us';
    return `https://3000-${sandbox.id}.daytonaproxy01.${target}`;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async request(
    method: string,
    path: string,
    body?: unknown,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Use Capacitor's built-in CapacitorHttp in native (no CORS, key stays out of WebView).
    // In web dev, use fetch (subject to CORS — use the dev proxy for local testing).
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await CapacitorHttp.request({
          method,
          url,
          headers,
          data: body,
          responseType: 'json',
          // CapacitorHttp uses connectTimeout + readTimeout in ms.
          connectTimeout: 10_000,
          readTimeout: timeoutMs,
        });
        if (res.status >= 400) {
          const msg = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
          throw new Error(`Daytona ${method} ${path} → ${res.status}: ${msg}`);
        }
        return res.data;
      } catch (e: any) {
        // CapacitorHttp throws on network errors with .message; rethrow with context.
        if (e.message?.includes('Daytona')) throw e;
        throw new Error(`Daytona ${method} ${path} → network error: ${e.message ?? e}`);
      }
    }

    // Web dev — direct fetch with AbortController timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Daytona ${method} ${path} → ${res.status}: ${text}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
}
