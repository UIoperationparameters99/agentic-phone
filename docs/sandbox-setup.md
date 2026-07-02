# Sandbox Setup — Daytona for End Users

This guide is for end users of `agentic-phone`. It walks through signing up for Daytona (free, no credit card required) and getting an API key to paste into the app.

## Step 1 — Sign up for Daytona

1. Go to **https://app.daytona.io/signup**
2. Sign up with **Google** or **GitHub** OAuth (fastest), or email + password
3. Verify your email (check inbox, click the link)
4. **You're in.** No credit card required at any point.

You'll see **$100 in free credit** in your dashboard. This is enough for ~990 hours of sandbox time at the default 1 vCPU / 1 GB RAM config — roughly 40 days of continuous use, or much longer if you pause sandboxes when not actively using them.

## Step 2 — Generate an API key

1. In the Daytona dashboard, go to **Settings → API Keys** (or click your avatar → API Keys)
2. Click **"Generate new key"**
3. Name it `agentic-phone` (or whatever you like)
4. Copy the key — it looks like `dtn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
5. **Store it securely.** You'll paste it into the agentic-phone app. You won't be able to see it again after closing the dialog.

## Step 3 — Paste into agentic-phone

1. Open agentic-phone on your Android device
2. Go to **Settings → BYOK**
3. Under **Sandbox provider**, select **Daytona**
4. Paste your Daytona API key
5. Under **LLM provider**, select your provider (OpenAI / Anthropic / Google / OpenRouter / Z.AI) and paste that key too
6. Tap **Test connection** — the app will spawn a tiny test sandbox, run `echo hello`, and tear it down. Should take ~2 seconds.
7. You're ready. Tap **Start session** to begin.

## How credit burn works

- **Running sandbox** — burns credit at ~$0.10/hour (1 vCPU / 1 GB RAM config)
- **Paused sandbox** — burns nothing (state is preserved via snapshot)
- **Destroyed sandbox** — burns nothing, but state is lost unless you saved it

**Tips to make $100 last:**
- Tap **Pause** when you step away (sandbox freezes, no burn)
- Tap **End session** when you're done for the day (sandbox destroyed, workspace saved as snapshot)
- Long-running agent tasks (e.g., "build me a web app") — let them run, but check in periodically

## Auto-stop

Daytona auto-stops idle sandboxes after 15 minutes by default. In agentic-phone, we set this to **0 (indefinite)** for active sessions, so your agent can run long tasks without dying. If you walk away for >15 min without pausing, the sandbox will auto-stop — but a snapshot is saved, so tap **Resume** to pick up where you left off.

## Troubleshooting

**"401 Unauthorized"** — your API key is wrong or expired. Generate a new one in Daytona dashboard.

**"402 Payment Required"** — you've burned through your $100 free credit. Either add a credit card (unlocks another $100 free + recurring paid) or wait — Daytona sometimes refreshes free credit for active accounts.

**"Sandbox failed to start"** — check your internet connection. If you're on a corporate network, port 443 (HTTPS) must be open. The WS connection to the sandbox preview URL uses port 443 too.

**"Cold start is slow"** — first sandbox of the day takes ~5 seconds (Daytona warms up). Subsequent sandboxes in the same hour take <1 second.

## Privacy

- Your LLM API key is stored in Android Keystore on your device (hardware-backed where available)
- When you start a session, the key is passed to your Daytona sandbox as an environment variable
- The sandbox uses the key to call the LLM provider directly
- When you end the session, the sandbox is destroyed — the env var (and your key) are wiped
- The agentic-phone project maintainers never see your keys
- Daytona sees that you're spawning sandboxes but doesn't see your LLM key (it's in the env, which Daytona doesn't log)
