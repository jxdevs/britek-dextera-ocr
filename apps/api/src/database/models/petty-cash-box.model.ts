import {
  BelongsToMany,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
} from 'sequelize-typescript';
import { Worker } from './worker.model';
import { BoxAssignment } from './box-assignment.model';
import { Invoice } from './invoice.model';

export type BoxType = 'individual' | 'shared';
export type BoxStatus = 'open' | 'closed' | 'blocked';

@Table({ tableName: 'petty_cash_boxes', timestamps: true, underscored: true })
export class PettyCashBox extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  declare code: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.ENUM('individual', 'shared'), allowNull: false })
  declare type: BoxType;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false })
  declare initial_amount: string;

  @Column({ type: DataType.DECIMAL(14, 2), allowNull: false })
  declare current_balance: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare opened_at: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare closed_at: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare expires_at: Date | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare project_name: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare cost_center: string | null;

  @Column({
    type: DataType.ENUM('open', 'closed', 'blocked'),
    allowNull: false,
    defaultValue: 'open',
  })
  declare status: BoxStatus;

  @ForeignKey(() => Worker)
  @Column({ type: DataType.UUID, allowNull: true })
  declare created_by: string | null;

  @BelongsToMany(() => Worker, () => BoxAssignment)
  declare workers: Worker[];

  @HasMany(() => Invoice, 'box_id')
  declare invoices: Invoice[];
}
