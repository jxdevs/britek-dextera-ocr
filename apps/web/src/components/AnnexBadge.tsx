import { Paperclip } from 'lucide-react';
import {
  BOX_DOCUMENT_TYPE_LABEL,
  IDENTITY_DOC_TYPES,
  type BoxDocumentType,
  type DocumentType,
  type InvoiceAnnex,
} from '../lib/api';
import { cn } from '../lib/utils';

interface Props {
  documentType: DocumentType;
  annexes?: InvoiceAnnex[] | null;
  className?: string;
}

/**
 * Estado de la identificación del prestador en una cuenta de cobro: qué soportes
 * llegaron (RUT, cédula) y cuáles faltan.
 *
 * Es informativo — no bloquea la aprobación. El residente puede mandar el RUT hoy
 * y la cédula otro día, así que el chip cambia solo cuando llegan.
 *
 * No se muestra nada en facturas: ahí la identificación es el NIT impreso.
 */
export function AnnexBadge({ documentType, annexes, className }: Props) {
  if (documentType !== 'cuenta_cobro') return null;

  const attached = (annexes ?? [])
    .map((a) => a.doc_type)
    .filter((t) => IDENTITY_DOC_TYPES.includes(t));
  const missing = IDENTITY_DOC_TYPES.filter((t) => !attached.includes(t));

  if (missing.length === 0) {
    return (
      <Chip className={cn('bg-emerald-50 text-emerald-700', className)} title="RUT y cédula anexados">
        RUT + cédula
      </Chip>
    );
  }

  if (attached.length === 0) {
    return (
      <Chip
        className={cn('bg-amber-50 text-amber-700', className)}
        title="El residente no ha anexado el RUT ni la cédula del prestador"
      >
        Sin anexos
      </Chip>
    );
  }

  return (
    <Chip
      className={cn('bg-sky-50 text-sky-700', className)}
      title={`Anexado: ${label(attached)} · Falta: ${label(missing)}`}
    >
      Falta {label(missing).toLowerCase()}
    </Chip>
  );
}

function Chip({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0',
        className,
      )}
    >
      <Paperclip className="size-2.5" />
      {children}
    </span>
  );
}

function label(types: BoxDocumentType[]): string {
  return types.map((t) => BOX_DOCUMENT_TYPE_LABEL[t]).join(' y ');
}
