import { FileText, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface LocationState {
  from?: { pathname: string };
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? {};
  const redirectTo = state.from?.pathname ?? '/workers';

  const [email, setEmail] = useState('admin@ocrdemo.local');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Credenciales inválidas'
          : err instanceof Error
            ? err.message
            : 'Error desconocido',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <FileText className="size-7 text-slate-900" />
          <div>
            <p className="text-lg font-semibold text-slate-900">Britek+Dextera</p>
            <p className="text-xs text-slate-500">Legalización de caja menor</p>
          </div>
        </div>
        <form
          onSubmit={onSubmit}
          className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-4"
        >
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

          {error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-3 py-2 text-sm font-medium text-white"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Iniciar sesión
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500 text-center">
          Demo: <code>admin@ocrdemo.local</code> / <code>admin123</code>
        </p>
      </div>
    </div>
  );
}
