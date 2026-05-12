import { BelongsToMany, Column, DataType, HasMany, Model, Table } from 'sequelize-typescript';
import { PettyCashBox } from './petty-cash-box.model';
import { BoxAssignment } from './box-assignment.model';
import { Invoice } from './invoice.model';
import { Approval } from './approval.model';

export type WorkerRole = 'worker' | 'approver' | 'admin';

@Table({ tableName: 'workers', timestamps: true, underscored: true })
export class Worker extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare document_number: string;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  declare phone: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING, allowNull: true })
  declare email: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  declare password_hash: string | null;

  @Column({
    type: DataType.ENUM('worker', 'approver', 'admin'),
    allowNull: false,
    defaultValue: 'worker',
  })
  declare role: WorkerRole;

  @HasMany(() => Invoice, 'worker_id')
  declare invoices: Invoice[];

  @HasMany(() => Approval, 'approver_id')
  declare approvals: Approval[];

  @BelongsToMany(() => PettyCashBox, () => BoxAssignment)
  declare boxes: PettyCashBox[];
}
