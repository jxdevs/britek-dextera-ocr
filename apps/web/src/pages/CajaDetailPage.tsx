import { ArrowLeft, Loader2, Lock, Pencil, Star } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BoxFormModal } from '../components/BoxFormModal';
import { pettyCash, type Movement, type PettyCashBox } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn, formatMoney } from '../lib/utils';

export default function CajaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';

  const [box, setBox] = useState<PettyCashBox | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, m] = await Promise.all([pettyCash.get(id), pettyCash.movements(id)]);
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

  const handleClose = async () => {
    if (!box) return;
    if (!confirm(`Cerrar la caja ${box.code}? No se pueden registrar más facturas contra ella.`))
      return;
    setClosing(true);
    try {
      await pettyCash.close(box.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally {
      setClosing(false);
    }
  };

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
        <Link to="/cajas" className="mt-4 inline-flex items-center gap-1 text-sm text-slate-600">
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </div>
    );
  }

  const initial = parseFloat(box.initial_amount);
  const current = parseFloat(box.current_balance);
  const used = initial - current;
  const pct = initial > 0 ? (current / initial) * 100 : 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <button
          onClick={() => navigate('/cajas')}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" /> Volver a cajas
        </button>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">{box.name}</h2>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset',
                box.status === 'open'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-slate-100 text-slate-600 ring-slate-200',
              )}
            >
              {box.status === 'open' ? 'Abierta' : 'Cerrada'}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset bg-sky-50 text-sky-700 ring-sky-200">
              {box.type === 'individual' ? 'Individual' : 'Compartida'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {box.code} · abierta el {new Date(box.opened_at).toLocaleDateString('es-CO')}
            {box.closed_at && ` · cerrada el ${new Date(box.closed_at).toLocaleDateString('es-CO')}`}
          </p>
        </div>
        {canEdit && box.status === 'open' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 hover:bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
            >
              <Pencil className="size-4" />
              Asignar trabajadores
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 hover:bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
            >
              {closing ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              Cerrar caja
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card label="Saldo actual" value={formatMoney(current)} muted={`de ${formatMoney(initial)}`} />
        <Card label="Consumido" value={formatMoney(used)} muted={`${(100 - pct).toFixed(1)}% del monto`} />
        <Card
          label="Movimientos aprobados"
          value={String(movements.length)}
          muted="facturas legalizadas"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Trabajadores asignados ({box.workers.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {box.workers.map((w) => (
            <div key={w.id} className="px-4 py-3 flex items-center gap-3">
              <div className="size-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700">
                {w.name
                  .split(' ')
                  .slice(0, 2)
                  .map((s) => s[0])
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">{w.name}</p>
                <p className="text-xs text-slate-500 tabular-nums">
                  {w.document_number} · {w.phone}
                </p>
              </div>
              {w.BoxAssignment.is_primary && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 rounded">
                  <Star className="size-3 fill-current" /> Primario
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Movimientos ({movements.length})
          </h3>
        </div>
        {movements.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Sin movimientos. Aparecerán aquí cuando se aprueben facturas (Sprint 1.3).
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                <th className="text-left px-4 py-2 font-medium">Factura</th>
                <th className="text-right px-4 py-2 font-medium">Monto</th>
                <th className="text-left px-4 py-2 font-medium">Aprobador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2 text-slate-700 tabular-nums">
                    {new Date(m.created_at).toLocaleDateString('es-CO')}
                  </td>
                  <td className="px-4 py-2 text-slate-900">{m.invoice.vendor_name ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-700 tabular-nums">
                    {m.invoice.invoice_number ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-900 tabular-nums font-medium">
                    {formatMoney(parseFloat(m.invoice.total))}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{m.approver.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <BoxFormModal
          mode="reassign"
          title="Reasignar trabajadores"
          lockedType={box.type}
          initial={{
            type: box.type,
            worker_ids: box.workers.map((w) => w.id),
            primary_worker_id: box.workers.find((w) => w.BoxAssignment.is_primary)?.id,
          }}
          onClose={() => setEditing(false)}
          onSubmit={async (input) => {
            await pettyCash.assign(box.id, input.worker_ids, input.primary_worker_id);
            setEditing(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Card({ label, value, muted }: { label: string; value: string; muted: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 tabular-nums">{muted}</p>
    </div>
  );
}
