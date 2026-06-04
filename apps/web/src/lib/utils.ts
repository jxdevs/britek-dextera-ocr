import clsx, { type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatMoney(value: number | null | undefined, currency = 'COP') {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(value);
}

// ============ Box deadline (semáforo) ============

export const BOX_DEADLINE_DAYS = 7;

export type DeadlineSeverity = 'ok' | 'warning' | 'urgent' | 'overdue';

export interface BoxDeadlineInfo {
  /** Días restantes (negativo = vencida) */
  daysLeft: number;
  /** Texto corto para badges ("5d", "¡Hoy!", "Vencida") */
  badgeLabel: string;
  /** Texto largo para banners */
  bannerLabel: string;
  severity: DeadlineSeverity;
  /** Clases para el dot / badge */
  dotColor: string;
  /** Clases para el banner de alerta */
  bannerClasses: string;
}

export function getBoxDeadlineInfo(openedAt: string): BoxDeadlineInfo {
  const opened = new Date(openedAt);
  const now = new Date();
  const diffMs = now.getTime() - opened.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const daysLeft = BOX_DEADLINE_DAYS - diffDays;

  if (daysLeft > 3) {
    return {
      daysLeft,
      badgeLabel: `${daysLeft}d`,
      bannerLabel: `Quedan ${daysLeft} días para cerrar esta caja`,
      severity: 'ok',
      dotColor: 'bg-emerald-500',
      bannerClasses: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    };
  }
  if (daysLeft >= 2) {
    return {
      daysLeft,
      badgeLabel: `${daysLeft}d`,
      bannerLabel: `Quedan ${daysLeft} días para cerrar esta caja`,
      severity: 'warning',
      dotColor: 'bg-amber-500',
      bannerClasses: 'bg-amber-50 border-amber-200 text-amber-800',
    };
  }
  if (daysLeft === 1) {
    return {
      daysLeft,
      badgeLabel: '¡Hoy!',
      bannerLabel: 'Último día para cerrar esta caja',
      severity: 'urgent',
      dotColor: 'bg-orange-500',
      bannerClasses: 'bg-orange-50 border-orange-200 text-orange-800',
    };
  }
  // daysLeft <= 0 → vencida
  const overdueDays = Math.abs(daysLeft);
  return {
    daysLeft,
    badgeLabel: 'Vencida',
    bannerLabel:
      overdueDays === 0
        ? 'Esta caja debería haberse cerrado hoy'
        : `Esta caja debería haberse cerrado hace ${overdueDays} día${overdueDays > 1 ? 's' : ''}`,
    severity: 'overdue',
    dotColor: 'bg-rose-500',
    bannerClasses: 'bg-rose-50 border-rose-200 text-rose-800',
  };
}

// ============ Box consumption alerts ============

export type ConsumptionSeverity = 'warning' | 'critical' | 'depleted';

export interface BoxConsumptionAlert {
  /** Percentage consumed (0-100) */
  consumedPct: number;
  /** Percentage remaining (0-100) */
  remainingPct: number;
  severity: ConsumptionSeverity;
  /** Short label for badges */
  badgeLabel: string;
  /** Descriptive message for banners */
  bannerLabel: string;
  dotColor: string;
  bannerClasses: string;
}

/**
 * Returns an alert if the box consumption is >= 75% of the initial amount.
 * Returns null if consumption is below the threshold.
 */
export function getBoxConsumptionAlert(
  initialAmount: string,
  currentBalance: string,
): BoxConsumptionAlert | null {
  const initial = parseFloat(initialAmount);
  const current = parseFloat(currentBalance);
  if (!Number.isFinite(initial) || initial <= 0) return null;

  const consumed = initial - current;
  const consumedPct = (consumed / initial) * 100;
  const remainingPct = 100 - consumedPct;

  if (consumedPct >= 90) {
    return {
      consumedPct,
      remainingPct,
      severity: 'depleted',
      badgeLabel: `${remainingPct.toFixed(0)}% restante`,
      bannerLabel: `⚠️ Fondos casi agotados — solo queda el ${remainingPct.toFixed(1)}% del monto. Prepare la legalización.`,
      dotColor: 'bg-rose-500',
      bannerClasses: 'bg-rose-50 border-rose-300 text-rose-800',
    };
  }
  if (consumedPct >= 80) {
    return {
      consumedPct,
      remainingPct,
      severity: 'critical',
      badgeLabel: `${remainingPct.toFixed(0)}% restante`,
      bannerLabel: `Se ha consumido el ${consumedPct.toFixed(0)}% del monto. Inicie la preparación de legalización.`,
      dotColor: 'bg-orange-500',
      bannerClasses: 'bg-orange-50 border-orange-300 text-orange-800',
    };
  }
  if (consumedPct >= 75) {
    return {
      consumedPct,
      remainingPct,
      severity: 'warning',
      badgeLabel: `${remainingPct.toFixed(0)}% restante`,
      bannerLabel: `Alerta: se ha consumido el ${consumedPct.toFixed(0)}% del monto. Revise la caja y prepare la legalización.`,
      dotColor: 'bg-amber-500',
      bannerClasses: 'bg-amber-50 border-amber-300 text-amber-800',
    };
  }

  return null;
}
