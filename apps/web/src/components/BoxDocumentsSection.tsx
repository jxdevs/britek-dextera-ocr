import {
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  boxDocuments as api,
  fetchBlobWithAuth,
  BOX_DOCUMENT_TYPE_LABEL,
  type BoxDocument,
  type BoxDocumentType,
} from '../lib/api';
import { cn } from '../lib/utils';

const TYPE_OPTIONS: BoxDocumentType[] = [
  'rut',
  'cedula',
  'camara_comercio',
  'certificacion_bancaria',
  'otro',
];

interface Props {
  boxId: string;
  /** Solo admin y aprobador pueden adjuntar; solo admin puede quitar. */
  canUpload: boolean;
  canDelete: boolean;
}

/**
 * Soportes que acompañan a la caja sin ser un movimiento: RUT del proveedor,
 * cédula del prestador, cámara de comercio. No pasan por la IA ni descuentan
 * saldo — solo quedan adjuntos al expediente.
 */
export function BoxDocumentsSection({ boxId, canUpload, canDelete }: Props) {
  const [docs, setDocs] = useState<BoxDocument[]>([]);
  /** Soportes que la IA archivó sin poder determinar a qué caja pertenecen. */
  const [unassigned, setUnassigned] = useState<BoxDocument[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<BoxDocumentType>('rut');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [own, orphans] = await Promise.all([
        api.listByBox(boxId),
        canUpload ? api.listUnassigned() : Promise.resolve([]),
      ]);
      setDocs(own);
      setUnassigned(orphans);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar documentos');
    } finally {
      setLoading(false);
    }
  }, [boxId, canUpload]);

  const claim = async (doc: BoxDocument) => {
    setClaiming(doc.id);
    try {
      await api.assign(doc.id, boxId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al asignar');
    } finally {
      setClaiming(null);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.create(boxId, file, {
        doc_type: docType,
        description: description.trim() || undefined,
      });
      setFile(null);
      setDescription('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al adjuntar');
    } finally {
      setUploading(false);
    }
  };

  /** El archivo va detrás del token, así que se descarga y se abre como blob. */
  const open = async (doc: BoxDocument) => {
    setOpening(doc.id);
    try {
      const blob = await fetchBlobWithAuth(`/box-documents/${doc.id}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // El navegador ya tiene el blob cargado; se libera al minuto.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el documento');
    } finally {
      setOpening(null);
    }
  };

  const remove = async (doc: BoxDocument) => {
    if (!confirm(`¿Quitar "${doc.original_name ?? BOX_DOCUMENT_TYPE_LABEL[doc.doc_type]}" de esta caja? El archivo no se borra.`))
      return;
    setRemoving(doc.id);
    try {
      await api.remove(doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al quitar');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Paperclip className="size-4 text-slate-500" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Documentos adjuntos</h3>
            <p className="text-xs text-slate-500">
              Soportes del expediente: RUT, cédulas, cámara de comercio. No son gastos y no
              descuentan saldo.
            </p>
          </div>
        </div>
        <span className="text-xs text-slate-500 shrink-0">{docs.length}</span>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </div>
      )}

      {canUpload && (
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
              <Upload className="size-3.5" />
              {file ? 'Cambiar archivo' : 'Elegir archivo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as BoxDocumentType)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {BOX_DOCUMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción (ej. RUT de Ferretería El Tornillo)"
              className="flex-1 min-w-[200px] rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />

            <button
              type="button"
              onClick={upload}
              disabled={!file || uploading}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {uploading && <Loader2 className="size-3.5 animate-spin" />}
              Adjuntar
            </button>
          </div>

          {file && (
            <p className="text-[11px] text-slate-500 truncate">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          )}
        </div>
      )}

      {!loading && unassigned.length > 0 && (
        <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 space-y-2">
          <p className="text-xs font-medium text-amber-900">
            {unassigned.length} soporte{unassigned.length === 1 ? '' : 's'} sin caja asignada
          </p>
          <p className="text-[11px] text-amber-800">
            La IA los archivó al subirlos, pero el residente no tenía una única caja abierta.
          </p>
          <ul className="space-y-1.5">
            {unassigned.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-2 rounded border border-amber-200 bg-white px-2.5 py-1.5"
              >
                <FileText className="size-3.5 text-amber-600 shrink-0" />
                <span className="flex-1 min-w-0 text-[11px] text-slate-700 truncate">
                  <span className="font-medium">{BOX_DOCUMENT_TYPE_LABEL[doc.doc_type]}</span>
                  {' · '}
                  {doc.original_name ?? '—'}
                  {doc.worker && ` · ${doc.worker.name}`}
                </span>
                <button
                  type="button"
                  onClick={() => open(doc)}
                  className="text-[11px] font-medium text-slate-600 hover:text-slate-900 shrink-0"
                >
                  Ver
                </button>
                <button
                  type="button"
                  onClick={() => claim(doc)}
                  disabled={claiming === doc.id}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-50 shrink-0"
                >
                  {claiming === doc.id && <Loader2 className="size-3 animate-spin" />}
                  Adjuntar a esta caja
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="size-4 animate-spin text-slate-400" />
        </div>
      ) : docs.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-500">
          No hay documentos adjuntos en esta caja.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.map((doc) => (
            <li key={doc.id} className="px-4 py-2.5 flex items-center gap-3">
              <FileText className="size-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-900">
                    {BOX_DOCUMENT_TYPE_LABEL[doc.doc_type]}
                  </span>
                  {doc.source === 'auto' && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-700"
                      title="Se subió a la cola de facturas y la IA lo reclasificó como soporte"
                    >
                      Clasificado por IA
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {doc.description ?? doc.original_name ?? '—'}
                  {doc.worker && ` · ${doc.worker.name}`}
                  {' · '}
                  {new Date(doc.created_at).toLocaleDateString('es-CO', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <button
                type="button"
                onClick={() => open(doc)}
                disabled={opening === doc.id}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0"
              >
                {opening === doc.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="size-3.5" />
                )}
                Ver
              </button>

              {canDelete && (
                <button
                  type="button"
                  onClick={() => remove(doc)}
                  disabled={removing === doc.id}
                  className={cn(
                    'inline-flex items-center text-rose-600 hover:text-rose-800 shrink-0',
                    removing === doc.id && 'opacity-50',
                  )}
                  title="Quitar de la caja"
                >
                  {removing === doc.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
