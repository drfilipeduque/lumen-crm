// Provider Claude via Anthropic Messages API.
// Usa fetch nativo (sem SDK) pra evitar dep extra.

import {
  AIProviderError,
  type AIProviderClient,
  type GenerateTextParams,
  type GenerateTextResult,
  type ValidateKeyResult,
} from './provider.interface.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export const CLAUDE_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
] as const;
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';

type ClaudeResponse = {
  id: string;
  model: string;
  content: { type: string; text: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

type ClaudeError = {
  error?: { type?: string; message?: string };
};

async function call(params: GenerateTextParams): Promise<ClaudeResponse> {
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens ?? 1024,
    messages: [{ role: 'user', content: params.prompt }],
  };
  if (params.system) body.system = params.system;
  if (params.temperature !== undefined) body.temperature = params.temperature;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': params.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as ClaudeError;
    const msg = errBody.error?.message ?? `Claude HTTP ${res.status}`;
    // 408/429/5xx são retryable; 4xx restantes não.
    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    throw new AIProviderError(msg, res.status, retryable);
  }
  return (await res.json()) as ClaudeResponse;
}

export const claudeProvider: AIProviderClient = {
  async generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
    const r = await call(params);
    const text = r.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');
    return {
      text,
      model: r.model,
      inputTokens: r.usage?.input_tokens,
      outputTokens: r.usage?.output_tokens,
    };
  },

  async validateKey(apiKey: string, model: string): Promise<ValidateKeyResult> {
    try {
      await call({ apiKey, model, prompt: 'ping', maxTokens: 8 });
      return { ok: true };
    } catch (e) {
      if (e instanceof AIProviderError) return { ok: false, error: e.message };
      return { ok: false, error: (e as Error).message };
    }
  },
};
