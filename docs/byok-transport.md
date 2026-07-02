# BYOK Transport — Option A vs Option B

## The decision

**v1 ships Option B** (LLM keys → sandbox env vars at spawn). Option A (mobile relays each LLM call) is a Phase 4 "Paranoid mode" toggle.

## Option A — Mobile relays each LLM call

```
Mobile (Keystore) ──► LLM provider ──► Mobile ──► Sandbox (agent loop)
                              ▲
                              └─ streaming tokens
```

**Pros:**
- Strictest "keys never leave device" — LLM key only ever lives in mobile Keystore + transient HTTPS call
- User has 100% audit of every LLM call (could log them)
- Sandbox never sees the key

**Cons:**
- Mobile must stay online during agent runs (kill switch = drop connection)
- Double-hop latency (mobile → LLM → mobile → sandbox)
- Mobile battery drain (mobile is the relay)
- More complex transport (mobile must multiplex LLM streaming + agent events)

**When to use:** A future "Paranoid mode" toggle for users who prioritize key isolation over autonomy.

## Option B — Scoped keys on sandbox (chosen for v1)

```
Mobile (Keystore) ──[keys as env vars at spawn]──► Sandbox ──► LLM provider
                                                       │
                                                       └─ streaming tokens + tool events ──► Mobile (WS)
```

**Pros:**
- Simpler architecture (no double-hop)
- Mobile can disconnect mid-agent-run (true background autonomy — sandbox keeps working)
- Faster streaming (single hop from sandbox to LLM)
- Sandbox is per-user, isolated, ephemeral (Daytona container)
- User said "idk, you decide" — they're not a privacy purist

**Cons:**
- LLM key does leave the device (lives in sandbox env for the session)
- If sandbox is compromised, key is exposed (mitigated by: Daytona container isolation, ephemeral sandboxes, key wiped on destroy)

**When to use:** Default for v1. Right for 95% of users.

## Key lifecycle (Option B)

1. **Onboarding** — user pastes LLM provider + key into mobile
   - Stored in Android Keystore via `capacitor-secure-storage-plugin`
   - Never written to localStorage, AsyncStorage, or plaintext
2. **Session start** — user taps "Start session"
   - Mobile reads keys from Keystore
   - Mobile calls Daytona `POST /sandbox` via Capacitor HTTP plugin (native layer, no CORS)
   - Request body includes `env_vars: {OPENAI_API_KEY: ..., ANTHROPIC_API_KEY: ..., ...}`
   - Sandbox boots, sidecar starts, reads keys from `process.env`
3. **During session** — mobile connects WS to sandbox preview URL
   - Agent loop calls LLM directly using `process.env.OPENAI_API_KEY` etc.
   - Events stream back to mobile over WS
   - Mobile can disconnect — sandbox keeps running (background autonomy)
4. **Session end** — user taps "End session" (or auto-stop kicks in)
   - Mobile calls Daytona `DELETE /sandbox`
   - Sandbox is destroyed — env vars (including keys) are wiped
   - Workspace state is tarred + pushed to a Daytona volume for next session

## Why this is safe enough

- **Daytona container isolation** — each sandbox is a separate container, not a shared namespace
- **Ephemeral** — sandboxes are designed to be created and destroyed; they're not long-lived VMs
- **Per-user** — each user has their own Daytona account; their sandbox is in their own Daytona namespace
- **Key wiped on destroy** — `DELETE /sandbox` removes the container; env vars don't persist
- **Native HTTP** — Capacitor's HTTP plugin makes the Daytona REST call from the native Android layer, so the Daytona API key also never sits in the WebView JS context (no CORS, no XSS exposure)

## Future: Option A as "Paranoid mode"

In Phase 4, we can add a per-session toggle: "Paranoid mode — relay LLM calls through my phone."

Implementation sketch:
- Mobile reads LLM key from Keystore
- Mobile opens WS to sandbox as usual
- Mobile tells sidecar "don't call LLM directly; I'll relay"
- Sidecar emits `llm_request` events (provider, model, messages, tools)
- Mobile intercepts, calls LLM provider via Capacitor HTTP plugin, streams response back as `llm_response` events
- Sidecar feeds response into the agent loop

This adds ~100ms latency per LLM call (mobile relay overhead) but gives strict key isolation.
