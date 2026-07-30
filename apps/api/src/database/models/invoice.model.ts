import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Worker } from './worker.model';
import { PettyCashBox } from './petty-cash-box.model';
import { Approval } from './approval.model';
import { BoxDocument } from './box-document.model';

export type InvoiceStatus = 'pending' | 'observed' | 'approved' | 'rejected';

/**
 * Tipo de soporte de gasto. Ambos descuentan de la caja y se legalizan; cambian
 * las reglas de validación (una cuenta de cobro no lleva IVA ni CUFE y se
 * identifica con la cédula del prestador).
 *
 * Los documentos que NO son gasto (RUT, cédula, cámara de comercio) no entran
 * aquí: viven en la tabla `box_documents`.
 */
export type DocumentType = 'factura' | 'cuenta_cobro';

export type ExpenseCategory =
  | 'combustible'
  | 'transporte'
  | 'peajes'
  | 'parqueaderos'
  | 'materiales'
  | 'consumibles'
  | 'alimentacion'
  | 'otro';

/**
 * `paranoid: true` — las facturas nunca se borran de la base. El botón de la UI
 * las envía a la papelera (marca `deleted_at`) y Sequelize las excluye de todas
 * las consultas normales. Se pueden restaurar durante la ventana de retención
 * (`TRASH_RETENTION_DAYS` en invoices.service); después solo dejan de listarse,
 * pero la fila sigue ahí.
 */
@Table({
  tableName: 'invoices',
  timestamps: true,
  underscored: true,
  paranoid: true,
  deletedAt: 'deleted_at',
})
export class Invoice extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => PettyCashBox)
  @Column({ type: DataType.UUID, allowNull: true })
  declare box_id: string | null;

  @ForeignKey(() => Worker)
  @Column({ type: DataType.UUID, allowNull: false })
  declare worker_id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare image_url: string;

  @Column({
    type: DataType.ENUM('factura', 'cuenta_cobro'),
    allowNull: false,
    defaultValue: 'factura',
  })
  declare document_type: DocumentType;

  @Column({
    type: DataType.ENUM('pending', 'observed', 'approved', 'rejected'),
    allowNull: false,
    defaultValue: 'pending',
  })
  declare status: InvoiceStatus;

  @Column({ type: DataType.STRING, allowNull: true })
  declare vendor_nit: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare vendor_name: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare invoice_number: string | null;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare invoice_date: string | null;

  /** CUFE/CUDE de factura electrónica DIAN (96 hex). Null en tirillas POS y recibos manuales. */
  @Column({ type: DataType.STRING(100), allowNull: true })
  declare cufe: string | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  declare subtotal: string | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: true })
  declare iva: string | null;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false })
  declare total: string;

  @Column({ type: DataType.STRING(8), allowNull: true, defaultValue: 'COP' })
  declare currency: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare extracted_data: Record<string, unknown> | null;

  @Column({ type: DataType.FLOAT, allowNull: true })
  declare confidence_score: number | null;

  @Column({
    type: DataType.ENUM(
      'combustible', 'transporte', 'peajes', 'parqueaderos',
      'materiales', 'consumibles', 'alimentacion', 'otro',
    ),
    allowNull: true,
  })
  declare expense_category: ExpenseCategory | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare requires_special_approval: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare reported_late: boolean;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare submitted_at: Date;

  /** Momento en que se envió a la papelera. null = activa. Lo gestiona Sequelize. */
  @Column({ type: DataType.DATE, allowNull: true })
  declare deleted_at: Date | null;

  /**
   * Quién la envió a la papelera. Sin @ForeignKey a propósito: una segunda
   * asociación a Worker volvería ambiguos los `include: [{ model: Worker }]`
   * que ya usan worker_id.
   */
  @Column({ type: DataType.UUID, allowNull: true })
  declare deleted_by: string | null;

  @BelongsTo(() => Worker, 'worker_id')
  declare worker: Worker;

  @BelongsTo(() => PettyCashBox, 'box_id')
  declare box: PettyCashBox | null;

  @HasMany(() => Approval, 'invoice_id')
  declare approvals: Approval[];

  /**
   * Soportes que acompañan a este gasto (RUT, cédula del prestador). Van aparte
   * porque no tienen valor ni se legalizan; aquí solo se exponen para saber si a
   * una cuenta de cobro le falta identificación.
   */
  @HasMany(() => BoxDocument, 'invoice_id')
  declare annexes: BoxDocument[];
}
