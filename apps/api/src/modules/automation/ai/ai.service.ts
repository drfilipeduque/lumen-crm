// Service unificado de IA.
// - decifra apiKey só na hora de chamar (nunca cacheia em memória plana)
// - retry com backoff exponencial em erros 429/5xx (max 3 tentativas)
// - incrementa usageCount + lastUsedAt depois de cada chamada bem-sucedida
// - loga tokens usados pra futuro billing/observabilidade

import { prisma } from '../../../lib/prisma.js';
import { decrypt } from '../../../lib/crypto.js';
import { claudeProvider, DEFAULT_CLAUDE_MODEL } from './providers/claude.provider.js';
import { openaiProvider, DEFAULT_OPENAI_MODEL } from './providers/openai.provider.js';
import {
  AIProviderError,
  type AIProviderClient,
  type GenerateTextParams,
  type GenerateTextResult,
  type ValidateKeyResult,
} from './providers/provider.interface.js';

export class AIServiceError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function pickProvider(provider: 'CLAUDE' | 'OPENAI'): AIProviderClient {
  if (provider === 'CLAUDE') return claudeProvider;
  if (provider === 'OPENAI') return openaiProvider;
  throw new AIServiceError('PROVIDER_UNKNOWN', `Provider desconhecido: ${provider}`);
}

export function defaultModelFor(provider: 'CLAUDE' | 'OPENAI'): string {
  return provider === 'CLAUDE' ? DEFAULT_CLAUDE_MODEL : DEFAULT_OPENAI_MODEL;
}

const MAX_RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>, log?: (m: string) => void): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof AIProviderError && e.retryable;
      if (!retryable || attempt === MAX_RETRIES - 1) throw e;
      // Backoff exponencial com jitter: 500ms, 1500ms, ...
      const delay = 500 * 2 ** attempt + Math.floor(Math.random() * 200);
      log?.(`AI retry attempt=${attempt + 1} delay=${delay}ms err=${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export type GenerateOpts = {
  // Prompt já com variáveis substituídas (use prompt-builder antes).
  prompt: string;
  system?: string;
  // Override do modelo padrão da integração.
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

// Chamada principal: localiza integração, decifra key, chama provider, atualiza stats.
export async function generateText(integrationId: string, opts: GenerateOpts): Promise<GenerateTextResult> {
  const integ = await prisma.aIIntegration.findUnique({ where: { id: integrationId } });
  if (!integ) throw new AIServiceError('NOT_FOUND', 'Integração não encontrada', 404);
  if (!integ.active) throw new AIServiceError('INACTIVE', 'Integração desativada', 400);

  const apiKey = decrypt(integ.apiKey);
  const provider = pickProvider(integ.provider);
  const model = opts.model ?? integ.defaultModel ?? defaultModelFor(integ.provider);

  const params: GenerateTextParams = {
    apiKey,
    model,
    prompt: opts.prompt,
    system: opts.system,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
  };

  const result = await withRetry(() => provider.generateText(params));

  // Stats — não bloqueante: erro aqui não derruba a chamada de IA.
  await prisma.aIIntegration
    .update({
      where: { id: integrationId },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    })
    .catch(() => {});

  return result;
}

// Testa uma key sem persistir (usada no botão "testar conexão" ANTES de salvar).
export async function testKey(provider: 'CLAUDE' | 'OPENAI', apiKey: string, model: string): Promise<ValidateKeyResult> {
  const p = pickProvider(provider);
  return p.validateKey(apiKey, model);
}

// Testa uma integração já existente (botão Testar no card).
export async function testIntegration(
  integrationId: string,
  prompt = 'Responda apenas: OK',
): Promise<{ ok: true; result: GenerateTextResult } | { ok: false; error: string }> {
  try {
    const r = await generateText(integrationId, { prompt, maxTokens: 32 });
    return { ok: true, result: r };
  } catch (e) {
    if (e instanceof AIProviderError) return { ok: false, error: e.message };
    if (e instanceof AIServiceError) return { ok: false, error: e.message };
    return { ok: false, error: (e as Error).message };
  }
}
