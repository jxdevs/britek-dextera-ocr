import { AlertTriangle, ArrowLeft, Check, Clock, Eye, Loader2, Lock, Pencil, Settings, Star, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BoxFormModal } from '../components/BoxFormModal';
import { approvals as approvalsApi, pettyCash, type Movement, type PettyCashBox, type UpdateBoxInput } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn, formatMoney, getBoxConsumptionAlert, getBoxDeadlineInfo } from '../lib/utils';

export default function CajaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const canApprove = user?.role === 'admin' || user?.role === 'approver';

  const [box, setBox] = useState<PettyCashBox | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingBox, setEditingBox] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const activeMovements = movements.filter((m) => m.status !== 'rejected');
  const consumed = activeMovements.reduce((sum, m) => sum + parseFloat(m.total), 0);
  const legalized = movements.filter((m) => m.status === 'approved').reduce((sum, m) => sum + parseFloat(m.total), 0);
  const pendingCount = movements.filter((m) => m.status === 'pending').length;
  const consumedPct = initial > 0 ? (consumed / initial) * 100 : 0;
  const legalizedPct = initial > 0 ? (legalized / initial) * 100 : 0;

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
        {canEdit && box.status === 'open' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditingBox(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 hover:bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
            >
              <Settings className="size-4" />
              Editar caja
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
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`¿Eliminar la caja ${box.code} con TODOS sus movimientos y archivos? Esta acción no se puede deshacer.`)) return;
                setDeleting(true);
                try {
                  await pettyCash.remove(box.id);
                  navigate('/cajas');
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Error al eliminar');
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Eliminar
            </button>
          </div>
        )}
        {canEdit && (box.status === 'closed' || box.status === 'blocked') && (
          <div className="flex gap-2">
            {box.status === 'blocked' && (
              <button
                type="button"
                onClick={handleClose}
                disabled={closing}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 hover:bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 disabled:opacity-50"
              >
                {closing ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
                Cerrar caja
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!confirm(`¿Eliminar la caja ${box.code} con TODOS sus movimientos y archivos? Esta acción no se puede deshacer.`)) return;
                setDeleting(true);
                try {
                  await pettyCash.remove(box.id);
                  navigate('/cajas');
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'Error al eliminar');
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Eliminar caja
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card label="Monto inicial" value={formatMoney(initial)} muted="asignado a la caja" />
        <Card label="Consumido" value={formatMoney(consumed)} muted={`${consumedPct.toFixed(1)}% del monto`} />
        <Card label="Legalizado" value={formatMoney(legalized)} muted={`${legalizedPct.toFixed(1)}% del monto`} />
        <Card
          label="Pendientes de legalizar"
          value={String(pendingCount)}
          muted={pendingCount > 0 ? 'facturas por revisar' : 'todo legalizado'}
        />
      </div>

      {/* Alerta de consumo (75%–80%+) */}
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
            <p className="text-sm font-medium">Caja bloqueada por vencimiento de plazo</p>
            <p className="text-xs mt-0.5 opacity-75">
              Esta caja superó el plazo de 7 días. No se pueden aprobar facturas hasta que un admin la cierre.
            </p>
          </div>
        </div>
      )}

      {/* Semáforo de plazo — solo para cajas abiertas */}
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

      {/* Sección de residentes asignados — oculta temporalmente
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Residentes asignados ({box.workers.length})
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
      */}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Facturas ({movements.length})
          </h3>
        </div>
        {movements.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Sin facturas. Aparecerán aquí cuando el residente las suba por WhatsApp.
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
                <th className="text-center px-4 py-2 font-medium">Soporte</th>
                {(canEdit || canApprove) && <th className="text-center px-4 py-2 font-medium">Acciones</th>}
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
                    <td
                      className="px-4 py-2 text-slate-900 cursor-pointer hover:text-sky-700"
                      onClick={() => navigate(`/facturas/${m.id}`)}
                    >
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
                    <td className="px-4 py-2 text-center">
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 cursor-pointer"
                        onClick={() => navigate(`/facturas/${m.id}`)}
                      >
                        <Eye className="size-3.5" />
                        Ver
                      </span>
                    </td>
                    {(canEdit || canApprove) && (
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {/* Aprobar / Rechazar — solo para pendientes */}
                          {(m.status === 'pending' || m.status === 'observed') && canApprove && (
                            <>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm(`¿Legalizar la factura de ${m.vendor_name ?? 'Sin proveedor'} por ${formatMoney(parseFloat(m.total))}?`)) return;
                                  try {
                                    await approvalsApi.decide({ invoice_id: m.id, action: 'approve' });
                                    await load();
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : 'Error al legalizar');
                                  }
                                }}
                                className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 transition-colors"
                                title="Legalizar factura"
                              >
                                <Check className="size-3" />
                                Legalizar
                              </button>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const reason = prompt('Motivo del rechazo:');
                                  if (!reason) return;
                                  try {
                                    await approvalsApi.decide({ invoice_id: m.id, action: 'reject', comments: reason });
                                    await load();
                                  } catch (err) {
                                    alert(err instanceof Error ? err.message : 'Error al rechazar');
                                  }
                                }}
                                className="inline-flex items-center gap-0.5 rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-100 transition-colors"
                                title="Rechazar factura"
                              >
                                <X className="size-3" />
                                Rechazar
                              </button>
                            </>
                          )}
                          {/* Eliminar — solo admin */}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm(`¿Eliminar esta factura de ${m.vendor_name ?? 'Sin proveedor'} por ${formatMoney(parseFloat(m.total))}? Se restaurará el saldo a la caja.`)) return;
                                try {
                                  await pettyCash.removeMovement(box.id, m.id);
                                  await load();
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : 'Error al eliminar');
                                }
                              }}
                              className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-600 hover:text-rose-800 ml-1"
                              title="Eliminar factura"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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
                <td colSpan={(canEdit || canApprove) ? 4 : 3} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Modal de reasignar residentes — oculto temporalmente
      {editing && (
        <BoxFormModal
          mode="reassign"
          title="Reasignar residentes"
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
      */}

      {editingBox && (
        <EditBoxModal
          box={box}
          onClose={() => setEditingBox(false)}
          onSaved={async () => {
            setEditingBox(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function EditBoxModal({
  box,
  onClose,
  onSaved,
}: {
  box: PettyCashBox;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(box.code);
  const [name, setName] = useState(box.name);
  const [projectName, setProjectName] = useState(box.project_name ?? '');
  const [costCenter, setCostCenter] = useState(box.cost_center ?? '');
  const [initialAmount, setInitialAmount] = useState(box.initial_amount);
  const [exceptionJustification, setExceptionJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MAX_AMOUNT = 1_000_000;
  const amountExceedsLimit = parseInt(initialAmount || '0', 10) > MAX_AMOUNT;
  // El admin puede superar el tope si proporciona una justificación
  const amountBlocked = amountExceedsLimit && exceptionJustification.trim().length < 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: UpdateBoxInput = {};
      if (code !== box.code) input.code = code;
      if (name !== box.name) input.name = name;
      if (projectName !== (box.project_name ?? '')) input.project_name = projectName;
      if (costCenter !== (box.cost_center ?? '')) input.cost_center = costCenter;
      if (initialAmount !== box.initial_amount)
        input.initial_amount = parseInt(initialAmount, 10);

      // Incluir justificación de excepción cuando el monto supera el tope
      if (amountExceedsLimit) {
        input.exception_justification = exceptionJustification.trim();
      }

      await pettyCash.update(box.id, input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4"
      >
        <h3 className="text-lg font-semibold text-slate-900">Editar caja</h3>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Código</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            required
            minLength={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            required
            minLength={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Proyecto</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Nombre del proyecto"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Centro de costo</label>
            <input
              type="text"
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Ej: CC-001"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Monto inicial
          </label>
          <input
            type="number"
            value={initialAmount}
            onChange={(e) => setInitialAmount(e.target.value)}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2',
              amountExceedsLimit
                ? 'border-amber-400 focus:ring-amber-500 text-amber-700'
                : 'border-slate-300 focus:ring-slate-400',
            )}
            step="1"
            min="0"
            required
          />
          {amountExceedsLimit && (
            <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-xs text-amber-800 font-medium mb-1.5">
                ⚠️ El monto supera $1.000.000 — Se requiere justificación de excepción
              </p>
              <textarea
                value={exceptionJustification}
                onChange={(e) => setExceptionJustification(e.target.value)}
                placeholder="Explique por qué se requiere un monto superior al tope (mín. 10 caracteres)"
                rows={2}
                className="w-full rounded-md border border-amber-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
              {exceptionJustification.trim().length > 0 && exceptionJustification.trim().length < 10 && (
                <p className="mt-1 text-xs text-amber-600">
                  La justificación debe tener al menos 10 caracteres ({exceptionJustification.trim().length}/10)
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || amountBlocked}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
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
