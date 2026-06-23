import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Modal } from '@/components/base/Modal';
import { ConfirmModal } from '@/components/base/ConfirmModal';
import type { Usuario, RolUsuario, Organizacion, Pais, Compania } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import { useUbicaciones } from '@/hooks/useUbicaciones';
import PaisesCentrosTab from './components/PaisesCentrosTab';

interface TabConteo {
  tabla: string;
  label: string;
  count: number | null;
  icon: string;
  color: string;
  bg: string;
}

interface StatsData {
  catalogo: number;
  cobrosCuentas: number;
  cobrosRegistros: number;
  cuentasAjustadas: number;
  usuarios: number;
  activas: number;
  inactivas: number;
  cobrosActivas: number;
  cobrosInactivas: number;
}

export default function ConfiguracionPage() {
  const { user, isAdmin } = useAuth();
  const { addToast } = useToast();
  const { isSuperAdmin } = usePermissions();
  const { organizaciones, paises, companias } = useUbicaciones();
  const [activeTab, setActiveTab] = useState<'general' | 'usuarios' | 'sistema' | 'ubicacion'>('general');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [editUsuario, setEditUsuario] = useState<Usuario | null>(null);
  const [nuevoRol, setNuevoRol] = useState<RolUsuario>('viewer');
  const [nuevoPaisId, setNuevoPaisId] = useState('');
  const [nuevoCompaniaId, setNuevoCompaniaId] = useState('');
  const [nuevoOrganizacionId, setNuevoOrganizacionId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Usuario | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRol, setInviteRol] = useState<RolUsuario>('viewer');
  const [invitePaisId, setInvitePaisId] = useState('');
  const [inviteCompaniaId, setInviteCompaniaId] = useState('');
  const [inviteOrganizacionId, setInviteOrganizacionId] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [creatingMayoreoUsers, setCreatingMayoreoUsers] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [cat, cobCuentas, cobReg, ajustadas, usr, activas, inactivas, cobAct, cobInact] = await Promise.all([
        supabase.from('catalogo_gyp').select('*', { count: 'exact', head: true }),
        supabase.from('cobros_cofersa_cuentas').select('*', { count: 'exact', head: true }),
        supabase.from('cobros_cofersa').select('*', { count: 'exact', head: true }),
        supabase.from('cuentas_ajustadas').select('*', { count: 'exact', head: true }),
        supabase.from('usuarios').select('*', { count: 'exact', head: true }),
        supabase.from('catalogo_gyp').select('*', { count: 'exact', head: true }).eq('activa', true),
        supabase.from('catalogo_gyp').select('*', { count: 'exact', head: true }).eq('activa', false),
        supabase.from('cobros_cofersa_cuentas').select('*', { count: 'exact', head: true }).eq('activa', true),
        supabase.from('cobros_cofersa_cuentas').select('*', { count: 'exact', head: true }).eq('activa', false),
      ]);

      setStats({
        catalogo: cat.count ?? 0,
        cobrosCuentas: cobCuentas.count ?? 0,
        cobrosRegistros: cobReg.count ?? 0,
        cuentasAjustadas: ajustadas.count ?? 0,
        usuarios: usr.count ?? 0,
        activas: activas.count ?? 0,
        inactivas: inactivas.count ?? 0,
        cobrosActivas: cobAct.count ?? 0,
        cobrosInactivas: cobInact.count ?? 0,
      });
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      addToast('error', 'Error al cargar estadísticas');
    } finally {
      setLoadingStats(false);
    }
  }, [addToast]);

  const fetchUsuarios = useCallback(async () => {
    setLoadingUsuarios(true);
    const { data, error } = await supabase.from('usuarios').select('*').order('nombre', { ascending: true });
    if (error) {
      console.error('Error cargando usuarios:', error);
      addToast('error', 'Error al cargar usuarios');
    } else {
      setUsuarios(data || []);
    }
    setLoadingUsuarios(false);
  }, [addToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'usuarios') {
      fetchUsuarios();
    }
  }, [activeTab, fetchUsuarios]);

  const handleUpdateRol = async () => {
    if (!editUsuario) return;
    const updates: Record<string, unknown> = { rol: nuevoRol };
    if (nuevoPaisId) updates.pais_id = nuevoPaisId; else updates.pais_id = null;
    if (nuevoCompaniaId) updates.compania_id = nuevoCompaniaId; else updates.compania_id = null;
    if (nuevoOrganizacionId) updates.organizacion_id = nuevoOrganizacionId; else updates.organizacion_id = null;
    const { error } = await supabase.from('usuarios').update(updates).eq('id', editUsuario.id);
    if (error) {
      addToast('error', 'Error al actualizar usuario');
    } else {
      addToast('success', 'Usuario actualizado correctamente');
      setUsuarios((prev) => prev.map((u) => (u.id === editUsuario.id ? { ...u, rol: nuevoRol, pais_id: nuevoPaisId || null, compania_id: nuevoCompaniaId || null, organizacion_id: nuevoOrganizacionId || null } : u)));
    }
    setEditUsuario(null);
  };

  const handleDeleteUsuario = async () => {
    if (!confirmDelete) return;
    const { error } = await supabase.from('usuarios').delete().eq('id', confirmDelete.id);
    if (error) {
      addToast('error', 'Error al eliminar usuario');
    } else {
      addToast('success', 'Usuario eliminado');
      setUsuarios((prev) => prev.filter((u) => u.id !== confirmDelete.id));
    }
    setConfirmDelete(null);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      addToast('error', 'Ingresá un email válido');
      return;
    }
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: inviteEmail.trim(),
        password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      });
      if (error) {
        addToast('error', error.message);
      } else if (data.user) {
        // Update user profile with role and scope
        await supabase.from('usuarios').update({
          rol: inviteRol,
          pais_id: invitePaisId || null,
          compania_id: inviteCompaniaId || null,
          organizacion_id: inviteOrganizacionId || null,
        }).eq('id', data.user.id);
        addToast('success', 'Invitación enviada correctamente');
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteRol('viewer');
        setInvitePaisId('');
        setInviteCompaniaId('');
        setInviteOrganizacionId('');
        fetchUsuarios();
      }
    } catch (err) {
      addToast('error', 'Error al enviar invitación');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCreateMayoreoUsers = async () => {
    setCreatingMayoreoUsers(true);
    try {
      const { data, error } = await supabase.functions.invoke('crear-usuarios-mayoreo', {
        body: {},
      });
      if (error) {
        addToast('error', `Error: ${error.message || 'No se pudo conectar con el servidor'}`);
        return;
      }
      if (data?.success) {
        const created = data.results?.filter((r: { status: string }) => r.status === 'created').length || 0;
        const updated = data.results?.filter((r: { status: string }) => r.status === 'updated').length || 0;
        addToast('success', `Usuarios Mayoreo: ${created} creados, ${updated} actualizados. Revisá la tabla.`);
        fetchUsuarios();
      } else {
        addToast('error', `Error: ${data?.error || 'Respuesta inesperada'}`);
      }
    } catch (err) {
      addToast('error', 'Error al crear usuarios Mayoreo');
      console.error(err);
    } finally {
      setCreatingMayoreoUsers(false);
    }
  };

  const tabItems = useMemo(
    () => [
      { id: 'general', label: 'General', icon: 'ri-dashboard-line' },
      { id: 'usuarios', label: 'Usuarios', icon: 'ri-user-settings-line' },
      { id: 'ubicacion', label: 'Ubicación', icon: 'ri-map-pin-line' },
      { id: 'sistema', label: 'Sistema', icon: 'ri-server-line' },
    ],
    [],
  );

  const conteoCards: TabConteo[] = useMemo(
    () =>
      stats
        ? [
            {
              tabla: 'catalogo_gyp',
              label: 'Catálogo GYP',
              count: stats.catalogo,
              icon: 'ri-table-line',
              color: 'text-emerald-600',
              bg: 'bg-emerald-50',
            },
            {
              tabla: 'cobros_cofersa_cuentas',
              label: 'Cuentas de Cobro',
              count: stats.cobrosCuentas,
              icon: 'ri-money-dollar-circle-line',
              color: 'text-amber-600',
              bg: 'bg-amber-50',
            },
            {
              tabla: 'cobros_cofersa',
              label: 'Registros de Cobro',
              count: stats.cobrosRegistros,
              icon: 'ri-file-list-3-line',
              color: 'text-sky-600',
              bg: 'bg-sky-50',
            },
            {
              tabla: 'cuentas_ajustadas',
              label: 'Cuentas Ajustadas',
              count: stats.cuentasAjustadas,
              icon: 'ri-scales-3-line',
              color: 'text-orange-600',
              bg: 'bg-orange-50',
            },
            {
              tabla: 'usuarios',
              label: 'Usuarios',
              count: stats.usuarios,
              icon: 'ri-user-line',
              color: 'text-violet-600',
              bg: 'bg-violet-50',
            },
          ]
        : [],
    [stats],
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-sm text-slate-500">Administración del sistema y gestión de usuarios</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className={tab.icon}></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab General */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Cards de conteo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {loadingStats
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="rounded-xl bg-white p-4 border border-slate-200 animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-24 mb-3"></div>
                    <div className="h-8 bg-slate-200 rounded w-16"></div>
                  </div>
                ))
              : conteoCards.map((card) => (
                  <div
                    key={card.tabla}
                    className="rounded-xl bg-white p-4 border border-slate-200 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">{card.label}</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{card.count?.toLocaleString()}</p>
                      </div>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${card.bg}`}>
                        <i className={`${card.icon} ${card.color} text-lg`}></i>
                      </div>
                    </div>
                  </div>
                ))}
          </div>

          {/* Detalle de estados */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white p-4 border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Estado del Catálogo GYP</h3>
              {loadingStats ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-full"></div>
                  <div className="h-4 bg-slate-200 rounded w-full"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Cuentas activas</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-emerald-600">{stats?.activas.toLocaleString()}</span>
                      <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${stats && stats.catalogo > 0 ? (stats.activas / stats.catalogo) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Cuentas inactivas</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-500">{stats?.inactivas.toLocaleString()}</span>
                      <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-300 rounded-full"
                          style={{ width: `${stats && stats.catalogo > 0 ? (stats.inactivas / stats.catalogo) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-white p-4 border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Estado de Cuentas de Cobro</h3>
              {loadingStats ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-full"></div>
                  <div className="h-4 bg-slate-200 rounded w-full"></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Cuentas activas</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-emerald-600">{stats?.cobrosActivas.toLocaleString()}</span>
                      <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${stats && stats.cobrosCuentas > 0 ? (stats.cobrosActivas / stats.cobrosCuentas) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Cuentas inactivas</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-500">{stats?.cobrosInactivas.toLocaleString()}</span>
                      <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-300 rounded-full"
                          style={{ width: `${stats && stats.cobrosCuentas > 0 ? (stats.cobrosInactivas / stats.cobrosCuentas) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="rounded-xl bg-white p-4 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Acciones Rápidas</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('usuarios')}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <i className="ri-user-add-line mr-1"></i>
                Gestionar Usuarios
              </button>
              <button
                onClick={() => setActiveTab('ubicacion')}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <i className="ri-map-pin-line mr-1"></i>
                Gestionar Ubicaciones
              </button>
              <button
                onClick={() => fetchStats()}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-1"></i>
                Actualizar Estadísticas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Usuarios */}
      {activeTab === 'usuarios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Usuarios del Sistema</h3>
              <p className="text-sm text-slate-500">{usuarios.length} usuario{usuarios.length !== 1 ? 's' : ''} registrado{usuarios.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-2">
              {isSuperAdmin && (
                <button
                  onClick={handleCreateMayoreoUsers}
                  disabled={creatingMayoreoUsers}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <i className="ri-user-add-line mr-1"></i>
                  {creatingMayoreoUsers ? 'Creando...' : 'Crear Usuarios Mayoreo'}
                </button>
              )}
              {isSuperAdmin && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-user-add-line mr-1"></i>
                  Invitar Usuario
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 bg-slate-50">
                    <th className="py-3 px-4 font-medium">Nombre</th>
                    <th className="py-3 px-4 font-medium">Email</th>
                    <th className="py-3 px-4 font-medium">Rol</th>
                    <th className="py-3 px-4 font-medium">País</th>
                    <th className="py-3 px-4 font-medium">Compañía</th>
                    <th className="py-3 px-4 font-medium">Organización</th>
                    {isSuperAdmin && <th className="py-3 px-4 font-medium text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {loadingUsuarios ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        {Array.from({ length: isSuperAdmin ? 7 : 6 }).map((_, j) => (
                          <td key={j} className="py-3 px-4">
                            <div className="h-4 bg-slate-200 rounded animate-pulse w-24"></div>
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : usuarios.length === 0 ? (
                    <tr>
                      <td colSpan={isSuperAdmin ? 7 : 6} className="py-8 text-center text-slate-400">
                        No hay usuarios registrados
                      </td>
                    </tr>
                  ) : (
                    usuarios.map((u) => (
                      <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                              <i className="ri-user-line text-emerald-600 text-sm"></i>
                            </div>
                            <span className="font-medium text-slate-900">{u.nombre || 'Sin nombre'}</span>
                            {u.id === user?.id && (
                              <span className="text-xs text-slate-400">(vos)</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{u.email}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              u.rol === 'super_admin'
                                ? 'bg-violet-100 text-violet-700'
                                : u.rol === 'admin'
                                ? 'bg-emerald-100 text-emerald-700'
                                : u.rol === 'editor'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {u.rol === 'super_admin' ? 'Super Admin' : u.rol === 'admin' ? 'Administrador' : u.rol === 'editor' ? 'Editor' : 'Visualizador'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {paises.find(p => p.id === u.pais_id)?.nombre || <span className="text-slate-400 italic">—</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {companias.find(c => c.id === u.compania_id)?.nombre || <span className="text-slate-400 italic">—</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {organizaciones.find(o => o.id === u.organizacion_id)?.nombre || <span className="text-slate-400 italic">—</span>}
                        </td>
                        {isSuperAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditUsuario(u);
                                setNuevoRol(u.rol as RolUsuario);
                                setNuevoPaisId(u.pais_id || '');
                                setNuevoCompaniaId(u.compania_id || '');
                                setNuevoOrganizacionId(u.organizacion_id || '');
                              }}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                              title="Editar usuario"
                            >
                              <i className="ri-pencil-line text-base"></i>
                            </button>
                            <button
                              onClick={() => setConfirmDelete(u)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Eliminar"
                              disabled={u.id === user?.id}
                            >
                              <i className="ri-delete-bin-line text-base"></i>
                            </button>
                          </div>
                        </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Ubicación */}
      {activeTab === 'ubicacion' && <PaisesCentrosTab />}

      {/* Tab Sistema */}
      {activeTab === 'sistema' && (
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-4 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Información del Sistema</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Nombre</p>
                <p className="text-sm font-medium text-slate-900">GestorGYP</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Versión</p>
                <p className="text-sm font-medium text-slate-900">1.0.0</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Empresa</p>
                <p className="text-sm font-medium text-slate-900">OLO Logistics</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Base de Datos</p>
                <p className="text-sm font-medium text-slate-900">Supabase PostgreSQL</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Autenticación</p>
                <p className="text-sm font-medium text-slate-900">Supabase Auth</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Fecha de acceso</p>
                <p className="text-sm font-medium text-slate-900">{new Date().toLocaleDateString('es-ES')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Sesión Actual</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Usuario</p>
                <p className="text-sm font-medium text-slate-900">{user?.nombre || user?.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Email</p>
                <p className="text-sm font-medium text-slate-900">{user?.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Rol</p>
                <p className="text-sm font-medium text-slate-900">{user?.rol === 'super_admin' ? 'Super Admin' : user?.rol === 'admin' ? 'Administrador' : user?.rol === 'editor' ? 'Editor' : 'Visualizador'}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {user?.pais_id ? `País: ${paises.find(p => p.id === user.pais_id)?.nombre || user.pais_id}` : ''}
                {user?.compania_id ? ` | Compañía: ${companias.find(c => c.id === user.compania_id)?.nombre || user.compania_id}` : ''}
                {user?.organizacion_id ? ` | Org: ${organizaciones.find(o => o.id === user.organizacion_id)?.nombre || user.organizacion_id}` : ''}
                {!user?.pais_id && !user?.compania_id && !user?.organizacion_id && 'Sin restricción de scope'}
              </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">ID</p>
                <p className="text-sm font-medium text-slate-900 font-mono text-xs">{user?.id}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Módulos Activos</h3>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <i className="ri-check-line"></i>
                Dashboard
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <i className="ri-check-line"></i>
                Catálogo GYP
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <i className="ri-check-line"></i>
                Cobros Cofersa
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <i className="ri-check-line"></i>
                Activación de Cuentas
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <i className="ri-check-line"></i>
                Cuentas Ajustadas
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <i className="ri-check-line"></i>
                Presupuestos
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <i className="ri-check-line"></i>
                Tasas
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                <i className="ri-check-line"></i>
                Configuración
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar usuario */}
      <Modal isOpen={!!editUsuario} onClose={() => setEditUsuario(null)} title="Editar Usuario" size="md">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-500 mb-1">Usuario</p>
            <p className="text-sm font-medium text-slate-900">{editUsuario?.nombre || editUsuario?.email}</p>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Rol</label>
            <select
              value={nuevoRol}
              onChange={(e) => setNuevoRol(e.target.value as RolUsuario)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="super_admin">Super Admin</option>
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="viewer">Visualizador</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Organización (scope)</label>
              <select
                value={nuevoOrganizacionId}
                onChange={(e) => {
                  setNuevoOrganizacionId(e.target.value);
                  if (e.target.value) { setNuevoPaisId(''); setNuevoCompaniaId(''); }
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Sin restricción (ver todo)</option>
                {organizaciones.map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Limita la visibilidad a esta organización</p>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">País (scope)</label>
              <select
                value={nuevoPaisId}
                onChange={(e) => {
                  setNuevoPaisId(e.target.value);
                  if (e.target.value) setNuevoCompaniaId('');
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Sin restricción</option>
                {paises.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Limita la visibilidad a este país</p>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Compañía (scope)</label>
              <select
                value={nuevoCompaniaId}
                onChange={(e) => setNuevoCompaniaId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Sin restricción</option>
                {companias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Limita la visibilidad a esta compañía (el más restrictivo)</p>
            </div>
          </div>
          {nuevoRol === 'super_admin' && (nuevoPaisId || nuevoCompaniaId || nuevoOrganizacionId) && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs text-amber-700 flex items-start gap-1.5">
                <i className="ri-alert-line w-4 h-4 flex items-center justify-center shrink-0 mt-0.5"></i>
                Un Super Admin con scope asignado seguirá viendo todo (el scope no aplica a super_admin). Si querés limitar su acceso, usá el rol Admin.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setEditUsuario(null)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200"
            >
              Cancelar
            </button>
            <button
              onClick={handleUpdateRol}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Guardar
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal invitar usuario */}
      <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} title="Invitar Usuario" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="usuario@ejemplo.com"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Rol</label>
            <select
              value={inviteRol}
              onChange={(e) => setInviteRol(e.target.value as RolUsuario)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="viewer">Visualizador</option>
              <option value="editor">Editor</option>
              <option value="admin">Administrador</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm text-slate-500 mb-1">Organización (opcional)</label>
              <select value={inviteOrganizacionId} onChange={(e) => { setInviteOrganizacionId(e.target.value); if (e.target.value) { setInvitePaisId(''); setInviteCompaniaId(''); } }} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                <option value="">Sin restricción</option>
                {organizaciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">País (opcional)</label>
              <select value={invitePaisId} onChange={(e) => { setInvitePaisId(e.target.value); if (e.target.value) setInviteCompaniaId(''); }} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                <option value="">Sin restricción</option>
                {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-500 mb-1">Compañía (opcional)</label>
              <select value={inviteCompaniaId} onChange={(e) => setInviteCompaniaId(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
                <option value="">Sin restricción</option>
                {companias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowInviteModal(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200"
            >
              Cancelar
            </button>
            <button
              onClick={handleInvite}
              disabled={inviteLoading}
              className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {inviteLoading ? 'Enviando...' : 'Enviar Invitación'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmar eliminar */}
      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDeleteUsuario}
        title="Eliminar Usuario"
        message={`¿Eliminar a ${confirmDelete?.nombre || confirmDelete?.email} de la base de datos? Esto no elimina la cuenta de autenticación, solo el perfil.`}
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  );
}