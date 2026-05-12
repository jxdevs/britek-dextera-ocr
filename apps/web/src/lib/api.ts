const TOKEN_KEY = 'ocrdemo.token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent('ocrdemo:logout'));
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ============ Auth ============

export type WorkerRole = 'worker' | 'approver' | 'admin';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  role: WorkerRole;
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}

export const auth = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthUser>('/auth/me'),
};

// ============ Workers ============

export interface Worker {
  id: string;
  document_number: string;
  name: string;
  phone: string;
  email: string | null;
  role: WorkerRole;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkerInput {
  document_number: string;
  name: string;
  phone: string;
  email?: string | null;
  password?: string;
  role?: WorkerRole;
}

export type UpdateWorkerInput = Partial<CreateWorkerInput>;

export const workers = {
  list: () => request<Worker[]>('/workers'),
  get: (id: string) => request<Worker>(`/workers/${id}`),
  create: (input: CreateWorkerInput) =>
    request<Worker>('/workers', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: UpdateWorkerInput) =>
    request<Worker>(`/workers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<{ id: string }>(`/workers/${id}`, { method: 'DELETE' }),
};

// ============ Extraction (legacy from Sprint 0.5) ============

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
  return request<ExtractionResponse>('/extraction/test', {
    method: 'POST',
    body: form,
  });
}
