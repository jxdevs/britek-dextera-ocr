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

export type InvoiceStatus = 'pending' | 'approved' | 'rejected';

@Table({ tableName: 'invoices', timestamps: true, underscored: true })
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
    type: DataType.ENUM('pending', 'approved', 'rejected'),
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

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  declare submitted_at: Date;

  @BelongsTo(() => Worker, 'worker_id')
  declare worker: Worker;

  @BelongsTo(() => PettyCashBox, 'box_id')
  declare box: PettyCashBox | null;

  @HasMany(() => Approval, 'invoice_id')
  declare approvals: Approval[];
}
