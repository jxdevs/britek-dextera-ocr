import { useEffect, useState } from 'react';
import type { ExtractedInvoice, InvoiceItem } from '../lib/api';
import { cn, dianValidationUrl, formatMoney, isValidCufeFormat } from '../lib/utils';

/** Format a number as Colombian integer (no decimals, dot as thousands separator) */
function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return Math.round(value).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

/** Parse a formatted string (with dots as thousands) back to number */
function parseFormattedInt(str: string): number | null {
  const cleaned = str.replace(/\./g, '').replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

interface Props {
  data: ExtractedInvoice;
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
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset', tone)}>
      Confianza {pct}%
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  type?: 'text' | 'number' | 'date';
}) {
  const display =
    value === null || value === undefined
      ? ''
      : type === 'number'
        ? String(value)
        : String(value);

  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={display}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
      />
    </label>
  );
}

export function ExtractedFields({ data }: Props) {
  const [form, setForm] = useState<ExtractedInvoice>(data);

  useEffect(() => {
    setForm(data);
  }, [data]);

  const update = <K extends keyof ExtractedInvoice>(key: K, value: ExtractedInvoice[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateItem = (idx: number, patch: Partial<InvoiceItem>) =>
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Datos extraídos</h2>
          <p className="text-xs text-slate-500">Editables. Solo simulación — aún no se guardan.</p>
        </div>
        <ConfidenceBadge score={form.confidence_score} />
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Proveedor" value={form.vendor_name} onChange={(v) => update('vendor_name', v)} />
          <Field
            label="NIT"
            value={form.vendor_nit}
            onChange={(v) => update('vendor_nit', v || null)}
          />
          <Field
            label="Número de factura"
            value={form.invoice_number}
            onChange={(v) => update('invoice_number', v || null)}
          />
          <Field
            label="Fecha"
            value={form.invoice_date}
            onChange={(v) => update('invoice_date', v || null)}
            type="date"
          />
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600">CUFE / CUDE</span>
            {form.cufe && (
              <span
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ring-1 ring-inset',
                  isValidCufeFormat(form.cufe)
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-amber-50 text-amber-800 ring-amber-200',
                )}
              >
                {isValidCufeFormat(form.cufe)
                  ? 'Formato válido'
                  : `Formato dudoso — ${form.cufe.trim().length}/96`}
              </span>
            )}
          </div>
          <input
            type="text"
            value={form.cufe ?? ''}
            spellCheck={false}
            placeholder="Sin CUFE — no es una factura electrónica"
            onChange={(e) => update('cufe', e.target.value.trim().toLowerCase() || null)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-[11px] leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
          />
          {form.cufe && (
            <a
              href={dianValidationUrl(form.cufe)}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-[11px] font-medium text-slate-700 hover:text-slate-900 underline underline-offset-2"
            >
              Validar en la DIAN ↗
            </a>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Subtotal</span>
            <input
              type="text"
              value={form.subtotal != null ? formatInt(form.subtotal) : ''}
              onChange={(v) => update('subtotal', parseFormattedInt(v.target.value))}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">IVA</span>
            <input
              type="text"
              value={form.iva != null ? formatInt(form.iva) : ''}
              onChange={(v) => update('iva', parseFormattedInt(v.target.value))}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Total</span>
            <input
              type="text"
              value={formatInt(form.total)}
              onChange={(v) => update('total', parseFormattedInt(v.target.value) ?? 0)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
          <div>
            <span className="font-medium">Moneda: </span>
            {form.currency ?? 'COP'}
          </div>
          <div className="text-right">
            <span className="font-medium">Total formateado: </span>
            {formatMoney(form.total, form.currency ?? 'COP')}
          </div>
        </div>

        {form.notes && (
          <div className="text-xs text-slate-700 bg-amber-50 border border-amber-200 rounded p-3">
            <span className="font-medium">Notas del modelo: </span>
            {form.notes}
          </div>
        )}

        {form.items.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-600 mb-2">Ítems ({form.items.length})</h3>
            <div className="border border-slate-200 rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Descripción</th>
                    <th className="text-right px-2 py-1.5 font-medium w-16">Cant.</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Precio</th>
                    <th className="text-right px-2 py-1.5 font-medium w-24">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {form.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1">
                        <input
                          value={item.description ?? ''}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          className="w-full bg-transparent focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          value={item.quantity ?? ''}
                          onChange={(e) =>
                            updateItem(idx, {
                              quantity: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          className="w-full bg-transparent text-right focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="text"
                          value={item.unit_price != null ? formatInt(item.unit_price) : '—'}
                          onChange={(e) =>
                            updateItem(idx, {
                              unit_price: parseFormattedInt(e.target.value),
                            })
                          }
                          className="w-full bg-transparent text-right focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input
                          type="text"
                          value={item.total != null ? formatInt(item.total) : '—'}
                          onChange={(e) =>
                            updateItem(idx, {
                              total: parseFormattedInt(e.target.value),
                            })
                          }
                          className="w-full bg-transparent text-right focus:outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
