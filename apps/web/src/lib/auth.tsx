import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth, getToken, setToken, type AuthUser } from './api';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  // ─── LOGIN CON EMAIL/PASSWORD (COMENTADO) ───────────────────────────
  // login: (email: string, password: string) => Promise<void>;
  // ─── LOGIN CON GOOGLE ───────────────────────────────────────────────
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await auth.me();
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onLogout = () => {
      setUser(null);
    };
    window.addEventListener('ocrdemo:logout', onLogout);
    return () => window.removeEventListener('ocrdemo:logout', onLogout);
  }, [refresh]);

  // ─── LOGIN CON EMAIL/PASSWORD (COMENTADO) ───────────────────────────
  // const login = useCallback(async (email: string, password: string) => {
  //   const res = await auth.login(email, password);
  //   setToken(res.access_token);
  //   setUser(res.user);
  // }, []);

  // ─── LOGIN CON GOOGLE ───────────────────────────────────────────────
  const loginWithGoogle = useCallback(async (credential: string) => {
    const res = await auth.googleLogin(credential);
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, loginWithGoogle, logout }),
    [user, loading, loginWithGoogle, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
