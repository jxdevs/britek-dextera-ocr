import { Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthImage } from '../components/AuthImage';
import { InvoiceUploadModal } from '../components/InvoiceUploadModal';
import { invoices as invoicesApi, type Invoice, type InvoiceStatus } from '../lib/api';
import { cn, formatMoney } from '../lib/utils';

const TABS: { value: InvoiceStatus; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'approved', label: 'Aprobadas' },
  { value: 'rejected', label: 'Rechazadas' },
];

const STATUS_TONE: Record<InvoiceStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export default function FacturasPendingPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<InvoiceStatus>('pending');
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

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
            : 'Sin facturas en este estado.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((inv) => (
            <Link
              key={inv.id}
              to={`/facturas/${inv.id}`}
              className="bg-white border border-slate-200 rounded-lg overflow-hidden hover:shadow-sm hover:border-slate-300 transition-all flex flex-col"
            >
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
                    {inv.status === 'pending'
                      ? 'Pendiente'
                      : inv.status === 'approved'
                        ? 'Aprobada'
                        : 'Rechazada'}
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
                  {inv.confidence_score !== null && (
                    <ConfidencePill score={inv.confidence_score} />
                  )}
                </div>
              </div>
            </Link>
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
