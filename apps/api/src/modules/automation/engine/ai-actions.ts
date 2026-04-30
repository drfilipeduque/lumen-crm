// Subtypes "ai_*" do action-executor.
//
// Padrão: cada action recebe um `integrationId` + um `outputVar` e devolve
// o valor produzido — o action-executor o joga em `step[nodeId][outputVar]`.

import { generateText } from '../ai/ai.service.js';
import { renderTemplate } from '../ai/prompt-builder.js';
import type { ExecutionContext } from './context.js';

type Cfg = Record<string, unknown>;

function readPrompt(cfg: Cfg, fallbackKey = 'prompt'): string {
  const p = cfg[fallbackKey];
  if (typeof p !== 'string') throw new Error(`ai action: '${fallbackKey}' obrigatório`);
  return p;
}

function readIntegrationId(cfg: Cfg): string {
  const id = cfg.integrationId;
  if (typeof id !== 'string' || !id) throw new Error('ai action: integrationId obrigatório');
  return id;
}

function readOutputVar(cfg: Cfg, fallback = 'output'): string {
  const o = cfg.outputVar;
  return typeof o === 'string' && o ? o : fallback;
}

// Despacha pra um dos subtypes de IA. Retorna `{ [outputVar]: valor }`.
export async function runAIAction(
  subtype: string,
  cfg: Cfg,
  ctx: ExecutionContext,
): Promise<Record<string, unknown>> {
  const integrationId = readIntegrationId(cfg);
  const outputVar = readOutputVar(cfg);
  const model = cfg.model as string | undefined;
  const temperature = cfg.temperature as number | undefined;
  const maxTokens = cfg.maxTokens as number | undefined;

  switch (subtype) {
    case 'ai_generate': {
      const prompt = renderTemplate(readPrompt(cfg), ctx as unknown as Record<string, unknown>);
      const r = await generateText(integrationId, { prompt, model, temperature, maxTokens });
      return { [outputVar]: r.text, _model: r.model, _inputTokens: r.inputTokens, _outputTokens: r.outputTokens };
    }

    case 'ai_classify': {
      const input = renderTemplate(String(cfg.input ?? ''), ctx as unknown as Record<string, unknown>);
      const categories = (cfg.categories as string[] | undefined) ?? [];
      if (categories.length === 0) throw new Error('ai_classify: categories obrigatório');
      const prompt = [
        'Você é um classificador. Responda APENAS com uma das categorias abaixo, sem explicação.',
        `Categorias: ${categories.join(', ')}.`,
        '',
        `Texto: ${input}`,
        '',
        'Categoria:',
      ].join('\n');
      const r = await generateText(integrationId, {
        prompt,
        model,
        temperature: temperature ?? 0,
        maxTokens: maxTokens ?? 16,
      });
      // Normaliza: pega a primeira categoria do retorno que confere (case-insensitive).
      const txt = r.text.trim().toLowerCase();
      const matched = categories.find((c) => txt.startsWith(c.toLowerCase())) ?? r.text.trim();
      return { [outputVar]: matched, _raw: r.text };
    }

    case 'ai_summarize': {
      const input = renderTemplate(String(cfg.input ?? ''), ctx as unknown as Record<string, unknown>);
      const maxLength = (cfg.maxLength as number | undefined) ?? 280;
      const prompt = `Resuma o texto abaixo em até ${maxLength} caracteres, em PT-BR, mantendo nomes próprios.\n\n${input}`;
      const r = await generateText(integrationId, { prompt, model, temperature: temperature ?? 0.2, maxTokens });
      return { [outputVar]: r.text.trim() };
    }

    case 'ai_extract': {
      const input = renderTemplate(String(cfg.input ?? ''), ctx as unknown as Record<string, unknown>);
      const schema = (cfg.schema as Record<string, string> | undefined) ?? {};
      const fields = Object.entries(schema)
        .map(([k, t]) => `- ${k}: ${t}`)
        .join('\n');
      const prompt = [
        'Extraia os campos abaixo do texto e retorne APENAS um JSON válido (sem markdown, sem comentário).',
        'Se um campo não estiver presente, use null.',
        '',
        'Campos:',
        fields,
        '',
        'Texto:',
        input,
        '',
        'JSON:',
      ].join('\n');
      const r = await generateText(integrationId, {
        prompt,
        model,
        temperature: temperature ?? 0,
        maxTokens: maxTokens ?? 512,
      });
      let parsed: unknown = null;
      // Tolera respostas com cerca tripla de markdown.
      const cleaned = r.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { _parseError: true, raw: r.text };
      }
      return { [outputVar]: parsed };
    }

    default:
      throw new Error(`ai action subtype desconhecido: ${subtype}`);
  }
}
