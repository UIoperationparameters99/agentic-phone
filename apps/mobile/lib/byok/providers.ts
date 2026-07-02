/**
 * Re-export provider configs from shared-types, plus mobile-specific helpers.
 */

export {
  LLM_PROVIDERS,
  SANDBOX_PROVIDERS,
  type LlmProviderConfig,
  type SandboxProviderConfig,
  type LlmProviderId,
  type SandboxProviderId,
  type ByokConfig,
} from '@agentic/shared-types';

import { LLM_PROVIDERS } from '@agentic/shared-types';

/** Get the env vars to pass to the sandbox at spawn time. */
export function envVarsForConfig(config: {
  llm: {
    provider: keyof typeof LLM_PROVIDERS;
    apiKey: string;
    model?: string;
    baseUrl?: string;
  };
  sandbox: { apiKey: string };
}): Record<string, string> {
  const llmProvider = LLM_PROVIDERS[config.llm.provider];
  const env: Record<string, string> = {
    [llmProvider.envVar]: config.llm.apiKey,
    // Tell the sidecar which provider + model to use.
    AGENTIC_LLM_PROVIDER: llmProvider.id,
    AGENTIC_LLM_MODEL: config.llm.model ?? llmProvider.defaultModel,
    // User's baseUrl override wins (for 'custom' provider); else fall back to provider default.
    AGENTIC_LLM_BASE_URL: config.llm.baseUrl?.trim() || llmProvider.baseUrl,
  };
  return env;
}
