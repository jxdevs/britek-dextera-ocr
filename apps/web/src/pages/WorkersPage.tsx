import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  workers as workersApi,
  type CreateWorkerInput,
  type Worker,
  type WorkerRole,
} from '../lib/api';
import { cn } from '../lib/utils';

const EMPTY: CreateWorkerInput = {
  document_number: '',
  name: '',
  phone: '',
  email: '',
  role: 'worker',
  password: '',
};

const ROLE_LABEL: Record<WorkerRole, string> = {
  admin: 'Admin',
  approver: 'Aprobador',
  worker: 'Residente',
};

const ROLE_TONE: Record<WorkerRole, string> = {
  admin: 'bg-violet-100 text-violet-800 ring-violet-200',
  approver: 'bg-sky-100 text-sky-800 ring-sky-200',
  worker: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export default function WorkersPage() {
  const [items, setItems] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await workersApi.list());
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

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (w: Worker) => {
    setEditing(w);
    setModalOpen(true);
  };

  const remove = async (w: Worker) => {
    if (!confirm(`Eliminar a ${w.name}? Esta acción no se puede deshacer.`)) return;
    try {
      await workersApi.remove(w.id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Residentes</h2>
          <p className="text-sm text-slate-600">
            Admins y aprobadores entran al dashboard; los residentes envían facturas por WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="size-4" />
          Nuevo
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">Sin residentes aún.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nombre</th>
                <th className="text-left px-4 py-2 font-medium">Documento</th>
                <th className="text-left px-4 py-2 font-medium">Teléfono</th>
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Rol</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{w.name}</td>
                  <td className="px-4 py-2 text-slate-700">{w.document_number}</td>
                  <td className="px-4 py-2 text-slate-700 tabular-nums">{w.phone}</td>
                  <td className="px-4 py-2 text-slate-700">{w.email ?? '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset',
                        ROLE_TONE[w.role],
                      )}
                    >
                      {ROLE_LABEL[w.role]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => openEdit(w)}
                      title="Editar"
                      className="p-1.5 rounded hover:bg-slate-200 text-slate-600"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => remove(w)}
                      title="Eliminar"
                      className="p-1.5 rounded hover:bg-rose-100 text-rose-600 ml-1"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <WorkerModal
          initial={editing}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

function WorkerModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Worker | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<CreateWorkerInput>(() =>
    initial
      ? {
          document_number: initial.document_number,
          name: initial.name,
          phone: initial.phone,
          email: initial.email ?? '',
          role: initial.role,
          password: '',
        }
      : { ...EMPTY },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresPassword = (form.role === 'admin' || form.role === 'approver') && !initial;

  const update = <K extends keyof CreateWorkerInput>(key: K, value: CreateWorkerInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: CreateWorkerInput = {
        document_number: form.document_number.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email?.trim() || null,
        role: form.role,
      };
      if (form.password && form.password.trim()) {
        payload.password = form.password.trim();
      }
      if (initial) {
        await workersApi.update(initial.id, payload);
      } else {
        await workersApi.create(payload);
      }
      await onSaved();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Error al guardar',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            {initial ? 'Editar residente' : 'Nuevo residente'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" required value={form.name} onChange={(v) => update('name', v)} />
            <Field
              label="Documento"
              required
              value={form.document_number}
              onChange={(v) => update('document_number', v)}
            />
            <Field
              label="Teléfono (con código país)"
              required
              placeholder="+573001234567"
              value={form.phone}
              onChange={(v) => update('phone', v)}
            />
            <Field
              label="Email"
              type="email"
              value={form.email ?? ''}
              onChange={(v) => update('email', v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Rol</label>
              <select
                value={form.role}
                onChange={(e) => update('role', e.target.value as WorkerRole)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="worker">Residente</option>
                <option value="approver">Aprobador</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Field
              label={
                initial
                  ? 'Contraseña (dejar vacío para no cambiar)'
                  : requiresPassword
                    ? 'Contraseña (requerida)'
                    : 'Contraseña (opcional)'
              }
              type="password"
              value={form.password ?? ''}
              onChange={(v) => update('password', v)}
            />
          </div>

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 rounded-md hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {initial ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
      />
    </label>
  );
}
