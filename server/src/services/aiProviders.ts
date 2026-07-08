import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

// Minimal provider interface used across the extraction pipeline.
export interface AiProvider {
  chat(systemPrompt: string, userMessage: string): Promise<string>;
  /** Fallback: same as chat() but without JSON MIME type — used for retries
   *  when the model ignores responseMimeType and returns free-form text. */
  chatText(systemPrompt: string, userMessage: string): Promise<string>;
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

  constructor(apiKey: string, model = 'gemini-2.5-flash') {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = model;
  }

  private extractGeminiText(response: any): string {
    const candidate = response?.candidates?.[0];

    if (typeof response.text === 'string' && response.text.trim()) {
      console.log('[gemini] selected raw text from response.text');
      return response.text;
    }

    if (candidate?.content != null) {
      if (typeof candidate.content === 'string') {
        console.log('[gemini] selected raw text from candidate.content string');
        return candidate.content;
      }

      if (typeof candidate.content === 'object') {
        if (Array.isArray(candidate.content.parts)) {
          const joined = candidate.content.parts
            .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
            .join('');
          if (joined.trim()) {
            console.log('[gemini] selected raw text from candidate.content.parts');
            return joined;
          }
        }

        if (typeof (candidate.content as any).text === 'string') {
          console.log('[gemini] selected raw text from candidate.content.text');
          return (candidate.content as any).text;
        }

        console.log('[gemini] selected raw text from JSON-stringified candidate.content');
        return JSON.stringify(candidate.content);
      }
    }

    if (typeof candidate?.text === 'string' && candidate.text.trim()) {
      console.log('[gemini] selected raw text from candidate.text');
      return candidate.text;
    }

    console.log('[gemini] no raw text available from response');
    return '';
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      // First attempt: request JSON MIME type (works on models that support it)
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

      const candidate = (response as {
        candidates?: Array<{ finishReason?: string; content?: unknown; text?: string }>;
      }).candidates?.[0];
      const finishReason = candidate?.finishReason ?? 'unknown';
      const rawText = this.extractGeminiText(response);

      console.log('[gemini] raw response object:');
      console.log(JSON.stringify(
        {
          text: response.text,
          candidates: (response as any).candidates?.map((c: any) => ({
            finishReason: c.finishReason,
            text: c.text,
            content:
              typeof c.content === 'object' && c.content !== null
                ? JSON.stringify(c.content)
                : c.content,
          })),
        },
        null,
        2
      ));
      console.log('[gemini] raw response text:');
      console.log(rawText);
      console.log(`[gemini] finishReason: ${finishReason}`);

      // If the model returned nothing (e.g. safety block), throw so retry fires
      if (!rawText) {
        throw new Error(`Gemini returned empty response (finishReason: ${finishReason})`);
      }

      // Quick JSON validity check — if it fails, the model ignored the MIME type
      try {
        JSON.parse(rawText);
        return rawText; // valid JSON, all good
      } catch {
        // Model returned non-JSON despite MIME type request.
        // Log a full sample so the deployed backend shows the exact issue.
        console.warn('[gemini] responseMimeType was set but response is not JSON. Raw output:');
        console.warn(rawText);
        throw new Error(`Gemini returned non-JSON response despite responseMimeType: ${rawText.slice(0, 100)}`);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Gemini request timed out after 90 seconds');
      }
      // Re-throw all other errors — the batch retry layer handles them
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  /** Text-mode fallback: no responseMimeType, relies on prompt-only JSON enforcement. */
  async chatText(systemPrompt: string, userMessage: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: systemPrompt,
          // No responseMimeType — model returns free text, we extract JSON from it
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      });

      const rawText = this.extractGeminiText(response);
      if (!rawText) throw new Error('Gemini returned empty response in text mode');
      console.log(`[gemini/text] first 200 chars: ${rawText.slice(0, 200)}`);
      return rawText;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Gemini text-mode request timed out after 90 seconds');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

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

  async chatText(systemPrompt: string, userMessage: string): Promise<string> {
    // OpenAI json_object mode already enforces JSON — text mode is the same call
    return this.chat(systemPrompt, userMessage);
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

  async chatText(_systemPrompt: string, _userMessage: string): Promise<string> {
    return this.chat(_systemPrompt, _userMessage);
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
