/**
 * BYOK config types — what the user pastes into the app.
 *
 * Stored in Android Keystore via `capacitor-secure-storage-plugin`.
 * See: docs/byok-transport.md
 */

export type LlmProviderId =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'openrouter'
  | 'zai'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'custom';

export interface LlmProviderConfig {
  id: LlmProviderId;
  label: string;
  /** Env var name the sidecar reads to call this provider. */
  envVar: string;
  /** Default model id (user can override). */
  defaultModel: string;
  /** URL to fetch the list of models, if any. */
  modelsUrl?: string;
  /** Auth header format. */
  authHeader: (apiKey: string) => Record<string, string>;
  /** Base URL for API calls. */
  baseUrl: string;
  /** Where to get an API key. */
  keyUrl: string;
  /** Free tier info (for the BYOK config screen). */
  freeTierNote?: string;
}

export const LLM_PROVIDERS: Record<LlmProviderId, LlmProviderConfig> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    baseUrl: 'https://api.openai.com/v1',
    modelsUrl: 'https://api.openai.com/v1/models',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    keyUrl: 'https://platform.openai.com/api-keys',
    freeTierNote: 'No free tier — pay as you go. GPT-4o-mini is cheapest.',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-3-5-sonnet-20241022',
    baseUrl: 'https://api.anthropic.com/v1',
    authHeader: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
    keyUrl: 'https://console.anthropic.com/settings/keys',
    freeTierNote: '$5 free credit on signup.',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    envVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
    defaultModel: 'gemini-1.5-pro',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelsUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    authHeader: (k) => ({ 'x-goog-api-key': k }),
    keyUrl: 'https://aistudio.google.com/app/apikey',
    freeTierNote: 'Generous free tier — Gemini 1.5 Flash is free up to 15 RPM.',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    envVar: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    keyUrl: 'https://openrouter.ai/keys',
    freeTierNote: 'Some models have free variants (look for ":free" suffix).',
  },
  zai: {
    id: 'zai',
    label: 'Z.AI (GLM)',
    envVar: 'ZAI_API_KEY',
    defaultModel: 'glm-4.5',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelsUrl: 'https://open.bigmodel.cn/api/paas/v4/models',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    freeTierNote: 'GLM-4-Flash is free. GLM-4.5 has free tier with rate limits.',
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    envVar: 'MISTRAL_API_KEY',
    defaultModel: 'mistral-large-latest',
    baseUrl: 'https://api.mistral.ai/v1',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    keyUrl: 'https://console.mistral.ai/api-keys',
    freeTierNote: 'Free tier with rate limits on small models.',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    envVar: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    keyUrl: 'https://console.groq.com/keys',
    freeTierNote: 'Generous free tier — very fast inference.',
  },
  together: {
    id: 'together',
    label: 'Together AI',
    envVar: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    baseUrl: 'https://api.together.xyz/v1',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    keyUrl: 'https://api.together.xyz/settings/api-keys',
    freeTierNote: '$5 free credit on signup.',
  },
  fireworks: {
    id: 'fireworks',
    label: 'Fireworks AI',
    envVar: 'FIREWORKS_API_KEY',
    defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    keyUrl: 'https://fireworks.ai/api-keys',
    freeTierNote: 'Free tier with rate limits.',
  },
  custom: {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    envVar: 'CUSTOM_LLM_API_KEY',
    defaultModel: '',
    baseUrl: '',
    authHeader: (k) => ({ Authorization: `Bearer ${k}` }),
    keyUrl: '',
    freeTierNote: 'Any OpenAI-compatible endpoint (e.g., LM Studio, Ollama, vLLM).',
  },
};

export type SandboxProviderId = 'daytona';

export interface SandboxProviderConfig {
  id: SandboxProviderId;
  label: string;
  envVar: string;
  baseUrl: string;
  keyUrl: string;
  freeTierNote?: string;
}

export const SANDBOX_PROVIDERS: Record<SandboxProviderId, SandboxProviderConfig> = {
  daytona: {
    id: 'daytona',
    label: 'Daytona',
    envVar: 'DAYTONA_API_KEY',
    baseUrl: 'https://app.daytona.io/api',
    keyUrl: 'https://app.daytona.io/dashboard/api-keys',
    freeTierNote: '$100 free credit, no credit card required (email verification only).',
  },
};

export interface ByokConfig {
  llm: {
    provider: LlmProviderId;
    apiKey: string;
    model?: string; // override default
  };
  sandbox: {
    provider: SandboxProviderId;
    apiKey: string;
  };
}
