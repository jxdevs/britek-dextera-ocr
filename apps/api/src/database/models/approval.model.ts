import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Worker } from './worker.model';
import { Invoice } from './invoice.model';

export type ApprovalAction = 'approve' | 'reject';

@Table({
  tableName: 'approvals',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class Approval extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Invoice)
  @Column({ type: DataType.UUID, allowNull: false })
  declare invoice_id: string;

  @ForeignKey(() => Worker)
  @Column({ type: DataType.UUID, allowNull: false })
  declare approver_id: string;

  @Column({ type: DataType.ENUM('approve', 'reject'), allowNull: false })
  declare action: ApprovalAction;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare comments: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare edited_fields: Record<string, unknown> | null;

  @BelongsTo(() => Invoice, 'invoice_id')
  declare invoice: Invoice;

  @BelongsTo(() => Worker, 'approver_id')
  declare approver: Worker;
}
