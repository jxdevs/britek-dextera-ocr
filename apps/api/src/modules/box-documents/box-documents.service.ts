import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  BoxDocument,
  Invoice,
  PettyCashBox,
  Worker,
  type BoxDocumentType,
} from '../../database/models';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from '../storage/storage.service';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const VALID_TYPES: BoxDocumentType[] = [
  'rut',
  'cedula',
  'camara_comercio',
  'certificacion_bancaria',
  'otro',
];

export const DOCUMENT_TYPE_LABELS: Record<BoxDocumentType, string> = {
  rut: 'RUT',
  cedula: 'Cédula',
  camara_comercio: 'Cámara de comercio',
  certificacion_bancaria: 'Certificación bancaria',
  otro: 'Otro',
};

/**
 * Soportes que identifican a quien presta el servicio en una cuenta de cobro.
 * Se piden por WhatsApp y basta con que llegue uno de los dos.
 */
export const IDENTITY_TYPES: BoxDocumentType[] = ['rut', 'cedula'];

/**
 * Ventana para deducir a qué cuenta de cobro pertenece un soporte que llega
 * suelto. Más allá de esto no se adivina: el anexo queda sin gasto asignado y un
 * admin lo ubica desde la caja.
 */
const ANNEX_LOOKBACK_DAYS = 30;

/** Cuenta de cobro a la que aún le falta identificación del prestador. */
export interface PendingAnnexInvoice {
  invoice: Invoice;
  /** Qué se recibió ya (puede estar vacío). */
  attached: BoxDocumentType[];
  /** rut y/o cedula que aún no llegan. */
  missing: BoxDocumentType[];
}

@Injectable()
export class BoxDocumentsService {
  private readonly logger = new Logger(BoxDocumentsService.name);

  constructor(
    @InjectModel(BoxDocument) private readonly documents: typeof BoxDocument,
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    @InjectModel(Worker) private readonly workers: typeof Worker,
    @InjectModel(Invoice) private readonly invoices: typeof Invoice,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Adjunta un documento a una caja desde el panel. No pasa por la IA: quien lo
   * sube ya sabe qué es, y analizarlo sería gastar tokens en un RUT.
   */
  async create(
    boxId: string,
    file: Express.Multer.File,
    input: {
      doc_type?: string;
      description?: string;
      worker_id?: string;
      invoice_id?: string;
    },
    user: AuthUser,
  ) {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no soportado (${file.mimetype}). Permitidos: ${ALLOWED_MIME.join(', ')}.`,
      );
    }

    const box = await this.boxes.findByPk(boxId);
    if (!box) throw new NotFoundException('Caja no encontrada');

    if (input.worker_id) {
      const worker = await this.workers.findByPk(input.worker_id);
      if (!worker) throw new NotFoundException('Residente no encontrado');
    }

    if (input.invoice_id) {
      const invoice = await this.invoices.findByPk(input.invoice_id);
      if (!invoice) throw new NotFoundException('Documento de gasto no encontrado');
    }

    const fileUrl = await this.storage.put(file.buffer, file.originalname);

    const document = await this.documents.create({
      box_id: boxId,
      invoice_id: input.invoice_id ?? null,
      worker_id: input.worker_id ?? null,
      doc_type: normalizeType(input.doc_type),
      description: input.description?.trim() || null,
      file_url: fileUrl,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      source: 'manual',
      uploaded_by: user.id,
    });

    this.audit.log({
      user,
      action: 'create',
      entity: 'box_document',
      entityId: document.id,
      entityLabel: `Documento adjunto a la caja ${box.code}: ${DOCUMENT_TYPE_LABELS[document.doc_type]}`,
      after: {
        box_id: boxId,
        doc_type: document.doc_type,
        original_name: file.originalname,
      },
    });

    return this.findOne(document.id);
  }

  /**
   * Archiva un documento que llegó por la cola de facturas o por WhatsApp y que
   * la IA clasificó como soporte.
   *
   * Se cuelga del gasto que se indique (`invoiceId`); si no se indica, se intenta
   * deducir: cuando el residente tiene UNA sola cuenta de cobro reciente a la que
   * le falta justo ese soporte, es esa. Si hay varias no se adivina — el archivo
   * se guarda igual y quien llame decide si preguntar.
   */
  async createFromClassification(input: {
    workerId: string;
    fileUrl: string;
    file: Express.Multer.File;
    subtype: string | null;
    uploadedBy: string | null;
    invoiceId?: string | null;
  }) {
    const docType = normalizeType(input.subtype);

    let invoice: Invoice | null = null;
    if (input.invoiceId) {
      invoice = await this.invoices.findByPk(input.invoiceId);
    } else if (IDENTITY_TYPES.includes(docType)) {
      const pending = await this.pendingAnnexesForWorker(input.workerId, docType);
      if (pending.length === 1) invoice = pending[0].invoice;
    }

    // La caja sale del gasto cuando ya la tiene; si no (cuenta de cobro aún sin
    // asignar), se cae al mismo criterio de antes: la única caja abierta.
    let boxId = invoice?.box_id ?? null;
    if (!boxId) {
      const openBoxes = await this.openBoxesForWorker(input.workerId);
      boxId = openBoxes.length === 1 ? openBoxes[0].id : null;
      if (!boxId) {
        this.logger.log(
          `Soporte de residente ${input.workerId} queda sin caja asignada (${openBoxes.length} cajas abiertas).`,
        );
      }
    }

    const document = await this.documents.create({
      box_id: boxId,
      invoice_id: invoice?.id ?? null,
      worker_id: input.workerId,
      doc_type: docType,
      description: null,
      file_url: input.fileUrl,
      original_name: input.file.originalname,
      mime_type: input.file.mimetype,
      size_bytes: input.file.size,
      source: 'auto',
      uploaded_by: input.uploadedBy,
    });

    return this.findOne(document.id);
  }

  listByBox(boxId: string) {
    return this.documents.findAll({
      where: { box_id: boxId },
      include: [
        { model: Worker, attributes: ['id', 'name'] },
        {
          model: Invoice,
          required: false,
          attributes: ['id', 'document_type', 'invoice_number', 'vendor_name', 'total'],
        },
      ],
      order: [['created_at', 'DESC']],
    });
  }

  /** Soportes colgados de un gasto concreto. */
  listByInvoice(invoiceId: string) {
    return this.documents.findAll({
      where: { invoice_id: invoiceId },
      include: [{ model: Worker, attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
    });
  }

  /**
   * Cuentas de cobro recientes del residente a las que les falta identificación
   * del prestador (RUT o cédula). Es la base del flujo de WhatsApp: en vez de
   * recordar en una sesión qué se le pidió, se recalcula desde los datos, así el
   * residente puede mandar el RUT hoy y la cédula la semana entrante.
   *
   * @param docType si se pasa, solo devuelve las que les falta ESE soporte.
   */
  async pendingAnnexesForWorker(
    workerId: string,
    docType?: BoxDocumentType,
  ): Promise<PendingAnnexInvoice[]> {
    const since = new Date(Date.now() - ANNEX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const invoices = await this.invoices.findAll({
      where: {
        worker_id: workerId,
        document_type: 'cuenta_cobro',
        // Una cuenta de cobro rechazada no necesita soportes.
        status: { [Op.in]: ['pending', 'observed', 'approved'] },
        submitted_at: { [Op.gte]: since },
      },
      include: [
        {
          model: BoxDocument,
          as: 'annexes',
          required: false,
          attributes: ['id', 'doc_type'],
        },
      ],
      order: [['submitted_at', 'DESC']],
    });

    return invoices
      .map((invoice) => {
        const attached = (invoice.annexes ?? [])
          .map((d) => d.doc_type)
          .filter((t) => IDENTITY_TYPES.includes(t));
        return {
          invoice,
          attached,
          missing: IDENTITY_TYPES.filter((t) => !attached.includes(t)),
        };
      })
      .filter((row) =>
        docType ? row.missing.includes(docType) : row.missing.length > 0,
      );
  }

  /**
   * Cuelga un soporte ya guardado de un gasto (y de su caja). Lo usan tanto el
   * panel como el flujo de WhatsApp cuando el residente elige a qué cuenta de
   * cobro corresponde; sin `user` no se audita, igual que el resto del flujo de
   * WhatsApp, y queda solo en el log.
   */
  async attachToInvoice(id: string, invoiceId: string, user?: AuthUser) {
    const document = await this.findOne(id);
    const invoice = await this.invoices.findByPk(invoiceId);
    if (!invoice) throw new NotFoundException('Documento de gasto no encontrado');

    const before = { invoice_id: document.invoice_id, box_id: document.box_id };
    await document.update({
      invoice_id: invoice.id,
      box_id: invoice.box_id ?? document.box_id,
    });

    if (user) {
      this.audit.log({
        user,
        action: 'update',
        entity: 'box_document',
        entityId: id,
        entityLabel: `Soporte ${DOCUMENT_TYPE_LABELS[document.doc_type]} anexado a un gasto`,
        before,
        after: { invoice_id: invoice.id, box_id: invoice.box_id },
      });
    } else {
      this.logger.log(
        `Soporte ${id} (${document.doc_type}) anexado al gasto ${invoice.id}`,
      );
    }

    return this.findOne(id);
  }

  /**
   * Corrige el tipo de un soporte. Se usa cuando la IA no distinguió el RUT de
   * la cédula y el residente lo aclara con un botón en WhatsApp.
   */
  async setDocType(id: string, docType: BoxDocumentType) {
    const document = await this.findOne(id);
    await document.update({ doc_type: docType });
    return this.findOne(id);
  }

  private openBoxesForWorker(workerId: string) {
    return this.boxes.findAll({
      where: { status: 'open' },
      include: [
        {
          model: Worker,
          where: { id: workerId },
          attributes: [],
          through: { attributes: [] },
          required: true,
        },
      ],
    });
  }

  /** Documentos que la IA archivó pero que no se pudieron asignar a una caja. */
  listUnassigned() {
    return this.documents.findAll({
      where: { box_id: null },
      include: [{ model: Worker, attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
    });
  }

  async findOne(id: string) {
    const document = await this.documents.findByPk(id, {
      include: [
        { model: Worker, attributes: ['id', 'name'] },
        { model: PettyCashBox, attributes: ['id', 'code', 'name'] },
        {
          model: Invoice,
          required: false,
          attributes: ['id', 'document_type', 'invoice_number', 'vendor_name', 'total'],
        },
      ],
    });
    if (!document) throw new NotFoundException('Documento no encontrado');
    return document;
  }

  /** Mueve un documento sin asignar (o mal asignado) a la caja indicada. */
  async assignToBox(id: string, boxId: string, user: AuthUser) {
    const document = await this.findOne(id);
    const box = await this.boxes.findByPk(boxId);
    if (!box) throw new NotFoundException('Caja no encontrada');

    const previous = document.box_id;
    await document.update({ box_id: boxId });

    this.audit.log({
      user,
      action: 'update',
      entity: 'box_document',
      entityId: id,
      entityLabel: `Documento asignado a la caja ${box.code}`,
      before: { box_id: previous },
      after: { box_id: boxId },
    });

    return this.findOne(id);
  }

  async getFilePath(id: string) {
    const document = await this.documents.findByPk(id, { paranoid: false });
    if (!document) throw new NotFoundException('Documento no encontrado');
    return {
      fileUrl: document.file_url,
      mimeType: document.mime_type ?? this.storage.mimeTypeFromPath(document.file_url),
      originalName: document.original_name ?? 'documento',
    };
  }

  /** Igual que con las facturas: no se borra el archivo, solo deja de listarse. */
  async remove(id: string, user: AuthUser) {
    const document = await this.findOne(id);

    await document.update({ deleted_at: new Date() });

    this.audit.log({
      user,
      action: 'delete',
      entity: 'box_document',
      entityId: id,
      entityLabel: `Documento adjunto eliminado: ${DOCUMENT_TYPE_LABELS[document.doc_type]}`,
      before: { box_id: document.box_id, doc_type: document.doc_type },
    });

    return { id, deleted: true };
  }
}

function normalizeType(raw: string | null | undefined): BoxDocumentType {
  const value = raw?.trim().toLowerCase();
  return value && VALID_TYPES.includes(value as BoxDocumentType)
    ? (value as BoxDocumentType)
    : 'otro';
}
