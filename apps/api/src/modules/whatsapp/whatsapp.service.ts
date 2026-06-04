import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  Approval,
  BoxAssignment,
  Invoice,
  PettyCashBox,
  WhatsappEvent,
  Worker,
} from '../../database/models';
import { InvoicesService } from '../invoices/invoices.service';
import { KapsoService } from './kapso.service';

/** Mapped message from the controller (already extracted from Kapso v2 payload) */
export interface IncomingMessage {
  message_id: string;
  from: string;
  type: 'text' | 'image' | 'interactive';
  text?: string;
  media_url?: string;
  media_base64?: string;
  media_mime_type?: string;
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
  };
  timestamp?: string;
}

// ────────────────────────────────────────────────────────────
// Conversation state machine (in-memory per phone)
// ────────────────────────────────────────────────────────────
interface ConversationSession {
  state: 'awaiting_confirm';
  invoiceId: string;
  expiresAt: Date;
}

/** TTL for pending confirmation (10 minutes) */
const SESSION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  /** In-memory sessions indexed by normalized phone */
  private readonly sessions = new Map<string, ConversationSession>();

  constructor(
    private readonly config: ConfigService,
    private readonly sequelize: Sequelize,
    @InjectModel(WhatsappEvent) private readonly events: typeof WhatsappEvent,
    @InjectModel(Worker) private readonly workers: typeof Worker,
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    @InjectModel(BoxAssignment) private readonly assignments: typeof BoxAssignment,
    @InjectModel(Invoice) private readonly invoices: typeof Invoice,
    @InjectModel(Approval) private readonly approvals: typeof Approval,
    private readonly invoicesService: InvoicesService,
    private readonly kapso: KapsoService,
  ) {}

  // ──────────────────────────────────────────────────────────
  // Main entry point
  // ──────────────────────────────────────────────────────────

  async handleIncoming(payload: IncomingMessage) {
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
          'No estás registrado en Britek. Contacta al administrador.',
        );
        await event.update({ processed: true });
        return { ok: true, unknown_worker: true };
      }

      if (payload.type === 'interactive') {
        await this.handleButtonReply(worker, payload);
      } else if (payload.type === 'image') {
        await this.handleImage(worker, payload);
      } else if (payload.type === 'text') {
        await this.handleText(worker, (payload.text ?? '').trim());
      }

      await event.update({ processed: true, worker_id: worker.id });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error procesando mensaje';
      this.logger.error(`Fallo en mensaje ${payload.message_id}: ${message}`, err as Error);
      await event.update({ processed: true, error: message });
      // Avisamos al residente para que reintente.
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
    // If there's an active session, remind them to use buttons
    const session = this.getSession(worker.phone);
    if (session) {
      await this.kapso.sendText(
        worker.phone,
        'Tienes una factura pendiente de confirmar. Usa los botones ✅ o ❌ para continuar.',
      );
      return;
    }

    const cmd = text.toLowerCase().trim();

    // Check for balance query
    if (cmd === 'saldo' || cmd === 'cajas' || cmd === 'mi saldo') {
      await this.handleSaldo(worker);
      return;
    }

    // For greetings, help, or any other text → show main menu with interactive buttons
    await this.sendMainMenu(worker);
  }

  /** Sends the main menu with interactive buttons */
  private async sendMainMenu(worker: Worker) {
    await this.kapso.sendInteractiveButtons(
      worker.phone,
      `¡Hola ${worker.name.split(' ')[0]}! 👋\n\nSoy tu asistente de caja menor. ¿Qué deseas hacer?`,
      [
        { id: 'menu_factura', title: '📸 Subir factura' },
        { id: 'menu_saldo', title: '💰 Ver saldo' },
      ],
      'Britek · Caja menor',
    );
  }

  /** Handles balance query */
  private async handleSaldo(worker: Worker) {
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
      `💰 *Tus cajas activas:*\n${lines.join('\n')}`,
    );
  }

  // ──────────────────────────────────────────────────────────
  // Image handler → OCR → send confirmation buttons
  // ──────────────────────────────────────────────────────────

  private async handleImage(worker: Worker, payload: IncomingMessage) {
    // If there's already a pending session, tell them to resolve it first
    const existingSession = this.getSession(worker.phone);
    if (existingSession) {
      await this.kapso.sendText(
        worker.phone,
        'Ya tienes una factura pendiente de confirmar. Usa los botones ✅ o ❌ antes de enviar otra.',
      );
      return;
    }

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

    // ── Verification: confirm invoice exists in DB ──
    const verified = await this.invoices.findByPk(invoice.id);
    if (!verified) {
      throw new Error(`Factura ${invoice.id} no se encontró en BD después de crearla`);
    }

    // Build confirmation message with extracted data
    const total = parseFloat(invoice.total);
    const vendor = invoice.vendor_name ?? 'Desconocido';
    const vendorNit = invoice.vendor_nit ?? '—';
    const invoiceNum = invoice.invoice_number ?? '—';
    const invoiceDate = invoice.invoice_date ?? '—';
    const conf = invoice.confidence_score ?? 0;

    let confirmMsg = `📋 *Factura detectada:*\n`;
    confirmMsg += `• Proveedor: ${vendor}\n`;
    confirmMsg += `• NIT: ${vendorNit}\n`;
    confirmMsg += `• Factura #: ${invoiceNum}\n`;
    confirmMsg += `• Fecha: ${invoiceDate}\n`;

    // Items / productos
    const items = (invoice.extracted_data as Record<string, unknown>)?.items as
      | Array<{ description: string; quantity?: number; unit_price?: number; total?: number }>
      | undefined;
    if (items && items.length > 0) {
      confirmMsg += `\n🛒 *Productos/Servicios:*\n`;
      for (const item of items) {
        let line = `  - ${item.description}`;
        if (item.quantity != null) line += ` (x${item.quantity})`;
        if (item.total != null) line += ` — $${formatCOP(item.total)}`;
        confirmMsg += `${line}\n`;
      }
    }

    const subtotal = invoice.subtotal ? `$${formatCOP(invoice.subtotal)}` : '—';
    const iva = invoice.iva ? `$${formatCOP(invoice.iva)}` : '—';
    confirmMsg += `\n• Subtotal: ${subtotal}\n`;
    confirmMsg += `• IVA: ${iva}\n`;
    confirmMsg += `• *Total: $${formatCOP(total)} COP*\n`;

    if (conf > 0 && conf < 0.6) {
      confirmMsg += `\n⚠️ _La calidad de la imagen es baja, los datos podrían ser inexactos._\n`;
    }

    confirmMsg += `\n¿Los datos son correctos?`;

    // Save session
    this.setSession(worker.phone, {
      state: 'awaiting_confirm',
      invoiceId: invoice.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    // Send interactive buttons
    await this.kapso.sendInteractiveButtons(
      worker.phone,
      confirmMsg,
      [
        { id: 'confirm_invoice', title: '✅ Confirmar' },
        { id: 'reject_invoice', title: '❌ Rechazar' },
      ],
    );
  }

  // ──────────────────────────────────────────────────────────
  // Interactive button reply handler
  // ──────────────────────────────────────────────────────────

  private async handleButtonReply(worker: Worker, payload: IncomingMessage) {
    const buttonId = payload.interactive?.button_reply?.id;
    if (!buttonId) {
      await this.kapso.sendText(worker.phone, 'No pude procesar esa respuesta.');
      return;
    }

    // Handle main menu buttons (no session needed)
    if (buttonId === 'menu_factura') {
      await this.kapso.sendText(
        worker.phone,
        '📸 *Envíame la foto de tu factura* y la procesaré automáticamente.',
      );
      return;
    }
    if (buttonId === 'menu_saldo') {
      await this.handleSaldo(worker);
      return;
    }

    // Invoice confirmation/rejection requires active session
    const session = this.getSession(worker.phone);
    if (!session) {
      await this.sendMainMenu(worker);
      return;
    }

    if (buttonId === 'confirm_invoice') {
      await this.confirmInvoice(worker, session.invoiceId);
    } else if (buttonId === 'reject_invoice') {
      await this.rejectInvoice(worker, session.invoiceId);
    } else {
      await this.kapso.sendText(worker.phone, 'Opción no reconocida.');
    }
  }

  // ──────────────────────────────────────────────────────────
  // Confirm: assign to box, create approval, deduct balance
  // ──────────────────────────────────────────────────────────

  private async confirmInvoice(worker: Worker, invoiceId: string) {
    const invoice = await this.invoices.findByPk(invoiceId);
    if (!invoice || invoice.status !== 'pending') {
      this.clearSession(worker.phone);
      await this.kapso.sendText(
        worker.phone,
        'La factura ya no está disponible. Envía una nueva foto.',
      );
      return;
    }

    // Find open box(es) assigned to this worker
    const workerBoxes = await this.boxes.findAll({
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

    if (workerBoxes.length === 0) {
      this.clearSession(worker.phone);
      await this.kapso.sendText(
        worker.phone,
        'No tienes cajas abiertas asignadas. Contacta al administrador. La factura quedó en revisión manual.',
      );
      return;
    }

    const total = parseFloat(invoice.total);

    // Find first box with sufficient balance
    const box = workerBoxes.find(
      (b) => parseFloat(b.current_balance) >= total,
    );

    if (!box) {
      this.clearSession(worker.phone);
      const balances = workerBoxes
        .map((b) => `${b.code}: $${formatCOP(b.current_balance)}`)
        .join(', ');
      await this.kapso.sendText(
        worker.phone,
        `Saldo insuficiente en tus cajas (${balances}). La factura de $${formatCOP(total)} quedó pendiente de revisión manual.`,
      );
      return;
    }

    // Assign box to invoice AND deduct balance immediately (in a transaction)
    await this.sequelize.transaction(async (t) => {
      // Lock the box row to prevent race conditions
      const lockedBox = await this.boxes.findByPk(box.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!lockedBox) throw new Error('Caja no encontrada');

      const currentBalance = parseFloat(lockedBox.current_balance);
      if (currentBalance < total) {
        throw new Error(`Saldo insuficiente: ${currentBalance} < ${total}`);
      }

      const newBalance = (currentBalance - total).toFixed(2);
      await lockedBox.update({ current_balance: newBalance }, { transaction: t });
      await invoice.update({ box_id: box.id }, { transaction: t });
    });

    // ── Verification: reload from DB and confirm it was saved ──
    await invoice.reload();
    if (invoice.box_id !== box.id) {
      this.logger.error(
        `Verificación fallida: factura ${invoice.id} debía tener box_id=${box.id} pero tiene box_id=${invoice.box_id}`,
      );
      await this.kapso.sendText(
        worker.phone,
        '⚠️ Hubo un problema guardando tu factura. Por favor reenvía la foto.',
      );
      return;
    }

    this.clearSession(worker.phone);

    this.logger.log(
      `✅ Factura ${invoice.id} confirmada → caja ${box.code} (${box.id}), monto $${formatCOP(total)}`,
    );

    await this.kapso.sendText(
      worker.phone,
      `✅ *Factura enviada correctamente*\n` +
        `• Caja: ${box.code} (${box.name})\n` +
        `• Monto: $${formatCOP(total)} COP\n` +
        `• Estado: Pendiente de aprobación\n\n` +
        `Un aprobador revisará tu factura. Puedes enviar otra cuando quieras.`,
    );
  }

  // ──────────────────────────────────────────────────────────
  // Reject: delete invoice entirely (OCR data was wrong)
  // 'rejected' status is only for approver rejections from web
  // ──────────────────────────────────────────────────────────

  private async rejectInvoice(worker: Worker, invoiceId: string) {
    const invoice = await this.invoices.findByPk(invoiceId);
    if (invoice) {
      // Delete stored image file
      if (invoice.image_url) {
        try {
          const fs = await import('fs');
          const path = await import('path');
          const uploadsDir = this.config.get<string>('uploadsDir') ?? 'uploads';
          const abs = path.resolve(uploadsDir, invoice.image_url);
          await fs.promises.unlink(abs);
        } catch {
          // ignore if file doesn't exist
        }
      }
      // Delete the invoice record
      await invoice.destroy();
    }

    this.clearSession(worker.phone);

    await this.kapso.sendText(
      worker.phone,
      'Factura descartada. Envía otra foto cuando quieras.',
    );
  }

  // ──────────────────────────────────────────────────────────
  // Media download helper
  // ──────────────────────────────────────────────────────────

  private async fetchMedia(
    payload: IncomingMessage,
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

    this.logger.log(`Descargando media: ${payload.media_url}`);

    // Kapso media URLs require API key authentication
    const headers: Record<string, string> = {};
    if (payload.media_url.includes('kapso.ai')) {
      const apiKey = this.config.get<string>('kapso.apiKey');
      if (apiKey) headers['X-API-Key'] = apiKey;
    }

    const res = await fetch(payload.media_url, { headers });
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

  // ──────────────────────────────────────────────────────────
  // Session helpers
  // ──────────────────────────────────────────────────────────

  private getSession(phone: string): ConversationSession | null {
    const normalPhone = this.normalizePhone(phone);
    const session = this.sessions.get(normalPhone);
    if (!session) return null;
    if (new Date() > session.expiresAt) {
      this.sessions.delete(normalPhone);
      return null;
    }
    return session;
  }

  private setSession(phone: string, session: ConversationSession) {
    this.sessions.set(this.normalizePhone(phone), session);
  }

  private clearSession(phone: string) {
    this.sessions.delete(this.normalizePhone(phone));
  }

  // ──────────────────────────────────────────────────────────
  // Events list (admin dashboard)
  // ──────────────────────────────────────────────────────────

  list(limit = 50) {
    return this.events.findAll({
      include: [{ model: Worker, attributes: ['id', 'name', 'phone'] }],
      order: [['created_at', 'DESC']],
      limit,
    });
  }

  // ──────────────────────────────────────────────────────────
  // Utils
  // ──────────────────────────────────────────────────────────

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
