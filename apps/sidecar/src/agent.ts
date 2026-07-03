/**
 * Agent setup — creates a Vercel AI SDK agent with the user's BYOK provider.
 *
 * Reads provider config from env vars (set by the mobile app at sandbox spawn).
 * Uses `streamText` from the `ai` package for the agent loop.
 */

import { streamText, type CoreMessage, type Tool } from 'ai';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export interface AgentConfig {
  workspace: string;
  provider: string;
  model: string;
  baseUrl?: string;
}

export interface AgentContext {
  workspace: string;
  /** The current run's prompt. */
  prompt?: string;
  /** The current run id. */
  runId?: string;
  /** The current turn id. */
  turnId?: string;
  /** Tool approval callback — returns true if approved. */
  requestApproval?: (toolName: string, args: unknown, summary: string, riskLevel: 'low' | 'medium' | 'high') => Promise<boolean>;
  /** Event emitter — pushes events to the WS server. */
  emit: (event: AgentEventish) => void;
}

export interface AgentEventish {
  type: string;
  [k: string]: unknown;
}

export interface AgentRuntime {
  config: AgentConfig;
  context: AgentContext;
  tools: Record<string, Tool>;
  /** The underlying Vercel AI SDK model (used by Task tool for subagents). */
  model: LanguageModelV1;
  registerTool: (name: string, tool: Tool) => void;
  run: (prompt: string, opts?: { maxTurns?: number; requireApproval?: boolean | 'auto' }) => Promise<void>;
  cancel: () => void;
  /** Call LLM via WS relay (mobile app proxies). Returns content + tool calls. */
  callLlmViaRelay: (messages: CoreMessage[], runId: string, turnId: string) => Promise<{
    content: string;
    toolCalls: Array<{ id: string; name: string; args: any }>;
  }>;
}

export async function createAgent(config: AgentConfig): Promise<AgentRuntime> {
  const model = createModel(config);

  const runtime: AgentRuntime = {
    config,
    context: {
      workspace: config.workspace,
      emit: () => {/* set by transport layer */},
    },
    tools: {},
    model,
    registerTool(name, tool) {
      this.tools[name] = tool;
    },
    async run(prompt, opts = {}) {
      const runId = `run_${Date.now()}`;
      const maxTurns = opts.maxTurns ?? 20;
      this.context.prompt = prompt;
      this.context.runId = runId;

      this.context.emit({
        type: 'run_started',
        runId,
        prompt,
        timestamp: Date.now(),
      });

      const messages: CoreMessage[] = [
        {
          role: 'system',
          content: buildSystemPrompt(config.workspace),
        },
        { role: 'user', content: prompt },
      ];

      let cancelled = false;
      this.cancel = () => { cancelled = true; };

      for (let turn = 0; turn < maxTurns; turn++) {
        if (cancelled) break;

        const turnId = `turn_${runId}_${turn}`;
        this.context.turnId = turnId;

        this.context.emit({
          type: 'turn_started',
          runId,
          turnId,
          timestamp: Date.now(),
        });

        try {
          const isRelay = process.env.AGENTIC_LLM_RELAY === 'true';

          if (isRelay) {
            // Relay mode: call LLM via WS relay (mobile app proxies the call).
            // We build the OpenAI-compatible request ourselves (with tools) and
            // emit it as an llm_request event. The mobile app calls the LLM
            // and sends back the response.
            const result = await this.callLlmViaRelay(messages, runId, turnId);
            if (cancelled) break;

            // Emit text
            if (result.content) {
              this.context.emit({ type: 'text_delta', runId, turnId, delta: result.content });
              messages.push({ role: 'assistant', content: result.content });
            }

            // Handle tool calls
            if (result.toolCalls && result.toolCalls.length > 0) {
              for (const tc of result.toolCalls) {
                this.context.emit({
                  type: 'tool_started',
                  runId, turnId,
                  toolCallId: tc.id,
                  toolName: tc.name,
                  args: tc.args,
                  timestamp: Date.now(),
                });

                const tool: any = this.tools[tc.name];
                if (tool?.execute) {
                  try {
                    const output = await tool.execute(tc.args);
                    this.context.emit({
                      type: 'tool_finished',
                      runId,
                      toolCallId: tc.id,
                      output,
                      isError: false,
                      durationMs: 0,
                    });
                    // Add tool result to messages for next turn
                    messages.push({ role: 'user', content: `[Tool ${tc.name} result: ${JSON.stringify(output).slice(0, 500)}]` } as any);
                  } catch (e: any) {
                    this.context.emit({
                      type: 'tool_finished',
                      runId,
                      toolCallId: tc.id,
                      output: { error: e.message },
                      isError: true,
                      durationMs: 0,
                    });
                  }
                } else {
                  this.context.emit({
                    type: 'tool_finished',
                    runId,
                    toolCallId: tc.id,
                    output: { error: `Unknown tool: ${tc.name}` },
                    isError: true,
                    durationMs: 0,
                  });
                }
              }
              // Continue to next turn (the model will see the tool results)
            } else {
              // No tool calls — we're done
              this.context.emit({ type: 'turn_finished', runId, turnId, timestamp: Date.now() });
              break;
            }
          } else {
            // Direct mode: use streamText (original code)
            const result = streamText({
              model: this.model,
              messages,
              tools: this.tools,
              maxSteps: 1,
            });

            let textBuffer = '';
            for await (const part of result.fullStream) {
              if (cancelled) break;
              switch (part.type) {
                case 'text-delta':
                  textBuffer += part.textDelta;
                  this.context.emit({ type: 'text_delta', runId, turnId, delta: part.textDelta });
                  break;
                case 'tool-call':
                  this.context.emit({ type: 'tool_started', runId, turnId, toolCallId: part.toolCallId, toolName: part.toolName, args: part.args, timestamp: Date.now() });
                  break;
                case 'finish':
                  if (part.usage) {
                    const u = part.usage as any;
                    this.context.emit({ type: 'usage', runId, inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0 });
                  }
                  break;
                case 'error':
                  const errMsg = (part as any).error instanceof Error ? (part as any).error.message : String((part as any).error);
                  const userFriendly = makeUserFriendlyError(errMsg, this.config);
                  this.context.emit({ type: 'text_delta', runId, turnId, delta: `\n\n⚠️ **Error:** ${userFriendly}\n` });
                  this.context.emit({ type: 'run_failed', runId, error: userFriendly, timestamp: Date.now() });
                  return;
              }
            }
            messages.push({ role: 'assistant', content: textBuffer || '(no text)' });
            // End after one turn in direct mode too
            this.context.emit({ type: 'turn_finished', runId, turnId, timestamp: Date.now() });
            break;
          }

          this.context.emit({ type: 'turn_finished', runId, turnId, timestamp: Date.now() });
        } catch (e) {
          this.context.emit({
            type: 'run_failed',
            runId,
            error: e instanceof Error ? e.message : String(e),
            timestamp: Date.now(),
          });
          return;
        }
      }

      this.context.emit({
        type: 'run_finished',
        runId,
        timestamp: Date.now(),
      });
    },
    cancel() { /* set by run() */ },

    /**
     * Call the LLM via the relay (mobile app proxies the call).
     * Returns parsed content + tool calls.
     */
    async callLlmViaRelay(messages: CoreMessage[], runId: string, turnId: string): Promise<{
      content: string;
      toolCalls: Array<{ id: string; name: string; args: any }>;
    }> {
      // Convert messages to OpenAI format
      const openaiMessages = messages.map((m) => {
        if (m.role === 'user' || m.role === 'system') {
          const content = typeof m.content === 'string' ? m.content : (m.content as any[]).map((p: any) => p.text || '').join('');
          return { role: m.role, content };
        }
        if (m.role === 'assistant') {
          const content = typeof m.content === 'string' ? m.content : (m.content as any[]).map((p: any) => p.text || '').join('');
          return { role: 'assistant', content };
        }
        return m;
      });

      // Build tools in OpenAI format
      // Convert zod schemas to JSON schemas (the SDK uses z.object() internally)
      const { zodToJsonSchema } = await import('zod-to-json-schema');
      const tools = Object.entries(this.tools).map(([name, tool]: [string, any]) => {
        let parameters = tool.parameters;
        // If it's a zod schema (has _def), convert to JSON schema
        if (parameters?._def) {
          try {
            parameters = zodToJsonSchema(parameters, 'parameters');
          } catch {
            parameters = { type: 'object', properties: {} };
          }
        }
        return {
          type: 'function',
          function: {
            name,
            description: tool.description,
            parameters,
          },
        };
      });

      const requestBody = {
        model: this.config.model,
        messages: openaiMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        max_tokens: 1000,
        stream: false,
      };

      const requestId = `llm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const emit = (globalThis as any).__agenticEmit as ((e: any) => void) | undefined;
      if (!emit) throw new Error('Relay: emit not available (no WS connection)');

      const responsePromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('LLM relay timeout (60s)')), 60_000);
        if (!(globalThis as any).__agenticLlmHandlers) (globalThis as any).__agenticLlmHandlers = new Map();
        (globalThis as any).__agenticLlmHandlers.set(requestId, { resolve, reject, timeout });
      });

      emit({ type: 'llm_request', requestId, body: requestBody });

      const responseText = await responsePromise;
      const response = JSON.parse(responseText);
      const choice = response.choices?.[0]?.message;
      const content = choice?.content || '';
      const toolCalls = (choice?.tool_calls || []).map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || '{}'),
      }));

      if (response.usage) {
        this.context.emit({
          type: 'usage',
          runId,
          inputTokens: response.usage.prompt_tokens ?? 0,
          outputTokens: response.usage.completion_tokens ?? 0,
        });
      }

      return { content, toolCalls };
    },
  };

  return runtime;
}

/**
 * Convert a raw LLM API error into a user-friendly message.
 *
 * Common cases:
 *   - "socket connection was closed" / "Connection reset" → sandbox can't reach the LLM endpoint
 *   - "401 Unauthorized" → wrong API key
 *   - "404 Not Found" → wrong model name or base URL
 *   - "429 Too Many Requests" → rate limited
 */
function makeUserFriendlyError(errMsg: string, config: AgentConfig): string {
  const lower = errMsg.toLowerCase();

  if (lower.includes('socket connection was closed') || lower.includes('connection reset') || lower.includes('recv failure') || lower.includes('econnreset') || lower.includes('etimedout')) {
    return `The sandbox cannot reach your LLM endpoint (${config.baseUrl}). This is likely because Daytona's sandbox network blocks this domain. Try a provider that's reachable: OpenAI, Anthropic, Google Gemini, OpenRouter, or use a provider with a standard domain (api.openai.com, api.anthropic.com, etc.).`;
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return `Authentication failed (401). Check that your API key is correct for ${config.provider}.`;
  }
  if (lower.includes('404') || lower.includes('not found') || lower.includes('model')) {
    return `Model "${config.model}" not found at ${config.baseUrl}. Verify the model name is correct for your provider.`;
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return `Rate limited (429). Your LLM provider is throttling requests. Wait a moment and try again.`;
  }
  return errMsg;
}

function createModel(config: AgentConfig) {
  const provider = config.provider;
  const model = config.model;
  const baseUrl = config.baseUrl;

  // If AGENTIC_LLM_RELAY is set, use a relay-based model that proxies
  // LLM calls through the mobile app (bypasses sandbox network restrictions).
  // This is automatically enabled when the sandbox can't reach the LLM endpoint.
  if (process.env.AGENTIC_LLM_RELAY === 'true') {
    return createRelayModel(config);
  }

  if (provider === 'openai' || provider === 'openrouter' || provider === 'custom' || provider === 'together' || provider === 'fireworks' || provider === 'groq') {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? process.env.CUSTOM_LLM_API_KEY ?? process.env.TOGETHER_API_KEY ?? process.env.FIREWORKS_API_KEY ?? process.env.GROQ_API_KEY,
      baseURL: baseUrl,
    });
    return openai(model);
  }
  if (provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: baseUrl,
    });
    return anthropic(model);
  }
  if (provider === 'google') {
    const google = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      baseURL: baseUrl,
    });
    return google(model);
  }
  if (provider === 'zai') {
    // Z.AI is OpenAI-compatible.
    const zai = createOpenAI({
      apiKey: process.env.ZAI_API_KEY,
      baseURL: baseUrl ?? 'https://open.bigmodel.cn/api/paas/v4',
    });
    return zai(model);
  }
  if (provider === 'mistral') {
    // Mistral is OpenAI-compatible.
    const mistral = createOpenAI({
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: baseUrl ?? 'https://api.mistral.ai/v1',
    });
    return mistral(model);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Create a relay-based LanguageModel that proxies LLM calls through the mobile app.
 *
 * Instead of calling the LLM directly (which may be blocked by sandbox network
 * restrictions), this model:
 *   1. Emits an 'llm_request' event over WS with the full request body
 *   2. Waits for an 'llm_response' event back from the mobile app
 *   3. Parses the response and feeds it back to the Vercel AI SDK stream
 *
 * The mobile app uses Capacitor HTTP (native layer, no CORS) to call the LLM
 * provider directly, then streams the response back over WS.
 *
 * This bypasses ALL sandbox network restrictions — the LLM call originates
 * from the user's phone, not the sandbox.
 */
function createRelayModel(config: AgentConfig): LanguageModelV1 {
  // The relay uses an OpenAI-compatible request/response format.
  // The mobile app handles the actual provider-specific auth + endpoint.

  const relayModel: LanguageModelV1 = {
    specificationVersion: 'v1',
    provider: `agentic-relay`,
    modelId: config.model,
    defaultObjectGenerationMode: 'json',

    async doGenerate(options) {
      // Not used — streamText always calls doStream
      throw new Error('Relay model does not support doGenerate');
    },

    async doStream(options) {
      // Build the OpenAI-compatible request body
      // Convert Vercel AI SDK tools → OpenAI function-calling format
      const opts = options as any;
      console.log('[relay] doStream called');
      console.log('[relay] options.tools type:', typeof opts.tools, 'isArray:', Array.isArray(opts.tools));
      
      // Get tools — the Vercel AI SDK might put them in different places
      const rawTools = opts.tools || opts.toolDefinition || [];
      console.log('[relay] rawTools length:', Array.isArray(rawTools) ? rawTools.length : 'not array');
      
      // Deep clone to avoid any proxy issues with Bun's minification
      const toolsJson = JSON.parse(JSON.stringify(rawTools));
      console.log('[relay] toolsJson length:', Array.isArray(toolsJson) ? toolsJson.length : 'not array');
      if (Array.isArray(toolsJson) && toolsJson.length > 0) {
        console.log('[relay] first tool:', JSON.stringify(toolsJson[0]).slice(0, 300));
      }
      
      // Convert to OpenAI format
      const tools = Array.isArray(toolsJson) ? toolsJson.map((t: any) => {
        // Handle both formats: {name, description, parameters} and {function: {name, description, parameters}}
        const fn = t.function || t;
        return {
          type: 'function',
          function: {
            name: fn.name,
            description: fn.description,
            parameters: fn.parameters,
          },
        };
      }) : [];
      console.log('[relay] converted tools:', tools.length);
      if (tools.length > 0) {
        console.log('[relay] first converted tool:', JSON.stringify(tools[0]).slice(0, 200));
      }

      const requestBody = {
        model: config.model,
        messages: options.prompt,
        tools: tools.length > 0 ? tools : undefined,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        stream: false, // non-streaming for simplicity — the relay returns the full response
      };

      // Emit the request over WS — the mobile app will intercept it.
      // We use a promise that resolves when the mobile app sends back the response.
      const requestId = `llm_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Get the emit function from the global context (set by transport layer)
      const emit = (globalThis as any).__agenticEmit as ((e: any) => void) | undefined;
      if (!emit) {
        throw new Error('Relay mode: emit function not available (no WS connection)');
      }

      // Set up a listener for the response
      const responsePromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('LLM relay timeout (60s)')), 60_000);
        const handlers = (globalThis as any).__agenticLlmHandlers as Map<string, { resolve: (v: string) => void; reject: (e: any) => void; timeout: any }> | undefined;
        if (!handlers) {
          (globalThis as any).__agenticLlmHandlers = new Map();
        }
        ((globalThis as any).__agenticLlmHandlers as Map<string, any>).set(requestId, { resolve, reject, timeout });
      });

      // Emit the request
      emit({
        type: 'llm_request',
        requestId,
        body: requestBody,
        provider: config.provider,
        baseUrl: config.baseUrl,
      });

      // Wait for the response (the mobile app will send it back as 'llm_response')
      const responseText = await responsePromise;

      // Parse the response and return as a stream
      // The mobile app sends back the raw response body (OpenAI chat completion format)
      const response = JSON.parse(responseText);

      // Convert to LanguageModelV1Stream format
      const stream = new ReadableStream({
        start(controller) {
          if (response.choices?.[0]?.message?.content) {
            controller.enqueue({
              type: 'text-delta',
              textDelta: response.choices[0].message.content,
            });
          }
          if (response.choices?.[0]?.message?.tool_calls) {
            for (const tc of response.choices[0].message.tool_calls) {
              controller.enqueue({
                type: 'tool-call',
                toolCallId: tc.id,
                toolName: tc.function.name,
                args: JSON.parse(tc.function.arguments),
              });
            }
          }
          controller.enqueue({
            type: 'finish',
            finishReason: response.choices?.[0]?.finish_reason ?? 'stop',
            usage: response.usage ? {
              promptTokens: response.usage.prompt_tokens ?? 0,
              completionTokens: response.usage.completion_tokens ?? 0,
            } : undefined,
          });
          controller.close();
        },
      });

      return { stream, rawCall: { rawPrompt: options.prompt, rawSettings: {} } };
    },
  };

  return relayModel;
}

function buildSystemPrompt(workspace: string): string {
  return `You are Agentic — a powerful AI agent running inside a cloud Linux sandbox on a phone.

Your workspace is at: ${workspace}

You have these tools:
- Bash(command, timeout?) — run shell commands (persistent session, 600s max timeout)
- Read(filepath, offset?, limit?) — read a file (defaults to 2000 lines)
- Write(filepath, content) — create or overwrite a file
- Edit(filepath, old_str, new_str) — find-and-replace in a file (must be unique)
- MultiEdit(filepath, edits) — multiple find-and-replaces in one file
- Grep(pattern, path?, glob?, output_mode?, -A/-B/-C?, -n?, -i?, multiline?) — ripgrep search
- Glob(pattern, path?) — file pattern match
- LS(path) — list directory contents
- TodoWrite(todos) — update the plan/todo list (one in_progress at a time)
- Skill(command) — invoke a skill (loads SKILL.md into context)
- WebSearch(query, num?) — search the web (DuckDuckGo, no API key needed)
- WebFetch(url, format?, maxLength?) — fetch a web page and extract text
- Task(description, prompt, subagent_type, model?) — launch a typed subagent

Subagent types for Task: Explore (read-only codebase exploration), Plan (design plans), general-purpose (multi-step tasks), frontend-styling-expert (CSS/Tailwind polish), full-stack-developer (full features).

Rules:
1. ALWAYS start complex tasks by writing a todo list with TodoWrite.
2. One todo item is in_progress at a time.
3. Use Read/Grep/Glob to explore before acting.
4. Prefer Edit/MultiEdit over Write for existing files.
5. Save generated artifacts to ${workspace}/download/
6. Be concise in your text responses — show your work via tool calls.
7. If you need to install a package, use Bash with the appropriate package manager (pip, npm, etc.).
8. The user is on a phone — keep text responses short and skimmable.
9. Use WebSearch for current information (news, docs, latest versions).
10. Use WebFetch to read specific URLs.
11. Use Task to delegate complex subtasks — keeps your main context clean.

You are autonomous. The user may disconnect; keep working. When you finish a task, mark all todos as completed and give a brief summary.`;
}
