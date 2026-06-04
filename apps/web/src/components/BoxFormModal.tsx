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
import { cn } from '../lib/utils';

interface Props {
  mode: 'create' | 'reassign';
  title: string;
  initial?: Partial<CreateBoxInput> & { type?: BoxType };
  lockedType?: BoxType;
  onClose: () => void;
  onSubmit: (input: CreateBoxInput) => Promise<void>;
}

export function BoxFormModal({ mode, title, initial, lockedType, onClose, onSubmit }: Props) {
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<BoxType>(lockedType ?? initial?.type ?? 'individual');
  const [amount, setAmount] = useState<string>(
    initial?.initial_amount ? String(initial.initial_amount) : '',
  );
  const [selected, setSelected] = useState<string[]>(initial?.worker_ids ?? []);
  const [primary, setPrimary] = useState<string | undefined>(initial?.primary_worker_id);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyWorkers, setBusyWorkers] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadData = async () => {
      try {
        const [w, boxes] = await Promise.all([
          workersApi.list(),
          mode === 'create' ? pettyCash.list() : Promise.resolve([] as PettyCashBox[]),
        ]);
        setAllWorkers(w);
        // Build a map of worker_id → box code for workers that already have an open box
        const busy = new Map<string, string>();
        for (const box of boxes) {
          if (box.status === 'open') {
            for (const bw of box.workers) {
              busy.set(bw.id, box.code);
            }
          }
        }
        setBusyWorkers(busy);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar trabajadores');
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
    if (mode === 'create' && (!code.trim() || !name.trim() || !amount)) return false;
    if (selected.length === 0) return false;
    if (type === 'individual' && selected.length !== 1) return false;
    return true;
  }, [mode, code, name, amount, selected, type]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        code: code.trim(),
        name: name.trim(),
        type,
        initial_amount: parseFloat(amount || '0'),
        worker_ids: selected,
        primary_worker_id: type === 'shared' ? primary : selected[0],
      });
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
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    placeholder="1000000"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
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
                      1 trabajador con su propio anticipo
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
                      Varios trabajadores descuentan
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
                Trabajadores asignados ({selected.length}
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
                  const isPrimary = primary === w.id;
                  const busyBoxCode = busyWorkers.get(w.id);
                  const isDisabled = mode === 'create' && !!busyBoxCode;
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
                            (Trabajador)
                          </span>
                        </p>
                        {isDisabled ? (
                          <p className="text-xs text-rose-500">Ya tiene caja abierta: {busyBoxCode}</p>
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
              disabled={!valid || saving}
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
