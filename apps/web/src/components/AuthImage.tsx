import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchBlobWithAuth } from '../lib/api';
import { cn } from '../lib/utils';

interface Props {
  path: string;
  alt: string;
  className?: string;
}

export function AuthImage({ path, alt, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let canceled = false;
    let created: string | null = null;
    setUrl(null);
    setError(false);
    fetchBlobWithAuth(path)
      .then((blob) => {
        if (canceled) return;
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
  return <img src={url} alt={alt} className={className} />;
}
