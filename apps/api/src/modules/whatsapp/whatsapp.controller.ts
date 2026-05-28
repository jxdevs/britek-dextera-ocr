import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { KapsoSignatureGuard } from './guards/kapso-signature.guard';
import { WhatsappService } from './whatsapp.service';

/**
 * Shape of Kapso v2 webhook payload (whatsapp.message.received).
 * We don't use class-validator here because Kapso's payload is complex
 * and nested — we manually extract what we need.
 */
interface KapsoV2Payload {
  data: Array<{
    message: {
      id: string;
      from: string;
      type: string;
      timestamp?: string;
      text?: { body: string };
      image?: { id: string; mime_type?: string; sha256?: string; caption?: string };
      interactive?: {
        type: string;
        button_reply?: { id: string; title: string };
        list_reply?: { id: string; title: string; description?: string };
      };
      kapso?: {
        direction?: string;
        has_media?: boolean;
        content?: string;
        media_data?: string; // base64
        media_url?: string;
      };
    };
    conversation: {
      id: string;
      phone_number?: string;
      phone_number_id?: string;
    };
    phone_number_id: string;
    is_new_conversation?: boolean;
  }>;
  type: string;
  batch?: boolean;
  batch_info?: Record<string, unknown>;
}

@Controller()
export class WhatsappController {
  private readonly logger = new Logger('WebhookKapso');

  constructor(private readonly service: WhatsappService) {}

  @Post('webhooks/kapso')
  @UseGuards(KapsoSignatureGuard)
  @HttpCode(200)
  async receive(@Body() body: KapsoV2Payload) {
    this.logger.log(`═══ WEBHOOK RECIBIDO ═══`);
    this.logger.log(`Event type: ${body.type}, batch: ${body.batch}, items: ${body.data?.length ?? 0}`);

    if (!body.data || !Array.isArray(body.data)) {
      this.logger.warn('Payload sin data[] — ignorando');
      return { ok: true, skipped: true };
    }

    // Process each message in the batch
    const results = [];
    for (const item of body.data) {
      const msg = item.message;
      if (!msg) {
        this.logger.warn('Item sin message — ignorando');
        continue;
      }

      this.logger.log(`Mensaje: type=${msg.type}, from=${msg.from}, id=${msg.id}`);
      this.logger.log(`Contenido: ${JSON.stringify(msg.text ?? msg.image ?? msg.interactive ?? '—')}`);

      // Map Kapso v2 → our internal format
      // For images: kapso.media_url = download URL, kapso.media_data = { url, filename, content_type, byte_size }
      const mediaData = msg.kapso?.media_data as
        | { url?: string; content_type?: string; filename?: string }
        | undefined;

      const mapped = {
        message_id: msg.id,
        from: msg.from,
        type: msg.type as 'text' | 'image' | 'interactive',
        text: msg.text?.body,
        media_url: msg.kapso?.media_url ?? mediaData?.url ?? undefined,
        media_base64: undefined, // Kapso v2 doesn't send base64, only URLs
        media_mime_type:
          mediaData?.content_type ?? msg.image?.mime_type ?? undefined,
        interactive: msg.interactive
          ? {
              type: msg.interactive.type as 'button_reply' | 'list_reply',
              button_reply: msg.interactive.button_reply,
            }
          : undefined,
        timestamp: msg.timestamp,
      };

      this.logger.log(`Mapped DTO: ${JSON.stringify(mapped)}`);

      try {
        const result = await this.service.handleIncoming(mapped);
        results.push(result);
      } catch (err) {
        this.logger.error(`Error procesando mensaje ${msg.id}:`, err);
        results.push({ ok: false, error: String(err) });
      }
    }

    return { ok: true, results };
  }

  @Get('whatsapp-events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  list(@Query('limit') limit?: string) {
    const n = limit ? Math.min(Math.max(parseInt(limit, 10), 1), 500) : 50;
    return this.service.list(n);
  }
}
