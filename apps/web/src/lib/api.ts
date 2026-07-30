const TOKEN_KEY = 'ocrdemo.token';
const API_BASE_URL = "/cajamenor/api";

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

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/auth/login') && !path.startsWith('/auth/google')) {
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
  // ─── LOGIN CON EMAIL/PASSWORD (COMENTADO) ───────────────────────────
  // login: (email: string, password: string) =>
  //   request<LoginResponse>('/auth/login', {
  //     method: 'POST',
  //     body: JSON.stringify({ email, password }),
  //   }),

  // ─── LOGIN CON GOOGLE ───────────────────────────────────────────────
  googleLogin: (credential: string) =>
    request<LoginResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
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
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return res.blob();
}

/** Like fetchBlobWithAuth but also returns the content type */
export async function fetchBlobWithType(path: string): Promise<{ blob: Blob; contentType: string }> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers
  });
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  const blob = await res.blob();
  const contentType = res.headers.get('Content-Type') ?? blob.type ?? 'application/octet-stream';
  return { blob, contentType };
}

// ============ Petty cash ============

export type BoxType = 'individual' | 'shared';
export type BoxStatus = 'open' | 'closed' | 'blocked';

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
  project_name: string | null;
  cost_center: string | null;
  opened_at: string;
  closed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  workers: BoxWorker[];
}

export interface CreateBoxInput {
  code: string;
  name: string;
  type: BoxType;
  initial_amount: number;
  project_name: string;
  cost_center: string;
  worker_ids: string[];
  primary_worker_id?: string;
  exception_justification?: string;
}

export type ExpenseCategory =
  | 'combustible' | 'transporte' | 'peajes' | 'parqueaderos'
  | 'materiales' | 'consumibles' | 'alimentacion' | 'otro';

export interface Movement {
  id: string;
  vendor_name: string | null;
  vendor_nit: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  cufe: string | null;
  document_type: DocumentType;
  total: string;
  status: InvoiceStatus;
  submitted_at: string;
  expense_category: ExpenseCategory | null;
  requires_special_approval: boolean;
  reported_late: boolean;
  approvals: Array<{
    id: string;
    action: 'approve' | 'reject';
    comments: string | null;
    created_at: string;
    approver: { id: string; name: string };
  }>;
  /**
   * Soportes de identificación (RUT, cédula) que el residente anexó por
   * WhatsApp o que un admin adjuntó. Solo relevante en cuentas de cobro.
   */
  annexes: InvoiceAnnex[];
}

export interface UpdateBoxInput {
  code?: string;
  name?: string;
  initial_amount?: number;
  current_balance?: number;
  project_name?: string;
  cost_center?: string;
  exception_justification?: string;
}

export const pettyCash = {
  list: () => request<PettyCashBox[]>('/petty-cash'),
  get: (id: string) => request<PettyCashBox>(`/petty-cash/${id}`),
  create: (input: CreateBoxInput) =>
    request<PettyCashBox>('/petty-cash', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateBoxInput) =>
    request<PettyCashBox>(`/petty-cash/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  close: (id: string) =>
    request<PettyCashBox>(`/petty-cash/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  unblock: (id: string) =>
    request<PettyCashBox>(`/petty-cash/${id}/unblock`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  assign: (id: string, worker_ids: string[], primary_worker_id?: string) =>
    request<PettyCashBox>(`/petty-cash/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ worker_ids, primary_worker_id }),
    }),
  movements: (id: string) => request<Movement[]>(`/petty-cash/${id}/movements`),
  removeMovement: (boxId: string, invoiceId: string) =>
    request<{ id: string; deleted: boolean }>(`/petty-cash/${boxId}/movements/${invoiceId}`, {
      method: 'DELETE',
    }),
  remove: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/petty-cash/${id}`, {
      method: 'DELETE',
    }),
  // Worker read-only endpoints
  listMine: () => request<PettyCashBox[]>('/petty-cash/mine'),
  getMine: (id: string) => request<PettyCashBox>(`/petty-cash/mine/${id}`),
  movementsMine: (id: string) => request<Movement[]>(`/petty-cash/mine/${id}/movements`),
};

// ============ Invoices ============

export type InvoiceStatus = 'pending' | 'observed' | 'approved' | 'rejected';

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
  /** factura | cuenta_cobro. Los soportes que no son gasto viven en BoxDocument. */
  document_type: DocumentType;
  status: InvoiceStatus;
  vendor_nit: string | null;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  /** CUFE/CUDE de factura electrónica DIAN. null si el soporte no es electrónico. */
  cufe: string | null;
  subtotal: string | null;
  iva: string | null;
  total: string;
  currency: string | null;
  extracted_data: Record<string, unknown> | null;
  confidence_score: number | null;
  expense_category: ExpenseCategory | null;
  requires_special_approval: boolean;
  reported_late: boolean;
  submitted_at: string;
  /** Fecha de envío a la papelera. null = activa. La fila nunca se borra. */
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  worker?: InvoiceWorker;
  box?: InvoiceBox | null;
  approvals?: InvoiceApproval[];
  /** Soportes de identificación anexados (RUT, cédula). Solo aplica a cuentas de cobro. */
  annexes?: InvoiceAnnex[];
}

/** Soporte colgado de un gasto, en la forma reducida que devuelven los listados. */
export interface InvoiceAnnex {
  id: string;
  doc_type: BoxDocumentType;
  original_name: string | null;
  created_at: string;
}

/** Factura en la papelera, con la ventana de restauración ya calculada. */
export interface TrashedInvoice extends Invoice {
  /** Fecha a partir de la cual deja de listarse en la papelera. */
  restorable_until: string;
  /** Días que faltan para eso. 0 = último día. */
  days_left: number;
}

/**
 * Resultado de subir un archivo a la cola de facturas: según lo que la IA vea,
 * termina como movimiento de caja o archivado como anexo.
 */
export type UploadResult =
  | { kind: 'invoice'; invoice: Invoice }
  | { kind: 'document'; document: BoxDocument };

/** Soporte de gasto. Ambos descuentan de la caja y se legalizan. */
export type DocumentType = 'factura' | 'cuenta_cobro';

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  factura: 'Factura',
  cuenta_cobro: 'Cuenta de cobro',
};

// ============ Anexos de caja (no son gasto) ============

export type BoxDocumentType =
  | 'rut'
  | 'cedula'
  | 'camara_comercio'
  | 'certificacion_bancaria'
  | 'otro';

export const BOX_DOCUMENT_TYPE_LABEL: Record<BoxDocumentType, string> = {
  rut: 'RUT',
  cedula: 'Cédula',
  camara_comercio: 'Cámara de comercio',
  certificacion_bancaria: 'Certificación bancaria',
  otro: 'Otro',
};

export interface BoxDocument {
  id: string;
  box_id: string | null;
  /** Gasto al que acompaña. null = soporte de la caja en general. */
  invoice_id: string | null;
  worker_id: string | null;
  doc_type: BoxDocumentType;
  description: string | null;
  file_url: string;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  /** manual = adjuntado desde la caja; auto = reclasificado por la IA al subirlo. */
  source: 'manual' | 'auto';
  created_at: string;
  worker?: { id: string; name: string } | null;
  box?: { id: string; code: string; name: string } | null;
  invoice?: {
    id: string;
    document_type: DocumentType;
    invoice_number: string | null;
    vendor_name: string | null;
    total: string;
  } | null;
}

/** Soportes con los que se identifica al prestador de una cuenta de cobro. */
export const IDENTITY_DOC_TYPES: BoxDocumentType[] = ['rut', 'cedula'];

export const boxDocuments = {
  listByBox: (boxId: string) => request<BoxDocument[]>(`/box-documents/box/${boxId}`),
  listByInvoice: (invoiceId: string) =>
    request<BoxDocument[]>(`/box-documents/invoice/${invoiceId}`),
  listUnassigned: () => request<BoxDocument[]>('/box-documents/unassigned'),
  create: (
    boxId: string,
    file: File,
    input: {
      doc_type?: BoxDocumentType;
      description?: string;
      worker_id?: string;
      invoice_id?: string;
    } = {},
  ) => {
    const form = new FormData();
    form.append('file', file);
    if (input.doc_type) form.append('doc_type', input.doc_type);
    if (input.description) form.append('description', input.description);
    if (input.worker_id) form.append('worker_id', input.worker_id);
    if (input.invoice_id) form.append('invoice_id', input.invoice_id);
    return request<BoxDocument>(`/box-documents/box/${boxId}`, { method: 'POST', body: form });
  },
  assign: (id: string, boxId: string) =>
    request<BoxDocument>(`/box-documents/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ box_id: boxId }),
    }),
  /** Cuelga el soporte de una cuenta de cobro concreta. */
  attach: (id: string, invoiceId: string) =>
    request<BoxDocument>(`/box-documents/${id}/attach`, {
      method: 'POST',
      body: JSON.stringify({ invoice_id: invoiceId }),
    }),
  remove: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/box-documents/${id}`, { method: 'DELETE' }),
};

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
  /**
   * Sube un documento a la cola. La IA decide qué es: si no es un gasto (RUT,
   * cédula, cámara de comercio) no se crea factura, se archiva como anexo de la
   * caja y la respuesta llega con kind = 'document'.
   */
  create: async (file: File, worker_id: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('worker_id', worker_id);
    return request<UploadResult>('/invoices', { method: 'POST', body: form });
  },
  /**
   * Envía una factura rechazada a la papelera. No la borra: deja de aparecer en
   * las vistas y queda restaurable durante {@link TRASH_RETENTION_DAYS} días.
   */
  moveToTrash: (id: string) =>
    request<{ id: string; trashed: boolean; deleted_at: string; restorable_until: string }>(
      `/invoices/${id}`,
      { method: 'DELETE' },
    ),
  trash: () => request<TrashedInvoice[]>('/invoices/trash'),
  restore: (id: string) => request<Invoice>(`/invoices/${id}/restore`, { method: 'POST' }),
};

/** Debe coincidir con TRASH_RETENTION_DAYS del backend. */
export const TRASH_RETENTION_DAYS = 30;

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

// ============ WhatsApp events ============

export interface WhatsappEvent {
  id: string;
  worker_id: string | null;
  kapso_message_id: string;
  raw_payload: Record<string, unknown>;
  processed: boolean;
  error: string | null;
  created_at: string;
  worker?: { id: string; name: string; phone: string } | null;
}

export const whatsapp = {
  events: (limit = 50) =>
    request<WhatsappEvent[]>(`/whatsapp-events?limit=${limit}`),
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
  cufe?: string | null;
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

// ============ Dashboard ============

export interface DashboardFilters {
  project_name?: string;
  cost_center?: string;
  worker_id?: string;
  from?: string;
  to?: string;
}

export interface DeliveredVsLegalized {
  total_delivered: number;
  total_legalized: number;
  legalized_pct: number;
  by_project: Array<{ project_name: string; delivered: number; legalized: number; pct: number }>;
  by_worker: Array<{ worker_id: string; worker_name: string; delivered: number; legalized: number; pct: number }>;
}

export interface SupportComposition {
  total_invoices: number;
  electronic_invoice: { count: number; pct: number; amount: number };
  weak_support: { count: number; pct: number; amount: number };
  no_support: { count: number; pct: number; amount: number };
}

export interface AmountAtRisk {
  total: number;
  by_reason: Array<{ reason: string; count: number; amount: number }>;
}

export interface AgingBuckets {
  '0-7': { count: number; amount: number };
  '8-15': { count: number; amount: number };
  '16-30': { count: number; amount: number };
  '30+': { count: number; amount: number };
}

export interface CapCompliance {
  boxes_over_cap: number;
  with_exception: number;
  without_exception: number;
}

export interface ExceptionDecisions {
  total: number;
  approved: number;
  rejected: number;
  by_approver: Array<{ approver_name: string; approved: number; rejected: number }>;
}

export interface AvailableBalanceItem {
  box_id: string;
  box_code: string;
  box_name: string;
  project_name: string | null;
  cost_center: string | null;
  worker_name: string;
  initial_amount: number;
  current_balance: number;
  consumed_pct: number;
  cap: number;
  threshold_alert: 'none' | 'yellow' | 'orange' | 'red';
}

export interface TimelyReporting {
  total: number;
  on_time: number;
  late: number;
  on_time_pct: number;
}

export interface BoxesByStatus {
  open: number;
  closed: number;
  blocked: number;
  total: number;
}

export interface DashboardKpis {
  boxes_by_status: BoxesByStatus;
  delivered_vs_legalized: DeliveredVsLegalized;
  support_composition: SupportComposition;
  amount_at_risk: AmountAtRisk;
  aging_buckets: AgingBuckets;
  cap_compliance: CapCompliance;
  exception_decisions: ExceptionDecisions;
  available_balances: AvailableBalanceItem[];
  timely_reporting: TimelyReporting;
}

export const dashboard = {
  kpis: (filters: DashboardFilters = {}) => {
    const qs = new URLSearchParams();
    if (filters.project_name) qs.set('project_name', filters.project_name);
    if (filters.cost_center) qs.set('cost_center', filters.cost_center);
    if (filters.worker_id) qs.set('worker_id', filters.worker_id);
    if (filters.from) qs.set('from', filters.from);
    if (filters.to) qs.set('to', filters.to);
    const q = qs.toString();
    return request<DashboardKpis>(`/dashboard/kpis${q ? `?${q}` : ''}`);
  },
};

// ============ Audit Logs ============

export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'close'
  | 'approve'
  | 'reject';

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  user_name: string;
  user_role: string;
  action: AuditAction;
  entity: string;
  entity_id: string | null;
  entity_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export interface AuditListResponse {
  rows: AuditLogEntry[];
  count: number;
}

export interface AuditListFilters {
  action?: string;
  entity?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export const auditLogs = {
  list: (filters: AuditListFilters = {}) => {
    const qs = new URLSearchParams();
    if (filters.action) qs.set('action', filters.action);
    if (filters.entity) qs.set('entity', filters.entity);
    if (filters.from) qs.set('from', filters.from);
    if (filters.to) qs.set('to', filters.to);
    if (filters.limit) qs.set('limit', String(filters.limit));
    if (filters.offset) qs.set('offset', String(filters.offset));
    const q = qs.toString();
    return request<AuditListResponse>(`/audit-logs${q ? `?${q}` : ''}`);
  },
};
