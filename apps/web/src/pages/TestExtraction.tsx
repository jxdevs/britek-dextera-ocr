import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { extractInvoice, type ExtractionResponse } from '../lib/api';
import { ExtractedFields } from '../components/ExtractedFields';
import { ImagePreview } from '../components/ImagePreview';
import { MetricsPanel } from '../components/MetricsPanel';
import { RawJson } from '../components/RawJson';

const MODELS = [
  { value: 'gemini-2.5-flash', label: 'Flash · rápido y barato' },
  { value: 'gemini-2.5-pro', label: 'Pro · más preciso, más caro' },
];

export default function TestExtraction() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [model, setModel] = useState(MODELS[0].value);
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const runExtraction = useCallback(
    async (target: File, withModel: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await extractInvoice(target, withModel);
        setResult(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleFile = useCallback(
    (next: File) => {
      setFile(next);
      setResult(null);
      setError(null);
      runExtraction(next, model);
    },
    [model, runExtraction],
  );

  const handleReextract = useCallback(() => {
    if (file) runExtraction(file, model);
  }, [file, model, runExtraction]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Test de extracción de facturas</h2>
          <p className="text-sm text-slate-600">
            Sube una imagen de factura para validar qué tan bien Gemini extrae los campos antes de conectar
            WhatsApp y la persistencia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Modelo</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleReextract}
            disabled={!file || loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : result ? (
              <RefreshCw className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {result ? 'Reextraer' : 'Extraer'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800">
          <p className="font-medium">No se pudo extraer</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <ImagePreview file={file} previewUrl={previewUrl} onFile={handleFile} />
        <div className="space-y-6">
          {loading && !result && (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
              <Loader2 className="mx-auto size-8 animate-spin text-slate-400 mb-3" />
              <p className="text-sm text-slate-600">Extrayendo con {model}…</p>
              <p className="text-xs text-slate-500 mt-1">Esto puede tardar 3–10 segundos.</p>
            </div>
          )}
          {result && (
            <>
              <ExtractedFields data={result.extracted} />
              <MetricsPanel result={result} />
              <RawJson raw={result.raw_response} />
            </>
          )}
          {!result && !loading && !file && (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-sm text-slate-500">
              Sube una factura para ver los datos extraídos aquí.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
