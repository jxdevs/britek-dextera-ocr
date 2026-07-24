import { AlertTriangle, Calendar, ChevronRight, Filter, Loader2, Plus, Users, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BoxFormModal } from '../components/BoxFormModal';
import { pettyCash, type BoxStatus, type PettyCashBox } from '../lib/api';
import { cn, formatMoney, getBalanceDisplay, getBoxConsumptionAlert, getBoxDeadlineInfo } from '../lib/utils';

export default function CajasPage() {
  const [items, setItems] = useState<PettyCashBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [workerFilter, setWorkerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | BoxStatus>('open');

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

  // Extract unique workers from all boxes for the filter dropdown
  const uniqueWorkers = useMemo(() => {
    const map = new Map<string, string>();
    for (const box of items) {
      for (const w of box.workers) {
        if (!map.has(w.id)) map.set(w.id, w.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // Filter boxes by selected worker and status
  const hasFilters = !!workerFilter || !!statusFilter;
  const filteredItems = useMemo(
    () =>
      items.filter(
        (box) =>
          (!workerFilter || box.workers.some((w) => w.id === workerFilter)) &&
          (!statusFilter || box.status === statusFilter),
      ),
    [items, workerFilter, statusFilter],
  );

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

      {/* Filter bar */}
      {!loading && items.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Filter className="size-4" />
            <span className="font-medium">Filtrar:</span>
          </div>
          <select
            value={workerFilter}
            onChange={(e) => setWorkerFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 min-w-[200px]"
          >
            <option value="">Todos los residentes</option>
            {uniqueWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | BoxStatus)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 min-w-[160px]"
          >
            <option value="">Todas</option>
            <option value="open">Abiertas</option>
            <option value="closed">Cerradas</option>
            <option value="blocked">Bloqueadas</option>
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setWorkerFilter('');
                setStatusFilter('');
              }}
              className="text-xs text-slate-500 hover:text-slate-700 underline"
            >
              Limpiar filtros
            </button>
          )}
          {hasFilters && (
            <span className="text-xs text-slate-500">
              {filteredItems.length} de {items.length} caja(s)
            </span>
          )}
        </div>
      )}

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
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg py-12 text-center text-sm text-slate-500">
          No hay cajas que coincidan con los filtros seleccionados.
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredItems.map((box) => (
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
  const balance = getBalanceDisplay(current);

  const primary = box.workers.find((w) => w.BoxAssignment.is_primary);
  const others = box.workers.filter((w) => !w.BoxAssignment.is_primary);

  const deadline = (box.status === 'open' || box.status === 'blocked') ? getBoxDeadlineInfo(box.opened_at) : null;
  const consumption = (box.status === 'open' || box.status === 'blocked') ? getBoxConsumptionAlert(box.initial_amount, box.current_balance) : null;

  return (
    <Link
      to={`/cajas/${box.id}`}
      className={cn(
        'block bg-white border rounded-lg hover:shadow-sm transition-all overflow-hidden',
        consumption?.severity === 'overdrawn'
          ? 'border-rose-400 hover:border-rose-500'
          : consumption?.severity === 'depleted'
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
                  : box.status === 'blocked'
                    ? 'bg-rose-50 text-rose-700 ring-rose-200'
                    : 'bg-slate-100 text-slate-600 ring-slate-200',
              )}
            >
              {box.status === 'open' ? 'Abierta' : box.status === 'blocked' ? 'Bloqueada' : 'Cerrada'}
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
            {' · '}
            <span className="inline-flex items-center gap-0.5">
              <Calendar className="size-3" />
              {new Date(box.opened_at).toLocaleDateString('es-CO')}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className={cn('text-lg font-semibold tabular-nums', balance.textClass)}>
            {balance.amount}
          </p>
          <p className="text-xs text-slate-500 tabular-nums">
            {balance.isOverdrawn
              ? balance.caption
              : `Legalizado ${consumedPct.toFixed(0)}% · de ${formatMoney(initial)}`}
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
          consumption.severity === 'overdrawn'
            ? 'bg-rose-100 text-rose-900 border-rose-300'
            : consumption.severity === 'depleted'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : consumption.severity === 'critical'
                ? 'bg-orange-50 text-orange-700 border-orange-200'
                : 'bg-amber-50 text-amber-700 border-amber-200',
        )}>
          <AlertTriangle className="size-3 shrink-0" />
          <span>
            {consumption.severity === 'overdrawn'
              ? 'Caja sobregirada — saldo a favor del residente'
              : consumption.severity === 'depleted'
                ? 'Fondos casi agotados — prepare legalización'
                : consumption.severity === 'critical'
                  ? 'Iniciar preparación de legalización'
                  : 'Revisar caja y preparar legalización'}
          </span>
          <span className="ml-auto tabular-nums">
            {consumption.severity === 'overdrawn'
              ? consumption.badgeLabel
              : `${consumption.remainingPct.toFixed(0)}% restante`}
          </span>
        </div>
      )}
    </Link>
  );
}
