# Architecture

> The full design doc for `agentic-phone` — a BYOK AI agentic workspace for Android, cloning z.ai agentic mode.

## Goals

1. **Faithful clone of z.ai agentic mode** — chat UI + tool-call cards + workspace browser + skill picker + todo panel, all on a phone.
2. **BYOK** — user supplies their own LLM API keys (OpenAI, Anthropic, Google, OpenRouter, Z.AI).
3. **AI has its own computer** — a real Linux sandbox in the cloud where the agent runs bash, reads/writes files, executes code, and persists a workspace.
4. **Free, no credit card** — both the LLM side (BYOK) and the sandbox side (Daytona free tier, $100 credit, email-only verification).
5. **Smooth APK** — installable on Android, feels native, not janky.
6. **Background autonomy** — mobile can disconnect mid-agent-run; the sandbox keeps working.

## Non-goals (for v1)

- iOS (Phase 4 — Capacitor gives it to us for free, but Android-first)
- Multi-user / SaaS — this is a personal BYOK app, no auth backend
- On-device model inference — agent runs in cloud sandbox, calls hosted LLMs

## The three layers

### Layer 1 — Mobile shell (`apps/mobile`)

**Stack:** Next.js 16 (App Router, static export) + React 19 + Tailwind CSS 4 + shadcn/ui + Capacitor 8.

**Why static export?** Capacitor wraps a static bundle in a native Android container. Server features (API routes, RSC) don't work in the APK — but we don't need them, because the agent runs in the cloud sandbox, not in a Next.js server.

**Why Capacitor over React Native / Tauri?**
- Capacitor 8 is the mature, stable mobile wrapper for web apps in 2026.
- It exposes native plugins — critically `capacitor-secure-storage-plugin` (Android Keystore) and `@capacitor-community/http` (native HTTP, no CORS).
- React Native would force us to rebuild the entire agentic UI from scratch (LobeChat, Cline's web UI, etc. are all React-web).
- Tauri Mobile is stable but has a smaller plugin ecosystem and a Rust backend that doesn't fit our TS-heavy stack.

**Mobile responsibilities:**
1. Render chat transcript + streaming tokens
2. Render tool-call cards (collapsible per-call: bash command + output, file diff, web search results)
3. File browser rooted at the sandbox workspace
4. Skill picker (`@skill-name` mention or tap-to-invoke)
5. Todo panel synced to the agent's TodoWrite state
6. BYOK config screen (LLM provider + key + Daytona key, all in Keystore)
7. Sandbox lifecycle: spawn / pause / resume / destroy via Daytona REST API (Capacitor HTTP plugin, native layer, no CORS)
8. WebSocket client → sandbox preview URL (event stream)

**What the mobile does NOT do:**
- Run agent bash (that's the sandbox's job)
- Store LLM keys in localStorage (uses Keystore via `capacitor-secure-storage-plugin`)
- Call LLMs directly (keys are passed to sandbox at spawn; sandbox calls LLM)

### Layer 2 — Cloud sandbox (`Daytona`, BYOS)

**What:** A real Linux box in the cloud. The agent's "computer." Per-user, isolated, ephemeral-but-resumable.

**Why Daytona (verified July 2026):**
- **No credit card required at signup** — $100 free credit with email verification only. This is fundamentally different from E2B, which now requires a $5 verification payment.
- **Real REST API + SDK** — Python, TypeScript, Ruby, Go, Java + CLI. `POST /sandbox` to spawn, full lifecycle management.
- **~90ms cold start** — fastest of any CC-free option (vs GitHub Codespaces' minutes-scale cold start).
- **Computer Use / VNC** — `sandbox.computerUse.start()` gives programmatic mouse/keyboard/screenshot, identical capability to Claude Computer Use.
- **PTY, snapshots, volumes, pause/resume, Git** — full workstation features.
- **Outbound internet on by default** — `pip install`, `curl`, `git clone` all work.
- **ToS explicitly allows AI agents** — §3: "managed runtime that allows AI models, agents, and human developers to execute code."
- **Auto-stop configurable to 0 (indefinite)** — agent can run long tasks without the sandbox dying.

**Why BYOS (Bring Your Own Sandbox)?** Mirror the BYOK pattern. Each user signs up for their own Daytona account, pastes their Daytona API key into the app. You carry $0 sandbox infrastructure cost — every user burns their own $100 free credit. Same UX model as BYOK.

**Honest caveats:**
- $100 credit is one-time, not monthly. For longer work, use snapshots + pause/resume (paused sandboxes don't burn compute).
- Daytona OSS repo went private June 2026 — the managed cloud service is unaffected and active.
- Container isolation by default (not microVM) — use the "Linux VM" sandbox type for untrusted code paths.

### Layer 3 — Agent brain (`apps/sidecar` running `@cline/sdk`)

**What:** The agentic loop — receives user prompts, calls tools (bash, file ops, web search), streams events back to mobile.

**Stack:** Bun + `@cline/sdk` (Apache-2.0, npm dep, v0.0.54) + WebSocket server.

**Why `@cline/sdk` and not build fresh?**
- Cline has been refactored into a decoupled monorepo SDK. VSCode coupling is 2/10 (one JSDoc comment, no actual imports).
- Already ships a Next.js+Bun+WS reference sidecar at `apps/examples/desktop-app/sidecar/` — we copy this as our template.
- Uses Vercel AI SDK under the hood (`ai@^6` + `@ai-sdk/*` providers) — same primitives we'd build fresh with, but already wired.
- **`ZAI="zai"` is a first-class provider id** (with `glm-thinking` routing) — direct alignment with cloning z.ai.
- Tool-event protocol is documented and reusable: 14-variant `AgentRuntimeEvent` union (`text-delta`, `tool-started`, `tool-updated`, `tool-finished`, `usage`, `turn-finished`, `run-finished`, etc.).
- BYOK approval flow already built (`tool_approval_state` event + `respond_tool_approval` command).
- Apache-2.0, no CLA, no commercial restrictions (just rebrand — don't call it "Cline").

**Estimated effort saved:** ~1-2 weeks to first streaming event on device vs ~3-6 weeks building fresh.

**Sidecar responsibilities:**
1. Start a WebSocket server on the sandbox's preview URL
2. Accept mobile client connections
3. Receive user prompts + tool approvals
4. Run the @cline/sdk AgentRuntime with user's LLM key (env var)
5. Stream events back to mobile (text deltas, tool calls, tool outputs, todos)
6. Persist workspace state via Daytona snapshots + git

**Tool surface (mirrors z.ai's stable core):**
- `Bash` — persistent session, 600s timeout
- `Read`, `Write`, `Edit`, `MultiEdit` — file ops
- `Grep` (ripgrep), `Glob`, `LS` — search/list
- `TodoWrite` / `TodoRead` — persists to `~/TODO` JSON
- `Skill` — loads `SKILL.md` into context (z.ai's extensibility pattern)
- (Phase 3) `WebSearch`, `WebFetch` — via the LLM provider's tools or a fallback
- (Phase 3) Subagent launch — typed Explore/Plan/general-purpose

## The event protocol

Mobile and sidecar communicate over a single WebSocket using `@cline/sdk`'s event protocol. Three layers:

1. **`AgentRuntimeEvent`** — 14-variant union emitted by the agent loop. Mobile renders each variant with its own UI component.
2. **`CoreSessionEvent`** — host-stream envelope (run/turn lifecycle).
3. **WS envelope** — `{command, response, event}` JSON-over-WebSocket. Already shipping in Cline's desktop-app sidecar.

Event variants (the ones mobile cares about):
- `run_started` / `run_finished` / `run_failed` — top-level lifecycle
- `turn_started` / `turn_finished` — per-turn lifecycle
- `text_delta` — streaming token output
- `reasoning_delta` — reasoning tokens (Claude/o1-style)
- `tool_started` / `tool_updated` / `tool_finished` — tool-call cards
- `usage` — token counts + cost
- `tool_approval_state` — BYOK approval flow

## BYOK transport — Option B

**Decision:** LLM keys are passed from the mobile Keystore to the sandbox as environment variables at spawn time. The agent (running inside the sandbox) calls the LLM directly. Mobile can disconnect mid-agent-run.

**Why Option B over Option A (mobile relays each LLM call)?**
- Simpler architecture — no double-hop
- Mobile can disconnect mid-agent-run (true background autonomy)
- Faster streaming (single hop from sandbox to LLM)
- Sandbox is per-user, isolated, ephemeral
- User said they're not a privacy purist — "idk, you decide"

**Key lifecycle:**
1. User pastes LLM key into mobile → stored in Android Keystore via `capacitor-secure-storage-plugin`
2. User taps "Start session" → mobile calls Daytona `POST /sandbox` with `env_vars: {OPENAI_API_KEY: ..., ANTHROPIC_API_KEY: ...}`
3. Sandbox boots, sidecar starts, reads keys from env, calls LLM directly
4. Mobile connects WebSocket to sandbox preview URL
5. Session ends → mobile calls Daytona `DELETE /sandbox` → keys are wiped (sandbox destroyed)

**What about Option A?** If a future user wants strictest "keys never leave device," we can add Option A as a "Paranoid mode" toggle in Phase 4.

## Persistence model

Mirrors z.ai's `/home/sync/repo.tar` pattern, but using Daytona primitives:

1. **Workspace tarball** — `~/workspace.tar.gz` snapshot of `/home/z/my-project/` (excluding `node_modules/`, `.git/`, `skills/`)
2. **Skills** — gitignored, re-fetched from a default skill pack on each session (mirror z.ai)
3. **Todo state** — `~/TODO` JSON (in-workspace, so it's in the snapshot)
4. **Git remote** — optional, user can configure a GitHub repo to push to for true cross-device persistence
5. **Daytona snapshots** — for fast pause/resume without re-booting

On session start:
- If a snapshot exists → restore
- Else if a git remote is configured → `git clone`
- Else → fresh workspace

On session end:
- Tar workspace → push to Daytona volume
- If git remote configured → `git push`

## Mobile UX — the 10 elements

Distilled from inspecting z.ai's workspace from the inside:

1. **Streaming chat transcript** with markdown rendering (tables, code blocks, lists)
2. **Collapsible tool-call cards** — tool name + JSON args + truncated output + status badge (▶/✓/✗). Vertical stack on phone.
3. **Workspace file browser** — tree rooted at `my-project/`, tap-to-preview text files
4. **Download affordance** — anything in `download/` surfaces as a tappable chip in-chat + in browser
5. **Upload sheet** — drops files into `upload/`, injects "I uploaded X" into next turn
6. **Skill picker / `@skill-name` mention** — searchable list of installed skills
7. **Todo / plan tracker panel** synced to TodoWrite JSON (one in_progress item, completed struck through)
8. **Expandable bash console** viewer for long installs/builds
9. **Stop / interrupt button** — kill switch for long-running agents
10. **Session resume + history** — list of past sessions, tap to re-hydrate workspace + todo state

## Phases

- **Phase 0** (this commit): scaffold monorepo, architecture docs, package structure
- **Phase 1** (this commit): MVP — BYOK config + chat + tool-call cards + Daytona adapter + @cline/sdk sidecar + WS event stream
- **Phase 2** (this commit): SKILL.md loader + default skill pack + file browser + todo panel + session resume
- **Phase 3** (next): web search/fetch tools, subagent delegation, snapshot persistence
- **Phase 4**: iOS build, Option A BYOK transport (paranoid mode), skill marketplace browser

## References

- z.ai agentic mode inspection report (in conversation)
- Daytona verification: confirmed CC-free, $100 email-only credit, real REST API, Computer Use, ToS allows AI agents
- Cline forkability: `@cline/sdk` v0.0.54, Apache-2.0, decoupled from VSCode, ships Next.js+Bun+WS reference sidecar
