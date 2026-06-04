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
        // Al rechazar, devolver el saldo a la caja (ya se descontó al subir)
        if (invoice.box_id) {
          const box = await this.boxes.findByPk(invoice.box_id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (box) {
            const invoiceTotal = parseFloat(invoice.total);
            const currentBalance = parseFloat(box.current_balance);
            const restoredBalance = (currentBalance + invoiceTotal).toFixed(2);
            await box.update({ current_balance: restoredBalance }, { transaction: t });
          }
        }

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
          after: { status: 'rejected', comments: dto.comments ?? null, balance_restored: true },
        });

        return;
      }

      // ── Aprobar / Legalizar ──
      // El saldo ya se descontó cuando el residente subió la factura.
      // Aquí solo validamos y legalizamos. Si el aprobador editó el total,
      // ajustamos la diferencia en el saldo.

      if (!invoice.box_id) {
        throw new BadRequestException(
          'La factura no tiene caja asignada. El residente debe subirla desde WhatsApp.',
        );
      }

      const box = await this.boxes.findByPk(invoice.box_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!box) throw new NotFoundException('Caja no encontrada');

      const originalTotal = parseFloat(invoice.total);
      const finalTotal = parseFloat(
        (editedFields.total as string | undefined) ?? invoice.total,
      );
      if (!Number.isFinite(finalTotal) || finalTotal <= 0) {
        throw new BadRequestException('El total debe ser un número positivo');
      }

      // Si el aprobador editó el total, ajustar la diferencia en el saldo
      let newBalance = box.current_balance;
      if (Math.abs(finalTotal - originalTotal) > 0.01) {
        const diff = originalTotal - finalTotal; // positivo = aprobador bajó el total → devolver
        const currentBalance = parseFloat(box.current_balance);
        newBalance = (currentBalance + diff).toFixed(2);
        await box.update({ current_balance: newBalance }, { transaction: t });
      }

      const invoiceUpdates: Record<string, unknown> = {
        ...editedFields,
        status: 'approved',
      };
      await invoice.update(invoiceUpdates, { transaction: t });

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
        after: { status: 'approved', total: finalTotal.toFixed(2) },
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
