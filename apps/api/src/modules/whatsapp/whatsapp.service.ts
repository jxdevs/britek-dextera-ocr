import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  Approval,
  BoxAssignment,
  BoxDocument,
  Invoice,
  PettyCashBox,
  WhatsappEvent,
  Worker,
  type BoxDocumentType,
} from '../../database/models';
import {
  BoxDocumentsService,
  DOCUMENT_TYPE_LABELS,
} from '../box-documents/box-documents.service';
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

/** Cuenta de cobro que el residente puede elegir para colgarle un soporte. */
interface AnnexCandidate {
  invoiceId: string;
  /** Texto del botón (máx. 20 caracteres en WhatsApp). */
  label: string;
}

type ConversationSession =
  /** Se le mostraron los datos del OCR y falta que confirme o rechace. */
  | { state: 'awaiting_confirm'; invoiceId: string; expiresAt: Date }
  /** Dijo que va a enviar los anexos de esta cuenta de cobro. */
  | { state: 'awaiting_annex'; invoiceId: string; expiresAt: Date }
  /** Llegó un soporte que la IA no supo clasificar: ¿RUT o cédula? */
  | { state: 'awaiting_annex_kind'; documentId: string; expiresAt: Date }
  /**
   * Hay varias cuentas de cobro candidatas. Con `documentId` el soporte ya está
   * guardado y solo falta colgarlo; sin él, el residente está eligiendo a cuál
   * le va a mandar la foto.
   */
  | {
      state: 'awaiting_annex_target';
      documentId: string | null;
      candidates: AnnexCandidate[];
      expiresAt: Date;
    };

/** TTL for pending confirmation (10 minutes) */
const SESSION_TTL_MS = 10 * 60 * 1000;

/**
 * Los anexos aguantan mucho más que una confirmación: el residente puede irse a
 * buscar el RUT y volver horas después. Y si la sesión igual se pierde (o la API
 * se reinicia), el soporte se sigue colgando solo — la cuenta de cobro pendiente
 * se deduce de la base, no de la conversación.
 */
const ANNEX_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

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
    private readonly annexes: BoxDocumentsService,
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

    // Número no registrado → ignorar completamente.
    // No se guarda nada en BD, no se responde nada.
    if (!worker) {
      this.logger.log(`Número ${phone} no registrado — ignorando completamente`);
      return { ok: true, unknown_worker: true };
    }

    const event =
      existing ??
      (await this.events.create({
        worker_id: worker.id,
        kapso_message_id: payload.message_id,
        raw_payload: payload as unknown as Record<string, unknown>,
        processed: false,
      }));

    try {

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
    const cmd = text.toLowerCase().trim();
    const session = this.getSession(worker.phone);

    if (session?.state === 'awaiting_confirm') {
      await this.kapso.sendText(
        worker.phone,
        'Tienes una factura pendiente de confirmar. Usa los botones ✅ o ❌ para continuar.',
      );
      return;
    }

    if (session?.state === 'awaiting_annex') {
      // "listo"/"ya" cierra el tema sin dejarlo colgado esperando una foto.
      if (['listo', 'ya', 'no', 'nada', 'no tengo'].includes(cmd)) {
        this.clearSession(worker.phone);
        await this.kapso.sendText(
          worker.phone,
          'Listo, no anexo nada más. Si después encuentras el RUT o la cédula, mándame la foto y la cuelgo de esa cuenta de cobro.',
        );
        return;
      }
      await this.kapso.sendText(
        worker.phone,
        'Mándame la *foto* del RUT o de la cédula, o escribe "listo" si no vas a anexar nada.',
      );
      return;
    }

    if (session) {
      await this.kapso.sendText(
        worker.phone,
        'Usa los botones del mensaje anterior para continuar.',
      );
      return;
    }

    // Check for balance query
    if (cmd === 'saldo' || cmd === 'cajas' || cmd === 'mi saldo') {
      await this.handleSaldo(worker);
      return;
    }

    if (cmd === 'anexos' || cmd === 'rut' || cmd === 'cedula' || cmd === 'cédula') {
      await this.handleAnnexMenu(worker);
      return;
    }

    // For greetings, help, or any other text → show main menu with interactive buttons
    await this.sendMainMenu(worker);
  }

  /** Sends the main menu with interactive buttons (WhatsApp permite máximo 3) */
  private async sendMainMenu(worker: Worker) {
    await this.kapso.sendInteractiveButtons(
      worker.phone,
      `¡Hola ${worker.name.split(' ')[0]}! 👋\n\nSoy tu asistente de caja menor. ¿Qué deseas hacer?`,
      [
        { id: 'menu_factura', title: '📸 Subir factura' },
        { id: 'menu_anexos', title: '📎 Anexar soportes' },
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
    const lines = boxes.map((b) => {
      const balance = parseFloat(b.current_balance);
      // Saldo negativo: gastó por encima del monto asignado y la empresa le debe.
      return balance < 0
        ? `• ${b.code} (${b.name}): $${formatCOP(Math.abs(balance).toFixed(2))} a tu favor`
        : `• ${b.code} (${b.name}): $${formatCOP(b.current_balance)} disponible`;
    });
    await this.kapso.sendText(
      worker.phone,
      `💰 *Tus cajas activas:*\n${lines.join('\n')}`,
    );
  }

  // ──────────────────────────────────────────────────────────
  // Image handler → OCR → send confirmation buttons
  // ──────────────────────────────────────────────────────────

  private async handleImage(worker: Worker, payload: IncomingMessage) {
    const session = this.getSession(worker.phone);

    // Una confirmación pendiente sí bloquea: si no, no sabríamos a qué factura
    // se refiere el ✅ que llegue después.
    if (session?.state === 'awaiting_confirm') {
      await this.kapso.sendText(
        worker.phone,
        'Ya tienes una factura pendiente de confirmar. Usa los botones ✅ o ❌ antes de enviar otra.',
      );
      return;
    }

    // En cambio, cuando está enviando anexos las fotos SON lo que esperamos.
    const annexTargetId =
      session?.state === 'awaiting_annex' ? session.invoiceId : null;

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

    // routeSupportDocuments: un RUT o una cédula ya no entran a la cola de
    // aprobación como si fueran un gasto — se archivan como anexo. La IA es la
    // que distingue, así que el residente no tiene que anunciar qué manda.
    const result = await this.invoicesService.createFromUpload(file, worker.id, {
      routeSupportDocuments: true,
      annexInvoiceId: annexTargetId,
    });

    if (result.kind === 'document') {
      await this.resolveAnnex(worker, result.document.id);
      return;
    }

    const invoice = result.invoice;

    // Estaba en modo anexos pero mandó un gasto: no se descarta, se procesa como
    // gasto. El anexo pendiente sigue pendiente y se puede mandar después.
    if (annexTargetId) {
      this.logger.log(
        `Residente ${worker.name} envió un gasto mientras anexaba soportes; se procesa como ${invoice.document_type}`,
      );
    }

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

    const isCuentaCobro = invoice.document_type === 'cuenta_cobro';

    let confirmMsg = isCuentaCobro
      ? `📋 *Cuenta de cobro detectada:*\n`
      : `📋 *Factura detectada:*\n`;
    confirmMsg += `• ${isCuentaCobro ? 'Prestador' : 'Proveedor'}: ${vendor}\n`;
    confirmMsg += `• ${isCuentaCobro ? 'Cédula/NIT' : 'NIT'}: ${vendorNit}\n`;
    confirmMsg += `• ${isCuentaCobro ? 'Documento' : 'Factura'} #: ${invoiceNum}\n`;
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
    if (buttonId === 'menu_anexos') {
      await this.handleAnnexMenu(worker);
      return;
    }

    // "No necesita" cierra la petición de anexos sin depender de la sesión: si
    // después cambia de opinión, basta con que mande la foto.
    if (buttonId === 'annex_none') {
      this.clearSession(worker.phone);
      await this.kapso.sendText(
        worker.phone,
        'Perfecto, la dejo sin anexos. Si más adelante consigues el RUT o la cédula, mándame la foto y la cuelgo de esa cuenta de cobro.',
      );
      return;
    }

    const session = this.getSession(worker.phone);

    // "Enviar anexos": normalmente hay sesión (viene de confirmar la cuenta de
    // cobro), pero si expiró se recupera la pendiente más reciente.
    if (buttonId === 'annex_now') {
      const invoiceId =
        session?.state === 'awaiting_annex' || session?.state === 'awaiting_confirm'
          ? session.invoiceId
          : null;
      await this.promptForAnnex(worker, invoiceId);
      return;
    }

    if (buttonId === 'annex_kind_rut' || buttonId === 'annex_kind_cedula') {
      if (session?.state !== 'awaiting_annex_kind') {
        await this.sendMainMenu(worker);
        return;
      }
      const docType: BoxDocumentType =
        buttonId === 'annex_kind_rut' ? 'rut' : 'cedula';
      await this.annexes.setDocType(session.documentId, docType);
      this.clearSession(worker.phone);
      await this.resolveAnnex(worker, session.documentId);
      return;
    }

    if (buttonId.startsWith('annex_pick_')) {
      if (session?.state !== 'awaiting_annex_target') {
        await this.sendMainMenu(worker);
        return;
      }
      const index = parseInt(buttonId.replace('annex_pick_', ''), 10);
      const candidate = session.candidates[index];
      if (!candidate) {
        await this.kapso.sendText(worker.phone, 'Opción no reconocida.');
        return;
      }
      this.clearSession(worker.phone);

      if (session.documentId) {
        // El soporte ya estaba guardado: solo faltaba saber de cuál era.
        const document = await this.annexes.attachToInvoice(
          session.documentId,
          candidate.invoiceId,
        );
        await this.reportAnnexStatus(worker, document);
      } else {
        // Eligió a qué cuenta de cobro le va a mandar la foto.
        await this.promptForAnnex(worker, candidate.invoiceId);
      }
      return;
    }

    // Invoice confirmation/rejection requires active session
    if (session?.state !== 'awaiting_confirm') {
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
  // Anexos de cuenta de cobro (RUT / cédula del prestador)
  //
  // No se guarda "qué le pedí" en ninguna parte: qué falta se recalcula contra
  // la base en cada mensaje. Por eso el residente puede mandar el RUT hoy, la
  // cédula la semana entrante, los dos de una, o ninguno.
  // ──────────────────────────────────────────────────────────

  /** Tras registrar una cuenta de cobro, ofrece anexar la identificación. */
  private async offerAnnex(worker: Worker, invoice: Invoice) {
    if (invoice.document_type !== 'cuenta_cobro') return;

    this.setSession(worker.phone, {
      state: 'awaiting_annex',
      invoiceId: invoice.id,
      expiresAt: new Date(Date.now() + ANNEX_SESSION_TTL_MS),
    });

    await this.kapso.sendInteractiveButtons(
      worker.phone,
      '📎 *¿Anexas la identificación del prestador?*\n\n' +
        'Puedes enviar el RUT, la cédula o los dos. No tiene que ser ahora: si mandas uno hoy y el otro después, los cuelgo de esta misma cuenta de cobro.',
      [
        { id: 'annex_now', title: '📎 Enviar anexos' },
        { id: 'annex_none', title: '✔️ No necesita' },
      ],
    );
  }

  /**
   * Punto de entrada del botón "Anexar soportes" del menú y del comando
   * "anexos": muestra qué cuentas de cobro están sin identificación.
   */
  private async handleAnnexMenu(worker: Worker) {
    const pending = await this.annexes.pendingAnnexesForWorker(worker.id);

    if (pending.length === 0) {
      await this.kapso.sendText(
        worker.phone,
        'Ninguna de tus cuentas de cobro recientes está esperando RUT ni cédula. ✅',
      );
      return;
    }

    if (pending.length === 1) {
      await this.promptForAnnex(worker, pending[0].invoice.id);
      return;
    }

    await this.askWhichInvoice(worker, null, pending);
  }

  /** Pide la foto del soporte para una cuenta de cobro concreta. */
  private async promptForAnnex(worker: Worker, invoiceId: string | null) {
    const pending = await this.annexes.pendingAnnexesForWorker(worker.id);

    // Sin destino (sesión expirada): si solo hay una pendiente es esa; si hay
    // varias se pregunta; si no hay ninguna, no hay nada que anexar.
    let target = invoiceId
      ? pending.find((p) => p.invoice.id === invoiceId)
      : undefined;

    if (!target) {
      if (pending.length === 0) {
        this.clearSession(worker.phone);
        await this.kapso.sendText(
          worker.phone,
          'Esa cuenta de cobro ya tiene su RUT y su cédula. No necesitas anexar nada más. ✅',
        );
        return;
      }
      if (pending.length > 1) {
        await this.askWhichInvoice(worker, null, pending);
        return;
      }
      target = pending[0];
    }

    this.setSession(worker.phone, {
      state: 'awaiting_annex',
      invoiceId: target.invoice.id,
      expiresAt: new Date(Date.now() + ANNEX_SESSION_TTL_MS),
    });

    const missing = target.missing.map((t) => DOCUMENT_TYPE_LABELS[t]).join(' o ');
    await this.kapso.sendText(
      worker.phone,
      `📎 Mándame la foto del *${missing}* de ${describeInvoice(target.invoice)}.\n\n` +
        'Puedes enviar los dos, uno ahora y el otro cuando lo tengas, o escribir "listo" si no vas a anexar nada.',
    );
  }

  /**
   * Decide qué hacer con un soporte recién guardado: colgarlo, preguntar si es
   * RUT o cédula, o preguntar de cuál cuenta de cobro es. El archivo ya está
   * guardado en todos los casos — nunca se pierde por no saber ubicarlo.
   */
  private async resolveAnnex(worker: Worker, documentId: string) {
    const document = await this.annexes.findOne(documentId);

    // La IA no supo qué era: preguntar es más barato que adivinar mal.
    if (document.doc_type === 'otro') {
      this.setSession(worker.phone, {
        state: 'awaiting_annex_kind',
        documentId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      });
      await this.kapso.sendInteractiveButtons(
        worker.phone,
        '📎 Guardé el documento, pero no distingo qué es. ¿Me confirmas?',
        [
          { id: 'annex_kind_rut', title: '📄 Es el RUT' },
          { id: 'annex_kind_cedula', title: '🪪 Es la cédula' },
        ],
      );
      return;
    }

    if (document.invoice_id) {
      await this.reportAnnexStatus(worker, document);
      return;
    }

    // Llegó suelto: buscar a qué cuenta de cobro le falta justo este soporte.
    const pending = await this.annexes.pendingAnnexesForWorker(
      worker.id,
      document.doc_type,
    );

    if (pending.length === 0) {
      this.clearSession(worker.phone);
      const label = DOCUMENT_TYPE_LABELS[document.doc_type];
      await this.kapso.sendText(
        worker.phone,
        `📎 Guardé el *${label}* como soporte de tu caja. No tienes cuentas de cobro esperando ese documento, así que no lo asocié a ningún gasto.`,
      );
      return;
    }

    if (pending.length === 1) {
      const linked = await this.annexes.attachToInvoice(
        documentId,
        pending[0].invoice.id,
      );
      await this.reportAnnexStatus(worker, linked);
      return;
    }

    await this.askWhichInvoice(worker, documentId, pending);
  }

  /** Botones para elegir entre varias cuentas de cobro pendientes. */
  private async askWhichInvoice(
    worker: Worker,
    documentId: string | null,
    pending: Awaited<ReturnType<BoxDocumentsService['pendingAnnexesForWorker']>>,
  ) {
    // WhatsApp solo admite 3 botones: se ofrecen las 3 más recientes.
    const candidates: AnnexCandidate[] = pending.slice(0, 3).map((p) => ({
      invoiceId: p.invoice.id,
      label: buttonLabel(p.invoice),
    }));

    if (pending.length > candidates.length) {
      this.logger.log(
        `Residente ${worker.name} tiene ${pending.length} cuentas de cobro sin anexos; se ofrecen las ${candidates.length} más recientes.`,
      );
    }

    this.setSession(worker.phone, {
      state: 'awaiting_annex_target',
      documentId,
      candidates,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    const lines = pending
      .slice(0, 3)
      .map((p, i) => `${i + 1}. ${describeInvoice(p.invoice)}`)
      .join('\n');

    await this.kapso.sendInteractiveButtons(
      worker.phone,
      `📎 ¿De cuál de estas cuentas de cobro es?\n\n${lines}` +
        (pending.length > 3
          ? `\n\n_Tienes ${pending.length} sin anexos; te muestro las 3 más recientes._`
          : ''),
      candidates.map((c, i) => ({ id: `annex_pick_${i}`, title: c.label })),
    );
  }

  /** Confirma el anexo y dice qué falta todavía. */
  private async reportAnnexStatus(worker: Worker, document: BoxDocument) {
    const label = DOCUMENT_TYPE_LABELS[document.doc_type];
    const invoiceId = document.invoice_id;

    if (!invoiceId) {
      this.clearSession(worker.phone);
      await this.kapso.sendText(
        worker.phone,
        `📎 Guardé el *${label}* como soporte de tu caja.`,
      );
      return;
    }

    const pending = await this.annexes.pendingAnnexesForWorker(worker.id);
    const row = pending.find((p) => p.invoice.id === invoiceId);
    const invoice = row?.invoice ?? (await this.invoices.findByPk(invoiceId));
    const where = invoice ? ` de ${describeInvoice(invoice)}` : '';

    // Sin fila pendiente = ya no le falta nada.
    if (!row || row.missing.length === 0) {
      this.clearSession(worker.phone);
      await this.kapso.sendText(
        worker.phone,
        `✅ *${label} anexado*${where}.\n\nYa tiene el RUT y la cédula. No falta nada más.`,
      );
      return;
    }

    // Falta el otro: la sesión sigue apuntando a la misma cuenta de cobro para
    // que la próxima foto se cuelgue sin volver a preguntar.
    this.setSession(worker.phone, {
      state: 'awaiting_annex',
      invoiceId,
      expiresAt: new Date(Date.now() + ANNEX_SESSION_TTL_MS),
    });

    const missing = row.missing.map((t) => DOCUMENT_TYPE_LABELS[t]).join(' y ');
    await this.kapso.sendText(
      worker.phone,
      `✅ *${label} anexado*${where}.\n\nFalta el *${missing}*. Mándamelo cuando lo tengas — puede ser hoy o otro día.`,
    );
  }

  // ──────────────────────────────────────────────────────────
  // Confirm: assign to box, create approval, deduct balance
  // ──────────────────────────────────────────────────────────

  private async confirmInvoice(worker: Worker, invoiceId: string) {
    const invoice = await this.invoices.findByPk(invoiceId);
    if (!invoice || (invoice.status !== 'pending' && invoice.status !== 'observed')) {
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

    // Excepción de segunda caja: con más de una caja abierta NO se auto-asigna.
    // La factura pasa a 'observed' (sin caja ni descuento de saldo) para que
    // un admin elija la caja correcta al aprobarla en el web.
    if (workerBoxes.length > 1) {
      await invoice.update({ status: 'observed' });
      this.clearSession(worker.phone);
      const codes = workerBoxes.map((b) => `${b.code} (${b.name})`).join(', ');
      this.logger.log(
        `Factura ${invoice.id} → observada sin caja: el residente ${worker.name} tiene ${workerBoxes.length} cajas abiertas`,
      );
      await this.kapso.sendText(
        worker.phone,
        `✅ *Factura registrada*\n` +
          `• Monto: $${formatCOP(total)} COP\n\n` +
          `Tienes ${workerBoxes.length} cajas abiertas (${codes}), por lo que un administrador asignará la caja correspondiente al aprobarla. Aún no se ha descontado saldo de ninguna caja.`,
      );
      await this.offerAnnex(worker, invoice);
      return;
    }

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

    const isCuentaCobro = invoice.document_type === 'cuenta_cobro';

    await this.kapso.sendText(
      worker.phone,
      `✅ *${isCuentaCobro ? 'Cuenta de cobro' : 'Factura'} enviada correctamente*\n` +
        `• Caja: ${box.code} (${box.name})\n` +
        `• Monto: $${formatCOP(total)} COP\n` +
        `• Estado: Pendiente de aprobación\n\n` +
        `Un aprobador la revisará. Puedes enviar otra cuando quieras.`,
    );

    await this.offerAnnex(worker, invoice);
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
  return n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** "la cuenta de cobro #A-123 de Juan Pérez ($120.000)" */
function describeInvoice(invoice: Invoice): string {
  const parts: string[] = [];
  if (invoice.invoice_number) parts.push(`#${invoice.invoice_number}`);
  if (invoice.vendor_name) parts.push(`de ${invoice.vendor_name}`);
  parts.push(`($${formatCOP(invoice.total)})`);
  return `la cuenta de cobro ${parts.join(' ')}`;
}

/** Texto de botón de WhatsApp: máximo 20 caracteres, sin excepciones. */
function buttonLabel(invoice: Invoice): string {
  const raw = invoice.invoice_number
    ? `#${invoice.invoice_number}`
    : invoice.vendor_name ?? `$${formatCOP(invoice.total)}`;
  return raw.length > 20 ? `${raw.slice(0, 19)}…` : raw;
}

function mimeFromContentType(mime: string): string {
  if (mime.includes('pdf')) return 'pdf';
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
