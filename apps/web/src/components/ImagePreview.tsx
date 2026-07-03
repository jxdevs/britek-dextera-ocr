import { FileText, Upload } from 'lucide-react';
import { useCallback, useState, type DragEvent } from 'react';
import { cn } from '../lib/utils';

interface Props {
  file: File | null;
  previewUrl: string | null;
  onFile: (file: File) => void;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

export function ImagePreview({ file, previewUrl, onFile }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) onFile(dropped);
    },
    [onFile],
  );

  const isPdf = file?.type === 'application/pdf';

  if (file && previewUrl) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
            <p className="text-xs text-slate-500">
              {(file.size / 1024).toFixed(0)} KB · {file.type}
            </p>
          </div>
          <label className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer">
            Cambiar
            <input
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
        </div>
        {isPdf ? (
          <div className="bg-slate-50 flex flex-col items-center justify-center min-h-[400px] gap-3">
            <FileText className="size-12 text-rose-500" />
            <p className="text-sm font-medium text-slate-700">{file.name}</p>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
            >
              Abrir PDF en nueva pestaña
            </a>
          </div>
        ) : (
          <div className="bg-slate-100 p-4 flex items-center justify-center min-h-[400px]">
            <img
              src={previewUrl}
              alt="Factura"
              className="max-w-full max-h-[600px] object-contain rounded shadow-sm"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <label
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      className={cn(
        'block bg-white border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
        isDragging
          ? 'border-slate-900 bg-slate-50'
          : 'border-slate-300 hover:border-slate-400',
      )}
    >
      <input
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <Upload className="mx-auto size-10 text-slate-400 mb-3" strokeWidth={1.5} />
      <p className="text-sm font-medium text-slate-900">Arrastra una factura o haz clic para seleccionar</p>
      <p className="text-xs text-slate-500 mt-1">JPG, PNG, WEBP o PDF · hasta 10 MB</p>
    </label>
  );
}
