import { FileText, ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchBlobWithType } from '../lib/api';
import { cn } from '../lib/utils';

interface Props {
  path: string;
  alt: string;
  className?: string;
}

export function AuthImage({ path, alt, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let canceled = false;
    let created: string | null = null;
    setUrl(null);
    setIsPdf(false);
    setError(false);
    fetchBlobWithType(path)
      .then(({ blob, contentType }) => {
        if (canceled) return;
        const pdf = contentType.includes('application/pdf');
        setIsPdf(pdf);
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => {
        if (!canceled) setError(true);
      });
    return () => {
      canceled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);

  if (error) {
    return (
      <div className={cn('flex items-center justify-center bg-slate-100 text-slate-400', className)}>
        <ImageOff className="size-8" />
      </div>
    );
  }
  if (!url) {
    return <div className={cn('bg-slate-100 animate-pulse', className)} />;
  }

  if (isPdf) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex flex-col items-center justify-center gap-2 bg-slate-50 text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer',
          className,
        )}
        title="Abrir PDF en nueva pestaña"
      >
        <FileText className="size-10 text-rose-500" />
        <span className="text-xs font-medium">Documento PDF</span>
        <span className="text-[10px] text-slate-400">Clic para abrir</span>
      </a>
    );
  }

  return <img src={url} alt={alt} className={className} />;
}
