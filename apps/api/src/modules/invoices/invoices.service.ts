import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import {
  Approval,
  BoxAssignment,
  BoxDocument,
  Invoice,
  PettyCashBox,
  Worker,
} from '../../database/models';
import type {
  DocumentType,
  ExpenseCategory,
} from '../../database/models/invoice.model';
import { GeminiService } from '../ai/gemini.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { BoxDocumentsService } from '../box-documents/box-documents.service';
import { StorageService } from '../storage/storage.service';
import { CUFE_PATTERN, normalizeCufe } from './cufe';
import { ListInvoicesDto } from './dto/list-invoices.dto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Días que una factura permanece restaurable en la papelera. Pasado el plazo
 * deja de listarse, pero la fila nunca se borra de la base.
 */
export const TRASH_RETENTION_DAYS = 30;

/**
 * Una carga puede terminar en dos sitios según lo que la IA vea en la imagen:
 * como movimiento de caja (factura o cuenta de cobro) o como anexo archivado.
 */
export type UploadResult =
  | { kind: 'invoice'; invoice: Invoice }
  | { kind: 'document'; document: BoxDocument };

/** Categorías que requieren aprobación especial (admin) */
const RESTRICTED_CATEGORIES: ExpenseCategory[] = ['alimentacion'];

/** Categorías válidas para el campo expense_category */
const VALID_CATEGORIES: ExpenseCategory[] = [
  'combustible', 'transporte', 'peajes', 'parqueaderos',
  'materiales', 'consumibles', 'alimentacion', 'otro',
];

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectModel(Invoice) private readonly invoices: typeof Invoice,
    @InjectModel(Worker) private readonly workers: typeof Worker,
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    @InjectModel(BoxAssignment) private readonly assignments: typeof BoxAssignment,
    private readonly storage: StorageService,
    private readonly gemini: GeminiService,
    private readonly audit: AuditService,
    private readonly supportDocs: BoxDocumentsService,
  ) {}

  /**
   * Sube un documento, lo clasifica con la IA y lo guarda donde corresponda.
   *
   * @param opts.routeSupportDocuments cuando la IA determina que el archivo no
   * es un gasto (RUT, cédula, cámara de comercio), lo archiva como anexo de la
   * caja en vez de crear una factura basura. Lo activa la carga desde el panel;
   * WhatsApp lo deja apagado para conservar su flujo actual.
   */
  async createFromUpload(
    file: Express.Multer.File,
    workerId: string,
    opts: { routeSupportDocuments?: boolean; uploadedBy?: string } = {},
  ): Promise<UploadResult> {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no soportado (${file.mimetype}). Permitidos: ${ALLOWED_MIME.join(', ')}.`,
      );
    }

    const worker = await this.workers.findByPk(workerId);
    if (!worker) throw new NotFoundException('Residente no encontrado');

    const imageUrl = await this.storage.put(file.buffer, file.originalname);

    let extraction;
    try {
      extraction = await this.gemini.extractInvoice({
        mimeType: file.mimetype,
        imageBase64: file.buffer.toString('base64'),
      });
    } catch (err) {
      this.logger.error('Gemini extraction failed', err);
      throw new BadRequestException(
        'No se pudo extraer la factura. Reintenta o sube otra imagen.',
      );
    }

    const data = extraction.extracted as Record<string, unknown>;

    // ── Clasificación del documento ──
    const kind = toStringOrNull(data.document_kind)?.toLowerCase();

    // No es un gasto: se archiva como anexo de la caja y no entra a la cola.
    if (kind === 'soporte' && opts.routeSupportDocuments) {
      const document = await this.supportDocs.createFromClassification({
        workerId,
        fileUrl: imageUrl,
        file,
        subtype: toStringOrNull(data.document_subtype),
        uploadedBy: opts.uploadedBy ?? null,
      });
      return { kind: 'document', document };
    }

    const documentType: DocumentType =
      kind === 'cuenta_cobro' ? 'cuenta_cobro' : 'factura';

    // Regla de negocio: sin identificación del proveedor la confianza máxima es 10%.
    // En una cuenta de cobro esa identificación es la cédula de quien presta el
    // servicio, y va en el mismo campo.
    let confidenceScore =
      typeof data.confidence_score === 'number' ? data.confidence_score : null;
    const vendorNit = toStringOrNull(data.vendor_nit);
    if (!vendorNit && confidenceScore !== null) {
      confidenceScore = Math.min(confidenceScore, 0.10);
    }

    // ── Categoría de gasto (Regla 3) ──
    const rawCategory = toStringOrNull(data.expense_category);
    const expenseCategory: ExpenseCategory | null =
      rawCategory && VALID_CATEGORIES.includes(rawCategory as ExpenseCategory)
        ? (rawCategory as ExpenseCategory)
        : 'otro';

    // ── Determinar si requiere aprobación especial ──
    let requiresSpecialApproval = false;
    const reasons: string[] = [];

    // Sin identificación del proveedor → requiere admin
    if (!vendorNit) {
      requiresSpecialApproval = true;
      reasons.push(documentType === 'cuenta_cobro' ? 'Sin cédula' : 'Sin NIT');
    }

    // Confidence bajo → requiere admin
    if (confidenceScore !== null && confidenceScore < 0.6) {
      requiresSpecialApproval = true;
      reasons.push('Confianza baja');
    }

    // Categoría restringida (alimentación) → requiere admin
    if (expenseCategory && RESTRICTED_CATEGORIES.includes(expenseCategory)) {
      requiresSpecialApproval = true;
      reasons.push(`Categoría restringida: ${expenseCategory}`);
    }

    // ── CUFE/CUDE (factura electrónica DIAN) ──
    // Se guarda tal como se leyó (normalizado); un formato dudoso no bloquea la
    // factura, solo se registra para que el aprobador lo revise contra la imagen.
    //
    // Se conserva incluso si el documento se clasificó como cuenta de cobro: que
    // una cuenta de cobro no DEBA tener CUFE no justifica botar el dato cuando la
    // IA sí lo leyó. Al contrario, es la señal de que la clasificación falló y de
    // que en realidad era una factura electrónica.
    const cufe = normalizeCufe(data.cufe);
    if (cufe && !CUFE_PATTERN.test(cufe)) {
      this.logger.warn(
        `CUFE con formato inesperado (${cufe.length} caracteres, se esperaban 96 hex). Requiere verificación manual.`,
      );
    }
    if (cufe && documentType === 'cuenta_cobro') {
      this.logger.warn(
        'Documento clasificado como cuenta de cobro pero trae CUFE: probablemente sea una factura electrónica mal clasificada.',
      );
    }

    // ── Reporte tardío (Regla 4a) ──
    const invoiceDateStr = toStringOrNull(data.invoice_date);
    let reportedLate = false;
    if (invoiceDateStr) {
      const invoiceDate = new Date(invoiceDateStr);
      const now = new Date();
      const diffMs = now.getTime() - invoiceDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours > 24) {
        reportedLate = true;
        requiresSpecialApproval = true;
        reasons.push('Reporte tardío (>24h)');
      }
    }

    // ── Status: observed si requiere aprobación especial (Regla 8b) ──
    const status = requiresSpecialApproval ? 'observed' : 'pending';

    if (reasons.length > 0) {
      this.logger.log(
        `${documentType === 'cuenta_cobro' ? 'Cuenta de cobro' : 'Factura'} marcada como "${status}" por: ${reasons.join(', ')}`,
      );
    }

    const invoice = await this.invoices.create({
      worker_id: workerId,
      box_id: null,
      image_url: imageUrl,
      document_type: documentType,
      status,
      vendor_nit: vendorNit,
      vendor_name: toStringOrNull(data.vendor_name),
      invoice_number: toStringOrNull(data.invoice_number),
      invoice_date: invoiceDateStr,
      cufe,
      subtotal: toDecimalOrNull(data.subtotal),
      iva: toDecimalOrNull(data.iva),
      total: toDecimalOrNull(data.total) ?? '0',
      currency: toStringOrNull(data.currency) ?? 'COP',
      extracted_data: extraction.extracted,
      confidence_score: confidenceScore,
      expense_category: expenseCategory,
      requires_special_approval: requiresSpecialApproval,
      reported_late: reportedLate,
      submitted_at: new Date(),
    });

    return { kind: 'invoice', invoice: await this.findOne(invoice.id) };
  }

  async list(filters: ListInvoicesDto) {
    const where: WhereOptions = {};
    if (filters.status) where.status = filters.status;
    if (filters.worker_id) where.worker_id = filters.worker_id;
    if (filters.box_id) {
      where.box_id = filters.box_id;
    }

    return this.invoices.findAll({
      where,
      include: [
        { model: Worker, attributes: ['id', 'name', 'document_number', 'phone'] },
        { model: PettyCashBox, attributes: ['id', 'code', 'name', 'type', 'status'] },
      ],
      order: [['submitted_at', 'DESC']],
    });
  }

  async findOne(id: string) {
    const invoice = await this.invoices.findByPk(id, {
      include: [
        { model: Worker, attributes: ['id', 'name', 'document_number', 'phone'] },
        { model: PettyCashBox, attributes: ['id', 'code', 'name', 'type', 'status'] },
        {
          model: Approval,
          include: [{ model: Worker, as: 'approver', attributes: ['id', 'name'] }],
        },
      ],
      order: [[{ model: Approval, as: 'approvals' }, 'created_at', 'DESC']],
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  /**
   * Cajas abiertas asignadas al residente. `sufficient` indica si el saldo alcanza;
   * las que no alcanzan también se devuelven, porque aprobar en negativo está
   * permitido con justificación (deja saldo a favor del residente).
   */
  async eligibleBoxesFor(invoiceId: string) {
    const invoice = await this.invoices.findByPk(invoiceId);
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    const total = parseFloat(invoice.total);

    // Solo cajas abiertas (no bloqueadas ni cerradas)
    const boxes = await this.boxes.findAll({
      where: { status: 'open' },
      include: [
        {
          model: Worker,
          where: { id: invoice.worker_id },
          attributes: [],
          through: { attributes: [] },
          required: true,
        },
      ],
    });

    return boxes.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      type: b.type,
      current_balance: b.current_balance,
      sufficient: parseFloat(b.current_balance) >= total,
    }));
  }

  /** `paranoid: false` para que la papelera pueda seguir mostrando la miniatura. */
  async getImagePath(id: string) {
    const invoice = await this.invoices.findByPk(id, { paranoid: false });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return {
      imageUrl: invoice.image_url,
      mimeType: this.storage.mimeTypeFromPath(invoice.image_url),
    };
  }

  /**
   * Envía una factura rechazada a la papelera. No borra nada: marca `deleted_at`
   * (soft delete de Sequelize), conserva la imagen y el historial de aprobaciones,
   * y la saca de todas las vistas. Se puede restaurar durante 30 días.
   */
  async moveToTrash(id: string, user: AuthUser) {
    const invoice = await this.invoices.findByPk(id, {
      include: [{ model: Worker, attributes: ['id', 'name'] }],
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');

    if (invoice.status !== 'rejected') {
      throw new BadRequestException(
        'Solo se pueden enviar a la papelera facturas rechazadas',
      );
    }

    const before = {
      status: invoice.status,
      vendor_name: invoice.vendor_name,
      total: invoice.total,
      worker: invoice.worker?.name,
    };

    await invoice.update({ deleted_by: user.id });
    await invoice.destroy();
    await invoice.reload({ paranoid: false });

    this.audit.log({
      user,
      action: 'delete',
      entity: 'invoice',
      entityId: invoice.id,
      entityLabel: `Factura enviada a la papelera: ${invoice.vendor_name ?? 'Sin proveedor'} - $${invoice.total}`,
      before,
      after: {
        deleted_at: invoice.deleted_at,
        restorable_until: this.purgeDate(invoice.deleted_at!),
      },
    });

    return {
      id,
      trashed: true,
      deleted_at: invoice.deleted_at,
      restorable_until: this.purgeDate(invoice.deleted_at!),
    };
  }

  /**
   * Facturas en la papelera dentro de la ventana de retención. Pasados los 30
   * días dejan de aparecer aquí, pero la fila permanece en la base de datos.
   *
   * Solo se listan las rechazadas: son las únicas que se pueden mandar a la
   * papelera. Una factura en otro estado con `deleted_at` salió de una caja
   * (removeMovement), no se borró tampoco, pero no es restaurable y por eso no
   * se ofrece aquí.
   */
  async listTrash() {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * DAY_MS);

    const rows = await this.invoices.findAll({
      paranoid: false,
      where: { status: 'rejected', deleted_at: { [Op.gte]: cutoff } },
      include: [
        { model: Worker, attributes: ['id', 'name', 'document_number', 'phone'] },
        { model: PettyCashBox, attributes: ['id', 'code', 'name', 'type', 'status'] },
      ],
      order: [['deleted_at', 'DESC']],
    });

    return rows.map((invoice) => {
      const deletedAt = invoice.deleted_at!;
      return {
        ...invoice.toJSON(),
        restorable_until: this.purgeDate(deletedAt),
        // Se redondea hacia arriba: el día en curso todavía cuenta como disponible.
        days_left: Math.max(
          0,
          Math.ceil((this.purgeDate(deletedAt).getTime() - Date.now()) / DAY_MS),
        ),
      };
    });
  }

  /** Devuelve una factura de la papelera a su estado anterior (sigue rechazada). */
  async restore(id: string, user: AuthUser) {
    const invoice = await this.invoices.findByPk(id, { paranoid: false });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (!invoice.deleted_at) {
      throw new BadRequestException('Esta factura no está en la papelera');
    }

    if (this.purgeDate(invoice.deleted_at).getTime() < Date.now()) {
      throw new BadRequestException(
        `La factura lleva más de ${TRASH_RETENTION_DAYS} días en la papelera y ya no se puede restaurar.`,
      );
    }

    // Restaurar una factura que no está rechazada la devolvería a una caja cuyo
    // saldo ya se recalculó al sacarla, y quedaría descuadrada.
    if (invoice.status !== 'rejected') {
      throw new BadRequestException(
        'Solo se pueden restaurar facturas rechazadas. Esta salió de una caja y su saldo ya fue reajustado.',
      );
    }

    await invoice.restore();
    await invoice.update({ deleted_by: null });

    this.audit.log({
      user,
      action: 'restore',
      entity: 'invoice',
      entityId: invoice.id,
      entityLabel: `Factura restaurada desde la papelera: ${invoice.vendor_name ?? 'Sin proveedor'} - $${invoice.total}`,
      before: { deleted_at: invoice.deleted_at },
      after: { status: invoice.status, deleted_at: null },
    });

    return this.findOne(id);
  }

  /** Fecha a partir de la cual la factura deja de listarse en la papelera. */
  private purgeDate(deletedAt: Date): Date {
    return new Date(new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * DAY_MS);
  }
}

function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function toDecimalOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(2);
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n.toFixed(2);
  }
  return null;
}
