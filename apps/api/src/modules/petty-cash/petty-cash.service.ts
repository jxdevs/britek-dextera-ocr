import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  Approval,
  BoxAssignment,
  Invoice,
  PettyCashBox,
  Worker,
} from '../../database/models';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AssignWorkersDto } from './dto/assign-workers.dto';
import { CreateBoxDto } from './dto/create-box.dto';

@Injectable()
export class PettyCashService {
  constructor(
    private readonly sequelize: Sequelize,
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    @InjectModel(BoxAssignment) private readonly assignments: typeof BoxAssignment,
    @InjectModel(Worker) private readonly workers: typeof Worker,
    @InjectModel(Invoice) private readonly invoices: typeof Invoice,
    @InjectModel(Approval) private readonly approvals: typeof Approval,
  ) {}

  list() {
    return this.boxes.findAll({
      include: [
        {
          model: Worker,
          attributes: ['id', 'name', 'document_number', 'phone'],
          through: { attributes: ['is_primary'] },
        },
      ],
      order: [
        ['status', 'ASC'],
        ['opened_at', 'DESC'],
      ],
    });
  }

  async findOne(id: string) {
    const box = await this.boxes.findByPk(id, {
      include: [
        {
          model: Worker,
          attributes: ['id', 'name', 'document_number', 'phone'],
          through: { attributes: ['is_primary'] },
        },
      ],
    });
    if (!box) throw new NotFoundException('Caja no encontrada');
    return box;
  }

  async create(dto: CreateBoxDto, user: AuthUser) {
    this.validateTypeVsWorkers(dto.type, dto.worker_ids);
    if (dto.primary_worker_id && !dto.worker_ids.includes(dto.primary_worker_id)) {
      throw new BadRequestException(
        'primary_worker_id debe estar dentro de worker_ids',
      );
    }
    await this.assertWorkersExist(dto.worker_ids);

    try {
      const box = await this.sequelize.transaction(async (t) => {
        const created = await this.boxes.create(
          {
            code: dto.code,
            name: dto.name,
            type: dto.type,
            initial_amount: dto.initial_amount.toFixed(2),
            current_balance: dto.initial_amount.toFixed(2),
            opened_at: new Date(),
            status: 'open',
            created_by: user.id,
          },
          { transaction: t },
        );

        const primary = dto.primary_worker_id ?? dto.worker_ids[0];
        await this.assignments.bulkCreate(
          dto.worker_ids.map((wid) => ({
            box_id: created.id,
            worker_id: wid,
            is_primary: wid === primary,
          })),
          { transaction: t },
        );

        return created;
      });

      return this.findOne(box.id);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async close(id: string) {
    const box = await this.boxes.findByPk(id);
    if (!box) throw new NotFoundException('Caja no encontrada');
    if (box.status === 'closed') {
      throw new ConflictException('La caja ya estaba cerrada');
    }
    await box.update({ status: 'closed', closed_at: new Date() });
    return this.findOne(id);
  }

  async assign(id: string, dto: AssignWorkersDto) {
    const box = await this.boxes.findByPk(id);
    if (!box) throw new NotFoundException('Caja no encontrada');
    if (box.status !== 'open') {
      throw new ConflictException('No se pueden modificar asignaciones de una caja cerrada');
    }
    this.validateTypeVsWorkers(box.type, dto.worker_ids);
    if (dto.primary_worker_id && !dto.worker_ids.includes(dto.primary_worker_id)) {
      throw new BadRequestException(
        'primary_worker_id debe estar dentro de worker_ids',
      );
    }
    await this.assertWorkersExist(dto.worker_ids);

    await this.sequelize.transaction(async (t) => {
      await this.assignments.destroy({ where: { box_id: id }, transaction: t });
      const primary = dto.primary_worker_id ?? dto.worker_ids[0];
      await this.assignments.bulkCreate(
        dto.worker_ids.map((wid) => ({
          box_id: id,
          worker_id: wid,
          is_primary: wid === primary,
        })),
        { transaction: t },
      );
    });

    return this.findOne(id);
  }

  async movements(id: string) {
    const box = await this.boxes.findByPk(id);
    if (!box) throw new NotFoundException('Caja no encontrada');

    return this.approvals.findAll({
      where: { action: 'approve' },
      include: [
        {
          model: Invoice,
          where: { box_id: id, status: 'approved' },
          required: true,
          attributes: ['id', 'vendor_name', 'invoice_number', 'invoice_date', 'total'],
        },
        {
          model: Worker,
          as: 'approver',
          attributes: ['id', 'name'],
        },
      ],
      order: [['created_at', 'DESC']],
    });
  }

  private validateTypeVsWorkers(type: 'individual' | 'shared', worker_ids: string[]) {
    if (type === 'individual' && worker_ids.length !== 1) {
      throw new BadRequestException(
        'Una caja individual debe tener exactamente 1 trabajador asignado',
      );
    }
  }

  private async assertWorkersExist(ids: string[]) {
    const count = await this.workers.count({ where: { id: ids } });
    if (count !== ids.length) {
      throw new BadRequestException('Alguno de los trabajadores no existe');
    }
  }

  private mapError(err: unknown) {
    if (err instanceof UniqueConstraintError) {
      return new ConflictException(
        `Ya existe una caja con ${err.errors.map((e) => e.path).join(', ')}`,
      );
    }
    return err as Error;
  }
}
