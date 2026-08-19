import { AlertTriangle, Bell, Calendar, ChevronRight, Filter, Loader2, Lock, Plus, SquareCheck, Users, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BoxFormModal } from '../components/BoxFormModal';
import { pettyCash, type BoxStatus, type PettyCashBox } from '../lib/api';
import { useScrollRestoration, useSessionState } from '../lib/listState';
import { cn, formatMoney, getBalanceDisplay, getBoxConsumptionAlert } from '../lib/utils';

export default function CajasPage() {
  const [items, setItems] = useState<PettyCashBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Los filtros se recuerdan al entrar a una caja y volver.
  const [workerFilter, setWorkerFilter] = useSessionState('cajas:worker', '');
  const [statusFilter, setStatusFilter] = useSessionState<'' | BoxStatus>('cajas:status', 'open');

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

  // Devuelve al usuario a la misma altura de la lista al regresar del detalle.
  useScrollRestoration('cajas:scroll', !loading && items.length > 0);

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

  // Causación contable, sumada sobre las cajas visibles con los filtros puestos.
  const accrual = useMemo(() => {
    const accrued = filteredItems.reduce((sum, b) => sum + (b.accrued_count ?? 0), 0);
    const pending = filteredItems.reduce((sum, b) => sum + (b.pending_accrual_count ?? 0), 0);
    return { accrued, pending, total: accrued + pending };
  }, [filteredItems]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Cajas menores</h2>
          <p className="text-sm text-slate-600">
            Individual: anticipo de un residente. Compartida: bolsa común para varios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClosedBoxesBell boxes={items} />
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="size-4" />
            Nueva caja
          </button>
        </div>
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

      {!loading && accrual.total > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm">
          <SquareCheck className="size-4 text-slate-400 shrink-0" />
          <span className="font-medium text-slate-900">Causación contable</span>
          <span className="text-slate-500 tabular-nums">
            {accrual.accrued} de {accrual.total} facturas legalizadas
            {hasFilters && ' (según filtros)'}
          </span>
          <span
            className={cn(
              'ml-auto inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset tabular-nums',
              accrual.pending > 0
                ? 'bg-orange-50 text-orange-700 ring-orange-200'
                : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
            )}
          >
            {accrual.pending > 0 ? `${accrual.pending} pendientes de causar` : 'Todo causado'}
          </span>
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

/** Días que abarca el historial de cierres del panel, contando hoy. */
const CLOSED_HISTORY_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** "Hoy" / "Ayer" / "viernes, 15 de agosto" según qué tan atrás quedó el día. */
function dayLabel(day: Date) {
  const diff = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(day).getTime()) / DAY_MS,
  );
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return day.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Campana de cierres: el contador avisa cuántas cajas se cerraron hoy y el panel
 * muestra el historial de los últimos {@link CLOSED_HISTORY_DAYS} días agrupado
 * por día. Se calcula sobre todas las cajas cargadas, no sobre las filtradas:
 * un cierre no debe desaparecer del aviso porque el filtro esté en "Abiertas".
 */
function ClosedBoxesBell({ boxes }: { boxes: PettyCashBox[] }) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Cierres recientes agrupados por día, del más nuevo al más viejo.
  const groups = useMemo(() => {
    const cutoff =
      startOfDay(new Date()).getTime() - (CLOSED_HISTORY_DAYS - 1) * DAY_MS;
    const recent = boxes
      .filter(
        (b) =>
          b.status === 'closed' &&
          b.closed_at &&
          new Date(b.closed_at).getTime() >= cutoff,
      )
      .sort(
        (a, b) =>
          new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime(),
      );

    const byDay = new Map<number, PettyCashBox[]>();
    for (const box of recent) {
      const key = startOfDay(new Date(box.closed_at!)).getTime();
      const sameDay = byDay.get(key);
      if (sameDay) sameDay.push(box);
      else byDay.set(key, [box]);
    }
    return Array.from(byDay, ([time, items]) => ({ time, items }));
  }, [boxes]);

  const todayKey = startOfDay(new Date()).getTime();
  const closedToday = groups.find((g) => g.time === todayKey)?.items.length ?? 0;
  const total = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="relative" ref={wrapper}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={
          closedToday > 0
            ? `${closedToday} caja(s) cerrada(s) hoy`
            : 'Historial de cierres'
        }
        title={
          closedToday > 0
            ? `${closedToday} caja(s) cerrada(s) hoy`
            : `Sin cierres hoy · ${total} en los últimos ${CLOSED_HISTORY_DAYS} días`
        }
        className={cn(
          'relative inline-flex items-center justify-center rounded-md border px-2.5 py-2 transition-colors',
          open
            ? 'border-slate-400 bg-slate-100 text-slate-900'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
        )}
      >
        <Bell className="size-4" />
        {closedToday > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center tabular-nums">
            {closedToday}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] overflow-y-auto z-20 bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="sticky top-0 bg-white px-4 py-3 border-b border-slate-200">
            <p className="text-sm font-semibold text-slate-900">Cajas cerradas</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {closedToday > 0
                ? `${closedToday} hoy · últimos ${CLOSED_HISTORY_DAYS} días`
                : `Ninguna hoy · últimos ${CLOSED_HISTORY_DAYS} días`}
            </p>
          </div>

          {total === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              No se han cerrado cajas en los últimos {CLOSED_HISTORY_DAYS} días.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.time}>
                <p className="px-4 py-1.5 bg-slate-50 border-y border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {dayLabel(new Date(group.time))} · {group.items.length}
                </p>
                {group.items.map((box) => {
                  const primary =
                    box.workers.find((w) => w.BoxAssignment.is_primary) ??
                    box.workers[0];
                  // Una caja puede cerrarse sobregirada: el saldo se muestra como
                  // "a favor del residente" igual que en el resto de la app.
                  const balance = getBalanceDisplay(box.current_balance);
                  return (
                    <Link
                      key={box.id}
                      to={`/cajas/${box.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <Lock className="size-3.5 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {box.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {box.code}
                          {primary ? ` · ${primary.name}` : ''}
                        </p>
                      </div>
                      <div
                        className="text-right shrink-0"
                        title={`Cerrada a las ${new Date(box.closed_at!).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · ${balance.amount} ${balance.caption}`}
                      >
                        <p className="text-xs text-slate-500 tabular-nums">
                          {new Date(box.closed_at!).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <p className={cn('text-xs font-medium tabular-nums', balance.textClass)}>
                          {balance.amount}
                        </p>
                      </div>
                      <ChevronRight className="size-3.5 text-slate-400 shrink-0" />
                    </Link>
                  );
                })}
              </div>
            ))
          )}
        </div>
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

  const consumption = (box.status === 'open' || box.status === 'blocked') ? getBoxConsumptionAlert(box.initial_amount, box.current_balance) : null;

  const accrued = box.accrued_count ?? 0;
  const pendingAccrual = box.pending_accrual_count ?? 0;
  const accruable = accrued + pendingAccrual;

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
            {accruable > 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset tabular-nums',
                  pendingAccrual > 0
                    ? 'bg-orange-50 text-orange-700 ring-orange-200'
                    : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                )}
                title={
                  pendingAccrual > 0
                    ? `${pendingAccrual} factura(s) legalizada(s) pendiente(s) de causación`
                    : 'Todas las facturas legalizadas están causadas'
                }
              >
                <SquareCheck className="size-2.5" />
                {accrued}/{accruable} causadas
              </span>
            )}
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
