import { AlertTriangle, ChevronRight, Clock, Loader2, Plus, Users, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BoxFormModal } from '../components/BoxFormModal';
import { pettyCash, type PettyCashBox } from '../lib/api';
import { cn, formatMoney, getBoxConsumptionAlert, getBoxDeadlineInfo } from '../lib/utils';

export default function CajasPage() {
  const [items, setItems] = useState<PettyCashBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await pettyCash.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Cajas menores</h2>
          <p className="text-sm text-slate-600">
            Individual: anticipo de un residente. Compartida: bolsa común para varios.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="size-4" />
          Nueva caja
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="size-5 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg py-12 text-center text-sm text-slate-500">
          No hay cajas abiertas todavía.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((box) => (
            <BoxCard key={box.id} box={box} />
          ))}
        </div>
      )}

      {creating && (
        <BoxFormModal
          mode="create"
          title="Abrir nueva caja"
          onClose={() => setCreating(false)}
          onSubmit={async (input) => {
            await pettyCash.create(input);
            setCreating(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function BoxCard({ box }: { box: PettyCashBox }) {
  const initial = parseFloat(box.initial_amount);
  const current = parseFloat(box.current_balance);
  const consumedPct = initial > 0 ? ((initial - current) / initial) * 100 : 0;

  const primary = box.workers.find((w) => w.BoxAssignment.is_primary);
  const others = box.workers.filter((w) => !w.BoxAssignment.is_primary);

  const deadline = box.status === 'open' ? getBoxDeadlineInfo(box.opened_at) : null;
  const consumption = box.status === 'open' ? getBoxConsumptionAlert(box.initial_amount, box.current_balance) : null;

  return (
    <Link
      to={`/cajas/${box.id}`}
      className={cn(
        'block bg-white border rounded-lg hover:shadow-sm transition-all overflow-hidden',
        consumption?.severity === 'depleted'
          ? 'border-rose-300 hover:border-rose-400'
          : consumption?.severity === 'critical'
            ? 'border-orange-300 hover:border-orange-400'
            : consumption?.severity === 'warning'
              ? 'border-amber-300 hover:border-amber-400'
              : deadline?.severity === 'overdue'
                ? 'border-rose-300 hover:border-rose-400'
                : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="px-5 py-4 flex items-center gap-6">
        <div className="flex-shrink-0">
          <div
            className={cn(
              'size-10 rounded-lg flex items-center justify-center',
              box.type === 'individual' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700',
            )}
          >
            {box.type === 'individual' ? <User className="size-5" /> : <Users className="size-5" />}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 truncate">{box.name}</p>
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset',
                box.status === 'open'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-slate-100 text-slate-600 ring-slate-200',
              )}
            >
              {box.status === 'open' ? 'Abierta' : 'Cerrada'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {box.code} ·{' '}
            {primary ? (
              <>
                {primary.name}
                {others.length > 0 && ` +${others.length} más`}
              </>
            ) : (
              `${box.workers.length} residente(s)`
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-slate-900">
            {formatMoney(current)}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            Legalizado {consumedPct.toFixed(0)}% · de {formatMoney(initial)}
          </p>
          <div className="mt-1 w-32 bg-slate-100 rounded-full h-1 overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                consumedPct >= 75 ? 'bg-rose-500' : consumedPct >= 50 ? 'bg-amber-500' : 'bg-sky-500',
              )}
              style={{ width: `${Math.max(0, Math.min(100, consumedPct))}%` }}
            />
          </div>
        </div>
        {/* Semáforo de plazo */}
        {deadline && (
          <div className="flex items-center gap-1.5 mr-1">
            <span className={cn('size-2 rounded-full', deadline.dotColor)} />
            <span className={cn(
              'text-[11px] font-semibold tabular-nums',
              deadline.severity === 'overdue' ? 'text-rose-600' :
              deadline.severity === 'urgent' ? 'text-orange-600' :
              deadline.severity === 'warning' ? 'text-amber-600' :
              'text-emerald-600',
            )}>
              {deadline.badgeLabel}
            </span>
          </div>
        )}
        <ChevronRight className="size-4 text-slate-400" />
      </div>
      {/* Alerta compacta de consumo */}
      {consumption && (
        <div className={cn(
          'flex items-center gap-2 px-5 py-1.5 text-[11px] font-medium border-t',
          consumption.severity === 'depleted'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : consumption.severity === 'critical'
              ? 'bg-orange-50 text-orange-700 border-orange-200'
              : 'bg-amber-50 text-amber-700 border-amber-200',
        )}>
          <AlertTriangle className="size-3 shrink-0" />
          <span>
            {consumption.severity === 'depleted'
              ? 'Fondos casi agotados — prepare legalización'
              : consumption.severity === 'critical'
                ? 'Iniciar preparación de legalización'
                : 'Revisar caja y preparar legalización'}
          </span>
          <span className="ml-auto tabular-nums">{consumption.remainingPct.toFixed(0)}% restante</span>
        </div>
      )}
    </Link>
  );
}
