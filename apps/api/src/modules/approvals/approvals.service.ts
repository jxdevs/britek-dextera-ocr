import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  Approval,
  BoxAssignment,
  Invoice,
  PettyCashBox,
} from '../../database/models';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { InvoicesService } from '../invoices/invoices.service';
import { DecideDto } from './dto/decide.dto';

const EDITABLE_FIELDS = [
  'vendor_nit',
  'vendor_name',
  'invoice_number',
  'invoice_date',
  'subtotal',
  'iva',
  'total',
  'currency',
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const DECIMAL_FIELDS = new Set<EditableField>(['subtotal', 'iva', 'total']);

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly sequelize: Sequelize,
    private readonly invoicesService: InvoicesService,
    private readonly audit: AuditService,
    @InjectModel(Invoice) private readonly invoices: typeof Invoice,
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    @InjectModel(BoxAssignment) private readonly assignments: typeof BoxAssignment,
    @InjectModel(Approval) private readonly approvals: typeof Approval,
  ) {}

  async decide(dto: DecideDto, user: AuthUser) {
    const editedFields = this.sanitizeEditedFields(dto.edited_fields);

    await this.sequelize.transaction(async (t) => {
      const invoice = await this.invoices.findByPk(dto.invoice_id, {
        transaction: t,
      });
      if (!invoice) throw new NotFoundException('Factura no encontrada');
      if (invoice.status !== 'pending') {
        throw new ConflictException('La factura ya fue procesada');
      }

      if (dto.action === 'reject') {
        await invoice.update({ status: 'rejected' }, { transaction: t });
        await this.approvals.create(
          {
            invoice_id: invoice.id,
            approver_id: user.id,
            action: 'reject',
            comments: dto.comments ?? null,
            edited_fields:
              Object.keys(editedFields).length > 0 ? editedFields : null,
          },
          { transaction: t },
        );

        this.audit.log({
          user,
          action: 'reject',
          entity: 'invoice',
          entityId: invoice.id,
          entityLabel: `${invoice.vendor_name ?? 'Sin proveedor'} - ${invoice.invoice_number ?? 'S/N'}`,
          before: { status: 'pending' },
          after: { status: 'rejected', comments: dto.comments ?? null },
        });

        return;
      }

      // Use pre-assigned box (from WhatsApp) if available; otherwise fall back to approver's choice
      const resolvedBoxId = invoice.box_id ?? dto.box_id;
      if (!resolvedBoxId) {
        throw new BadRequestException('Para aprobar debes elegir una caja');
      }

      const box = await this.boxes.findByPk(resolvedBoxId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!box) throw new NotFoundException('Caja no encontrada');
      if (box.status !== 'open') {
        throw new ConflictException('La caja está cerrada');
      }

      const assignment = await this.assignments.findOne({
        where: { box_id: box.id, worker_id: invoice.worker_id },
        transaction: t,
      });
      if (!assignment) {
        throw new BadRequestException(
          'El trabajador de la factura no está asignado a esta caja',
        );
      }

      const finalTotal = parseFloat(
        (editedFields.total as string | undefined) ?? invoice.total,
      );
      const currentBalance = parseFloat(box.current_balance);
      if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
        throw new BadRequestException('El total debe ser un número positivo');
      }
      if (finalTotal > currentBalance) {
        throw new BadRequestException(
          `Saldo insuficiente: la caja tiene ${currentBalance}, factura es ${finalTotal}`,
        );
      }

      const invoiceUpdates: Record<string, unknown> = {
        ...editedFields,
        box_id: box.id,
        status: 'approved',
      };
      await invoice.update(invoiceUpdates, { transaction: t });

      const newBalance = (currentBalance - finalTotal).toFixed(2);
      await box.update({ current_balance: newBalance }, { transaction: t });

      await this.approvals.create(
        {
          invoice_id: invoice.id,
          approver_id: user.id,
          action: 'approve',
          comments: dto.comments ?? null,
          edited_fields:
            Object.keys(editedFields).length > 0 ? editedFields : null,
        },
        { transaction: t },
      );

      this.audit.log({
        user,
        action: 'approve',
        entity: 'invoice',
        entityId: invoice.id,
        entityLabel: `${invoice.vendor_name ?? 'Sin proveedor'} - ${invoice.invoice_number ?? 'S/N'}`,
        before: { status: 'pending', total: invoice.total },
        after: { status: 'approved', box_id: dto.box_id, total: finalTotal.toFixed(2), new_balance: newBalance },
      });
    });

    return this.invoicesService.findOne(dto.invoice_id);
  }

  private sanitizeEditedFields(input: Record<string, unknown> | undefined) {
    const out: Record<string, unknown> = {};
    if (!input) return out;
    for (const key of EDITABLE_FIELDS) {
      if (!(key in input)) continue;
      const value = input[key];
      if (value === null || value === undefined || value === '') {
        out[key] = null;
        continue;
      }
      if (DECIMAL_FIELDS.has(key)) {
        const n = Number(value);
        if (!Number.isFinite(n)) {
          throw new BadRequestException(`Valor inválido para ${key}`);
        }
        out[key] = n.toFixed(2);
      } else {
        out[key] = String(value);
      }
    }
    return out;
  }
}
