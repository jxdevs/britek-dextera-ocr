import { Clock, Coins, Cpu } from 'lucide-react';
import type { ExtractionResponse } from '../lib/api';
import { formatNumber } from '../lib/utils';

interface Props {
  result: ExtractionResponse;
}

export function MetricsPanel({ result }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Metric
        icon={<Clock className="size-4" />}
        label="Latencia"
        value={`${(result.latency_ms / 1000).toFixed(2)} s`}
        sub={`${formatNumber(result.latency_ms)} ms`}
      />
      <Metric
        icon={<Cpu className="size-4" />}
        label="Tokens"
        value={formatNumber(result.tokens.total)}
        sub={`${formatNumber(result.tokens.input)} in · ${formatNumber(result.tokens.output)} out`}
      />
      <Metric
        icon={<Coins className="size-4" />}
        label="Costo estimado"
        value={`$${result.cost_estimate_usd.toFixed(5)} USD`}
        sub={result.model}
      />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 tabular-nums">{sub}</p>
    </div>
  );
}
