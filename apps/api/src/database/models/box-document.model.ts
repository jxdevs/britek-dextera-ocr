import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  Table,
} from 'sequelize-typescript';
import { Invoice } from './invoice.model';
import { PettyCashBox } from './petty-cash-box.model';
import { Worker } from './worker.model';

/** Tipo de soporte adjunto. No son gastos: no tienen valor ni se legalizan. */
export type BoxDocumentType =
  | 'rut'
  | 'cedula'
  | 'camara_comercio'
  | 'certificacion_bancaria'
  | 'otro';

/** Cómo llegó el documento a la caja. */
export type BoxDocumentSource =
  /** Un admin lo adjuntó directamente desde el detalle de la caja. Nunca pasa por la IA. */
  | 'manual'
  /** Se subió por la cola de facturas y la IA determinó que no era un gasto. */
  | 'auto';

/**
 * Documentos que acompañan a una caja menor sin ser un movimiento: copia del RUT
 * del proveedor, cédula del prestador, cámara de comercio, etc.
 *
 * Viven en su propia tabla y no en `invoices` a propósito: no tienen total,
 * estado ni aprobación, así que no pueden colarse en saldos, KPIs, la cola de
 * aprobación ni el Excel de legalización.
 */
@Table({
  tableName: 'box_documents',
  timestamps: true,
  underscored: true,
  paranoid: true,
  deletedAt: 'deleted_at',
})
export class BoxDocument extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  /** Caja a la que acompaña. null cuando aún no se pudo determinar cuál. */
  @ForeignKey(() => PettyCashBox)
  @Column({ type: DataType.UUID, allowNull: true })
  declare box_id: string | null;

  /**
   * Cuenta de cobro (o factura) a la que acompaña. null = anexo de la caja en
   * general, o soporte que llegó sin que se pudiera deducir de qué gasto es.
   *
   * Es lo que permite que el residente mande el RUT hoy y la cédula otro día:
   * cada archivo se cuelga del mismo gasto sin depender de la conversación.
   */
  @ForeignKey(() => Invoice)
  @Column({ type: DataType.UUID, allowNull: true })
  declare invoice_id: string | null;

  /** Residente que aportó el documento. */
  @ForeignKey(() => Worker)
  @Column({ type: DataType.UUID, allowNull: true })
  declare worker_id: string | null;

  @Column({
    type: DataType.ENUM(
      'rut', 'cedula', 'camara_comercio', 'certificacion_bancaria', 'otro',
    ),
    allowNull: false,
    defaultValue: 'otro',
  })
  declare doc_type: BoxDocumentType;

  /** Descripción libre: "RUT de Ferretería El Tornillo", "Cédula Juan Pérez". */
  @Column({ type: DataType.STRING, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare file_url: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare original_name: string | null;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare mime_type: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare size_bytes: number | null;

  @Column({
    type: DataType.ENUM('manual', 'auto'),
    allowNull: false,
    defaultValue: 'manual',
  })
  declare source: BoxDocumentSource;

  /** Usuario que lo subió. Sin @ForeignKey para no volver ambiguos los joins con worker_id. */
  @Column({ type: DataType.UUID, allowNull: true })
  declare uploaded_by: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare deleted_at: Date | null;

  @BelongsTo(() => PettyCashBox, 'box_id')
  declare box: PettyCashBox | null;

  @BelongsTo(() => Invoice, 'invoice_id')
  declare invoice: Invoice | null;

  @BelongsTo(() => Worker, 'worker_id')
  declare worker: Worker | null;
}
