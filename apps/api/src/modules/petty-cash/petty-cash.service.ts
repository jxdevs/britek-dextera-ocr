import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { AssignWorkersDto } from './dto/assign-workers.dto';
import { CreateBoxDto } from './dto/create-box.dto';
import { UpdateBoxDto } from './dto/update-box.dto';

@Injectable()
export class PettyCashService {
  private readonly logger = new Logger(PettyCashService.name);

  constructor(
    private readonly sequelize: Sequelize,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
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
    if (dto.initial_amount > 1_000_000) {
      throw new BadRequestException(
        'El monto inicial no puede superar $1.000.000',
      );
    }
    await this.assertWorkersExist(dto.worker_ids);
    await this.assertNoOpenBoxForWorkers(dto.worker_ids);

    try {
      const box = await this.sequelize.transaction(async (t) => {
        const created = await this.boxes.create(
          {
            code: dto.code,
            name: dto.name,
            type: dto.type,
            initial_amount: dto.initial_amount.toFixed(2),
            current_balance: dto.initial_amount.toFixed(2),
            project_name: dto.project_name,
            cost_center: dto.cost_center,
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

      const result = await this.findOne(box.id);

      this.audit.log({
        user,
        action: 'create',
        entity: 'petty_cash_box',
        entityId: box.id,
        entityLabel: `${dto.name} - ${dto.code}`,
        after: { code: dto.code, name: dto.name, type: dto.type, initial_amount: dto.initial_amount },
      });

      return result;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async close(id: string, user: AuthUser) {
    const box = await this.boxes.findByPk(id);
    if (!box) throw new NotFoundException('Caja no encontrada');
    if (box.status === 'closed') {
      throw new ConflictException('La caja ya estaba cerrada');
    }
    const beforeBalance = box.current_balance;
    await box.update({ status: 'closed', closed_at: new Date() });

    this.audit.log({
      user,
      action: 'close',
      entity: 'petty_cash_box',
      entityId: id,
      entityLabel: `${box.name} - ${box.code}`,
      before: { status: 'open', current_balance: beforeBalance },
      after: { status: 'closed', closed_at: new Date().toISOString() },
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateBoxDto, user: AuthUser) {
    const box = await this.boxes.findByPk(id);
    if (!box) throw new NotFoundException('Caja no encontrada');

    const updates: Record<string, unknown> = {};
    if (dto.code !== undefined) updates.code = dto.code;
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.project_name !== undefined) updates.project_name = dto.project_name;
    if (dto.cost_center !== undefined) updates.cost_center = dto.cost_center;

    if (dto.initial_amount !== undefined) {
      updates.initial_amount = dto.initial_amount.toFixed(2);

      // Auto-recalcular current_balance para preservar el monto consumido
      if (dto.current_balance === undefined) {
        const oldInitial = parseFloat(box.initial_amount);
        const oldBalance = parseFloat(box.current_balance);
        const consumed = oldInitial - oldBalance; // monto ya legalizado
        const newBalance = Math.max(0, dto.initial_amount - consumed);
        updates.current_balance = newBalance.toFixed(2);
      }
    }

    if (dto.current_balance !== undefined)
      updates.current_balance = dto.current_balance.toFixed(2);

    if (Object.keys(updates).length === 0) {
      return this.findOne(id);
    }

    const beforeData: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      beforeData[key] = (box as any)[key];
    }

    try {
      await box.update(updates);
    } catch (err) {
      throw this.mapError(err);
    }

    this.audit.log({
      user,
      action: 'update',
      entity: 'petty_cash_box',
      entityId: id,
      entityLabel: `${box.name} - ${box.code}`,
      before: beforeData,
      after: updates,
    });

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

  /**
   * Reverts an approved movement: deletes the approval, restores the box balance,
   * and sets the invoice back to pending. Admin only.
   */
  async removeMovement(boxId: string, approvalId: string, user: AuthUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Solo un admin puede eliminar movimientos');
    }

    const box = await this.boxes.findByPk(boxId);
    if (!box) throw new NotFoundException('Caja no encontrada');

    const approval = await this.approvals.findByPk(approvalId, {
      include: [{ model: Invoice }],
    });
    if (!approval) throw new NotFoundException('Movimiento no encontrado');

    const invoice = approval.invoice;
    if (!invoice || invoice.box_id !== boxId) {
      throw new BadRequestException('El movimiento no pertenece a esta caja');
    }

    const invoiceTotal = parseFloat(invoice.total);

    await this.sequelize.transaction(async (t) => {
      // 1. Restore box balance
      const currentBalance = parseFloat(box.current_balance);
      const restoredBalance = (currentBalance + invoiceTotal).toFixed(2);
      await box.update({ current_balance: restoredBalance }, { transaction: t });

      // 2. Reset invoice: remove box assignment and set back to pending
      await invoice.update(
        { box_id: null, status: 'pending' },
        { transaction: t },
      );

      // 3. Delete the approval record
      await approval.destroy({ transaction: t });

      // 4. Audit log
      this.audit.log({
        user,
        action: 'delete',
        entity: 'approval',
        entityId: approvalId,
        entityLabel: `Movimiento eliminado: ${invoice.vendor_name ?? 'Sin proveedor'} - $${invoiceTotal.toFixed(2)}`,
        before: {
          status: 'approved',
          box_id: boxId,
          total: invoice.total,
          box_balance: box.current_balance,
        },
        after: {
          status: 'pending',
          box_id: null,
          restored_balance: restoredBalance,
        },
      });

      this.logger.warn(
        `Admin ${user.name} eliminó movimiento ${approvalId} de caja ${box.code}. Saldo restaurado: ${box.current_balance} → ${restoredBalance}`,
      );
    });

    return { id: approvalId, deleted: true };
  }

  async remove(id: string, user: AuthUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Solo un admin puede eliminar cajas');
    }

    const box = await this.boxes.findByPk(id);
    if (!box) throw new NotFoundException('Caja no encontrada');

    await this.sequelize.transaction(async (t) => {
      // 1. Get all invoices for this box (we need their image paths & IDs)
      const boxInvoices = await this.invoices.findAll({
        where: { box_id: id },
        attributes: ['id', 'image_url'],
        transaction: t,
      });

      const invoiceIds = boxInvoices.map((inv) => inv.id);

      // 2. Delete approvals linked to those invoices
      if (invoiceIds.length > 0) {
        await this.approvals.destroy({
          where: { invoice_id: invoiceIds },
          transaction: t,
        });
      }

      // 3. Delete the invoices
      await this.invoices.destroy({
        where: { box_id: id },
        transaction: t,
      });

      // 4. Delete box assignments
      await this.assignments.destroy({
        where: { box_id: id },
        transaction: t,
      });

      // 5. Delete the box itself
      await box.destroy({ transaction: t });

      // 6. Delete files from storage (best-effort, after DB commit is guaranteed)
      for (const inv of boxInvoices) {
        if (inv.image_url) {
          try {
            const fs = await import('fs');
            const abs = this.storage.absolute(inv.image_url);
            await fs.promises.unlink(abs);
          } catch (err) {
            this.logger.warn(`No se pudo eliminar archivo ${inv.image_url}: ${err}`);
          }
        }
      }
    });

    this.audit.log({
      user,
      action: 'delete',
      entity: 'petty_cash_box',
      entityId: id,
      entityLabel: `${box.name} - ${box.code}`,
      before: { code: box.code, name: box.name, type: box.type, initial_amount: box.initial_amount, current_balance: box.current_balance, status: box.status },
    });

    return { id, deleted: true };
  }

  private validateTypeVsWorkers(type: 'individual' | 'shared', worker_ids: string[]) {
    if (type === 'individual' && worker_ids.length !== 1) {
      throw new BadRequestException(
        'Una caja individual debe tener exactamente 1 residente asignado',
      );
    }
  }

  private async assertWorkersExist(ids: string[]) {
    const count = await this.workers.count({ where: { id: ids } });
    if (count !== ids.length) {
      throw new BadRequestException('Alguno de los residentes no existe');
    }
  }

  private async assertNoOpenBoxForWorkers(workerIds: string[]) {
    // Find open boxes that have any of the given workers assigned
    const openBoxes = await this.boxes.findAll({
      where: { status: 'open' },
      attributes: ['id', 'code', 'name'],
      include: [
        {
          model: Worker,
          where: { id: workerIds },
          attributes: ['id', 'name'],
          through: { attributes: [] },
          required: true,
        },
      ],
    });

    if (openBoxes.length > 0) {
      const workerNames = openBoxes
        .flatMap((b) => (b as any).workers.map((w: Worker) => w.name));
      const uniqueNames = [...new Set(workerNames)].join(', ');
      const boxCode = openBoxes[0].code;
      throw new ConflictException(
        `El residente ${uniqueNames} ya tiene una caja abierta (${boxCode}). Debe cerrarla antes de abrir otra.`,
      );
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
