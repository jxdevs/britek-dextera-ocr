import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface Props {
  raw: string;
}

export function RawJson({ raw }: Props) {
  const [open, setOpen] = useState(false);
  let formatted = raw;
  try {
    formatted = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // keep raw
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Respuesta cruda del modelo
      </button>
      {open && (
        <pre className="border-t border-slate-200 p-4 text-xs text-slate-700 overflow-x-auto bg-slate-50 max-h-96">
          {formatted}
        </pre>
      )}
    </div>
  );
}
