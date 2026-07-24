import { AlertTriangle, ArrowLeft, Clock, Loader2, Lock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pettyCash, type Movement, type PettyCashBox } from '../lib/api';
import { cn, formatMoney, getBalanceDisplay, getBoxConsumptionAlert, getBoxDeadlineInfo } from '../lib/utils';

export default function MiCajaDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [box, setBox] = useState<PettyCashBox | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, m] = await Promise.all([pettyCash.getMine(id), pettyCash.movementsMine(id)]);
      setBox(b);
      setMovements(m);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !box) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800">
          {error ?? 'Caja no encontrada'}
        </div>
        <Link to="/mis-cajas" className="mt-4 inline-flex items-center gap-1 text-sm text-slate-600">
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </div>
    );
  }

  const initial = parseFloat(box.initial_amount);
  const activeMovements = movements.filter((m) => m.status !== 'rejected');
  const consumed = activeMovements.reduce((sum, m) => sum + parseFloat(m.total), 0);
  const legalized = movements.filter((m) => m.status === 'approved').reduce((sum, m) => sum + parseFloat(m.total), 0);
  const pendingCount = movements.filter((m) => m.status === 'pending').length;
  const consumedPct = initial > 0 ? (consumed / initial) * 100 : 0;
  const legalizedPct = initial > 0 ? (legalized / initial) * 100 : 0;
  const available = parseFloat(box.current_balance);
  const availablePct = initial > 0 ? (available / initial) * 100 : 0;
  const balance = getBalanceDisplay(available);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" /> Volver a mis cajas
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-slate-900">{box.name}</h2>
          <span
            className={cn(
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset',
              box.status === 'open'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : box.status === 'blocked'
                  ? 'bg-rose-50 text-rose-700 ring-rose-200'
                  : 'bg-slate-100 text-slate-600 ring-slate-200',
            )}
          >
            {box.status === 'open' ? 'Abierta' : box.status === 'blocked' ? 'Bloqueada' : 'Cerrada'}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset bg-sky-50 text-sky-700 ring-sky-200">
            {box.type === 'individual' ? 'Individual' : 'Compartida'}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset bg-slate-100 text-slate-500 ring-slate-200">
            Solo lectura
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          {box.code} · abierta el {new Date(box.opened_at).toLocaleDateString('es-CO')}
          {box.expires_at && ` · vence el ${new Date(box.expires_at).toLocaleDateString('es-CO')}`}
          {box.closed_at && ` · cerrada el ${new Date(box.closed_at).toLocaleDateString('es-CO')}`}
        </p>
        {(box.project_name || box.cost_center) && (
          <p className="text-sm text-slate-500 mt-0.5">
            {box.project_name && <><span className="font-medium text-slate-700">Proyecto:</span> {box.project_name}</>}
            {box.project_name && box.cost_center && ' · '}
            {box.cost_center && <><span className="font-medium text-slate-700">Centro de costo:</span> {box.cost_center}</>}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card label="Monto inicial" value={formatMoney(initial)} muted="asignado a la caja" />
        <Card
          label={balance.isOverdrawn ? 'Saldo a tu favor' : 'Disponible'}
          value={balance.amount}
          muted={balance.isOverdrawn ? 'la empresa te lo debe' : `${availablePct.toFixed(1)}% del monto`}
          valueClass={balance.textClass}
        />
        <Card label="Consumido" value={formatMoney(consumed)} muted={`${consumedPct.toFixed(1)}% del monto`} />
        <Card label="Legalizado" value={formatMoney(legalized)} muted={`${legalizedPct.toFixed(1)}% del monto`} />
        <Card
          label="Pendientes de legalizar"
          value={String(pendingCount)}
          muted={pendingCount > 0 ? 'facturas por revisar' : 'todo legalizado'}
        />
      </div>

      {/* Alerta de consumo */}
      {box.status === 'open' && (() => {
        const consumption = getBoxConsumptionAlert(box.initial_amount, box.current_balance);
        if (!consumption) return null;
        return (
          <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', consumption.bannerClasses)}>
            <AlertTriangle className="size-5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">{consumption.bannerLabel}</p>
              <p className="text-xs mt-0.5 opacity-75">
                Consumido: {formatMoney(parseFloat(box.initial_amount) - parseFloat(box.current_balance))} de {formatMoney(parseFloat(box.initial_amount))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('size-2.5 rounded-full', consumption.dotColor)} />
              <span className="text-xs font-semibold uppercase tracking-wide">{consumption.badgeLabel}</span>
            </div>
          </div>
        );
      })()}

      {/* Alerta de caja bloqueada */}
      {box.status === 'blocked' && (
        <div className="flex items-center gap-3 rounded-lg border px-4 py-3 bg-rose-50 border-rose-300 text-rose-800">
          <Lock className="size-5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Caja bloqueada</p>
            <p className="text-xs mt-0.5 opacity-75">
              No se pueden registrar ni aprobar facturas mientras la caja esté bloqueada. Un administrador debe desbloquearla para reanudar la operación.
            </p>
          </div>
        </div>
      )}

      {/* Semáforo de plazo */}
      {box.status === 'open' && (() => {
        const deadline = getBoxDeadlineInfo(box.opened_at);
        return (
          <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-3', deadline.bannerClasses)}>
            {deadline.severity === 'overdue' ? (
              <AlertTriangle className="size-5 shrink-0" />
            ) : (
              <Clock className="size-5 shrink-0" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{deadline.bannerLabel}</p>
              <p className="text-xs mt-0.5 opacity-75">
                Abierta el {new Date(box.opened_at).toLocaleDateString('es-CO')} — plazo de 7 días
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn('size-2.5 rounded-full', deadline.dotColor)} />
              <span className="text-xs font-semibold uppercase tracking-wide">{deadline.badgeLabel}</span>
            </div>
          </div>
        );
      })()}

      {/* Tabla de facturas (solo lectura) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Facturas ({movements.length})
          </h3>
        </div>
        {movements.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Sin facturas registradas en esta caja.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                <th className="text-left px-4 py-2 font-medium">Factura</th>
                <th className="text-right px-4 py-2 font-medium">Monto</th>
                <th className="text-center px-4 py-2 font-medium">Estado</th>
                <th className="text-left px-4 py-2 font-medium">Aprobador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => {
                const approval = m.approvals?.[0];
                return (
                  <tr
                    key={m.id}
                    className={cn(
                      'hover:bg-slate-50 transition-colors',
                      m.status === 'rejected' && 'opacity-50',
                    )}
                  >
                    <td className="px-4 py-2 text-slate-700 tabular-nums">
                      {new Date(m.submitted_at).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-2 text-slate-900">
                      {m.vendor_name ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-slate-700 tabular-nums">
                      {m.invoice_number ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-900 tabular-nums font-medium">
                      {formatMoney(parseFloat(m.total))}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ring-1 ring-inset',
                        m.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : m.status === 'rejected'
                            ? 'bg-rose-50 text-rose-700 ring-rose-200'
                            : m.status === 'observed'
                              ? 'bg-violet-50 text-violet-700 ring-violet-200'
                              : 'bg-amber-50 text-amber-700 ring-amber-200',
                      )}>
                        {m.status === 'approved' ? 'Legalizada' : m.status === 'rejected' ? 'Rechazada' : m.status === 'observed' ? 'Observada' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-700">
                      {approval?.approver?.name ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-sm font-semibold text-slate-900 text-right">
                  Total consumido
                </td>
                <td className="px-4 py-2 text-right text-sm font-bold text-slate-900 tabular-nums">
                  {formatMoney(activeMovements.reduce((sum, m) => sum + parseFloat(m.total), 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  muted,
  valueClass = 'text-slate-900',
}: {
  label: string;
  value: string;
  muted: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', valueClass)}>{value}</p>
      <p className="text-xs text-slate-500 tabular-nums">{muted}</p>
    </div>
  );
}
