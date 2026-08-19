import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Estado de listados (filtros y posición del scroll) que sobrevive a entrar a
 * un detalle y volver. Se guarda en sessionStorage: se conserva mientras la
 * pestaña esté abierta y se descarta al cerrarla.
 */
const PREFIX = 'britek:list:';

const storageKey = (key: string) => `${PREFIX}${key}`;

/** El layout scrollea en <main>, pero si su alto no queda acotado scrollea el documento. */
function getScroller(): HTMLElement | null {
  const main = document.querySelector('main');
  if (main && main.scrollHeight > main.clientHeight + 1) return main;
  return null;
}

function getScrollTop(): number {
  const el = getScroller();
  return el ? el.scrollTop : window.scrollY;
}

function setScrollTop(top: number) {
  const el = getScroller();
  if (el) el.scrollTop = top;
  else window.scrollTo(0, top);
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(storageKey(key));
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Como useState, pero recuerda el valor entre navegaciones dentro de la app. */
export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, initial));
  const keyRef = useRef(key);

  useEffect(() => {
    if (keyRef.current !== key) {
      // Cambió la lista (p. ej. otra caja): no arrastrar el valor de la anterior.
      keyRef.current = key;
      setValue(read(key, initial));
      return;
    }
    try {
      sessionStorage.setItem(storageKey(key), JSON.stringify(value));
    } catch {
      // sessionStorage puede no estar disponible (modo privado, cuota): el filtro
      // sigue funcionando, solo no se recuerda.
    }
  }, [key, value, initial]);

  return [value, setValue];
}

/**
 * Guarda la posición del scroll de la página y la restaura cuando `ready` pasa
 * a true (es decir, cuando la lista ya está renderizada y tiene su alto final).
 */
export function useScrollRestoration(key: string, ready: boolean) {
  const restoredKey = useRef<string | null>(null);

  useEffect(() => {
    let pending = 0;
    const persist = () => {
      pending = 0;
      try {
        sessionStorage.setItem(storageKey(key), String(getScrollTop()));
      } catch {
        // sin persistencia disponible
      }
    };
    // En captura porque el scroll puede ocurrir en <main> y no burbujea hasta window.
    // Se persiste a lo sumo una vez por frame; no se guarda al desmontar porque
    // en ese momento la lista ya salió del DOM y el scrollTop mediría 0.
    const onScroll = () => {
      if (pending) return;
      pending = requestAnimationFrame(persist);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (pending) {
        cancelAnimationFrame(pending);
        persist();
      }
    };
  }, [key]);

  useEffect(() => {
    if (!ready || restoredKey.current === key) return;
    restoredKey.current = key;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(storageKey(key));
    } catch {
      return;
    }
    const top = Number(raw);
    if (!top || Number.isNaN(top)) return;
    // Dos frames: el primero pinta la lista, el segundo ya tiene el alto final.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setScrollTop(top));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [key, ready]);
}
