// Interface uniforme entre Claude/OpenAI/etc.
// Cada provider implementa generateText e validateKey.

export type GenerateTextParams = {
  apiKey: string;
  model: string;
  prompt: string;
  // Mensagem de sistema opcional (orientação/persona).
  system?: string;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateTextResult = {
  text: string;
  // Tokens consumidos (quando o provider devolve). Útil pra observabilidade.
  inputTokens?: number;
  outputTokens?: number;
  // Modelo de fato usado (alguns providers fazem aliasing).
  model: string;
};

export type ValidateKeyResult = {
  ok: boolean;
  error?: string;
};

export interface AIProviderClient {
  generateText(params: GenerateTextParams): Promise<GenerateTextResult>;
  // Faz uma chamada barata pra confirmar que a key é válida.
  validateKey(apiKey: string, model: string): Promise<ValidateKeyResult>;
}

// Erro padronizado pra retry/backoff no service.
export class AIProviderError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}
