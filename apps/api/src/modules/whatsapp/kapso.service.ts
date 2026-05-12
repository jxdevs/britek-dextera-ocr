import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KapsoService {
  private readonly logger = new Logger(KapsoService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Envía un mensaje de texto al trabajador.
   * El payload exacto a Kapso depende del agente configurado; ajusta
   * `buildBody` cuando tengas los docs.
   */
  async sendText(toPhone: string, body: string): Promise<void> {
    const apiKey = this.config.get<string>('kapso.apiKey');
    const apiUrl = this.config.get<string>('kapso.apiUrl');

    if (!apiKey || !apiUrl) {
      this.logger.log(`[STUB outbound] → ${toPhone}\n${body}`);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(this.buildBody(toPhone, body)),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Kapso outbound ${res.status}: ${text}`);
      }
    } catch (err) {
      this.logger.error('Kapso outbound failed', err as Error);
    }
  }

  private buildBody(toPhone: string, body: string) {
    return {
      to: toPhone,
      type: 'text',
      text: { body },
    };
  }
}
