/**
 * Sidecar entry point.
 *
 * Runs inside the Daytona sandbox. Boots a WebSocket server that the mobile
 * app connects to. Receives user prompts, runs the agent loop, streams
 * events back.
 *
 * Bind to 0.0.0.0 so Daytona's preview URL can reach us.
 *
 * Env vars (set by the mobile app at sandbox spawn time):
 *   AGENTIC_LLM_PROVIDER   — 'openai' | 'anthropic' | 'google' | 'openrouter' | 'zai' | ...
 *   AGENTIC_LLM_MODEL      — model id, e.g. 'gpt-4o', 'claude-3-5-sonnet', 'glm-4.5'
 *   AGENTIC_LLM_BASE_URL   — base URL for the provider
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / etc.
 *   AGENTIC_WORKSPACE      — workspace root path (default: /home/daytona/workspace)
 *   PORT                   — WS port (default: 3000)
 */

import { WebSocketServer } from 'ws';
import { createAgent } from './agent.js';
import { registerTools } from './tools/index.js';
import { startSkillLoader } from './skills/loader.js';
import { handleCommand, broadcastEvent } from './transport/protocol.js';
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = '0.0.0.0';
const WORKSPACE = process.env.AGENTIC_WORKSPACE ?? '/home/daytona/workspace';

console.log(`[sidecar] starting on ${HOST}:${PORT}, workspace=${WORKSPACE}`);

// Ensure workspace exists.
import { mkdirSync } from 'node:fs';
mkdirSync(WORKSPACE, { recursive: true });
mkdirSync(`${WORKSPACE}/download`, { recursive: true });
mkdirSync(`${WORKSPACE}/upload`, { recursive: true });
mkdirSync(`${WORKSPACE}/skills`, { recursive: true });

// Create the agent + register tools.
const agent = await createAgent({
  workspace: WORKSPACE,
  provider: process.env.AGENTIC_LLM_PROVIDER ?? 'openai',
  model: process.env.AGENTIC_LLM_MODEL ?? 'gpt-4o',
  baseUrl: process.env.AGENTIC_LLM_BASE_URL,
});
registerTools(agent, { workspace: WORKSPACE });

// Start the skill loader (watches the skills/ directory).
startSkillLoader(`${WORKSPACE}/skills`);

// HTTP server — serves health check + WS upgrade.
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

// WebSocket server — mobile connects here.
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[sidecar] client connected');
  const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Send hello.
  ws.send(JSON.stringify({
    type: 'hello',
    serverId: 'sidecar-1',
    protocolVersion: 1,
    sandboxId: process.env.DAYTONA_SANDBOX_ID ?? 'unknown',
  }));

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      await handleCommand(ws, msg, { agent, workspace: WORKSPACE, clientId });
    } catch (e) {
      console.error('[sidecar] message handler error:', e);
      ws.send(JSON.stringify({
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      }));
    }
  });

  ws.on('close', () => {
    console.log('[sidecar] client disconnected');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[sidecar] listening on http://${HOST}:${PORT}`);
  console.log(`[sidecar] WS endpoint: ws://${HOST}:${PORT}/ws`);
  console.log(`[sidecar] health:     http://${HOST}:${PORT}/health`);
  broadcastEvent({
    type: 'run_started',
    runId: 'sidecar_boot',
    prompt: '(sidecar ready)',
    timestamp: Date.now(),
  });
});

// Graceful shutdown.
process.on('SIGTERM', () => {
  console.log('[sidecar] SIGTERM, shutting down…');
  server.close();
  process.exit(0);
});
