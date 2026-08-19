import { AlertTriangle, ArrowLeft, Check, ExternalLink, Loader2, SquareCheck, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthFilePreview } from '../components/AuthFilePreview';
import { InvoiceAnnexes } from '../components/InvoiceAnnexes';
import {
  ApiError,
  approvals as approvalsApi,
  invoices as invoicesApi,
  DOCUMENT_TYPE_LABEL,
  type DocumentType,
  type EligibleBox,
  type Invoice,
  type InvoiceStatus,
} from '../lib/api';
import { cn, dianValidationUrl, formatMoney, isValidCufeFormat } from '../lib/utils';

/** Format a raw numeric string as Colombian integer (no decimals, dots for thousands) */
function formatCOP(value: string): string {
  if (!value) return '';
  const n = Math.round(parseFloat(value));
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

/** Parse a formatted COP string (with dots) back to a raw numeric string */
function parseCOP(formatted: string): string {
  return formatted.replace(/\./g, '').replace(/,/g, '').trim();
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  pending: 'Pendiente',
  observed: 'Observada',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

const STATUS_TONE: Record<InvoiceStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  observed: 'bg-violet-50 text-violet-800 ring-violet-200',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
};

interface EditableForm {
  document_type: DocumentType;
  vendor_nit: string;
  vendor_name: string;
  invoice_number: string;
  invoice_date: string;
  cufe: string;
  subtotal: string;
  iva: string;
  total: string;
  currency: string;
}

function toForm(inv: Invoice): EditableForm {
  return {
    document_type: inv.document_type,
    vendor_nit: inv.vendor_nit ?? '',
    vendor_name: inv.vendor_name ?? '',
    invoice_number: inv.invoice_number ?? '',
    invoice_date: inv.invoice_date ?? '',
    cufe: inv.cufe ?? '',
    subtotal: inv.subtotal ?? '',
    iva: inv.iva ?? '',
    total: inv.total ?? '',
    currency: inv.currency ?? 'COP',
  };
}

function buildDiff(original: EditableForm, edited: EditableForm): Record<string, string> {
  const diff: Record<string, string> = {};
  (Object.keys(original) as (keyof EditableForm)[]).forEach((key) => {
    if (original[key] !== edited[key]) {
      diff[key] = edited[key];
    }
  });
  return diff;
}

export default function FacturaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [boxes, setBoxes] = useState<EligibleBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<EditableForm | null>(null);
  const [boxId, setBoxId] = useState<string>('');
  const [comments, setComments] = useState<string>('');
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [inv, eligible] = await Promise.all([
        invoicesApi.get(id),
        invoicesApi.eligibleBoxes(id),
      ]);
      setInvoice(inv);
      setForm(toForm(inv));
      setBoxes(eligible);
      // If box is pre-assigned (from WhatsApp), lock it
      if (inv.box_id) {
        setBoxId(inv.box_id);
      } else {
        const onlySufficient = eligible.filter((b) => b.sufficient);
        if (onlySufficient.length === 1) setBoxId(onlySufficient[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const original = useMemo(() => (invoice ? toForm(invoice) : null), [invoice]);
  const hasEdits = useMemo(
    () => (original && form ? Object.keys(buildDiff(original, form)).length > 0 : false),
    [original, form],
  );

  /**
   * Saldo que quedaría en `box` si se aprueba con el total que hay ahora en el
   * formulario. Replica el cálculo de approvals.service: en el flujo de WhatsApp la
   * caja ya venía descontada al subir, así que solo pesa la diferencia editada.
   * Se calcula aquí y no se usa el `resulting_balance` del backend porque ese sale
   * del total guardado, y el aprobador puede haberlo editado.
   */
  const project = useCallback(
    (box: EligibleBox): { balance: number; delta: number } | null => {
      if (!invoice || !form) return null;
      const finalTotal = parseFloat(form.total);
      if (!Number.isFinite(finalTotal)) return null;
      const current = parseFloat(box.current_balance);
      const delta = invoice.box_id ? parseFloat(invoice.total) - finalTotal : -finalTotal;
      return { balance: current + delta, delta };
    },
    [invoice, form],
  );

  const selectedBox = boxes.find((b) => b.id === (invoice?.box_id ?? boxId));
  const projection = selectedBox ? project(selectedBox) : null;
  // Igual que el backend: solo exige justificación si la aprobación empuja el saldo
  // hacia abajo. Bajar el total de una caja ya negativa la mejora, no la sobregira.
  const willOverdraw = projection !== null && projection.balance < 0 && projection.delta < 0;
  const needsJustification = willOverdraw && !comments.trim();

  const update = <K extends keyof EditableForm>(key: K, value: EditableForm[K]) =>
    setForm((curr) => (curr ? { ...curr, [key]: value } : curr));

  const decide = async (action: 'approve' | 'reject') => {
    if (!invoice || !form || !original) return;
    setSubmitting(action);
    setActionError(null);
    try {
      const diff = buildDiff(original, form);
      const updated = await approvalsApi.decide({
        invoice_id: invoice.id,
        action,
        box_id: action === 'approve' ? boxId : undefined,
        comments: comments.trim() || undefined,
        edited_fields: Object.keys(diff).length > 0 ? diff : undefined,
      });
      setInvoice(updated);
      setForm(toForm(updated));
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Error',
      );
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !invoice || !form) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800">
          {error ?? 'Factura no encontrada'}
        </div>
        <Link to="/facturas" className="mt-4 inline-flex items-center gap-1 text-sm text-slate-600">
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </div>
    );
  }

  const readOnly = invoice.status !== 'pending' && invoice.status !== 'observed';
  const confidence = invoice.confidence_score ?? null;
  // Se lee del formulario, no de la factura guardada, para que las etiquetas
  // cambien en el momento en que el aprobador corrige una clasificación errada.
  const isCuentaCobro = form.document_type === 'cuenta_cobro';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" /> Volver
        </button>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>
            Recibida el{' '}
            {new Date(invoice.submitted_at).toLocaleString('es-CO', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
          <span>·</span>
          <span>De {invoice.worker?.name ?? '—'}</span>
          <span>·</span>
          <span
            className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded font-medium ring-1 ring-inset',
              STATUS_TONE[invoice.status],
            )}
          >
            {STATUS_LABEL[invoice.status]}
          </span>
          {invoice.accrued_at && (
            <>
              <span>·</span>
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-200"
                title={`Causada en contabilidad el ${new Date(invoice.accrued_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}${invoice.accrued_by_name ? ` por ${invoice.accrued_by_name}` : ''}`}
              >
                <SquareCheck className="size-3" />
                Causada
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <AuthFilePreview
            path={`/invoices/${invoice.id}/image`}
            alt={invoice.vendor_name ?? 'Factura'}
          />
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Datos extraídos</h3>
                {/* La IA clasifica, pero puede errar: el aprobador corrige contra la imagen. */}
                {readOnly ? (
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium',
                      isCuentaCobro
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {DOCUMENT_TYPE_LABEL[form.document_type]}
                  </span>
                ) : (
                  <select
                    value={form.document_type}
                    onChange={(e) => update('document_type', e.target.value as DocumentType)}
                    title="Tipo de documento — corrígelo si la IA lo clasificó mal"
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-slate-900',
                      isCuentaCobro
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                        : 'border-slate-300 bg-white text-slate-700',
                    )}
                  >
                    <option value="factura">{DOCUMENT_TYPE_LABEL.factura}</option>
                    <option value="cuenta_cobro">{DOCUMENT_TYPE_LABEL.cuenta_cobro}</option>
                  </select>
                )}
              </div>
              {confidence !== null && (
                <ConfidenceBadge score={confidence} />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={isCuentaCobro ? 'Quien cobra' : 'Proveedor'}
                value={form.vendor_name}
                onChange={(v) => update('vendor_name', v)}
                readOnly={readOnly}
              />
              <Field
                label={isCuentaCobro ? 'Cédula' : 'NIT'}
                value={form.vendor_nit}
                onChange={(v) => update('vendor_nit', v)}
                readOnly={readOnly}
              />
              <Field label="Número" value={form.invoice_number} onChange={(v) => update('invoice_number', v)} readOnly={readOnly} />
              <Field label="Fecha" type="date" value={form.invoice_date} onChange={(v) => update('invoice_date', v)} readOnly={readOnly} />
            </div>

            {/* Una cuenta de cobro no lleva CUFE, así que el bloque se oculta. Pero si
                aun así trae uno, se muestra: es la prueba de que la clasificación falló. */}
            {(!isCuentaCobro || form.cufe.trim() !== '') && (
              <>
                {isCuentaCobro && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Este documento está clasificado como cuenta de cobro pero trae un CUFE.
                    Las cuentas de cobro no son documentos electrónicos: probablemente sea una
                    factura y convenga corregir el tipo arriba.
                  </div>
                )}
                <CufeField value={form.cufe} onChange={(v) => update('cufe', v)} readOnly={readOnly} />
              </>
            )}

            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Subtotal</span>
                <input
                  type="text"
                  value={formatCOP(form.subtotal)}
                  readOnly={readOnly}
                  onChange={(e) => update('subtotal', parseCOP(e.target.value))}
                  className={cn(
                    'mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900',
                    readOnly && 'bg-slate-50 text-slate-700',
                  )}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">IVA</span>
                <input
                  type="text"
                  value={formatCOP(form.iva)}
                  readOnly={readOnly}
                  onChange={(e) => update('iva', parseCOP(e.target.value))}
                  className={cn(
                    'mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900',
                    readOnly && 'bg-slate-50 text-slate-700',
                  )}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Total</span>
                <input
                  type="text"
                  value={formatCOP(form.total)}
                  readOnly={readOnly}
                  onChange={(e) => update('total', parseCOP(e.target.value))}
                  className={cn(
                    'mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900',
                    readOnly && 'bg-slate-50 text-slate-700',
                  )}
                />
              </label>
            </div>
            <ItemsTable extractedData={invoice.extracted_data} />

            {/* Categoría de gasto */}
            {invoice.expense_category && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-medium text-slate-600">Categoría:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200">
                  {invoice.expense_category === 'alimentacion' ? 'Alimentación' : invoice.expense_category.charAt(0).toUpperCase() + invoice.expense_category.slice(1)}
                </span>
              </div>
            )}

            {/* Anexos de identificación (solo cuentas de cobro) */}
            <InvoiceAnnexes documentType={invoice.document_type} annexes={invoice.annexes} />

            {/* Alertas de observación */}
            {(invoice.requires_special_approval || invoice.reported_late) && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                {invoice.reported_late && (
                  <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2.5 py-1.5">
                    ⏰ Reporte tardío — la factura fue reportada más de 24h después de la compra
                  </div>
                )}
                {invoice.requires_special_approval && invoice.status === 'observed' && (
                  <div className="flex items-center gap-2 text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded px-2.5 py-1.5">
                    🔒 Requiere aprobación de admin
                    {(() => {
                      const reasons: string[] = [];
                      if (!invoice.vendor_nit) reasons.push('sin NIT');
                      if (invoice.confidence_score !== null && invoice.confidence_score < 0.6) reasons.push('soporte débil');
                      if (invoice.expense_category === 'alimentacion') reasons.push('categoría restringida');
                      if (invoice.reported_late) reasons.push('reporte tardío');
                      return reasons.length > 0 ? ` (${reasons.join(', ')})` : '';
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {(invoice.status === 'pending' || invoice.status === 'observed') ? (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Decisión</h3>
              <div>
                <label className="text-xs font-medium text-slate-600">Caja asignada</label>
                {invoice.box_id ? (
                  <>
                    <div className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {(() => {
                        const assigned = boxes.find((b) => b.id === invoice.box_id);
                        return assigned
                          ? `${assigned.code} · ${assigned.name} · ${formatMoney(parseFloat(assigned.current_balance))}`
                          : invoice.box
                            ? `${invoice.box.code} · ${invoice.box.name}`
                            : invoice.box_id;
                      })()}
                    </div>
                  </>
                ) : (
                  <>
                    <select
                      value={boxId}
                      onChange={(e) => setBoxId(e.target.value)}
                      disabled={!!submitting}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="">Selecciona una caja…</option>
                      {boxes.map((b) => {
                        const p = project(b);
                        const overdraws = p !== null && p.balance < 0;
                        return (
                          <option key={b.id} value={b.id}>
                            {b.code} · {b.name} · {formatMoney(parseFloat(b.current_balance))}
                            {overdraws
                              ? ` (quedan ${formatMoney(Math.abs(p.balance))} a favor del residente)`
                              : ''}
                          </option>
                        );
                      })}
                    </select>
                    {boxes.length === 0 && (
                      <p className="mt-1 text-xs text-rose-700">
                        Este residente no está asignado a ninguna caja abierta.
                      </p>
                    )}
                  </>
                )}
              </div>
              {willOverdraw && projection && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-medium">
                      Esta factura excede el saldo de la caja.
                    </p>
                    <p className="mt-0.5 opacity-90">
                      Al aprobar, la caja quedará con {formatMoney(Math.abs(projection.balance))} a
                      favor del residente. Escribe una justificación para continuar.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-600">
                  {willOverdraw ? 'Justificación del saldo a favor (obligatoria)' : 'Comentarios (opcional)'}
                </label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={2}
                  disabled={!!submitting}
                  className={cn(
                    'mt-1 w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900',
                    needsJustification ? 'border-amber-400 bg-amber-50/40' : 'border-slate-300',
                  )}
                  placeholder={
                    willOverdraw
                      ? 'Explica por qué se autoriza el gasto por encima del saldo…'
                      : 'Motivo de rechazo, anotaciones, etc.'
                  }
                />
              </div>

              {hasEdits && (
                <p className="text-xs text-slate-500 italic">
                  Hiciste cambios. Se guardarán al aprobar/rechazar como `edited_fields`.
                </p>
              )}

              {actionError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                  {actionError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => decide('reject')}
                  disabled={!!submitting}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-rose-700 bg-white border border-rose-300 hover:bg-rose-50 rounded-md disabled:opacity-50"
                >
                  {submitting === 'reject' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <X className="size-4" />
                  )}
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={() => decide('approve')}
                  disabled={!!submitting || !boxId || needsJustification}
                  title={needsJustification ? 'Escribe la justificación del saldo a favor' : undefined}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md disabled:opacity-50"
                >
                  {submitting === 'approve' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Aprobar
                </button>
              </div>
            </div>
          ) : (
            <ApprovalHistory invoice={invoice} />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900',
          readOnly && 'bg-slate-50 text-slate-700',
        )}
      />
    </label>
  );
}

/**
 * CUFE/CUDE de factura electrónica. Se muestra siempre —también vacío— porque
 * "esta factura no es electrónica" es información relevante para el aprobador,
 * no una ausencia de dato. Cuando el código tiene el formato válido (96 hex) se
 * ofrece el enlace al portal de la DIAN para verificarlo.
 */
function CufeField({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  const trimmed = value.trim();
  const valid = isValidCufeFormat(trimmed);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">CUFE / CUDE (factura electrónica)</span>
        {trimmed && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ring-1 ring-inset',
              valid
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-amber-50 text-amber-800 ring-amber-200',
            )}
          >
            {valid ? 'Formato válido' : `Formato dudoso — ${trimmed.length}/96`}
          </span>
        )}
      </div>

      <input
        type="text"
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        placeholder="Sin CUFE — el soporte no es una factura electrónica"
        onChange={(e) => onChange(e.target.value.trim().toLowerCase())}
        className={cn(
          'w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-[11px] leading-relaxed tracking-tight text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900',
          readOnly && 'bg-slate-50 text-slate-700',
        )}
      />

      {trimmed ? (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <a
            href={dianValidationUrl(trimmed)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2"
          >
            Validar en la DIAN <ExternalLink className="size-3" />
          </a>
          {!valid && (
            <span className="text-amber-700">
              Verifica el código contra la imagen antes de validar
            </span>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">
          Las tirillas POS y los recibos manuales no traen CUFE. Si la factura sí lo tiene, cópialo
          desde la imagen para poder validarla ante la DIAN.
        </p>
      )}
    </div>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone =
    score >= 0.8
      ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
      : score >= 0.6
        ? 'bg-amber-100 text-amber-800 ring-amber-200'
        : 'bg-rose-100 text-rose-800 ring-rose-200';
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset',
        tone,
      )}
    >
      Confianza {pct}%
    </span>
  );
}

function ApprovalHistory({ invoice }: { invoice: Invoice }) {
  const list = invoice.approvals ?? [];
  if (list.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Decisión</h3>
      {invoice.box && (
        <p className="text-sm text-slate-700">
          Descontada de{' '}
          <Link to={`/cajas/${invoice.box.id}`} className="font-medium underline">
            {invoice.box.code}
          </Link>{' '}
          ({invoice.box.name}).
        </p>
      )}
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a.id} className="border border-slate-100 rounded p-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">
                {a.action === 'approve' ? 'Aprobada' : 'Rechazada'} por {a.approver.name}
              </span>
              <span className="text-slate-500">
                {new Date(a.created_at).toLocaleString('es-CO')}
              </span>
            </div>
            {a.comments && <p className="mt-1 text-slate-600">{a.comments}</p>}
            {a.edited_fields && Object.keys(a.edited_fields).length > 0 && (
              <pre className="mt-1 text-[10px] text-slate-500 bg-slate-50 rounded p-1.5 overflow-x-auto">
                {JSON.stringify(a.edited_fields, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ExtractedItem {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
}

function ItemsTable({ extractedData }: { extractedData: Record<string, unknown> | null }) {
  if (!extractedData) return null;
  const items = extractedData.items as ExtractedItem[] | undefined;
  if (!items || items.length === 0) return null;

  return (
    <div>
      <span className="text-xs font-medium text-slate-600">Productos / Servicios</span>
      <div className="mt-1 border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Descripción</th>
              <th className="text-right px-3 py-1.5 font-medium w-14">Cant.</th>
              <th className="text-right px-3 py-1.5 font-medium w-24">Precio</th>
              <th className="text-right px-3 py-1.5 font-medium w-24">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item, idx) => (
              <tr key={idx} className="text-slate-700">
                <td className="px-3 py-1.5">{item.description}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {item.quantity ?? '—'}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {item.unit_price != null ? formatMoney(item.unit_price) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  {item.total != null ? formatMoney(item.total) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
