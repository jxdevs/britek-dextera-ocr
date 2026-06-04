import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Filter,
  Loader2,
  LogIn,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldX,
  Trash2,
  Lock,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  auditLogs,
  type AuditAction,
  type AuditListFilters,
  type AuditLogEntry,
} from '../lib/api';
import { cn } from '../lib/utils';

const PAGE_SIZE = 25;

const ACTION_CONFIG: Record<
  AuditAction,
  { label: string; icon: typeof Plus; tone: string }
> = {
  login_success: { label: 'Login exitoso', icon: LogIn, tone: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  login_failed: { label: 'Login fallido', icon: LogIn, tone: 'bg-rose-100 text-rose-700 ring-rose-200' },
  create: { label: 'Crear', icon: Plus, tone: 'bg-sky-100 text-sky-700 ring-sky-200' },
  update: { label: 'Editar', icon: Pencil, tone: 'bg-amber-100 text-amber-700 ring-amber-200' },
  delete: { label: 'Eliminar', icon: Trash2, tone: 'bg-rose-100 text-rose-700 ring-rose-200' },
  close: { label: 'Cerrar caja', icon: Lock, tone: 'bg-violet-100 text-violet-700 ring-violet-200' },
  approve: { label: 'Aprobar', icon: ShieldCheck, tone: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  reject: { label: 'Rechazar', icon: ShieldX, tone: 'bg-rose-100 text-rose-700 ring-rose-200' },
};

const ENTITY_LABELS: Record<string, string> = {
  session: 'Sesión',
  worker: 'Trabajador',
  petty_cash_box: 'Caja menor',
  invoice: 'Factura',
};

export default function AuditLogsPage() {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  // Expanded row
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: AuditListFilters = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (actionFilter) filters.action = actionFilter;
      if (entityFilter) filters.entity = entityFilter;
      const res = await auditLogs.list(filters);
      setRows(res.rows);
      setCount(res.count);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, entityFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [actionFilter, entityFilter]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Auditoría</h2>
        <p className="text-sm text-slate-600">
          Registro de todas las acciones realizadas en el sistema
        </p>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="size-4 text-slate-400" />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          <option value="">Todas las entidades</option>
          {Object.entries(ENTITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 ml-auto tabular-nums">
          {count} registro{count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Sin registros de auditoría.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 font-medium">Usuario</th>
                <th className="text-left px-4 py-2 font-medium">Acción</th>
                <th className="text-left px-4 py-2 font-medium">Entidad</th>
                <th className="text-left px-4 py-2 font-medium">Detalle</th>
                <th className="text-left px-4 py-2 font-medium">IP</th>
                <th className="px-4 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((log) => {
                const cfg = ACTION_CONFIG[log.action];
                const Icon = cfg?.icon ?? Pencil;
                const isExpanded = expanded === log.id;
                const hasDiff = log.before || log.after;

                return (
                  <>
                    <tr
                      key={log.id}
                      className={cn(
                        'hover:bg-slate-50 transition-colors',
                        hasDiff && 'cursor-pointer',
                      )}
                      onClick={() =>
                        hasDiff && setExpanded(isExpanded ? null : log.id)
                      }
                    >
                      <td className="px-4 py-2 text-slate-700 tabular-nums whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('es-CO', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2">
                        <p className="text-slate-900 font-medium text-xs">
                          {log.user_name}
                        </p>
                        <p className="text-slate-500 text-[10px]">
                          {log.user_role}
                        </p>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ring-1 ring-inset',
                            cfg?.tone ?? 'bg-slate-100 text-slate-600 ring-slate-200',
                          )}
                        >
                          <Icon className="size-3" />
                          {cfg?.label ?? log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-700 text-xs">
                        {ENTITY_LABELS[log.entity] ?? log.entity}
                      </td>
                      <td className="px-4 py-2 text-slate-600 text-xs max-w-[200px] truncate">
                        {log.entity_label ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-500 text-xs tabular-nums">
                        {log.ip ?? '—'}
                      </td>
                      <td className="px-4 py-2">
                        {hasDiff && (
                          isExpanded ? (
                            <ChevronUp className="size-4 text-slate-400" />
                          ) : (
                            <ChevronDown className="size-4 text-slate-400" />
                          )
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${log.id}-diff`}>
                        <td colSpan={7} className="bg-slate-50 px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            {log.before && (
                              <div>
                                <p className="font-semibold text-rose-700 mb-1">
                                  Antes
                                </p>
                                <pre className="bg-white rounded border border-slate-200 p-3 overflow-x-auto text-slate-700 text-[11px] leading-relaxed">
                                  {JSON.stringify(log.before, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.after && (
                              <div>
                                <p className="font-semibold text-emerald-700 mb-1">
                                  Después
                                </p>
                                <pre className="bg-white rounded border border-slate-200 p-3 overflow-x-auto text-slate-700 text-[11px] leading-relaxed">
                                  {JSON.stringify(log.after, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <p className="tabular-nums">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
