import { FileText, LogOut, ScanLine, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/utils';

const navItems = [
  { to: '/workers', label: 'Trabajadores', icon: Users, roles: ['admin'] as const },
  { to: '/test-extraction', label: 'Test de extracción', icon: ScanLine, roles: null },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col">
        <div className="px-4 py-4 flex items-center gap-2 border-b border-slate-800">
          <FileText className="size-5" />
          <div>
            <p className="text-sm font-semibold text-white">OCRDEMO</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Caja menor</p>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems
            .filter((item) => !item.roles || (user && item.roles.includes(user.role as never)))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
        </nav>
        {user && (
          <div className="p-3 border-t border-slate-800">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email ?? user.role}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200"
            >
              <LogOut className="size-3.5" />
              Cerrar sesión
            </button>
          </div>
        )}
      </aside>
      <main className="flex-1 bg-slate-50 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
