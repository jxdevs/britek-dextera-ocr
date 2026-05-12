import { Loader2, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import {
  ApiError,
  invoices as invoicesApi,
  workers as workersApi,
  type Invoice,
  type Worker,
} from '../lib/api';
import { cn } from '../lib/utils';

interface Props {
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}

export function InvoiceUploadModal({ onClose, onCreated }: Props) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [workerId, setWorkerId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workersApi
      .list()
      .then((all) => {
        const onlyWorkers = all.filter((w) => w.role === 'worker');
        setWorkers(onlyWorkers);
        if (onlyWorkers.length > 0) setWorkerId(onlyWorkers[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => setLoadingWorkers(false));
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }, []);

  const submit = async () => {
    if (!file || !workerId) return;
    setSubmitting(true);
    setError(null);
    try {
      const invoice = await invoicesApi.create(file, workerId);
      onCreated(invoice);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Cargar factura manualmente</h3>
            <p className="text-xs text-slate-500">
              Simula el flujo que después llega por WhatsApp.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Trabajador</label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              disabled={loadingWorkers || submitting}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} — {w.phone}
                </option>
              ))}
            </select>
          </div>

          {file ? (
            <div className="bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(0)} KB · {file.type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                Quitar
              </button>
            </div>
          ) : (
            <label
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              className={cn(
                'block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                dragging ? 'border-slate-900 bg-slate-50' : 'border-slate-300 hover:border-slate-400',
              )}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
              <Upload className="mx-auto size-8 text-slate-400 mb-2" strokeWidth={1.5} />
              <p className="text-sm font-medium text-slate-900">
                Arrastra una factura o haz clic
              </p>
              <p className="text-xs text-slate-500 mt-0.5">JPG, PNG o WEBP · hasta 10 MB</p>
            </label>
          )}

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 rounded-md hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!file || !workerId || submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-md"
          >
            {submitting && <Loader2 className="size-3.5 animate-spin" />}
            Subir y extraer
          </button>
        </div>
      </div>
    </div>
  );
}
