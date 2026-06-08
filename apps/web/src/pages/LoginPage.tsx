import { FileText, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
// import { type FormEvent } from 'react'; // Comentado — login por email/password deshabilitado
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface LocationState {
  from?: { pathname: string };
}

// Declaración de tipos para Google Identity Services (GSI)
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number;
              logo_alignment?: 'left' | 'center';
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? {};
  const redirectTo = state.from?.pathname ?? '/workers';

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiReady, setGsiReady] = useState(false);

  // ─── LOGIN CON EMAIL/PASSWORD (COMENTADO) ───────────────────────────
  // const [email, setEmail] = useState('admin@ocrdemo.local');
  // const [password, setPassword] = useState('admin123');
  //
  // const onSubmit = async (e: FormEvent) => {
  //   e.preventDefault();
  //   setLoading(true);
  //   setError(null);
  //   try {
  //     await login(email, password);
  //     navigate(redirectTo, { replace: true });
  //   } catch (err) {
  //     setError(
  //       err instanceof ApiError && err.status === 401
  //         ? 'Credenciales inválidas'
  //         : err instanceof Error
  //           ? err.message
  //           : 'Error desconocido',
  //     );
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // ─── LOGIN CON GOOGLE ───────────────────────────────────────────────
  const handleGoogleCallback = useCallback(
    async (response: { credential: string }) => {
      setLoading(true);
      setError(null);
      try {
        await loginWithGoogle(response.credential);
        navigate(redirectTo, { replace: true });
      } catch (err) {
        setError(
          err instanceof ApiError && err.status === 401
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Error desconocido al iniciar sesión con Google',
        );
      } finally {
        setLoading(false);
      }
    },
    [loginWithGoogle, navigate, redirectTo],
  );

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('VITE_GOOGLE_CLIENT_ID no está configurado');
      return;
    }

    // Verificar si el script de GSI ya está cargado
    const initializeGoogle = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleGoogleCallback,
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_blue',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 320,
          logo_alignment: 'left',
        });
        setGsiReady(true);
      }
    };

    // Si el script ya está cargado, inicializar directamente
    if (window.google?.accounts?.id) {
      initializeGoogle();
      return;
    }

    // Si no, esperar a que cargue
    const checkInterval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(checkInterval);
        initializeGoogle();
      }
    }, 100);

    // Timeout después de 10 segundos
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (!gsiReady) {
        setError('No se pudo cargar Google Sign-In. Recarga la página.');
      }
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [handleGoogleCallback, gsiReady]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <FileText className="size-7 text-slate-900" />
          <div>
            <p className="text-lg font-semibold text-slate-900">Britek</p>
            <p className="text-xs text-slate-500">Legalización de caja menor</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4">
          {/* ─── FORMULARIO EMAIL/PASSWORD (COMENTADO) ────────────────────── */}
          {/*
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600">Email</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Contraseña</label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-3 py-2 text-sm font-medium text-white"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              Iniciar sesión
            </button>
          </form>
          */}

          {/* ─── BOTÓN DE GOOGLE SIGN-IN ──────────────────────────────────── */}
          <p className="text-sm text-slate-600 text-center">
            Inicia sesión con tu cuenta de Google
          </p>

          <div className="flex justify-center">
            {loading ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="size-5 animate-spin text-slate-500" />
                <span className="text-sm text-slate-500">Verificando...</span>
              </div>
            ) : (
              <div ref={googleBtnRef} id="google-signin-button" />
            )}
          </div>

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </p>
          )}
        </div>

        <p className="mt-3 text-xs text-slate-500 text-center">
          Solo usuarios registrados pueden acceder
        </p>

        {/* ─── HINT DE DEMO (COMENTADO) ──────────────────────────────────── */}
        {/* <p className="mt-3 text-xs text-slate-500 text-center">
          Demo: <code>admin@ocrdemo.local</code> / <code>admin123</code>
        </p> */}
      </div>
    </div>
  );
}
