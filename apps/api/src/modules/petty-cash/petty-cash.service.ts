import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, UniqueConstraintError } from 'sequelize';
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

/** Tope máximo de caja menor sin excepción */
const MAX_BOX_AMOUNT = 1_000_000;
/** Días de plazo para legalizar una caja */
const BOX_DEADLINE_DAYS = 7;
/** Máximo de cajas abiertas por residente (la segunda solo como excepción de admin) */
const MAX_OPEN_BOXES_PER_WORKER = 2;

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

  async list() {
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

  // ════════════════════════════════════════════════════════════════════
  // CONSULTA PARA WORKERS (solo lectura)
  // ════════════════════════════════════════════════════════════════════

  async listByWorker(workerId: string) {
    return this.boxes.findAll({
      include: [
        {
          model: Worker,
          attributes: ['id', 'name', 'document_number', 'phone'],
          through: { attributes: ['is_primary'] },
        },
      ],
      where: {
        id: {
          [Op.in]: Sequelize.literal(
            `(SELECT box_id FROM box_assignments WHERE worker_id = '${workerId}')`,
          ),
        },
      },
      order: [
        ['status', 'ASC'],
        ['opened_at', 'DESC'],
      ],
    });
  }

  async findOneByWorker(boxId: string, workerId: string) {
    const box = await this.boxes.findByPk(boxId, {
      include: [
        {
          model: Worker,
          attributes: ['id', 'name', 'document_number', 'phone'],
          through: { attributes: ['is_primary'] },
        },
      ],
    });
    if (!box) throw new NotFoundException('Caja no encontrada');

    const isAssigned = (box as any).workers?.some(
      (w: Worker) => w.id === workerId,
    );
    if (!isAssigned) {
      throw new ForbiddenException('No tienes acceso a esta caja');
    }

    return box;
  }

  async movementsByWorker(boxId: string, workerId: string) {
    // Validate worker is assigned to this box
    await this.findOneByWorker(boxId, workerId);

    return this.invoices.findAll({
      where: { box_id: boxId },
      attributes: [
        'id', 'vendor_name', 'vendor_nit', 'invoice_number', 'invoice_date', 'cufe',
        'document_type', 'total', 'status', 'submitted_at', 'expense_category',
        'requires_special_approval', 'reported_late',
      ],
      include: [
        {
          model: Approval,
          required: false,
          attributes: ['id', 'action', 'comments', 'created_at'],
          include: [
            { model: Worker, as: 'approver', attributes: ['id', 'name'] },
          ],
        },
      ],
      order: [['submitted_at', 'DESC']],
    });
  }

  async create(dto: CreateBoxDto, user: AuthUser) {
    this.validateTypeVsWorkers(dto.type, dto.worker_ids);
    if (dto.primary_worker_id && !dto.worker_ids.includes(dto.primary_worker_id)) {
      throw new BadRequestException(
        'primary_worker_id debe estar dentro de worker_ids',
      );
    }

    // ── Regla 2b: Tope de $1.000.000 con excepciones ──
    if (dto.initial_amount > MAX_BOX_AMOUNT) {
      if (user.role !== 'admin') {
        throw new ForbiddenException(
          `El monto supera $${MAX_BOX_AMOUNT.toLocaleString('es-CO')}. Solo un admin puede crear cajas con excepción al tope.`,
        );
      }
      if (!dto.exception_justification) {
        throw new BadRequestException(
          `El monto supera $${MAX_BOX_AMOUNT.toLocaleString('es-CO')}. Debe incluir una justificación (exception_justification).`,
        );
      }
    }

    await this.assertWorkersExist(dto.worker_ids);
    // ── Regla 1b: No abrir si hay caja abierta O cajas con facturas sin legalizar ──
    // Un admin puede abrir una SEGUNDA caja como excepción justificada.
    const usedSecondBoxException = await this.assertNoOpenBoxForWorkers(
      dto.worker_ids,
      { user, justification: dto.exception_justification },
    );
    await this.assertPreviousBoxesFullyLegalized(dto.worker_ids);

    const openedAt = new Date();
    const expiresAt = new Date(openedAt.getTime() + BOX_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

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
            opened_at: openedAt,
            expires_at: expiresAt,
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

      const auditAfter: Record<string, unknown> = {
        code: dto.code, name: dto.name, type: dto.type,
        initial_amount: dto.initial_amount, expires_at: expiresAt.toISOString(),
      };
      if (dto.initial_amount > MAX_BOX_AMOUNT) {
        auditAfter.exception_justification = dto.exception_justification;
        auditAfter.exception_approved_by = user.name;
      }
      if (usedSecondBoxException) {
        auditAfter.second_box_exception = true;
        auditAfter.exception_justification = dto.exception_justification;
        auditAfter.exception_approved_by = user.name;
      }

      this.audit.log({
        user,
        action: 'create',
        entity: 'petty_cash_box',
        entityId: box.id,
        entityLabel: `${dto.name} - ${dto.code}`,
        after: auditAfter,
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
    const beforeStatus = box.status;
    await box.update({ status: 'closed', closed_at: new Date() });

    this.audit.log({
      user,
      action: 'close',
      entity: 'petty_cash_box',
      entityId: id,
      entityLabel: `${box.name} - ${box.code}`,
      before: { status: beforeStatus, current_balance: beforeBalance },
      after: { status: 'closed', closed_at: new Date().toISOString() },
    });

    return this.findOne(id);
  }

  /** Desbloquea una caja bloqueada, devolviéndola a estado 'open'. Admin only. */
  async unblock(id: string, user: AuthUser) {
    const box = await this.boxes.findByPk(id);
    if (!box) throw new NotFoundException('Caja no encontrada');
    if (box.status !== 'blocked') {
      throw new ConflictException('Solo se pueden desbloquear cajas bloqueadas');
    }

    await box.update({ status: 'open' });

    this.audit.log({
      user,
      action: 'update',
      entity: 'petty_cash_box',
      entityId: id,
      entityLabel: `Desbloqueo: ${box.name} - ${box.code}`,
      before: { status: 'blocked' },
      after: { status: 'open' },
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
      // ── Regla 2b: Tope de $1.000.000 con excepciones ──
      if (dto.initial_amount > MAX_BOX_AMOUNT) {
        if (user.role !== 'admin') {
          throw new ForbiddenException(
            `El monto supera $${MAX_BOX_AMOUNT.toLocaleString('es-CO')}. Solo un admin puede asignar montos con excepción al tope.`,
          );
        }
        if (!dto.exception_justification) {
          throw new BadRequestException(
            `El monto supera $${MAX_BOX_AMOUNT.toLocaleString('es-CO')}. Debe incluir una justificación (exception_justification).`,
          );
        }
      }

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

    const auditAfter: Record<string, unknown> = { ...updates };
    if (dto.initial_amount !== undefined && dto.initial_amount > MAX_BOX_AMOUNT) {
      auditAfter.exception_justification = dto.exception_justification;
      auditAfter.exception_approved_by = user.name;
    }

    this.audit.log({
      user,
      action: 'update',
      entity: 'petty_cash_box',
      entityId: id,
      entityLabel: `${box.name} - ${box.code}`,
      before: beforeData,
      after: auditAfter,
    });

    return this.findOne(id);
  }

  // ── Regla 1c: Inmutabilidad de asignación ──
  async assign(id: string, dto: AssignWorkersDto) {
    const box = await this.boxes.findByPk(id);
    if (!box) throw new NotFoundException('Caja no encontrada');
    if (box.status !== 'open') {
      throw new ConflictException('No se pueden modificar asignaciones de una caja cerrada o bloqueada');
    }
    this.validateTypeVsWorkers(box.type, dto.worker_ids);
    if (dto.primary_worker_id && !dto.worker_ids.includes(dto.primary_worker_id)) {
      throw new BadRequestException(
        'primary_worker_id debe estar dentro de worker_ids',
      );
    }
    await this.assertWorkersExist(dto.worker_ids);
    // La reasignación no admite excepción de segunda caja: los nuevos
    // residentes no pueden tener otra caja abierta (se excluye esta caja).
    await this.assertNoOpenBoxForWorkers(dto.worker_ids, undefined, id);

    // Verificar que la caja no tenga movimientos — inmutabilidad de asignación
    const invoiceCount = await this.invoices.count({ where: { box_id: id } });
    if (invoiceCount > 0) {
      throw new ConflictException(
        'No se pueden reasignar residentes de una caja que ya tiene movimientos registrados.',
      );
    }

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

    return this.invoices.findAll({
      where: { box_id: id },
      attributes: [
        'id', 'vendor_name', 'vendor_nit', 'invoice_number', 'invoice_date', 'cufe',
        'document_type', 'total', 'status', 'submitted_at', 'expense_category',
        'requires_special_approval', 'reported_late',
      ],
      include: [
        {
          model: Approval,
          required: false,
          attributes: ['id', 'action', 'comments', 'created_at'],
          include: [
            { model: Worker, as: 'approver', attributes: ['id', 'name'] },
          ],
        },
      ],
      order: [['submitted_at', 'DESC']],
    });
  }

  /**
   * Removes an invoice from a box: deletes approvals, restores the box balance,
   * and removes the invoice. Admin only.
   */
  async removeMovement(boxId: string, invoiceId: string, user: AuthUser) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Solo un admin puede eliminar movimientos');
    }

    const box = await this.boxes.findByPk(boxId);
    if (!box) throw new NotFoundException('Caja no encontrada');

    const invoice = await this.invoices.findByPk(invoiceId);
    if (!invoice || invoice.box_id !== boxId) {
      throw new BadRequestException('La factura no pertenece a esta caja');
    }

    const invoiceTotal = parseFloat(invoice.total);

    await this.sequelize.transaction(async (t) => {
      // 1. Restore box balance
      const currentBalance = parseFloat(box.current_balance);
      const restoredBalance = (currentBalance + invoiceTotal).toFixed(2);
      await box.update({ current_balance: restoredBalance }, { transaction: t });

      // 2. Archivar la factura. El modelo es paranoid: no se borra la fila,
      //    solo se marca deleted_at y deja de aparecer en las vistas. NO entra
      //    a la papelera —esa es solo para rechazadas— porque devolverla a la
      //    caja descuadraría el saldo que acabamos de reajustar.
      //    Las aprobaciones se conservan (antes se borraban por la FK del
      //    borrado físico) para no perder el historial de la decisión.
      await invoice.update({ deleted_by: user.id }, { transaction: t });
      await invoice.destroy({ transaction: t });

      // 4. Audit log
      this.audit.log({
        user,
        action: 'delete',
        entity: 'invoice',
        entityId: invoiceId,
        entityLabel: `Factura sacada de la caja y archivada: ${invoice.vendor_name ?? 'Sin proveedor'} - $${invoiceTotal.toFixed(2)}`,
        before: {
          status: invoice.status,
          box_id: boxId,
          total: invoice.total,
          box_balance: box.current_balance,
        },
        after: {
          deleted: true,
          restored_balance: restoredBalance,
        },
      });

      this.logger.warn(
        `Admin ${user.name} eliminó factura ${invoiceId} de caja ${box.code}. Saldo restaurado: ${box.current_balance} → ${restoredBalance}`,
      );
    });

    return { id: invoiceId, deleted: true };
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
          await this.storage.delete(inv.image_url);
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

  // ════════════════════════════════════════════════════════════════════
  // VALIDACIONES PRIVADAS
  // ════════════════════════════════════════════════════════════════════

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

  /**
   * Regla 1b: un residente solo puede tener una caja abierta. Un admin puede
   * abrir una SEGUNDA caja como excepción incluyendo una justificación
   * (máximo MAX_OPEN_BOXES_PER_WORKER).
   *
   * Retorna true cuando la creación procede gracias a la excepción.
   */
  private async assertNoOpenBoxForWorkers(
    workerIds: string[],
    exception?: { user: AuthUser; justification?: string },
    excludeBoxId?: string,
  ): Promise<boolean> {
    const where: Record<string, unknown> = {
      status: { [Op.in]: ['open', 'blocked'] },
    };
    if (excludeBoxId) where.id = { [Op.ne]: excludeBoxId };

    // Find open boxes that have any of the given workers assigned
    const openBoxes = await this.boxes.findAll({
      where,
      attributes: ['id', 'code', 'name', 'status'],
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

    if (openBoxes.length === 0) return false;

    // Conteo de cajas abiertas por residente para aplicar el tope duro
    const countByWorker = new Map<string, { name: string; count: number }>();
    for (const box of openBoxes) {
      for (const w of (box as any).workers as Worker[]) {
        const entry = countByWorker.get(w.id) ?? { name: w.name, count: 0 };
        entry.count++;
        countByWorker.set(w.id, entry);
      }
    }
    const atLimit = [...countByWorker.values()].find(
      (e) => e.count >= MAX_OPEN_BOXES_PER_WORKER,
    );
    if (atLimit) {
      throw new ConflictException(
        `El residente ${atLimit.name} ya tiene ${MAX_OPEN_BOXES_PER_WORKER} cajas abiertas, el máximo permitido incluso con excepción. Debe cerrar una antes de abrir otra.`,
      );
    }

    const canUseException =
      exception?.user.role === 'admin' &&
      (exception.justification?.trim().length ?? 0) > 0;

    if (!canUseException) {
      const workerNames = openBoxes
        .flatMap((b) => (b as any).workers.map((w: Worker) => w.name));
      const uniqueNames = [...new Set(workerNames)].join(', ');
      const boxCode = openBoxes[0].code;
      throw new ConflictException(
        `El residente ${uniqueNames} ya tiene una caja abierta (${boxCode}). Debe cerrarla antes de abrir otra. Un admin puede abrir una segunda caja como excepción incluyendo una justificación.`,
      );
    }

    return true;
  }

  // ── Regla 1b: Verificar que cajas cerradas anteriores estén 100% legalizadas ──
  private async assertPreviousBoxesFullyLegalized(workerIds: string[]) {
    const closedBoxesWithPending = await this.boxes.findAll({
      where: { status: 'closed' },
      attributes: ['id', 'code', 'name'],
      include: [
        {
          model: Worker,
          where: { id: workerIds },
          attributes: ['id', 'name'],
          through: { attributes: [] },
          required: true,
        },
        {
          model: Invoice,
          where: { status: { [Op.in]: ['pending', 'observed'] } },
          attributes: ['id'],
          required: true,
        },
      ],
    });

    if (closedBoxesWithPending.length > 0) {
      const boxCode = closedBoxesWithPending[0].code;
      throw new ConflictException(
        `La caja cerrada "${boxCode}" tiene facturas pendientes de legalizar. Debe legalizar el 100% antes de abrir una nueva caja.`,
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
