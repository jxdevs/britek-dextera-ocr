import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Filter,
  Loader2,
  Eye,
  FileWarning,
  RefreshCw,
  Shield,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  dashboard,
  invoices as invoicesApi,
  workers as workersApi,
  pettyCash,
  type DashboardKpis,
  type DashboardFilters,
  type Worker,
  type PettyCashBox,
} from '../lib/api';
import { cn } from '../lib/utils';

// ── Helpers ──────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtCurrencyFull(n: number): string {
  return `$${n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ── Color Palette ────────────────────────────────────────────────

const COLORS = {
  emerald: '#10b981',
  emeraldDark: '#059669',
  amber: '#f59e0b',
  amberDark: '#d97706',
  red: '#ef4444',
  redDark: '#dc2626',
  violet: '#8b5cf6',
  violetDark: '#7c3aed',
  sky: '#0ea5e9',
  skyDark: '#0284c7',
  slate: '#64748b',
  indigo: '#6366f1',
  rose: '#f43f5e',
  teal: '#14b8a6',
  orange: '#f97316',
};

const SUPPORT_COLORS = [COLORS.emerald, COLORS.amber, COLORS.red];
const AGING_COLORS = [COLORS.emerald, COLORS.amber, COLORS.orange, COLORS.red];

// ── Skeleton ─────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse bg-slate-200 rounded', className)} />
  );
}

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <Skeleton className="h-4 w-24 mb-3" />
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <Skeleton className="h-5 w-48 mb-4" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color: 'emerald' | 'amber' | 'red' | 'sky' | 'violet' | 'indigo';
  trend?: { value: number; label: string };
}

const colorMap = {
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-500/20' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-600', ring: 'ring-amber-500/20' },
  red: { bg: 'bg-red-50', icon: 'text-red-600', ring: 'ring-red-500/20' },
  sky: { bg: 'bg-sky-50', icon: 'text-sky-600', ring: 'ring-sky-500/20' },
  violet: { bg: 'bg-violet-50', icon: 'text-violet-600', ring: 'ring-violet-500/20' },
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', ring: 'ring-indigo-500/20' },
};

function KpiCard({ label, value, subtitle, icon: Icon, color, trend }: KpiCardProps) {
  const c = colorMap[color];
  return (
    <div className={cn(
      'bg-white rounded-xl border border-slate-200 p-5 transition-all duration-200',
      'hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5',
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900 truncate">{value}</p>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              'flex items-center gap-1 mt-1.5 text-xs font-medium',
              trend.value >= 0 ? 'text-emerald-600' : 'text-red-600',
            )}>
              {trend.value >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
              {trend.label}
            </div>
          )}
        </div>
        <div className={cn('p-2.5 rounded-lg ring-1', c.bg, c.ring)}>
          <Icon className={cn('size-5', c.icon)} />
        </div>
      </div>
    </div>
  );
}

// ── Section Card ────────────────────────────────────────────────

function SectionCard({ title, children, className }: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      'bg-white rounded-xl border border-slate-200 p-5 transition-shadow hover:shadow-sm',
      className,
    )}>
      <h3 className="text-sm font-semibold text-slate-700 mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ── Tooltip ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {fmtCurrencyFull(entry.value)}
        </p>
      ))}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-slate-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl">
      <p className="font-medium">{d.name}</p>
      <p>{d.value} facturas ({fmtPct(d.payload.pct)})</p>
      <p>{fmtCurrencyFull(d.payload.amount)}</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [workersList, setWorkersList] = useState<Worker[]>([]);
  const [boxesList, setBoxesList] = useState<PettyCashBox[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [observedCount, setObservedCount] = useState(0);

  // Derive unique project names and cost centers from boxes
  const projectNames = useMemo(() => {
    const names = new Set(boxesList.map((b) => b.project_name).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [boxesList]);

  const costCenters = useMemo(() => {
    const centers = new Set(boxesList.map((b) => b.cost_center).filter(Boolean) as string[]);
    return Array.from(centers).sort();
  }, [boxesList]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kpis = await dashboard.kpis(filters);
      setData(kpis);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar los KPIs');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Load workers, boxes, and invoice alert counts
  useEffect(() => {
    Promise.all([workersApi.list(), pettyCash.list()]).then(([w, b]) => {
      setWorkersList(w);
      setBoxesList(b);
    }).catch(() => {});

    // Fetch pending and observed invoice counts for alerts
    Promise.all([
      invoicesApi.list({ status: 'pending' }),
      invoicesApi.list({ status: 'observed' }),
    ]).then(([pending, observed]) => {
      setPendingCount(pending.length);
      setObservedCount(observed.length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Render ──

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="size-6 text-indigo-600" />
            Dashboard de Control
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Indicadores de caja menor en tiempo real</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              showFilters
                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200'
                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50',
            )}
          >
            <Filter className="size-3.5" />
            Filtros
            {Object.values(filters).filter(Boolean).length > 0 && (
              <span className="ml-1 size-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                {Object.values(filters).filter(Boolean).length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Proyecto</label>
              <select
                value={filters.project_name || ''}
                onChange={(e) => setFilters((f) => ({ ...f, project_name: e.target.value || undefined }))}
                className="w-full rounded-lg border border-slate-300 text-sm px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Todos</option>
                {projectNames.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Centro de costo</label>
              <select
                value={filters.cost_center || ''}
                onChange={(e) => setFilters((f) => ({ ...f, cost_center: e.target.value || undefined }))}
                className="w-full rounded-lg border border-slate-300 text-sm px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Todos</option>
                {costCenters.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Residente</label>
              <select
                value={filters.worker_id || ''}
                onChange={(e) => setFilters((f) => ({ ...f, worker_id: e.target.value || undefined }))}
                className="w-full rounded-lg border border-slate-300 text-sm px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Todos</option>
                {workersList.filter((w) => w.role === 'worker').map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
              <input
                type="date"
                value={filters.from || ''}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
                className="w-full rounded-lg border border-slate-300 text-sm px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
              <input
                type="date"
                value={filters.to || ''}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
                className="w-full rounded-lg border border-slate-300 text-sm px-3 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
          {Object.values(filters).some(Boolean) && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="mt-3 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Alertas de facturas pendientes / observadas */}
      {(pendingCount > 0 || observedCount > 0) && (
        <div className="space-y-3 mb-6">
          {pendingCount > 0 && (
            <div
              className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5 cursor-pointer hover:bg-amber-100 transition-colors"
              onClick={() => navigate('/facturas')}
            >
              <div className="p-2 rounded-lg bg-amber-100 ring-1 ring-amber-300">
                <Clock className="size-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">
                  {pendingCount} factura{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''} de legalizar
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Facturas enviadas por residentes esperando revisión y aprobación.
                </p>
              </div>
              <Eye className="size-4 text-amber-500" />
            </div>
          )}
          {observedCount > 0 && (
            <div
              className="flex items-center gap-3 rounded-xl border border-violet-300 bg-violet-50 px-5 py-3.5 cursor-pointer hover:bg-violet-100 transition-colors"
              onClick={() => navigate('/facturas')}
            >
              <div className="p-2 rounded-lg bg-violet-100 ring-1 ring-violet-300">
                <FileWarning className="size-5 text-violet-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-violet-800">
                  {observedCount} factura{observedCount !== 1 ? 's' : ''} observada{observedCount !== 1 ? 's' : ''} requieren revisión
                </p>
                <p className="text-xs text-violet-600 mt-0.5">
                  Facturas con alertas (sin NIT, baja confianza, alimentación o reporte tardío) que necesitan aprobación de un administrador.
                </p>
              </div>
              <Eye className="size-4 text-violet-500" />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="size-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchData} className="ml-auto text-sm text-red-600 font-medium hover:underline">
            Reintentar
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      {data && (
        <div className={cn('space-y-6', loading && 'opacity-60 pointer-events-none transition-opacity')}>
          {/* ── Row 1: KPI Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Monto Entregado"
              value={fmtCurrency(data.delivered_vs_legalized.total_delivered)}
              subtitle={`Legalizado: ${fmtPct(data.delivered_vs_legalized.legalized_pct)}`}
              icon={DollarSign}
              color="emerald"
            />
            <KpiCard
              label="Monto Legalizado"
              value={fmtCurrency(data.delivered_vs_legalized.total_legalized)}
              subtitle={`de ${fmtCurrency(data.delivered_vs_legalized.total_delivered)}`}
              icon={CheckCircle2}
              color="sky"
            />
            <KpiCard
              label="Monto en Riesgo"
              value={fmtCurrency(data.amount_at_risk.total)}
              subtitle={`${data.amount_at_risk.by_reason.length} tipo${data.amount_at_risk.by_reason.length !== 1 ? 's' : ''} de observación`}
              icon={AlertTriangle}
              color="amber"
            />
            <KpiCard
              label="Reporte Oportuno"
              value={fmtPct(data.timely_reporting.on_time_pct)}
              subtitle={`${data.timely_reporting.on_time} a tiempo, ${data.timely_reporting.late} tardíos`}
              icon={Clock}
              color="indigo"
            />
          </div>

          {/* ── Row 2: Delivered vs Legalized + Support Composition ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 2a: Entregado vs Legalizado por proyecto */}
            <SectionCard title="Entregado vs. Legalizado por Proyecto">
              {data.delivered_vs_legalized.by_project.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">Sin datos de proyectos</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={data.delivered_vs_legalized.by_project}
                    layout="vertical"
                    margin={{ left: 10, right: 10, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={fmtCurrency} />
                    <YAxis
                      type="category"
                      dataKey="project_name"
                      tick={{ fontSize: 11, fill: '#475569' }}
                      width={100}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="delivered" name="Entregado" fill={COLORS.sky} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="legalized" name="Legalizado" fill={COLORS.emerald} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            {/* 2b: Composición del soporte */}
            <SectionCard title="Composición del Soporte">
              {data.support_composition.total_invoices === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">Sin facturas registradas</p>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={240}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Factura electrónica', value: data.support_composition.electronic_invoice.count, pct: data.support_composition.electronic_invoice.pct, amount: data.support_composition.electronic_invoice.amount },
                          { name: 'Soporte débil', value: data.support_composition.weak_support.count, pct: data.support_composition.weak_support.pct, amount: data.support_composition.weak_support.amount },
                          { name: 'Sin soporte', value: data.support_composition.no_support.count, pct: data.support_composition.no_support.pct, amount: data.support_composition.no_support.amount },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {SUPPORT_COLORS.map((color, i) => (
                          <Cell key={i} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomPieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-3">
                    {[
                      { label: 'Factura electrónica', data: data.support_composition.electronic_invoice, color: COLORS.emerald },
                      { label: 'Soporte débil', data: data.support_composition.weak_support, color: COLORS.amber },
                      { label: 'Sin soporte', data: data.support_composition.no_support, color: COLORS.red },
                    ].map(({ label, data: d, color }) => (
                      <div key={label}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs font-medium text-slate-600">{label}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-slate-900">{fmtPct(d.pct)}</span>
                          <span className="text-xs text-slate-400">{d.count} fact. · {fmtCurrency(d.amount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          {/* ── Row 3: Aging + Exceptions ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 3a: Antigüedad de cajas */}
            <SectionCard title="Antigüedad de Cajas No Legalizadas">
              <div className="space-y-3">
                {(Object.entries(data.aging_buckets) as [string, { count: number; amount: number }][]).map(([bucket, d], i) => {
                  const maxCount = Math.max(
                    ...Object.values(data.aging_buckets).map((b) => b.count),
                    1,
                  );
                  const pct = (d.count / maxCount) * 100;
                  return (
                    <div key={bucket}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-600">{bucket} días</span>
                        <span className="text-xs text-slate-500">
                          {d.count} caja{d.count !== 1 ? 's' : ''} · {fmtCurrency(d.amount)}
                        </span>
                      </div>
                      <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 flex items-center pl-2"
                          style={{
                            width: `${Math.max(pct, d.count > 0 ? 8 : 0)}%`,
                            backgroundColor: AGING_COLORS[i],
                          }}
                        >
                          {d.count > 0 && (
                            <span className="text-[10px] font-bold text-white">{d.count}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            {/* 3b: Excepciones por aprobador */}
            <SectionCard title="Excepciones: Aprobadas vs. Rechazadas">
              {data.exception_decisions.total === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">Sin excepciones procesadas</p>
              ) : (
                <>
                  <div className="flex items-center gap-6 mb-4">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      <span className="text-sm font-semibold text-slate-700">{data.exception_decisions.approved}</span>
                      <span className="text-xs text-slate-400">aprobadas</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <XCircle className="size-4 text-red-500" />
                      <span className="text-sm font-semibold text-slate-700">{data.exception_decisions.rejected}</span>
                      <span className="text-xs text-slate-400">rechazadas</span>
                    </div>
                  </div>
                  {data.exception_decisions.by_approver.length > 0 && (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart
                        data={data.exception_decisions.by_approver}
                        margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="approver_name" tick={{ fontSize: 11, fill: '#475569' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="approved" name="Aprobadas" fill={COLORS.emerald} radius={[4, 4, 0, 0]} stackId="a" />
                        <Bar dataKey="rejected" name="Rechazadas" fill={COLORS.red} radius={[4, 4, 0, 0]} stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </>
              )}
            </SectionCard>
          </div>

          {/* ── Row 4: Saldo disponible (full width table) ── */}
          <SectionCard title="Saldo Disponible por Residente y Proyecto">
            {data.available_balances.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">Sin cajas abiertas</p>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pr-3">Caja</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pr-3">Residente</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pr-3">Proyecto</th>
                      <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pr-3">Inicial</th>
                      <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider py-2 pr-3">Disponible</th>
                      <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider py-2 w-48">Consumo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.available_balances.map((b) => {
                      const alertColors = {
                        none: '',
                        yellow: 'bg-amber-50',
                        orange: 'bg-orange-50',
                        red: 'bg-red-50',
                      };
                      const barColor = {
                        none: 'bg-emerald-500',
                        yellow: 'bg-amber-500',
                        orange: 'bg-orange-500',
                        red: 'bg-red-500',
                      };
                      return (
                        <tr
                          key={b.box_id}
                          className={cn(
                            'border-b border-slate-100 hover:bg-slate-50 transition-colors',
                            alertColors[b.threshold_alert],
                          )}
                        >
                          <td className="py-2.5 pr-3">
                            <span className="font-mono text-xs font-medium text-slate-700">{b.box_code}</span>
                          </td>
                          <td className="py-2.5 pr-3 text-slate-700">{b.worker_name}</td>
                          <td className="py-2.5 pr-3 text-slate-500 text-xs">{b.project_name || '—'}</td>
                          <td className="py-2.5 pr-3 text-right font-medium text-slate-700 tabular-nums">
                            {fmtCurrencyFull(b.initial_amount)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-bold tabular-nums" style={{ color: barColor[b.threshold_alert].replace('bg-', '').includes('red') ? COLORS.red : barColor[b.threshold_alert].replace('bg-', '').includes('orange') ? COLORS.orange : barColor[b.threshold_alert].replace('bg-', '').includes('amber') ? COLORS.amber : COLORS.emerald }}>
                            {fmtCurrencyFull(b.current_balance)}
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full transition-all duration-500', barColor[b.threshold_alert])}
                                  style={{ width: `${Math.min(b.consumed_pct, 100)}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-medium text-slate-500 w-10 text-right tabular-nums">
                                {fmtPct(b.consumed_pct)}
                              </span>
                              {b.threshold_alert !== 'none' && (
                                <AlertTriangle className={cn(
                                  'size-3.5 shrink-0',
                                  b.threshold_alert === 'red' ? 'text-red-500' : b.threshold_alert === 'orange' ? 'text-orange-500' : 'text-amber-500',
                                )} />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* ── Row 5: Expiring Boxes + Cap Compliance ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 5a: Cajas por vencer */}
            <SectionCard title="🚨 Cajas Próximas a Vencer">
              {data.expiring_boxes.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-slate-400">
                  <CheckCircle2 className="size-8 mb-2" />
                  <p className="text-sm">Todas las cajas están al día</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {data.expiring_boxes.map((box) => {
                    const urgencyStyles = {
                      critical: { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', label: 'Vencida' },
                      high: { bg: 'bg-orange-50 border-orange-200', badge: 'bg-orange-100 text-orange-700', label: 'Último día' },
                      medium: { bg: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700', label: '2-3 días' },
                      low: { bg: 'bg-slate-50 border-slate-200', badge: 'bg-slate-100 text-slate-600', label: `${box.days_remaining}d` },
                    };
                    const s = urgencyStyles[box.urgency];
                    return (
                      <div key={box.box_id} className={cn('rounded-lg border p-3', s.bg)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs font-bold text-slate-800">{box.box_code}</span>
                            <span className="text-xs text-slate-500 truncate">{box.box_name}</span>
                          </div>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0', s.badge)}>
                            {s.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Users className="size-3" />
                            {box.worker_name}
                          </span>
                          {box.project_name && (
                            <span className="truncate">{box.project_name}</span>
                          )}
                          <span className="flex items-center gap-1 ml-auto">
                            <Clock className="size-3" />
                            {box.pending_invoices} pendiente{box.pending_invoices !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>

            {/* 5b: Cumplimiento del tope + Monto en riesgo detail */}
            <div className="space-y-4">
              <SectionCard title="Cumplimiento del Tope $1.000.000 (RN-03)">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">{data.cap_compliance.boxes_over_cap}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Cajas &gt; tope</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{data.cap_compliance.with_exception}</p>
                    <p className="text-[10px] text-emerald-600 uppercase tracking-wider mt-1">Con excepción</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-3 text-center">
                    <p className="text-2xl font-bold text-red-700">{data.cap_compliance.without_exception}</p>
                    <p className="text-[10px] text-red-600 uppercase tracking-wider mt-1">Sin justificar</p>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Detalle del Monto en Riesgo">
                {data.amount_at_risk.by_reason.length === 0 ? (
                  <div className="flex items-center gap-2 py-4 justify-center text-emerald-600">
                    <Shield className="size-5" />
                    <span className="text-sm font-medium">Sin montos en riesgo</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.amount_at_risk.by_reason.map((r) => (
                      <div key={r.reason} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="size-3.5 text-amber-500" />
                          <span className="text-xs font-medium text-slate-700">{r.reason}</span>
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{r.count}</span>
                        </div>
                        <span className="text-xs font-bold text-amber-700 tabular-nums">{fmtCurrencyFull(r.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-xs font-bold text-slate-700">Total en riesgo</span>
                      <span className="text-sm font-bold text-amber-700 tabular-nums">{fmtCurrencyFull(data.amount_at_risk.total)}</span>
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
