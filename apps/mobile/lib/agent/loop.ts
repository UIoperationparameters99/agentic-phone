/**
 * Agent loop — runs on the mobile app.
 *
 * Architecture:
 *   1. Mobile app calls LLM directly via CapacitorHttp (native, no CORS, no relay)
 *   2. When LLM returns tool calls, mobile sends them to sidecar via WS
 *   3. Sidecar executes the tool and returns the result
 *   4. Mobile feeds the result back to the LLM
 *   5. Repeat until no more tool calls
 *
 * This is 4x faster than the relay architecture (1 hop for LLM, 1 for tools
 * vs 4 hops for the relay).
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { ByokConfig, AgentEvent } from '@agentic/shared-types';
import type { AgentWsClient } from './ws-client';

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Run the agent loop. Emits events to the UI via onEvent. */
export async function runAgentLoop(
  prompt: string,
  byok: ByokConfig,
  wsClient: AgentWsClient | null,
  onEvent: (event: AgentEvent) => void,
  maxTurns = 15,
): Promise<void> {
  const runId = `run_${Date.now()}`;
  const provider = byok.llm.provider;
  const model = byok.llm.model || 'gpt-4o-mini';
  const baseUrl = byok.llm.baseUrl || getDefaultBaseUrl(provider);
  const apiKey = byok.llm.apiKey;

  // Build messages
  const messages: Message[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: prompt },
  ];

  // Build tools
  const tools = SIDECAR_TOOLS;

  onEvent({ type: 'run_started', runId, prompt, timestamp: Date.now() });

  for (let turn = 0; turn < maxTurns; turn++) {
    const turnId = `turn_${runId}_${turn}`;
    onEvent({ type: 'turn_started', runId, turnId, timestamp: Date.now() });

    // Call LLM directly
    let llmResponse;
    try {
      llmResponse = await callLLM(baseUrl, apiKey, model, messages, tools);
    } catch (e: any) {
      onEvent({
        type: 'text_delta',
        runId,
        turnId,
        delta: `\n\n⚠️ **Error:** ${e.message}\n`,
      });
      onEvent({ type: 'run_failed', runId, error: e.message, timestamp: Date.now() });
      return;
    }

    const choice = llmResponse.choices?.[0]?.message;
    if (!choice) {
      onEvent({ type: 'run_failed', runId, error: 'No response from LLM', timestamp: Date.now() });
      return;
    }

    // Emit text content
    if (choice.content) {
      onEvent({ type: 'text_delta', runId, turnId, delta: choice.content });
    }

    // Emit usage
    if (llmResponse.usage) {
      onEvent({
        type: 'usage',
        runId,
        inputTokens: llmResponse.usage.prompt_tokens ?? 0,
        outputTokens: llmResponse.usage.completion_tokens ?? 0,
      });
    }

    // If no tool calls, we're done
    const toolCalls = choice.tool_calls || [];
    if (toolCalls.length === 0) {
      // Add assistant message to history
      messages.push({ role: 'assistant', content: choice.content || '' });
      onEvent({ type: 'turn_finished', runId, turnId, timestamp: Date.now() });
      break;
    }

    // Add assistant message with tool calls to history
    messages.push({
      role: 'assistant',
      content: choice.content || '',
      tool_calls: toolCalls,
    });

    // Execute each tool call on the sidecar
    for (const tc of toolCalls) {
      const toolName = tc.function.name;
      let args: any;
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {
        args = {};
      }

      onEvent({
        type: 'tool_started',
        runId,
        turnId,
        toolCallId: tc.id,
        toolName,
        args,
        timestamp: Date.now(),
      });

      try {
        // Send tool call to sidecar and wait for result
        const result = await wsClient?.executeTool(toolName, args) ?? { error: 'Not connected to sandbox' };
        onEvent({
          type: 'tool_finished',
          runId,
          toolCallId: tc.id,
          output: result,
          isError: !!(result as any)?.error,
          durationMs: 0,
        });
        // Add tool result to messages
        messages.push({
          role: 'tool',
          content: typeof result === 'string' ? result : JSON.stringify(result).slice(0, 4000),
          tool_call_id: tc.id,
        });
      } catch (e: any) {
        onEvent({
          type: 'tool_finished',
          runId,
          toolCallId: tc.id,
          output: { error: e.message },
          isError: true,
          durationMs: 0,
        });
        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: e.message }),
          tool_call_id: tc.id,
        });
      }
    }

    onEvent({ type: 'turn_finished', runId, turnId, timestamp: Date.now() });
  }

  onEvent({ type: 'run_finished', runId, timestamp: Date.now() });
}

/** Call the LLM directly via CapacitorHttp (native) or fetch (web dev). */
async function callLLM(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Message[],
  tools: ToolDef[],
): Promise<any> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: 2000,
    stream: false,
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  if (Capacitor.isNativePlatform()) {
    // Native: use CapacitorHttp (no CORS, can reach any endpoint)
    const res = await CapacitorHttp.request({
      method: 'POST',
      url,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: body,
      responseType: 'json',
      connectTimeout: 10_000,
      readTimeout: 120_000,
    });
    if (res.status >= 400) {
      const errText = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      throw new Error(`LLM returned ${res.status}: ${errText.slice(0, 300)}`);
    }
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  } else {
    // Web dev: use the dev proxy to avoid CORS
    const proxyUrl = 'http://localhost:8787/proxy';
    const proxyRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'X-Target-URL': url,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!proxyRes.ok) {
      const errText = await proxyRes.text();
      throw new Error(`LLM returned ${proxyRes.status}: ${errText.slice(0, 300)}`);
    }
    return JSON.parse(await proxyRes.text());
  }
}

function getDefaultBaseUrl(provider: string): string {
  const defaults: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    openrouter: 'https://openrouter.ai/api/v1',
    zai: 'https://open.bigmodel.cn/api/paas/v4',
    mistral: 'https://api.mistral.ai/v1',
    groq: 'https://api.groq.com/openai/v1',
    together: 'https://api.together.xyz/v1',
    fireworks: 'https://api.fireworks.ai/inference/v1',
    custom: '',
  };
  return defaults[provider] || '';
}

function buildSystemPrompt(): string {
  return `You are Agentic — an AI agent running inside a cloud Linux sandbox on a phone.

You have tools available. Use them when needed. When you don't need a tool, just respond with text.

Rules:
1. Use tools to explore, create files, and run commands.
2. Be concise — the user is on a phone.
3. When done, give a brief summary.`;
}

/** Tool definitions matching the sidecar's tools. */
const SIDECAR_TOOLS: ToolDef[] = [
  { type: 'function', function: { name: 'Bash', description: 'Run a bash command', parameters: { type: 'object', properties: { command: { type: 'string', description: 'The bash command' }, timeout: { type: 'number', description: 'Timeout ms (max 600000)' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'Read', description: 'Read a file', parameters: { type: 'object', properties: { filepath: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['filepath'] } } },
  { type: 'function', function: { name: 'Write', description: 'Write content to a file', parameters: { type: 'object', properties: { filepath: { type: 'string' }, content: { type: 'string' } }, required: ['filepath', 'content'] } } },
  { type: 'function', function: { name: 'Edit', description: 'Find-and-replace in a file', parameters: { type: 'object', properties: { filepath: { type: 'string' }, old_str: { type: 'string' }, new_str: { type: 'string' } }, required: ['filepath', 'old_str', 'new_str'] } } },
  { type: 'function', function: { name: 'Grep', description: 'Search file contents with ripgrep', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'Glob', description: 'Find files matching a glob pattern', parameters: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'LS', description: 'List directory contents', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'TodoWrite', description: 'Update the todo/plan list', parameters: { type: 'object', properties: { todos: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } } } } }, required: ['todos'] } } },
  { type: 'function', function: { name: 'WebSearch', description: 'Search the web (DuckDuckGo)', parameters: { type: 'object', properties: { query: { type: 'string' }, num: { type: 'number' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'WebFetch', description: 'Fetch a web page and extract text', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
];
