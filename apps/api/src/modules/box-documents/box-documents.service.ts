import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  BoxDocument,
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

@Injectable()
export class BoxDocumentsService {
  private readonly logger = new Logger(BoxDocumentsService.name);

  constructor(
    @InjectModel(BoxDocument) private readonly documents: typeof BoxDocument,
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    @InjectModel(Worker) private readonly workers: typeof Worker,
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
    input: { doc_type?: string; description?: string; worker_id?: string },
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

    const fileUrl = await this.storage.put(file.buffer, file.originalname);

    const document = await this.documents.create({
      box_id: boxId,
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
   * Archiva un documento que llegó por la cola de facturas y que la IA clasificó
   * como soporte. Se adjunta a la caja abierta del residente cuando no hay
   * ambigüedad; si tiene varias (o ninguna), queda sin asignar para que un admin
   * lo ubique desde el detalle de la caja.
   */
  async createFromClassification(input: {
    workerId: string;
    fileUrl: string;
    file: Express.Multer.File;
    subtype: string | null;
    uploadedBy: string | null;
  }) {
    const openBoxes = await this.boxes.findAll({
      where: { status: 'open' },
      include: [
        {
          model: Worker,
          where: { id: input.workerId },
          attributes: [],
          through: { attributes: [] },
          required: true,
        },
      ],
    });

    const boxId = openBoxes.length === 1 ? openBoxes[0].id : null;
    if (!boxId) {
      this.logger.log(
        `Soporte de residente ${input.workerId} queda sin caja asignada (${openBoxes.length} cajas abiertas).`,
      );
    }

    const document = await this.documents.create({
      box_id: boxId,
      worker_id: input.workerId,
      doc_type: normalizeType(input.subtype),
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
      include: [{ model: Worker, attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
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
