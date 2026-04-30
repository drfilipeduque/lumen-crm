// Provider OpenAI via Chat Completions.

import {
  AIProviderError,
  type AIProviderClient,
  type GenerateTextParams,
  type GenerateTextResult,
  type ValidateKeyResult,
} from './provider.interface.js';

const API_URL = 'https://api.openai.com/v1/chat/completions';

export const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini'] as const;
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

type OpenAIResponse = {
  id: string;
  model: string;
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type OpenAIError = {
  error?: { message?: string; code?: string };
};

async function call(params: GenerateTextParams): Promise<OpenAIResponse> {
  const messages: { role: string; content: string }[] = [];
  if (params.system) messages.push({ role: 'system', content: params.system });
  messages.push({ role: 'user', content: params.prompt });

  const body: Record<string, unknown> = {
    model: params.model,
    messages,
  };
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;
  if (params.temperature !== undefined) body.temperature = params.temperature;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as OpenAIError;
    const msg = errBody.error?.message ?? `OpenAI HTTP ${res.status}`;
    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    throw new AIProviderError(msg, res.status, retryable);
  }
  return (await res.json()) as OpenAIResponse;
}

export const openaiProvider: AIProviderClient = {
  async generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
    const r = await call(params);
    const text = r.choices[0]?.message.content ?? '';
    return {
      text,
      model: r.model,
      inputTokens: r.usage?.prompt_tokens,
      outputTokens: r.usage?.completion_tokens,
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
