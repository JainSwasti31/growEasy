import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// Minimal provider interface used across the extraction pipeline.
export interface AiProvider {
  chat(systemPrompt: string, userMessage: string): Promise<string>;
  readonly name: string;
}

// ── Known providers — used for startup validation ─────────────────────────────

export const KNOWN_PROVIDERS = ['gemini', 'openai', 'anthropic'] as const;
export type ProviderName = (typeof KNOWN_PROVIDERS)[number];

/**
 * Validate AI_PROVIDER at server startup. Throws immediately with a clear
 * message if misconfigured so the error surfaces before the first request.
 */
export function validateProviderConfig(): void {
  const provider = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase();

  if (!KNOWN_PROVIDERS.includes(provider as ProviderName)) {
    throw new Error(
      `[aiProviders] Unknown AI_PROVIDER="${provider}". ` +
        `Valid values: ${KNOWN_PROVIDERS.join(', ')}`
    );
  }

  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    throw new Error(
      '[aiProviders] AI_PROVIDER=gemini but GEMINI_API_KEY is not set.'
    );
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error(
      '[aiProviders] AI_PROVIDER=openai but OPENAI_API_KEY is not set.'
    );
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      '[aiProviders] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.'
    );
  }

  console.log(`[aiProviders] Provider validated: ${provider}`);
}

// ── Gemini ────────────────────────────────────────────────────────────────────

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI;
  private modelName: string;

  constructor(apiKey: string, model = 'gemini-flash-latest') {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = model;
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      });
      const text = response.text ?? '';
      if (!text) throw new Error('Gemini returned an empty response');
      return text;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Gemini request timed out after 90 seconds');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

/**
 * Fully implemented OpenAI provider using structured output (json_schema).
 *
 * Uses the response_format json_schema feature (available on gpt-4o and
 * gpt-4o-mini) which guarantees the model returns valid JSON conforming to
 * the schema — equivalent to Gemini's responseMimeType: 'application/json'.
 */
export class OpenAIProvider implements AiProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private modelName: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.modelName = model;
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const text = response.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('OpenAI returned an empty response');

    if (response.usage) {
      console.log(
        `[openai] tokens — prompt: ${response.usage.prompt_tokens}, ` +
          `completion: ${response.usage.completion_tokens}, ` +
          `total: ${response.usage.total_tokens}`
      );
    }

    return text;
  }
}

// ── Anthropic (stub — clear typed error) ──────────────────────────────────────

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_apiKey: string, _model = 'claude-3-5-haiku-20241022') {
    // Not yet implemented. To implement:
    // import Anthropic from '@anthropic-ai/sdk';
    // this.client = new Anthropic({ apiKey });
    // Use client.messages.create() with a JSON-requesting system prompt.
    // Claude doesn't have native JSON mode; add "Respond ONLY with JSON." to prompt.
  }

  async chat(_systemPrompt: string, _userMessage: string): Promise<string> {
    throw new Error(
      '[AnthropicProvider] Not yet implemented. Set AI_PROVIDER=gemini or AI_PROVIDER=openai.'
    );
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase() as ProviderName;

  if (provider === 'gemini') return new GeminiProvider(process.env.GEMINI_API_KEY!);
  if (provider === 'openai') return new OpenAIProvider(process.env.OPENAI_API_KEY!);
  if (provider === 'anthropic') return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);

  throw new Error(`[aiProviders] Unknown provider: "${provider}"`);
}
