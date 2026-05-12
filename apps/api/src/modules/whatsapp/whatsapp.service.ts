import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PettyCashBox, WhatsappEvent, Worker } from '../../database/models';
import { InvoicesService } from '../invoices/invoices.service';
import { KapsoWebhookDto } from './dto/kapso-webhook.dto';
import { KapsoService } from './kapso.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    @InjectModel(WhatsappEvent) private readonly events: typeof WhatsappEvent,
    @InjectModel(Worker) private readonly workers: typeof Worker,
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    private readonly invoicesService: InvoicesService,
    private readonly kapso: KapsoService,
  ) {}

  async handleIncoming(payload: KapsoWebhookDto) {
    const phone = this.normalizePhone(payload.from);

    // Idempotencia: si ya procesamos este message_id, devolvemos sin reprocesar.
    const existing = await this.events.findOne({
      where: { kapso_message_id: payload.message_id },
    });
    if (existing?.processed) {
      this.logger.log(`Duplicado ignorado: ${payload.message_id}`);
      return { duplicate: true, processed: true };
    }

    const worker = await this.workers.findOne({ where: { phone } });
    const event =
      existing ??
      (await this.events.create({
        worker_id: worker?.id ?? null,
        kapso_message_id: payload.message_id,
        raw_payload: payload as unknown as Record<string, unknown>,
        processed: false,
      }));

    try {
      if (!worker) {
        await this.kapso.sendText(
          phone,
          'No estás registrado en OCRDEMO. Contacta al administrador.',
        );
        await event.update({ processed: true });
        return { ok: true, unknown_worker: true };
      }

      if (payload.type === 'text') {
        await this.handleText(worker, (payload.text ?? '').trim());
      } else if (payload.type === 'image') {
        await this.handleImage(worker, payload);
      }

      await event.update({ processed: true, worker_id: worker.id });
      return { ok: true, invoice_id: undefined };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error procesando mensaje';
      this.logger.error(`Fallo en mensaje ${payload.message_id}: ${message}`, err as Error);
      await event.update({ processed: true, error: message });
      // Avisamos al trabajador para que reintente.
      try {
        await this.kapso.sendText(
          phone,
          'Tuvimos un problema procesando tu mensaje. Por favor reintenta en un momento.',
        );
      } catch {
        // ignore secondary failure
      }
      return { ok: false, error: message };
    }
  }

  private async handleText(worker: Worker, text: string) {
    const cmd = text.toLowerCase();
    if (cmd === 'saldo' || cmd === 'cajas' || cmd === 'mi saldo') {
      const boxes = await this.boxes.findAll({
        where: { status: 'open' },
        include: [
          {
            model: Worker,
            where: { id: worker.id },
            required: true,
            attributes: [],
            through: { attributes: [] },
          },
        ],
      });
      if (boxes.length === 0) {
        await this.kapso.sendText(
          worker.phone,
          'No tienes cajas abiertas asignadas. Contacta al administrador.',
        );
        return;
      }
      const lines = boxes.map(
        (b) =>
          `• ${b.code} (${b.name}): $${formatCOP(b.current_balance)} disponible`,
      );
      await this.kapso.sendText(
        worker.phone,
        `Tus cajas activas:\n${lines.join('\n')}`,
      );
      return;
    }

    if (cmd === 'ayuda' || cmd === 'help') {
      await this.kapso.sendText(worker.phone, helpText());
      return;
    }

    await this.kapso.sendText(
      worker.phone,
      'No entendí. Envíame la foto de tu factura o escribe "saldo" para ver tus cajas. Escribe "ayuda" para ver opciones.',
    );
  }

  private async handleImage(worker: Worker, payload: KapsoWebhookDto) {
    const { buffer, mimeType } = await this.fetchMedia(payload);

    const file = {
      buffer,
      mimetype: mimeType,
      originalname: `whatsapp_${payload.message_id}.${mimeFromContentType(mimeType)}`,
      size: buffer.length,
      fieldname: 'file',
      encoding: '7bit',
      stream: undefined as never,
      destination: '',
      filename: '',
      path: '',
    } as unknown as Express.Multer.File;

    const invoice = await this.invoicesService.createFromUpload(file, worker.id);

    const total = parseFloat(invoice.total);
    const vendor = invoice.vendor_name ?? 'el proveedor';
    const conf = invoice.confidence_score ?? 0;
    const lowConf = conf > 0 && conf < 0.6;

    await this.kapso.sendText(
      worker.phone,
      `Recibí tu factura de ${vendor} por $${formatCOP(invoice.total)}. ` +
        `Quedó en revisión. ID ${invoice.id.slice(0, 8)}.` +
        (lowConf ? ' La calidad de la imagen es baja, podrían pedirte reenviar.' : '') +
        (Number.isFinite(total) && total === 0 ? ' No pude leer el total — revisa el aprobador.' : ''),
    );
  }

  private async fetchMedia(
    payload: KapsoWebhookDto,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    if (payload.media_base64) {
      return {
        buffer: Buffer.from(payload.media_base64, 'base64'),
        mimeType: payload.media_mime_type ?? 'image/jpeg',
      };
    }
    if (!payload.media_url) {
      throw new Error('Mensaje image sin media_url ni media_base64');
    }
    const res = await fetch(payload.media_url);
    if (!res.ok) {
      throw new Error(`No pude descargar la imagen (${res.status})`);
    }
    const arr = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arr),
      mimeType:
        payload.media_mime_type ?? res.headers.get('content-type') ?? 'image/jpeg',
    };
  }

  list(limit = 50) {
    return this.events.findAll({
      include: [{ model: Worker, attributes: ['id', 'name', 'phone'] }],
      order: [['created_at', 'DESC']],
      limit,
    });
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/[^\d]/g, '');
    return `+${digits}`;
  }
}

function formatCOP(amount: string | number): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return String(amount);
  return n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

function mimeFromContentType(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

function helpText(): string {
  return [
    'Opciones disponibles:',
    '• Envía una foto de tu factura para legalizar.',
    '• "saldo" → ver el saldo de tus cajas activas.',
    '• "ayuda" → ver este mensaje.',
  ].join('\n');
}
