import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSidebar } from '@/contexts/SidebarContext';
import { useState } from 'react';
import type { ModuleName } from '@/types';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  module: ModuleName;
}

const allNavItems: NavItem[] = [
  { path: '/catalogo', label: 'Catálogo GYP', icon: 'ri-table-line', module: 'catalogo' },
  { path: '/cobros-cofersa', label: 'Cobros Cofersa', icon: 'ri-money-dollar-circle-line', module: 'cobros-cofersa' },
  { path: '/cuentas-ajustadas', label: 'Cuentas Ajustadas', icon: 'ri-scales-3-line', module: 'cuentas-ajustadas' },
  { path: '/presupuestos', label: 'Presupuestos', icon: 'ri-file-list-3-line', module: 'presupuestos' },
  { path: '/activacion-cuentas', label: 'Activación de Cuentas', icon: 'ri-toggle-line', module: 'activacion-cuentas' },
  { path: '/factores', label: 'Tasas', icon: 'ri-line-chart-line', module: 'factores' },
  { path: '/historial-cambios', label: 'Historial', icon: 'ri-history-line', module: 'historial-cambios' },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { canAccessModule, rolLabel, isAdmin, isSuperAdmin } = usePermissions();
  const { collapsed, toggle } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = allNavItems.filter((item) => canAccessModule(item.module));
  const canSeeConfig = canAccessModule('configuracion');

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 md:hidden rounded-lg bg-slate-900 p-2 text-white"
      >
        <i className={`ri-${mobileOpen ? 'close-line' : 'menu-line'} text-xl`}></i>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-slate-900 text-white transition-all duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${collapsed ? 'md:w-16' : 'md:w-64'}`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800 h-14">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
              <i className="ri-bar-chart-grouped-line text-white text-lg"></i>
            </div>
            {!collapsed && (
              <span className="text-lg font-bold tracking-tight transition-opacity duration-300">
                GestorGYP
              </span>
            )}
          </div>

          {/* Toggle button (desktop only) */}
          <button
            onClick={toggle}
            className="hidden md:flex items-center justify-center w-full py-2 border-b border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            <i className={`ri-${collapsed ? 'arrow-right-s-line' : 'arrow-left-s-line'} text-lg`}></i>
          </button>

          {/* Nav items */}
          <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || (item.path === '/catalogo' && location.pathname === '/');
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setMobileOpen(false); }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <i className={`${item.icon} text-lg w-5 flex items-center justify-center shrink-0`}></i>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}

            {!isSuperAdmin && (
              <div className="my-3 border-t border-slate-800"></div>
            )}

            {canSeeConfig && (
              <>
                <div className="my-3 border-t border-slate-800"></div>
                <button
                  onClick={() => { navigate('/configuracion'); setMobileOpen(false); }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    location.pathname === '/configuracion'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={collapsed ? 'Configuración' : undefined}
                >
                  <i className="ri-settings-4-line text-lg w-5 flex items-center justify-center shrink-0"></i>
                  {!collapsed && <span className="truncate">Configuración</span>}
                </button>
              </>
            )}

            <button
              onClick={() => { logout(); setMobileOpen(false); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors ${
                collapsed ? 'justify-center' : ''
              }`}
              title={collapsed ? 'Cerrar Sesión' : undefined}
            >
              <i className="ri-logout-box-r-line text-lg w-5 flex items-center justify-center shrink-0"></i>
              {!collapsed && <span className="truncate">Cerrar Sesión</span>}
            </button>
          </nav>

          {/* Footer user */}
          <div className="border-t border-slate-800 p-3">
            <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <i className="ri-user-line text-emerald-400 text-sm"></i>
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{user?.nombre || user?.email}</p>
                  <p className="text-xs text-slate-400">{rolLabel}</p>
                  {user?.pais_id && !isSuperAdmin && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      <i className="ri-map-pin-line mr-0.5"></i>
                      Asignado a país
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}