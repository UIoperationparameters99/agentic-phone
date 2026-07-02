/**
 * WebSocket client → sandbox sidecar.
 *
 * Single WS connection carrying the event stream (text deltas, tool calls,
 * todos, etc.) plus command/response (run, cancel, tool approval).
 *
 * Also handles LLM relay: when the sidecar emits an 'llm_request' event
 * (because the sandbox can't reach the LLM endpoint), this client intercepts
 * it, calls the LLM via Capacitor HTTP (native layer, no CORS, can reach
 * any endpoint), and sends the response back as an 'llm_response' command.
 *
 * See: packages/shared-types/src/events.ts
 */

import type { ClientMessage, ServerMessage, AgentEvent } from '@agentic/shared-types';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

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
  /** LLM relay config — if set, the client intercepts llm_request events. */
  llmRelay?: {
    apiKey: string;
    baseUrl: string;
  };
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
        resolve();
      };

      this.ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as ServerMessage;
          this.handlers.onMessage?.(msg);
          if (msg.type === 'event') {
            // Check if this is an llm_request event (relay mode)
            const event = msg.event as any;
            if (event.type === 'llm_request') {
              this.handleLlmRequest(event).catch(console.error);
            } else {
              this.handlers.onEvent?.(msg.event);
            }
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

  /**
   * Handle an llm_request event from the sidecar.
   * Calls the LLM via Capacitor HTTP (native layer) and sends the response back.
   */
  private async handleLlmRequest(event: any): Promise<void> {
    const { requestId, body, provider, baseUrl } = event;
    const relay = this.handlers.llmRelay;
    if (!relay) {
      // No relay configured — send error back
      this.send({
        type: 'llm_response',
        requestId,
        error: 'LLM relay not configured on mobile side',
      } as any);
      return;
    }

    try {
      // Build the OpenAI-compatible chat completion request
      const url = `${relay.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const requestBody = {
        model: body.model,
        messages: body.messages,
        temperature: body.temperature,
        max_tokens: body.maxTokens,
        stream: false,
      };

      let responseText: string;
      let status: number;

      if (Capacitor.isNativePlatform()) {
        // Use CapacitorHttp (native layer, no CORS, can reach any endpoint)
        const res = await CapacitorHttp.request({
          method: 'POST',
          url,
          headers: {
            'Authorization': `Bearer ${relay.apiKey}`,
            'Content-Type': 'application/json',
          },
          data: requestBody,
          responseType: 'text',
          connectTimeout: 10_000,
          readTimeout: 60_000,
        });
        status = res.status;
        responseText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      } else {
        // Web dev — use fetch
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${relay.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        status = res.status;
        responseText = await res.text();
      }

      if (status >= 400) {
        this.send({
          type: 'llm_response',
          requestId,
          error: `LLM returned ${status}: ${responseText.slice(0, 500)}`,
        } as any);
        return;
      }

      // Send the response back to the sidecar
      this.send({
        type: 'llm_response',
        requestId,
        response: responseText,
      } as any);
    } catch (e: any) {
      this.send({
        type: 'llm_response',
        requestId,
        error: e.message ?? String(e),
      } as any);
    }
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
  run(prompt: string, options?: {
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
