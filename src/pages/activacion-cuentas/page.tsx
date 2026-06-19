import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { CatalogoItem } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';

export default function ActivacionPage() {
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroClasificacion, setFiltroClasificacion] = useState('');
  const [filtroClasificacion1, setFiltroClasificacion1] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'active' | 'inactive'>('all');
  const [confirmModal, setConfirmModal] = useState<{ action: string; clasificacion?: string } | null>(null);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const { isSuperAdmin, userScope, canEdit } = usePermissions();
  const canWrite = canEdit;

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('catalogo_gyp').select('*');
    if (!isSuperAdmin && userScope.pais_id) query = query.eq('pais_id', userScope.pais_id);
    else if (!isSuperAdmin && userScope.compania_id) query = query.eq('compania_id', userScope.compania_id);
    else if (!isSuperAdmin && userScope.organizacion_id) query = query.eq('organizacion_id', userScope.organizacion_id);
    const { data, error } = await query.order('orden_clasificacion', { ascending: true });
    if (error) {
      addToast('error', 'Error al cargar catálogo');
    } else {
      setItems(data || []);
    }
    setLoading(false);
  }, [addToast, isSuperAdmin, userScope]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const clasificaciones = useMemo(() => [...new Set(items.map((i) => i.clasificacion).filter(Boolean))], [items]);
  const clasificaciones1 = useMemo(() => [...new Set(items.map((i) => i.clasificacion_1).filter(Boolean))], [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesClas = !filtroClasificacion || item.clasificacion === filtroClasificacion;
      const matchesClas1 = !filtroClasificacion1 || item.clasificacion_1 === filtroClasificacion1;
      const matchesEstado = filtroEstado === 'all' || (filtroEstado === 'active' && item.activa) || (filtroEstado === 'inactive' && !item.activa);
      return matchesClas && matchesClas1 && matchesEstado;
    });
  }, [items, filtroClasificacion, filtroClasificacion1, filtroEstado]);

  const stats = {
    total: items.length,
    activas: items.filter((i) => i.activa).length,
    inactivas: items.filter((i) => !i.activa).length,
    porcentaje: items.length ? Math.round((items.filter((i) => i.activa).length / items.length) * 100) : 0,
  };

  const toggleActiva = async (item: CatalogoItem) => {
    if (!canWrite) { addToast('error', 'No tienes permisos'); return; }
    const newValue = !item.activa;
    const { error } = await supabase.from('catalogo_gyp').update({ activa: newValue }).eq('id', item.id);
    if (error) {
      addToast('error', 'Error al actualizar');
    } else {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, activa: newValue } : i)));
    }
  };

  const bulkAction = async (action: string, clasificacion?: string) => {
    if (!canWrite) { addToast('error', 'No tienes permisos'); return; }
    try {
      let query = supabase.from('catalogo_gyp').update({ activa: action === 'activate' });
      if (clasificacion) {
        query = query.eq('clasificacion', clasificacion);
      }
      const { error } = await query;
      if (error) throw error;
      addToast('success', 'Acción masiva completada');
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
    setConfirmModal(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Activación de Cuentas</h1>
        <p className="text-sm text-slate-500">Activar o desactivar cuentas del catálogo</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Total Cuentas</p>
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Activas</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.activas}</p>
        </div>
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Inactivas</p>
          <p className="text-2xl font-bold text-slate-500">{stats.inactivas}</p>
        </div>
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">% Activas</p>
          <div className="flex items-center gap-3">
            <p className="text-2xl font-bold text-slate-900">{stats.porcentaje}%</p>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${stats.porcentaje}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {canWrite && (
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Acciones Masivas</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setConfirmModal({ action: 'activate' })} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors">Activar Todo</button>
            <button onClick={() => setConfirmModal({ action: 'deactivate' })} className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors">Desactivar Todo</button>
            {clasificaciones.map((c) => (
              <div key={c} className="flex gap-1">
                <button onClick={() => setConfirmModal({ action: 'activate', clasificacion: c })} className="rounded-l-lg bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-200 transition-colors">Activar {c}</button>
                <button onClick={() => setConfirmModal({ action: 'deactivate', clasificacion: c })} className="rounded-r-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors">Desactivar {c}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-white p-4 border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <select value={filtroClasificacion} onChange={(e) => setFiltroClasificacion(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="">Todas las clasificaciones</option>
            {clasificaciones.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroClasificacion1} onChange={(e) => setFiltroClasificacion1(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="">Todas las sub-clasificaciones</option>
            {clasificaciones1.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4 font-medium">Cuenta</th>
                <th className="py-3 pr-4 font-medium">Descripción</th>
                <th className="py-3 pr-4 font-medium">Clasificación</th>
                <th className="py-3 pr-4 font-medium">Clasificación 1</th>
                <th className="py-3 pr-4 font-medium">Estado</th>
                {canWrite && <th className="py-3 pr-4 font-medium">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: canWrite ? 6 : 5 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4"><div className="h-4 bg-slate-200 rounded animate-pulse w-20"></div></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={canWrite ? 6 : 5} className="py-8 text-center text-slate-400">No se encontraron resultados</td></tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-4 font-medium text-slate-900">{item.cuenta}</td>
                    <td className="py-3 pr-4 text-slate-700">{item.descripcion}</td>
                    <td className="py-3 pr-4 text-slate-600">{item.clasificacion}</td>
                    <td className="py-3 pr-4 text-slate-600">{item.clasificacion_1}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${item.activa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {item.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => toggleActiva(item)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.activa ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.activa ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="rounded-xl bg-white p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Confirmar acción masiva</h3>
            <p className="text-sm text-slate-500 mb-4">
              ¿{confirmModal.action === 'activate' ? 'Activar' : 'Desactivar'} {confirmModal.clasificacion ? `todas las cuentas de "${confirmModal.clasificacion}"` : 'TODAS las cuentas'}?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmModal(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={() => bulkAction(confirmModal.action, confirmModal.clasificacion)} className="rounded-lg px-4 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}