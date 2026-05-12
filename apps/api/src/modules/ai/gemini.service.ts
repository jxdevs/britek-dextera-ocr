import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { invoiceResponseSchema, extractionPrompt } from './schemas';

export interface ExtractionResult {
  extracted: Record<string, unknown>;
  raw_response: string;
  model: string;
  latency_ms: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost_estimate_usd: number;
}

export interface ExtractionOptions {
  model?: string;
  mimeType: string;
  imageBase64: string;
}

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private client!: GoogleGenAI;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('gemini.apiKey');
    if (!apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY is empty. Set it in apps/api/.env before calling the extraction endpoint.',
      );
    }
    this.client = new GoogleGenAI({ apiKey: apiKey ?? '' });
  }

  async extractInvoice(opts: ExtractionOptions): Promise<ExtractionResult> {
    const model = opts.model ?? this.config.get<string>('gemini.defaultModel')!;
    const started = Date.now();

    const response = await this.callWithRetry(() =>
      this.client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: extractionPrompt },
              {
                inlineData: {
                  mimeType: opts.mimeType,
                  data: opts.imageBase64,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: invoiceResponseSchema,
          temperature: 0.1,
        },
      }),
    );

    const latency_ms = Date.now() - started;
    const raw = response.text ?? '';

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(raw);
    } catch (err) {
      this.logger.error('Gemini returned non-JSON despite schema', err);
      throw new Error('Gemini did not return valid JSON. See raw_response.');
    }

    const usage = response.usageMetadata;
    const tokens = {
      input: usage?.promptTokenCount ?? 0,
      output: usage?.candidatesTokenCount ?? 0,
      total: usage?.totalTokenCount ?? 0,
    };

    const cost_estimate_usd = this.estimateCost(model, tokens.input, tokens.output);

    return {
      extracted,
      raw_response: raw,
      model,
      latency_ms,
      tokens,
      cost_estimate_usd,
    };
  }

  private estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.config.get<Record<string, { input: number; output: number }>>(
      'gemini.pricing',
    );
    const rate = pricing?.[model];
    if (!rate) return 0;
    return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  }

  private async callWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number })?.status;
        if (status && status < 500 && status !== 429) throw err;
        const wait = 500 * 2 ** i;
        this.logger.warn(`Gemini call failed (attempt ${i + 1}/${attempts}). Retrying in ${wait}ms.`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr;
  }
}
