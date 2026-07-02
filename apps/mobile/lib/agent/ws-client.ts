/**
 * WebSocket client → sandbox sidecar.
 *
 * Single WS connection carrying the event stream (text deltas, tool calls,
 * todos, etc.) plus command/response (run, cancel, tool approval).
 *
 * See: packages/shared-types/src/events.ts
 */

import type { ClientMessage, ServerMessage, AgentEvent } from '@agentic/shared-types';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface WsClientHandlers {
  onStatusChange?: (status: ConnectionStatus) => void;
  onEvent?: (event: AgentEvent) => void;
  onMessage?: (msg: ServerMessage) => void;
}

export class AgentWsClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private url: string,
    private handlers: WsClientHandlers,
  ) {}

  /** Connect to the sidecar. Auto-reconnects on disconnect. */
  async connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('connecting');
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        this.setStatus('error');
        reject(e);
        return;
      }

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        // Send hello
        this.send({ type: 'hello', clientId: `client_${Date.now()}`, protocolVersion: 1 });
        // Start ping
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            // WebSocket doesn't need application-level ping; the underlying TCP keep-alive handles it.
            // But we can use this to detect dead connections.
          }
        }, 30_000);
        resolve();
      };

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as ServerMessage;
          this.handlers.onMessage?.(msg);
          if (msg.type === 'event') {
            this.handlers.onEvent?.(msg.event);
          }
        } catch (e) {
          console.error('[ws] failed to parse message:', e);
        }
      };

      this.ws.onerror = (e) => {
        console.error('[ws] error:', e);
        this.setStatus('error');
      };

      this.ws.onclose = () => {
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        if (this.shouldReconnect) {
          this.setStatus('reconnecting');
          const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
          this.reconnectAttempts++;
          setTimeout(() => this.connect().catch(() => {/* will retry */}), delay);
        } else {
          this.setStatus('disconnected');
        }
      };
    });
  }

  /** Send a message to the sidecar. */
  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[ws] not connected — dropping message:', msg.type);
    }
  }

  /** Send a user prompt to start a new run. */
  run(prompt: string, options?: Parameters<typeof this.send>[0] extends never ? never : {
    model?: string;
    maxTurns?: number;
    requireApproval?: boolean | 'auto';
  }): void {
    this.send({ type: 'run', prompt, options });
  }

  /** Cancel the current run. */
  cancel(): void {
    this.send({ type: 'cancel' });
  }

  /** Respond to a tool approval request. */
  respondToolApproval(approvalId: string, decision: 'approve' | 'deny', feedback?: string): void {
    this.send({ type: 'tool_approval', approvalId, decision, feedback });
  }

  /** Disconnect cleanly (no auto-reconnect). */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  /** Get current connection status. */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.handlers.onStatusChange?.(s);
  }
}
