import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ReplyButton {
  id: string;
  title: string;
}

@Injectable()
export class KapsoService {
  private readonly logger = new Logger(KapsoService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Envía un mensaje de texto al trabajador.
   */
  async sendText(toPhone: string, body: string): Promise<void> {
    const apiKey = this.config.get<string>('kapso.apiKey');
    const phoneNumberId = this.config.get<string>('kapso.phoneNumberId');

    if (!apiKey || !phoneNumberId) {
      this.logger.log(`[STUB outbound text] → ${toPhone}\n${body}`);
      return;
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: toPhone.replace(/^\+/, ''),
      type: 'text',
      text: { body },
    };

    try {
      const url = `https://api.kapso.ai/meta/whatsapp/v24.0/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Kapso outbound ${res.status}: ${text}`);
      }
    } catch (err) {
      this.logger.error('Kapso outbound failed', err as Error);
    }
  }

  /**
   * Envía un mensaje interactivo con botones de respuesta rápida.
   * Usa el API REST de Kapso/Meta (WhatsApp Cloud API).
   */
  async sendInteractiveButtons(
    toPhone: string,
    bodyText: string,
    buttons: ReplyButton[],
    headerText?: string,
  ): Promise<void> {
    const apiKey = this.config.get<string>('kapso.apiKey');
    const phoneNumberId = this.config.get<string>('kapso.phoneNumberId');

    if (!apiKey || !phoneNumberId) {
      this.logger.log(
        `[STUB outbound buttons] → ${toPhone}\n${bodyText}\nButtons: ${buttons.map((b) => b.title).join(' | ')}`,
      );
      return;
    }

    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: toPhone.replace(/^\+/, ''), // Meta API espera sin +
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(headerText
          ? { header: { type: 'text', text: headerText } }
          : {}),
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    };

    try {
      // Kapso Meta API: POST /meta/whatsapp/v24.0/{phone_number_id}/messages
      const baseUrl = 'https://api.kapso.ai/meta/whatsapp';
      const url = `${baseUrl}/v24.0/${phoneNumberId}/messages`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error(`Kapso interactive outbound ${res.status}: ${text}`);
      }
    } catch (err) {
      this.logger.error('Kapso interactive outbound failed', err as Error);
    }
  }

  private buildTextBody(toPhone: string, body: string) {
    return {
      to: toPhone,
      type: 'text',
      text: { body },
    };
  }
}
