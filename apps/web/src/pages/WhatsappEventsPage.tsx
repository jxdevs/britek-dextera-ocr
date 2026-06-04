import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { whatsapp, type WhatsappEvent } from '../lib/api';
import { cn } from '../lib/utils';

export default function WhatsappEventsPage() {
  const [events, setEvents] = useState<WhatsappEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await whatsapp.events(100));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Eventos WhatsApp</h2>
          <p className="text-sm text-slate-600">
            Mensajes entrantes desde Kapso. Útil para debug. Mostrar los últimos 100.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 hover:bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Recargar
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 space-y-2">
        <p className="font-semibold">Cómo probar sin Kapso</p>
        <p>
          Envía un POST a <code className="bg-white px-1 rounded">/api/webhooks/kapso</code> con un
          JSON como:
        </p>
        <pre className="bg-white border border-blue-200 rounded p-2 text-xs overflow-x-auto">
{`{
  "message_id": "test-` + Math.random().toString(36).slice(2, 8) + `",
  "from": "+573000000003",
  "type": "text",
  "text": "saldo"
}`}
        </pre>
        <p className="text-xs text-blue-700">
          El outbound a Kapso aparece como <code>[STUB outbound]</code> en los logs del backend
          hasta que configures KAPSO_API_KEY y KAPSO_API_URL.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="size-5 animate-spin text-slate-400" />
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Sin eventos todavía.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-32">Recibido</th>
                <th className="text-left px-4 py-2 font-medium">Residente</th>
                <th className="text-left px-4 py-2 font-medium">Tipo</th>
                <th className="text-left px-4 py-2 font-medium">Mensaje</th>
                <th className="text-left px-4 py-2 font-medium w-24">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.map((e) => {
                const isOpen = expanded === e.id;
                const type = (e.raw_payload?.type as string) ?? '?';
                const text = e.raw_payload?.text as string | undefined;
                const fromPhone = e.raw_payload?.from as string | undefined;
                return (
                  <Fragment key={e.id}>
                    <tr
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                    >
                      <td className="px-4 py-2 text-xs text-slate-600 tabular-nums">
                        {new Date(e.created_at).toLocaleString('es-CO', {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </td>
                      <td className="px-4 py-2">
                        {e.worker ? (
                          <div>
                            <p className="text-sm font-medium text-slate-900">{e.worker.name}</p>
                            <p className="text-xs text-slate-500 tabular-nums">
                              {e.worker.phone}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-rose-700">
                            No registrado · {fromPhone ?? '?'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ring-1 ring-inset',
                            type === 'image'
                              ? 'bg-violet-50 text-violet-700 ring-violet-200'
                              : 'bg-slate-100 text-slate-700 ring-slate-200',
                          )}
                        >
                          {type}
                        </span>
                      </td>
                      <td className="px-4 py-2 max-w-md truncate text-slate-700">
                        {text ?? <span className="text-slate-400 italic">(imagen)</span>}
                      </td>
                      <td className="px-4 py-2">
                        {e.error ? (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-700">
                            <XCircle className="size-3.5" />
                            Error
                          </span>
                        ) : e.processed ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                            <CheckCircle2 className="size-3.5" />
                            Procesado
                          </span>
                        ) : (
                          <span className="text-xs text-amber-700">Pendiente</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50 px-4 py-3">
                          <div className="text-xs space-y-2">
                            <div>
                              <span className="font-medium text-slate-700">message_id:</span>{' '}
                              <code>{e.kapso_message_id}</code>
                            </div>
                            {e.error && (
                              <div className="text-rose-700">
                                <span className="font-medium">Error:</span> {e.error}
                              </div>
                            )}
                            <details>
                              <summary className="cursor-pointer text-slate-700 font-medium">
                                Payload crudo
                              </summary>
                              <pre className="mt-2 text-[10px] bg-white border border-slate-200 rounded p-2 overflow-x-auto max-h-64">
                                {JSON.stringify(e.raw_payload, null, 2)}
                              </pre>
                            </details>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
