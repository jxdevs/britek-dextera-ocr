import { Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ApiError,
  pettyCash,
  workers as workersApi,
  type BoxType,
  type CreateBoxInput,
  type PettyCashBox,
  type Worker,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

interface Props {
  mode: 'create' | 'reassign';
  title: string;
  initial?: Partial<CreateBoxInput> & { type?: BoxType };
  lockedType?: BoxType;
  onClose: () => void;
  onSubmit: (input: CreateBoxInput) => Promise<void>;
}

/** Cajas activas de un residente: abiertas (códigos) y bloqueada si existe */
interface BusyInfo {
  openCodes: string[];
  blockedCode: string | null;
}

export function BoxFormModal({ mode, title, initial, lockedType, onClose, onSubmit }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type] = useState<BoxType>(lockedType ?? initial?.type ?? 'individual');
  const [amount, setAmount] = useState<string>(
    initial?.initial_amount ? String(initial.initial_amount) : '',
  );
  const [selected, setSelected] = useState<string[]>(initial?.worker_ids ?? []);
  const [primary, setPrimary] = useState<string | undefined>(initial?.primary_worker_id);
  const [projectName, setProjectName] = useState(initial?.project_name ?? '');
  const [costCenter, setCostCenter] = useState(initial?.cost_center ?? '');
  const [exceptionJustification, setExceptionJustification] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyWorkers, setBusyWorkers] = useState<Map<string, BusyInfo>>(new Map());

  const MAX_AMOUNT = 1_000_000;
  const amountExceedsLimit = parseInt(amount || '0', 10) > MAX_AMOUNT;
  // Segunda caja: hay algún residente seleccionado que ya tiene una caja abierta
  const selectedNeedsSecondBox =
    mode === 'create' &&
    selected.some((id) => (busyWorkers.get(id)?.openCodes.length ?? 0) >= 1);
  // Los admins pueden superar el tope o abrir segunda caja si justifican
  const needsException = amountExceedsLimit || selectedNeedsSecondBox;
  const exceptionBlocked = needsException && (!isAdmin || exceptionJustification.trim().length < 10);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [w, boxes] = await Promise.all([
          workersApi.list(),
          mode === 'create' ? pettyCash.list() : Promise.resolve([] as PettyCashBox[]),
        ]);
        setAllWorkers(w);
        // Mapa de worker_id → cajas activas (abiertas y bloqueadas) del residente
        const busy = new Map<string, BusyInfo>();
        for (const box of boxes) {
          if (box.status !== 'open' && box.status !== 'blocked') continue;
          for (const bw of box.workers) {
            const info = busy.get(bw.id) ?? { openCodes: [], blockedCode: null };
            if (box.status === 'open') info.openCodes.push(box.code);
            else info.blockedCode = box.code;
            busy.set(bw.id, info);
          }
        }
        setBusyWorkers(busy);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar residentes');
      } finally {
        setLoadingWorkers(false);
      }
    };
    loadData();
  }, [mode]);

  const toggle = (id: string) => {
    setSelected((curr) => {
      if (curr.includes(id)) {
        if (primary === id) setPrimary(undefined);
        return type === 'individual' ? [] : curr.filter((x) => x !== id);
      }
      if (type === 'individual') {
        setPrimary(id);
        return [id];
      }
      return [...curr, id];
    });
  };

  const valid = useMemo(() => {
    if (mode === 'create' && (!code.trim() || !name.trim() || !amount || !projectName.trim() || !costCenter.trim())) return false;
    if (selected.length === 0) return false;
    if (type === 'individual' && selected.length !== 1) return false;
    return true;
  }, [mode, code, name, amount, projectName, costCenter, selected, type]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: CreateBoxInput = {
        code: code.trim(),
        name: name.trim(),
        type,
        initial_amount: parseInt(amount || '0', 10),
        project_name: projectName.trim(),
        cost_center: costCenter.trim(),
        worker_ids: selected,
        primary_worker_id: type === 'shared' ? primary : selected[0],
      };
      // Incluir justificación de excepción (tope de monto y/o segunda caja)
      if (needsException && isAdmin) {
        input.exception_justification = exceptionJustification.trim();
      }
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4 overflow-y-auto">
          {mode === 'create' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Código</span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    placeholder="CAJA-IND-002"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Monto inicial</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    placeholder="1000000"
                    className={cn(
                      'mt-1 w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2',
                      amountExceedsLimit && !isAdmin
                        ? 'border-rose-400 focus:ring-rose-500 text-rose-700'
                        : amountExceedsLimit && isAdmin
                          ? 'border-amber-400 focus:ring-amber-500 text-amber-700'
                          : 'border-slate-300 focus:ring-slate-900',
                    )}
                  />
                  {amountExceedsLimit && !isAdmin && (
                    <p className="mt-1 text-xs text-rose-600 font-medium">
                      El monto no puede superar $1.000.000
                    </p>
                  )}
                  {amountExceedsLimit && isAdmin && (
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
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Nombre</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Proyecto</span>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    required
                    placeholder="Nombre del proyecto"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Centro de costo</span>
                  <input
                    value={costCenter}
                    onChange={(e) => setCostCenter(e.target.value)}
                    required
                    placeholder="Ej: CC-001"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </label>
              </div>
              <div>
                <span className="text-xs font-medium text-slate-600">Tipo</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {/* Solo Individual en esta fase */}
                  <button
                    type="button"
                    disabled
                    className="rounded-md border px-3 py-2 text-sm text-left transition-colors border-slate-900 bg-slate-900 text-white"
                  >
                    <p className="font-medium">Individual</p>
                    <p className="text-xs text-slate-300">
                      1 residente con su propio anticipo
                    </p>
                  </button>

                  {/* TODO: Fase 2 - Habilitar caja compartida
                  <button
                    type="button"
                    disabled={!!lockedType}
                    onClick={() => {
                      setType('shared');
                      // No recortar selección para shared
                    }}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm text-left transition-colors',
                      type === 'shared'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                      lockedType && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <p className="font-medium">Compartida</p>
                    <p
                      className={cn(
                        'text-xs',
                        type === 'shared' ? 'text-slate-300' : 'text-slate-500',
                      )}
                    >
                      Varios residentes descuentan
                    </p>
                  </button>
                  */}
                </div>
              </div>
            </>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">
                Residentes asignados ({selected.length}
                {type === 'individual' ? '/1' : ''})
              </span>
              {/* TODO: Fase 2 - Caja compartida
              {type === 'shared' && selected.length > 1 && (
                <span className="text-xs text-slate-500">El primario recibe la marca ★</span>
              )}
              */}
            </div>
            <div className="mt-2 border border-slate-200 rounded-md max-h-64 overflow-y-auto divide-y divide-slate-100">
              {loadingWorkers ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="size-4 animate-spin text-slate-400" />
                </div>
              ) : (
                allWorkers.filter((w) => w.role === 'worker').map((w) => {
                  const isSelected = selected.includes(w.id);
                  const busyInfo = busyWorkers.get(w.id);
                  const openCodes = busyInfo?.openCodes ?? [];
                  const blockedCode = busyInfo?.blockedCode ?? null;
                  // Bloqueado siempre: caja bloqueada, tope de 2 cajas, o no-admin con caja abierta
                  const isDisabled =
                    mode === 'create' &&
                    (!!blockedCode ||
                      openCodes.length >= 2 ||
                      (openCodes.length === 1 && !isAdmin));
                  return (
                    <div
                      key={w.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2',
                        isDisabled
                          ? 'opacity-50 cursor-not-allowed bg-slate-50'
                          : 'cursor-pointer hover:bg-slate-50',
                        isSelected && !isDisabled && 'bg-slate-50',
                      )}
                      onClick={() => !isDisabled && toggle(w.id)}
                    >
                      {/* Fase 2: type === 'individual' ? 'radio' : 'checkbox' */}
                      <input
                        type="radio"
                        checked={isSelected}
                        readOnly
                        disabled={isDisabled}
                        className="accent-slate-900"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {w.name}
                          <span className="ml-1.5 text-xs text-slate-500 font-normal">
                            (Residente)
                          </span>
                        </p>
                        {mode === 'create' && blockedCode ? (
                          <p className="text-xs text-rose-500">
                            Tiene caja bloqueada: {blockedCode} — debe legalizarla y cerrarla primero
                          </p>
                        ) : mode === 'create' && openCodes.length >= 2 ? (
                          <p className="text-xs text-rose-500">
                            Ya tiene {openCodes.length} cajas abiertas (máximo permitido)
                          </p>
                        ) : mode === 'create' && openCodes.length === 1 ? (
                          isAdmin ? (
                            <p className="text-xs text-amber-600">
                              Ya tiene caja abierta: {openCodes[0]} — la segunda caja requiere justificación
                            </p>
                          ) : (
                            <p className="text-xs text-rose-500">Ya tiene caja abierta: {openCodes[0]}</p>
                          )
                        ) : (
                          <p className="text-xs text-slate-500 tabular-nums">{w.phone}</p>
                        )}
                      </div>
                      {/* TODO: Fase 2 - Botón primario para caja compartida
                      {type === 'shared' && isSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrimary(w.id);
                          }}
                          className={cn(
                            'text-xs px-2 py-0.5 rounded font-medium',
                            isPrimary
                              ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
                              : 'text-slate-500 hover:bg-slate-100',
                          )}
                        >
                          {isPrimary ? '★ Primario' : 'Marcar primario'}
                        </button>
                      )}
                      */}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {selectedNeedsSecondBox && isAdmin && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-xs text-amber-800 font-medium mb-1.5">
                ⚠️ El residente seleccionado ya tiene una caja abierta — la segunda caja se creará como excepción y requiere justificación
              </p>
              {amountExceedsLimit ? (
                <p className="text-xs text-amber-700">
                  La justificación del campo de monto aplica también para esta excepción.
                </p>
              ) : (
                <>
                  <textarea
                    value={exceptionJustification}
                    onChange={(e) => setExceptionJustification(e.target.value)}
                    placeholder="Explique por qué el residente necesita una segunda caja abierta (mín. 10 caracteres)"
                    rows={2}
                    className="w-full rounded-md border border-amber-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                  {exceptionJustification.trim().length > 0 && exceptionJustification.trim().length < 10 && (
                    <p className="mt-1 text-xs text-amber-600">
                      La justificación debe tener al menos 10 caracteres ({exceptionJustification.trim().length}/10)
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 rounded-md hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valid || saving || exceptionBlocked}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {mode === 'create' ? 'Abrir caja' : 'Guardar asignaciones'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
