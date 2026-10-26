import { GoogleGenAI } from '@google/genai';
import { geminiJsonSchema } from './schema';

export interface VerificationModel {
  generate(prompt: string, options?: { timeoutMs?: number }): Promise<string>;
}

export class ModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelConfigurationError';
  }
}

/** Lazy server-side Gemini adapter. No API key is read or required at import time. */
export class GeminiVerificationModel implements VerificationModel {
  async generate(prompt: string, options: { timeoutMs?: number } = {}): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ModelConfigurationError('GEMINI_API_KEY is not configured on the server.');
    }

    const client = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const timeoutMs = options.timeoutMs ?? Number(process.env.CITECHECK_MODEL_TIMEOUT_MS || 20000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: geminiJsonSchema,
          abortSignal: controller.signal,
          temperature: 0,
        },
      });
      const text = response.text;
      if (!text) throw new Error('The model returned no text.');
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }
}
