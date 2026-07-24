import { ExternalLink, FileText, ImageIcon, ImageOff, Maximize2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import { fetchBlobWithType } from '../lib/api';
import { cn } from '../lib/utils';

interface Props {
  path: string;
  alt: string;
  className?: string;
}

/**
 * Full-size file preview used in detail pages.
 * For images: renders an <img> with a toolbar (ampliar / abrir en nueva pestaña)
 * and a zoomable lightbox on click.
 * For PDFs: renders an embedded <iframe> viewer with a fallback link.
 */
export function AuthFilePreview({ path, alt, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState(false);

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
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <ImageIcon className="size-4 text-slate-500" />
          <span className="font-medium">Imagen</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Maximize2 className="size-3.5" />
            Ampliar
          </button>
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
      </div>
      <button
        type="button"
        onClick={() => setLightbox(true)}
        className="block cursor-zoom-in"
        title="Clic para ampliar"
      >
        <img
          src={url}
          alt={alt}
          className="w-full h-auto max-h-[85vh] object-contain bg-slate-100"
        />
      </button>

      {lightbox && (
        <ImageLightbox url={url} alt={alt} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const SCALE_STEP = 0.5;

function ImageLightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const zoomIn = useCallback(() => setScale((s) => clamp(s + SCALE_STEP)), []);
  const zoomOut = useCallback(
    () =>
      setScale((s) => {
        const next = clamp(s - SCALE_STEP);
        if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
        return next;
      }),
    [],
  );
  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Lock body scroll while open + close on ESC
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, zoomIn, zoomOut, reset]);

  const handleWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    setScale((s) => {
      const next = clamp(s + (e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    dragging.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setOffset({
        x: dragging.current.baseX + (e.clientX - dragging.current.startX),
        y: dragging.current.baseY + (e.clientY - dragging.current.startY),
      });
    };
    const onUp = () => {
      dragging.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="absolute top-4 right-4 flex items-center gap-1 rounded-lg bg-slate-900/70 p-1 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton title="Alejar (−)" onClick={zoomOut} disabled={scale <= MIN_SCALE}>
          <ZoomOut className="size-5" />
        </IconButton>
        <span className="min-w-[3.5rem] text-center text-xs font-medium tabular-nums text-white">
          {Math.round(scale * 100)}%
        </span>
        <IconButton title="Acercar (+)" onClick={zoomIn} disabled={scale >= MAX_SCALE}>
          <ZoomIn className="size-5" />
        </IconButton>
        <IconButton title="Restablecer (0)" onClick={reset} disabled={scale === 1 && offset.x === 0 && offset.y === 0}>
          <RotateCcw className="size-5" />
        </IconButton>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir en nueva pestaña"
          className="flex items-center justify-center rounded-md p-2 text-white/90 hover:bg-white/15 hover:text-white transition-colors"
        >
          <ExternalLink className="size-5" />
        </a>
        <IconButton title="Cerrar (Esc)" onClick={onClose}>
          <X className="size-5" />
        </IconButton>
      </div>

      <img
        src={url}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2))}
        draggable={false}
        className={cn(
          'max-h-[92vh] max-w-[92vw] select-none object-contain shadow-2xl transition-transform duration-75',
          scale > 1 ? (dragging.current ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
        )}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      />
    </div>
  );
}

function IconButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center rounded-md p-2 text-white/90 hover:bg-white/15 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
