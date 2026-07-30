import { ExternalLink, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import {
  fetchBlobWithAuth,
  BOX_DOCUMENT_TYPE_LABEL,
  IDENTITY_DOC_TYPES,
  type DocumentType,
  type InvoiceAnnex,
} from '../lib/api';
import { AnnexBadge } from './AnnexBadge';

interface Props {
  documentType: DocumentType;
  annexes?: InvoiceAnnex[] | null;
}

/**
 * Identificación del prestador en una cuenta de cobro: el RUT y/o la cédula que
 * el residente anexó por WhatsApp.
 *
 * Que falte uno NO impide aprobar — el residente puede mandarlos en días
 * distintos. El bloque solo deja claro con qué se está aprobando.
 */
export function InvoiceAnnexes({ documentType, annexes }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (documentType !== 'cuenta_cobro') return null;

  const docs = annexes ?? [];
  const attached = docs.map((a) => a.doc_type);
  const missing = IDENTITY_DOC_TYPES.filter((t) => !attached.includes(t));

  /** El archivo va detrás del token: se descarga y se abre como blob. */
  const open = async (id: string) => {
    setOpening(id);
    setError(null);
    try {
      const blob = await fetchBlobWithAuth(`/box-documents/${id}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir el anexo');
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-slate-100">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-600">
          Identificación del prestador
        </span>
        <AnnexBadge documentType={documentType} annexes={docs} />
      </div>

      {error && <p className="text-[11px] text-rose-700">{error}</p>}

      {docs.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          El residente aún no ha anexado el RUT ni la cédula. Puede enviarlos por WhatsApp
          en cualquier momento — no hace falta esperar para aprobar.
        </p>
      ) : (
        <ul className="space-y-1">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5"
            >
              <FileText className="size-3.5 text-slate-400 shrink-0" />
              <span className="flex-1 min-w-0 text-[11px] text-slate-700 truncate">
                <span className="font-medium">{BOX_DOCUMENT_TYPE_LABEL[doc.doc_type]}</span>
                {' · '}
                {new Date(doc.created_at).toLocaleDateString('es-CO', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <button
                type="button"
                onClick={() => open(doc.id)}
                disabled={opening === doc.id}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-700 hover:text-sky-900 shrink-0"
              >
                {opening === doc.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ExternalLink className="size-3" />
                )}
                Ver
              </button>
            </li>
          ))}
        </ul>
      )}

      {docs.length > 0 && missing.length > 0 && (
        <p className="text-[11px] text-slate-500">
          Falta {missing.map((t) => BOX_DOCUMENT_TYPE_LABEL[t]).join(' y ')}. El residente
          puede anexarlo después sin volver a subir la cuenta de cobro.
        </p>
      )}
    </div>
  );
}
