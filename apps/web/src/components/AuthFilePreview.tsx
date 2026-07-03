import { ExternalLink, FileText, ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchBlobWithType } from '../lib/api';
import { cn } from '../lib/utils';

interface Props {
  path: string;
  alt: string;
  className?: string;
}

/**
 * Full-size file preview used in detail pages.
 * For images: renders an <img>.
 * For PDFs: renders an embedded <iframe> viewer with a fallback link.
 */
export function AuthFilePreview({ path, alt, className }: Props) {
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
      <div className={cn('flex items-center justify-center bg-slate-100 text-slate-400 min-h-[400px]', className)}>
        <ImageOff className="size-8" />
      </div>
    );
  }

  if (!url) {
    return <div className={cn('bg-slate-100 animate-pulse min-h-[400px]', className)} />;
  }

  if (isPdf) {
    return (
      <div className={cn('flex flex-col', className)}>
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <FileText className="size-4 text-rose-500" />
            <span className="font-medium">Documento PDF</span>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ExternalLink className="size-3.5" />
            Abrir en nueva pestaña
          </a>
        </div>
        <iframe
          src={url}
          title={alt}
          className="w-full flex-1 min-h-[70vh] bg-white"
        />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={cn('w-full h-auto max-h-[85vh] object-contain bg-slate-100', className)}
    />
  );
}
