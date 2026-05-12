import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Worker } from './worker.model';

@Table({
  tableName: 'whatsapp_events',
  timestamps: true,
  updatedAt: false,
  underscored: true,
})
export class WhatsappEvent extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => Worker)
  @Column({ type: DataType.UUID, allowNull: true })
  declare worker_id: string | null;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  declare kapso_message_id: string;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare raw_payload: Record<string, unknown>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare processed: boolean;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare error: string | null;
}
