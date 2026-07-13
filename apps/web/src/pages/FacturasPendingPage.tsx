import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthImage } from '../components/AuthImage';
import { InvoiceUploadModal } from '../components/InvoiceUploadModal';
import { invoices as invoicesApi, workers as workersApi, type Invoice, type InvoiceStatus, type ExpenseCategory, type Worker } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn, formatMoney } from '../lib/utils';

const TABS: { value: InvoiceStatus; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'observed', label: 'Observadas' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
];

const STATUS_TONE: Record<InvoiceStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  observed: 'bg-violet-50 text-violet-800 ring-violet-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  pending: 'Pendiente',
  observed: 'Observada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

/** Normaliza texto para búsqueda: minúsculas y sin tildes */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  combustible: 'Combustible',
  transporte: 'Transporte',
  peajes: 'Peajes',
  parqueaderos: 'Parqueaderos',
  materiales: 'Materiales',
  consumibles: 'Consumibles',
  alimentacion: 'Alimentación',
  otro: 'Otro',
};

export default function FacturasPendingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<InvoiceStatus>('pending');
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [workersList, setWorkersList] = useState<Worker[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await invoicesApi.list({ status }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    workersApi.list().then(setWorkersList).catch(() => {});
  }, []);

  const hasFilters = !!search.trim() || !!workerFilter;
  const filteredItems = useMemo(() => {
    const q = normalize(search.trim());
    return items.filter((inv) => {
      if (workerFilter && inv.worker_id !== workerFilter) return false;
      if (!q) return true;
      const haystack = normalize(
        `${inv.vendor_name ?? ''} ${inv.vendor_nit ?? ''} ${inv.invoice_number ?? ''}`,
      );
      return haystack.includes(q);
    });
  }, [items, search, workerFilter]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Facturas</h2>
          <p className="text-sm text-slate-600">
            Cola de facturas extraídas con IA, listas para revisar y aprobar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="size-4" />
          Cargar factura
        </button>
      </div>

      <div className="border-b border-slate-200 flex gap-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatus(t.value)}
            className={cn(
              'px-1 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              status === t.value
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Buscador y filtro por residente */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por empresa, NIT o número de factura…"
            className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 min-w-[200px]"
        >
          <option value="">Todos los residentes</option>
          {workersList
            .filter((w) => w.role === 'worker')
            .map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setWorkerFilter('');
            }}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            Limpiar filtros
          </button>
        )}
        {hasFilters && !loading && (
          <span className="text-xs text-slate-500">
            {filteredItems.length} de {items.length} factura(s)
          </span>
        )}
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
          {status === 'pending'
            ? 'No hay facturas pendientes. Carga una manualmente para probar el flujo.'
            : status === 'observed'
              ? 'No hay facturas observadas (requiriendo aprobación de admin).'
              : 'Sin facturas en este estado.'}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg py-12 text-center text-sm text-slate-500">
          No hay facturas que coincidan con la búsqueda o los filtros.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((inv) => (
            <div key={inv.id} className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-sm hover:border-slate-300 transition-all flex flex-col relative">
              {status === 'rejected' && user?.role === 'admin' && (
                <button
                  type="button"
                  disabled={deleting === inv.id}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!confirm('¿Eliminar esta factura rechazada? Esta acción no se puede deshacer.')) return;
                    setDeleting(inv.id);
                    try {
                      await invoicesApi.remove(inv.id);
                      setItems((prev) => prev.filter((i) => i.id !== inv.id));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error al eliminar');
                    } finally {
                      setDeleting(null);
                    }
                  }}
                  className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-colors shadow-sm"
                  title="Eliminar factura"
                >
                  {deleting === inv.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </button>
              )}
              <Link
                to={`/facturas/${inv.id}`}
                className="flex flex-col flex-1">

              <AuthImage
                path={`/invoices/${inv.id}/image`}
                alt={inv.vendor_name ?? 'Factura'}
                className="h-48 w-full object-cover bg-slate-100"
              />
              <div className="p-3 space-y-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {inv.vendor_name ?? 'Proveedor desconocido'}
                  </p>
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset shrink-0',
                      STATUS_TONE[inv.status],
                    )}
                  >
                    {STATUS_LABEL[inv.status]}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500 truncate">
                    {inv.worker?.name ?? '—'}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatMoney(parseFloat(inv.total), inv.currency ?? 'COP')}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {new Date(inv.submitted_at).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <div className="flex items-center gap-1">
                    {inv.expense_category && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                        {CATEGORY_LABEL[inv.expense_category] ?? inv.expense_category}
                      </span>
                    )}
                    {inv.reported_late && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800">
                        Tardío
                      </span>
                    )}
                    {inv.requires_special_approval && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-800">
                        Admin
                      </span>
                    )}
                    {inv.confidence_score !== null && (
                      <ConfidencePill score={inv.confidence_score} />
                    )}
                  </div>
                </div>
              </div>
              </Link>
            </div>
          ))}
        </div>
      )}

      {uploadOpen && (
        <InvoiceUploadModal
          onClose={() => setUploadOpen(false)}
          onCreated={(inv) => {
            setUploadOpen(false);
            navigate(`/facturas/${inv.id}`);
          }}
        />
      )}
    </div>
  );
}

function ConfidencePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone =
    score >= 0.8
      ? 'bg-emerald-100 text-emerald-800'
      : score >= 0.6
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rose-100 text-rose-800';
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', tone)}>
      {pct}%
    </span>
  );
}
