export interface InvoiceItem {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
}

export interface ExtractedInvoice {
  vendor_nit?: string | null;
  vendor_name: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  subtotal?: number | null;
  iva?: number | null;
  total: number;
  currency?: string | null;
  items: InvoiceItem[];
  confidence_score: number;
  notes?: string | null;
}

export interface ExtractionResponse {
  extracted: ExtractedInvoice;
  raw_response: string;
  model: string;
  latency_ms: number;
  tokens: { input: number; output: number; total: number };
  cost_estimate_usd: number;
  file: { original_name: string; size_bytes: number; mime_type: string };
}

export async function extractInvoice(file: File, model: string): Promise<ExtractionResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('model', model);

  const res = await fetch('/api/extraction/test', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.message ?? JSON.stringify(body);
    } catch {
      // ignore
    }
    throw new Error(`Extraction failed (${res.status}): ${detail}`);
  }

  return res.json();
}
