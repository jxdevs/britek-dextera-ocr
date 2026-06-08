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
  Invoice,
  PettyCashBox,
  Worker,
} from '../../database/models';
import type { ExpenseCategory } from '../../database/models/invoice.model';
import { GeminiService } from '../ai/gemini.service';
import { StorageService } from '../storage/storage.service';
import { ListInvoicesDto } from './dto/list-invoices.dto';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

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
    @InjectModel(Approval) private readonly approvals: typeof Approval,
    private readonly storage: StorageService,
    private readonly gemini: GeminiService,
  ) {}

  async createFromUpload(file: Express.Multer.File, workerId: string) {
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

    // Regla de negocio: sin NIT el nivel de confianza máximo es 10%
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

    // Sin NIT → requiere admin
    if (!vendorNit) {
      requiresSpecialApproval = true;
      reasons.push('Sin NIT');
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
        `Factura marcada como "${status}" por: ${reasons.join(', ')}`,
      );
    }

    const invoice = await this.invoices.create({
      worker_id: workerId,
      box_id: null,
      image_url: imageUrl,
      status,
      vendor_nit: vendorNit,
      vendor_name: toStringOrNull(data.vendor_name),
      invoice_number: toStringOrNull(data.invoice_number),
      invoice_date: invoiceDateStr,
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

    return this.findOne(invoice.id);
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

  /** Returns the cajas the worker can use right now: open + balance >= invoice total. */
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

  async getImagePath(id: string) {
    const invoice = await this.invoices.findByPk(id);
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return {
      imageUrl: invoice.image_url,
      mimeType: this.storage.mimeTypeFromPath(invoice.image_url),
    };
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
