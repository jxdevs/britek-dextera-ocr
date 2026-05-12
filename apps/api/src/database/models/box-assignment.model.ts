import { Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { Worker } from './worker.model';
import { PettyCashBox } from './petty-cash-box.model';

@Table({ tableName: 'box_assignments', timestamps: true, underscored: true })
export class BoxAssignment extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare id: string;

  @ForeignKey(() => PettyCashBox)
  @Column({ type: DataType.UUID, allowNull: false })
  declare box_id: string;

  @ForeignKey(() => Worker)
  @Column({ type: DataType.UUID, allowNull: false })
  declare worker_id: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare is_primary: boolean;
}
