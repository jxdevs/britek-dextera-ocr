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

export async function fetchBlobWithAuth(path: string): Promise<Blob> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

// ============ Petty cash ============

export type BoxType = 'individual' | 'shared';
export type BoxStatus = 'open' | 'closed';

export interface BoxWorker {
  id: string;
  name: string;
  document_number: string;
  phone: string;
  BoxAssignment: { is_primary: boolean };
}

export interface PettyCashBox {
  id: string;
  code: string;
  name: string;
  type: BoxType;
  status: BoxStatus;
  initial_amount: string;
  current_balance: string;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  workers: BoxWorker[];
}

export interface CreateBoxInput {
  code: string;
  name: string;
  type: BoxType;
  initial_amount: number;
  worker_ids: string[];
  primary_worker_id?: string;
}

export interface Movement {
  id: string;
  invoice_id: string;
  approver_id: string;
  action: 'approve' | 'reject';
  comments: string | null;
  created_at: string;
  invoice: {
    id: string;
    vendor_name: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total: string;
  };
  approver: { id: string; name: string };
}

export const pettyCash = {
  list: () => request<PettyCashBox[]>('/petty-cash'),
  get: (id: string) => request<PettyCashBox>(`/petty-cash/${id}`),
  create: (input: CreateBoxInput) =>
    request<PettyCashBox>('/petty-cash', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  close: (id: string) =>
    request<PettyCashBox>(`/petty-cash/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  assign: (id: string, worker_ids: string[], primary_worker_id?: string) =>
    request<PettyCashBox>(`/petty-cash/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ worker_ids, primary_worker_id }),
    }),
  movements: (id: string) => request<Movement[]>(`/petty-cash/${id}/movements`),
};

// ============ Invoices ============

export type InvoiceStatus = 'pending' | 'approved' | 'rejected';

export interface InvoiceWorker {
  id: string;
  name: string;
  document_number: string;
  phone: string;
}

export interface InvoiceBox {
  id: string;
  code: string;
  name: string;
  type: BoxType;
  status: BoxStatus;
}

export interface InvoiceApproval {
  id: string;
  action: 'approve' | 'reject';
  comments: string | null;
  edited_fields: Record<string, unknown> | null;
  created_at: string;
  approver: { id: string; name: string };
}

export interface Invoice {
  id: string;
  worker_id: string;
  box_id: string | null;
  image_url: string;
  status: InvoiceStatus;
  vendor_nit: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: string | null;
  iva: string | null;
  total: string;
  currency: string | null;
  extracted_data: Record<string, unknown> | null;
  confidence_score: number | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  worker?: InvoiceWorker;
  box?: InvoiceBox | null;
  approvals?: InvoiceApproval[];
}

export interface EligibleBox {
  id: string;
  code: string;
  name: string;
  type: BoxType;
  current_balance: string;
  sufficient: boolean;
}

export const invoices = {
  list: (params?: { status?: InvoiceStatus; worker_id?: string; box_id?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.worker_id) qs.set('worker_id', params.worker_id);
    if (params?.box_id) qs.set('box_id', params.box_id);
    const q = qs.toString();
    return request<Invoice[]>(`/invoices${q ? `?${q}` : ''}`);
  },
  get: (id: string) => request<Invoice>(`/invoices/${id}`),
  eligibleBoxes: (id: string) => request<EligibleBox[]>(`/invoices/${id}/boxes`),
  create: async (file: File, worker_id: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('worker_id', worker_id);
    return request<Invoice>('/invoices', { method: 'POST', body: form });
  },
};

// ============ Approvals ============

export interface DecideInput {
  invoice_id: string;
  action: 'approve' | 'reject';
  box_id?: string;
  comments?: string;
  edited_fields?: Record<string, unknown>;
}

export const approvals = {
  decide: (input: DecideInput) =>
    request<Invoice>('/approvals', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
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
