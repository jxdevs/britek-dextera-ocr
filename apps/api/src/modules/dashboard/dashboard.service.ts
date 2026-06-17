import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions, fn, col, literal } from 'sequelize';
import {
  Approval,
  AuditLog,
  BoxAssignment,
  Invoice,
  PettyCashBox,
  Worker,
} from '../../database/models';
import { DashboardKpisDto } from './dto/dashboard-kpis.dto';

// ── Interfaces ──────────────────────────────────────────────────

interface DeliveredVsLegalized {
  total_delivered: number;
  total_legalized: number;
  legalized_pct: number;
  by_project: Array<{ project_name: string; delivered: number; legalized: number; pct: number }>;
  by_worker: Array<{ worker_id: string; worker_name: string; delivered: number; legalized: number; pct: number }>;
}

interface SupportComposition {
  total_invoices: number;
  electronic_invoice: { count: number; pct: number; amount: number };
  weak_support: { count: number; pct: number; amount: number };
  no_support: { count: number; pct: number; amount: number };
}

interface AmountAtRisk {
  total: number;
  by_reason: Array<{ reason: string; count: number; amount: number }>;
}

interface AgingBuckets {
  '0-7': { count: number; amount: number };
  '8-15': { count: number; amount: number };
  '16-30': { count: number; amount: number };
  '30+': { count: number; amount: number };
}

interface CapCompliance {
  boxes_over_cap: number;
  with_exception: number;
  without_exception: number;
}

interface ExceptionDecisions {
  total: number;
  approved: number;
  rejected: number;
  by_approver: Array<{ approver_name: string; approved: number; rejected: number }>;
}

interface AvailableBalanceItem {
  box_id: string;
  box_code: string;
  box_name: string;
  project_name: string | null;
  cost_center: string | null;
  worker_name: string;
  initial_amount: number;
  current_balance: number;
  consumed_pct: number;
  cap: number;
  threshold_alert: 'none' | 'yellow' | 'orange' | 'red';
}

interface ExpiringBoxItem {
  box_id: string;
  box_code: string;
  box_name: string;
  project_name: string | null;
  worker_name: string;
  expires_at: string;
  days_remaining: number;
  pending_invoices: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
}

interface TimelyReporting {
  total: number;
  on_time: number;
  late: number;
  on_time_pct: number;
}

export interface DashboardKpis {
  delivered_vs_legalized: DeliveredVsLegalized;
  support_composition: SupportComposition;
  amount_at_risk: AmountAtRisk;
  aging_buckets: AgingBuckets;
  cap_compliance: CapCompliance;
  exception_decisions: ExceptionDecisions;
  available_balances: AvailableBalanceItem[];
  expiring_boxes: ExpiringBoxItem[];
  timely_reporting: TimelyReporting;
}

const MAX_BOX_AMOUNT = 1_000_000;

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectModel(PettyCashBox) private readonly boxes: typeof PettyCashBox,
    @InjectModel(Invoice) private readonly invoices: typeof Invoice,
    @InjectModel(Approval) private readonly approvals: typeof Approval,
    @InjectModel(Worker) private readonly workers: typeof Worker,
    @InjectModel(BoxAssignment) private readonly assignments: typeof BoxAssignment,
    @InjectModel(AuditLog) private readonly auditLogs: typeof AuditLog,
  ) {}

  async getKpis(filters: DashboardKpisDto): Promise<DashboardKpis> {
    const [
      delivered_vs_legalized,
      support_composition,
      amount_at_risk,
      aging_buckets,
      cap_compliance,
      exception_decisions,
      available_balances,
      expiring_boxes,
      timely_reporting,
    ] = await Promise.all([
      this.getDeliveredVsLegalized(filters),
      this.getSupportComposition(filters),
      this.getAmountAtRisk(filters),
      this.getUnlegalizedAging(filters),
      this.getCapCompliance(filters),
      this.getExceptionDecisions(filters),
      this.getAvailableBalance(filters),
      this.getExpiringBoxes(filters),
      this.getTimelyReporting(filters),
    ]);

    return {
      delivered_vs_legalized,
      support_composition,
      amount_at_risk,
      aging_buckets,
      cap_compliance,
      exception_decisions,
      available_balances,
      expiring_boxes,
      timely_reporting,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 1. MONTO ENTREGADO vs LEGALIZADO
  // ════════════════════════════════════════════════════════════════

  private async getDeliveredVsLegalized(filters: DashboardKpisDto): Promise<DeliveredVsLegalized> {
    const boxWhere = this.buildBoxWhere(filters);

    const allBoxes = await this.boxes.findAll({
      where: boxWhere,
      include: [
        {
          model: Worker,
          attributes: ['id', 'name'],
          through: { attributes: ['is_primary'] },
        },
        {
          model: Invoice,
          where: { status: 'approved' },
          required: false,
          attributes: ['total'],
        },
      ],
    });

    let totalDelivered = 0;
    let totalLegalized = 0;
    const projectMap = new Map<string, { delivered: number; legalized: number }>();
    const workerMap = new Map<string, { name: string; delivered: number; legalized: number }>();

    for (const box of allBoxes) {
      const initial = parseFloat(box.initial_amount) || 0;
      const approvedSum = (box.invoices || []).reduce(
        (sum, inv) => sum + (parseFloat(inv.total) || 0),
        0,
      );

      totalDelivered += initial;
      totalLegalized += approvedSum;

      // By project
      const pName = box.project_name || 'Sin proyecto';
      const proj = projectMap.get(pName) || { delivered: 0, legalized: 0 };
      proj.delivered += initial;
      proj.legalized += approvedSum;
      projectMap.set(pName, proj);

      // By worker (primary)
      const primaryWorker = (box.workers || []).find(
        (w: any) => w.BoxAssignment?.is_primary,
      ) || (box.workers || [])[0];
      if (primaryWorker) {
        const wData = workerMap.get(primaryWorker.id) || {
          name: primaryWorker.name,
          delivered: 0,
          legalized: 0,
        };
        wData.delivered += initial;
        wData.legalized += approvedSum;
        workerMap.set(primaryWorker.id, wData);
      }
    }

    return {
      total_delivered: round2(totalDelivered),
      total_legalized: round2(totalLegalized),
      legalized_pct: totalDelivered > 0 ? round2((totalLegalized / totalDelivered) * 100) : 0,
      by_project: Array.from(projectMap.entries()).map(([project_name, d]) => ({
        project_name,
        delivered: round2(d.delivered),
        legalized: round2(d.legalized),
        pct: d.delivered > 0 ? round2((d.legalized / d.delivered) * 100) : 0,
      })),
      by_worker: Array.from(workerMap.entries()).map(([worker_id, d]) => ({
        worker_id,
        worker_name: d.name,
        delivered: round2(d.delivered),
        legalized: round2(d.legalized),
        pct: d.delivered > 0 ? round2((d.legalized / d.delivered) * 100) : 0,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 2. COMPOSICIÓN DEL SOPORTE
  // ════════════════════════════════════════════════════════════════

  private async getSupportComposition(filters: DashboardKpisDto): Promise<SupportComposition> {
    const invoiceWhere = this.buildInvoiceWhere(filters);

    const allInvoices = await this.invoices.findAll({
      where: invoiceWhere,
      attributes: ['vendor_nit', 'confidence_score', 'total'],
      include: filters.project_name || filters.cost_center
        ? [{ model: PettyCashBox, attributes: [], where: this.buildBoxWhereForJoin(filters), required: true }]
        : [],
    });

    let electronic = { count: 0, amount: 0 };
    let weak = { count: 0, amount: 0 };
    let noSupport = { count: 0, amount: 0 };

    for (const inv of allInvoices) {
      const total = parseFloat(inv.total) || 0;
      const hasNit = !!inv.vendor_nit;
      const confidence = inv.confidence_score ?? 0;

      if (!hasNit && confidence <= 0.1) {
        noSupport.count++;
        noSupport.amount += total;
      } else if (!hasNit || confidence < 0.6) {
        weak.count++;
        weak.amount += total;
      } else {
        electronic.count++;
        electronic.amount += total;
      }
    }

    const total = allInvoices.length;
    return {
      total_invoices: total,
      electronic_invoice: {
        count: electronic.count,
        pct: total > 0 ? round2((electronic.count / total) * 100) : 0,
        amount: round2(electronic.amount),
      },
      weak_support: {
        count: weak.count,
        pct: total > 0 ? round2((weak.count / total) * 100) : 0,
        amount: round2(weak.amount),
      },
      no_support: {
        count: noSupport.count,
        pct: total > 0 ? round2((noSupport.count / total) * 100) : 0,
        amount: round2(noSupport.amount),
      },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 3. MONTO EN RIESGO
  // ════════════════════════════════════════════════════════════════

  private async getAmountAtRisk(filters: DashboardKpisDto): Promise<AmountAtRisk> {
    const invoiceWhere: WhereOptions = {
      ...this.buildInvoiceWhere(filters),
      [Op.or]: [
        { status: 'observed' },
        { requires_special_approval: true },
      ],
    };

    const riskyInvoices = await this.invoices.findAll({
      where: invoiceWhere,
      attributes: [
        'total', 'vendor_nit', 'confidence_score',
        'expense_category', 'reported_late', 'requires_special_approval',
      ],
      include: filters.project_name || filters.cost_center
        ? [{ model: PettyCashBox, attributes: [], where: this.buildBoxWhereForJoin(filters), required: true }]
        : [],
    });

    const reasonMap = new Map<string, { count: number; amount: number }>();
    let totalRisk = 0;

    for (const inv of riskyInvoices) {
      const total = parseFloat(inv.total) || 0;
      totalRisk += total;

      const reasons: string[] = [];
      if (!inv.vendor_nit) reasons.push('Sin NIT');
      if (inv.confidence_score !== null && inv.confidence_score < 0.6) reasons.push('Confianza baja');
      if (inv.expense_category === 'alimentacion') reasons.push('Alimentación');
      if (inv.reported_late) reasons.push('Reporte tardío');
      if (reasons.length === 0) reasons.push('Otro');

      for (const r of reasons) {
        const existing = reasonMap.get(r) || { count: 0, amount: 0 };
        existing.count++;
        existing.amount += total;
        reasonMap.set(r, existing);
      }
    }

    return {
      total: round2(totalRisk),
      by_reason: Array.from(reasonMap.entries())
        .map(([reason, d]) => ({ reason, count: d.count, amount: round2(d.amount) }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 4. ANTIGÜEDAD DE CAJAS NO LEGALIZADAS
  // ════════════════════════════════════════════════════════════════

  private async getUnlegalizedAging(filters: DashboardKpisDto): Promise<AgingBuckets> {
    const boxWhere: WhereOptions = {
      ...this.buildBoxWhere(filters),
      status: { [Op.in]: ['open', 'blocked'] },
    };

    const openBoxes = await this.boxes.findAll({
      where: boxWhere,
      attributes: ['id', 'opened_at', 'initial_amount', 'current_balance'],
    });

    const now = new Date();
    const buckets: AgingBuckets = {
      '0-7': { count: 0, amount: 0 },
      '8-15': { count: 0, amount: 0 },
      '16-30': { count: 0, amount: 0 },
      '30+': { count: 0, amount: 0 },
    };

    for (const box of openBoxes) {
      const days = Math.floor(
        (now.getTime() - new Date(box.opened_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      const pending = parseFloat(box.initial_amount) - parseFloat(box.current_balance);
      const amount = Math.max(0, pending);

      if (days <= 7) {
        buckets['0-7'].count++;
        buckets['0-7'].amount += amount;
      } else if (days <= 15) {
        buckets['8-15'].count++;
        buckets['8-15'].amount += amount;
      } else if (days <= 30) {
        buckets['16-30'].count++;
        buckets['16-30'].amount += amount;
      } else {
        buckets['30+'].count++;
        buckets['30+'].amount += amount;
      }
    }

    // Round amounts
    for (const key of Object.keys(buckets) as (keyof AgingBuckets)[]) {
      buckets[key].amount = round2(buckets[key].amount);
    }

    return buckets;
  }

  // ════════════════════════════════════════════════════════════════
  // 5. CUMPLIMIENTO DEL TOPE RN-03
  // ════════════════════════════════════════════════════════════════

  private async getCapCompliance(filters: DashboardKpisDto): Promise<CapCompliance> {
    const boxWhere: WhereOptions = {
      ...this.buildBoxWhere(filters),
      initial_amount: { [Op.gt]: MAX_BOX_AMOUNT },
    };

    const overCapBoxes = await this.boxes.findAll({
      where: boxWhere,
      attributes: ['id'],
    });

    const boxIds = overCapBoxes.map((b) => b.id);

    let withException = 0;
    if (boxIds.length > 0) {
      // Check audit logs for exception_justification
      const exceptionLogs = await this.auditLogs.findAll({
        where: {
          entity: 'petty_cash_box',
          entity_id: boxIds,
          action: 'create',
        },
        attributes: ['entity_id', 'after'],
      });

      const boxesWithJustification = new Set(
        exceptionLogs
          .filter((log) => log.after && (log.after as any).exception_justification)
          .map((log) => log.entity_id),
      );
      withException = boxesWithJustification.size;
    }

    return {
      boxes_over_cap: boxIds.length,
      with_exception: withException,
      without_exception: Math.max(0, boxIds.length - withException),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 6. EXCEPCIONES APROBADAS vs RECHAZADAS
  // ════════════════════════════════════════════════════════════════

  private async getExceptionDecisions(filters: DashboardKpisDto): Promise<ExceptionDecisions> {
    // Approvals on observed invoices (those requiring special approval)
    const invoiceWhere: WhereOptions = {
      ...this.buildInvoiceWhere(filters),
      requires_special_approval: true,
    };

    const observedInvoices = await this.invoices.findAll({
      where: invoiceWhere,
      attributes: ['id'],
      include: filters.project_name || filters.cost_center
        ? [{ model: PettyCashBox, attributes: [], where: this.buildBoxWhereForJoin(filters), required: true }]
        : [],
    });

    const invoiceIds = observedInvoices.map((i) => i.id);
    if (invoiceIds.length === 0) {
      return { total: 0, approved: 0, rejected: 0, by_approver: [] };
    }

    const decisions = await this.approvals.findAll({
      where: { invoice_id: invoiceIds },
      attributes: ['action', 'approver_id'],
      include: [
        { model: Worker, as: 'approver', attributes: ['id', 'name'] },
      ],
    });

    let approved = 0;
    let rejected = 0;
    const approverMap = new Map<string, { name: string; approved: number; rejected: number }>();

    for (const d of decisions) {
      if (d.action === 'approve') approved++;
      else rejected++;

      const approverName = (d as any).approver?.name || 'Desconocido';
      const approverId = d.approver_id;
      const entry = approverMap.get(approverId) || { name: approverName, approved: 0, rejected: 0 };
      if (d.action === 'approve') entry.approved++;
      else entry.rejected++;
      approverMap.set(approverId, entry);
    }

    return {
      total: decisions.length,
      approved,
      rejected,
      by_approver: Array.from(approverMap.values()).map((d) => ({
        approver_name: d.name,
        approved: d.approved,
        rejected: d.rejected,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 7. SALDO DISPONIBLE POR RESIDENTE / PROYECTO
  // ════════════════════════════════════════════════════════════════

  private async getAvailableBalance(filters: DashboardKpisDto): Promise<AvailableBalanceItem[]> {
    const boxWhere: WhereOptions = {
      ...this.buildBoxWhere(filters),
      status: 'open',
    };

    const openBoxes = await this.boxes.findAll({
      where: boxWhere,
      include: [
        {
          model: Worker,
          attributes: ['id', 'name'],
          through: { attributes: ['is_primary'] },
        },
      ],
      order: [['current_balance', 'ASC']],
    });

    return openBoxes.map((box) => {
      const initial = parseFloat(box.initial_amount) || 0;
      const balance = parseFloat(box.current_balance) || 0;
      const consumedPct = initial > 0 ? round2(((initial - balance) / initial) * 100) : 0;

      let threshold: AvailableBalanceItem['threshold_alert'] = 'none';
      if (consumedPct >= 90) threshold = 'red';
      else if (consumedPct >= 80) threshold = 'orange';
      else if (consumedPct >= 75) threshold = 'yellow';

      const primaryWorker = (box.workers || []).find(
        (w: any) => w.BoxAssignment?.is_primary,
      ) || (box.workers || [])[0];

      return {
        box_id: box.id,
        box_code: box.code,
        box_name: box.name,
        project_name: box.project_name,
        cost_center: box.cost_center,
        worker_name: primaryWorker?.name || 'Sin asignar',
        initial_amount: round2(initial),
        current_balance: round2(balance),
        consumed_pct: consumedPct,
        cap: MAX_BOX_AMOUNT,
        threshold_alert: threshold,
      };
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 8. CAJAS PRÓXIMAS A VENCER
  // ════════════════════════════════════════════════════════════════

  private async getExpiringBoxes(filters: DashboardKpisDto): Promise<ExpiringBoxItem[]> {
    const boxWhere: WhereOptions = {
      ...this.buildBoxWhere(filters),
      status: { [Op.in]: ['open', 'blocked'] },
      expires_at: { [Op.ne]: null },
    };

    const boxes = await this.boxes.findAll({
      where: boxWhere,
      include: [
        {
          model: Worker,
          attributes: ['id', 'name'],
          through: { attributes: ['is_primary'] },
        },
        {
          model: Invoice,
          where: { status: { [Op.in]: ['pending', 'observed'] } },
          required: false,
          attributes: ['id'],
        },
      ],
      order: [['expires_at', 'ASC']],
    });

    const now = new Date();
    return boxes.map((box) => {
      const expiresAt = new Date(box.expires_at!);
      const daysRemaining = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      let urgency: ExpiringBoxItem['urgency'] = 'low';
      if (daysRemaining <= 0) urgency = 'critical';
      else if (daysRemaining <= 1) urgency = 'high';
      else if (daysRemaining <= 3) urgency = 'medium';

      const primaryWorker = (box.workers || []).find(
        (w: any) => w.BoxAssignment?.is_primary,
      ) || (box.workers || [])[0];

      return {
        box_id: box.id,
        box_code: box.code,
        box_name: box.name,
        project_name: box.project_name,
        worker_name: primaryWorker?.name || 'Sin asignar',
        expires_at: box.expires_at!.toString(),
        days_remaining: daysRemaining,
        pending_invoices: (box.invoices || []).length,
        urgency,
      };
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 9. % REPORTE OPORTUNO
  // ════════════════════════════════════════════════════════════════

  private async getTimelyReporting(filters: DashboardKpisDto): Promise<TimelyReporting> {
    const invoiceWhere = this.buildInvoiceWhere(filters);

    const allInvoices = await this.invoices.findAll({
      where: invoiceWhere,
      attributes: ['reported_late'],
      include: filters.project_name || filters.cost_center
        ? [{ model: PettyCashBox, attributes: [], where: this.buildBoxWhereForJoin(filters), required: true }]
        : [],
    });

    const total = allInvoices.length;
    const late = allInvoices.filter((inv) => inv.reported_late).length;
    const onTime = total - late;

    return {
      total,
      on_time: onTime,
      late,
      on_time_pct: total > 0 ? round2((onTime / total) * 100) : 0,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // FILTER HELPERS
  // ════════════════════════════════════════════════════════════════

  private buildBoxWhere(filters: DashboardKpisDto): WhereOptions {
    const where: any = {};
    if (filters.project_name) where.project_name = filters.project_name;
    if (filters.cost_center) where.cost_center = filters.cost_center;
    if (filters.worker_id) {
      // Will need to filter via include, handled separately
    }
    if (filters.from || filters.to) {
      const range: any = {};
      if (filters.from) range[Op.gte] = new Date(filters.from);
      if (filters.to) range[Op.lte] = new Date(filters.to);
      where.opened_at = range;
    }
    return where;
  }

  private buildBoxWhereForJoin(filters: DashboardKpisDto): WhereOptions {
    const where: any = {};
    if (filters.project_name) where.project_name = filters.project_name;
    if (filters.cost_center) where.cost_center = filters.cost_center;
    return where;
  }

  private buildInvoiceWhere(filters: DashboardKpisDto): WhereOptions {
    const where: any = {};
    if (filters.worker_id) where.worker_id = filters.worker_id;
    if (filters.from || filters.to) {
      const range: any = {};
      if (filters.from) range[Op.gte] = new Date(filters.from);
      if (filters.to) range[Op.lte] = new Date(filters.to);
      where.submitted_at = range;
    }
    return where;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
