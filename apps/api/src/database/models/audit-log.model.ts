import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Worker } from './worker.model';

export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'close'
  | 'approve'
  | 'reject';

@Table({ tableName: 'audit_logs', timestamps: true, updatedAt: false, underscored: true })
export class AuditLog extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Worker)
  @Column({ type: DataType.UUID, allowNull: true })
  declare user_id: string | null;

  @Column({ type: DataType.STRING, allowNull: false })
  declare user_name: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare user_role: string;

  @Column({
    type: DataType.ENUM(
      'login_success', 'login_failed',
      'create', 'update', 'delete', 'restore',
      'close', 'approve', 'reject',
    ),
    allowNull: false,
  })
  declare action: AuditAction;

  @Column({ type: DataType.STRING, allowNull: false })
  declare entity: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare entity_id: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare entity_label: string | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare before: Record<string, unknown> | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare after: Record<string, unknown> | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare ip: string | null;

  @BelongsTo(() => Worker, 'user_id')
  declare user: Worker;
}
