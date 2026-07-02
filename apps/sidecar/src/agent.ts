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
          const result = streamText({
            model,
            messages,
            tools: this.tools,
            maxSteps: 1, // single step per turn — we control the loop
          });

          let textBuffer = '';
          let reasoningBuffer = '';
          const toolCallsStarted = new Set<string>();

          for await (const part of result.fullStream) {
            if (cancelled) break;

            switch (part.type) {
              case 'text-delta':
                textBuffer += part.textDelta;
                this.context.emit({
                  type: 'text_delta',
                  runId,
                  turnId,
                  delta: part.textDelta,
                });
                break;
              case 'reasoning':
                reasoningBuffer += part.textDelta;
                this.context.emit({
                  type: 'reasoning_delta',
                  runId,
                  turnId,
                  delta: part.textDelta,
                });
                break;
              case 'tool-call':
                toolCallsStarted.add(part.toolCallId);
                this.context.emit({
                  type: 'tool_started',
                  runId,
                  turnId,
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  args: part.args,
                  timestamp: Date.now(),
                });
                break;
              case 'tool-call-streaming-start':
                if (!toolCallsStarted.has(part.toolCallId)) {
                  toolCallsStarted.add(part.toolCallId);
                  this.context.emit({
                    type: 'tool_started',
                    runId,
                    turnId,
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    args: {},
                    timestamp: Date.now(),
                  });
                }
                break;
              case 'finish':
                // Vercel AI SDK v4 emits usage as part of 'finish' part.
                if (part.usage) {
                  const u = part.usage as any;
                  this.context.emit({
                    type: 'usage',
                    runId,
                    inputTokens: u.inputTokens ?? 0,
                    outputTokens: u.outputTokens ?? 0,
                    reasoningTokens: u.reasoningTokens,
                  });
                }
                break;
              case 'error':
                this.context.emit({
                  type: 'run_failed',
                  runId,
                  error: part.error instanceof Error ? part.error.message : String(part.error),
                  timestamp: Date.now(),
                });
                return;
            }
          }

          // For tool results, we'd need to look at the messages array after streamText completes.
          // Vercel AI SDK calls tool execute() during the stream — tool_finished events are
          // emitted from within the tool's execute() via agent.context.emit().

          // Append the assistant's response to messages.
          messages.push({ role: 'assistant', content: textBuffer || '(no text)' });

          this.context.emit({
            type: 'turn_finished',
            runId,
            turnId,
            timestamp: Date.now(),
          });

          // If the assistant didn't call any tools, we're done.
          // (Vercel AI SDK's fullStream doesn't have a clean "did the model call a tool?" flag,
          // so we check if there were any tool-call parts.)
          // For simplicity, we end the loop after each turn — the agent can re-prompt if it wants.
          break;
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
  };

  return runtime;
}

function createModel(config: AgentConfig) {
  const provider = config.provider;
  const model = config.model;
  const baseUrl = config.baseUrl;

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
