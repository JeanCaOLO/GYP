import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { CobroCofersa, CobroCofersaCuenta, CatalogoItem, Organizacion, Pais, Compania, CentroCosto } from '@/types';
import { CATEGORIAS_COBRO as CATEGORIAS, MESES } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useUbicaciones } from '@/hooks/useUbicaciones';
import { usePermissions } from '@/hooks/usePermissions';

const PAGE_SIZE = 50;

type Tab = 'cuentas' | 'registros';

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
function formatCRC(n: number) {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(n);
}

export default function CobrosPage() {
  const [tab, setTab] = useState<Tab>('cuentas');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground-950">Cobros Cofersa</h1>
          <p className="text-sm text-foreground-700">Gestión de cuentas y registros de cobro</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-full bg-background-100 p-1 w-fit">
        <button
          onClick={() => setTab('cuentas')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'cuentas'
              ? 'bg-primary-500 text-background-50'
              : 'text-foreground-700 hover:text-foreground-950'
          }`}
        >
          Cuentas Configuradas
        </button>
        <button
          onClick={() => setTab('registros')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'registros'
              ? 'bg-primary-500 text-background-50'
              : 'text-foreground-700 hover:text-foreground-950'
          }`}
        >
          Registros de Cobros
        </button>
      </div>

      {tab === 'cuentas' ? <CuentasTab /> : <RegistrosTab />}
    </div>
  );
}

// ==========================================
// TAB: CUENTAS CONFIGURADAS
// ==========================================
function CuentasTab() {
  const [cuentas, setCuentas] = useState<CobroCofersaCuenta[]>([]);
  const [catalogoGyp, setCatalogoGyp] = useState<CatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'active' | 'inactive'>('all');
  const [filtroValidacion, setFiltroValidacion] = useState<'all' | 'existente' | 'no_existente' | 'repetida'>('all');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CobroCofersaCuenta | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CobroCofersaCuenta | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const { organizaciones, paises, companias, centrosCostos, organizacionesMap, paisesMap, companiasMap, centrosCostosMap } = useUbicaciones();
  const { isSuperAdmin, userScope, canEdit, canDelete } = usePermissions();
  const canWrite = canEdit;

  const fetchData = useCallback(async () => {
    setLoading(true);
    let cuentasQuery = supabase.from('cobros_cofersa_cuentas').select('*');
    if (!isSuperAdmin && userScope.pais_id) {
      cuentasQuery = cuentasQuery.eq('pais_id', userScope.pais_id);
    } else if (!isSuperAdmin && userScope.compania_id) {
      cuentasQuery = cuentasQuery.eq('compania_id', userScope.compania_id);
    } else if (!isSuperAdmin && userScope.organizacion_id) {
      cuentasQuery = cuentasQuery.eq('organizacion_id', userScope.organizacion_id);
    }
    cuentasQuery = cuentasQuery.order('cuenta', { ascending: true });
    const [cuentasRes, catRes] = await Promise.all([
      cuentasQuery,
      supabase.from('catalogo_gyp').select('id, cuenta, descripcion').eq('activa', true),
    ]);
    if (cuentasRes.data) setCuentas(cuentasRes.data as CobroCofersaCuenta[]);
    if (catRes.data) setCatalogoGyp(catRes.data as CatalogoItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Mapa de cuentas del catálogo GYP para validación rápida
  const catalogoMap = useMemo(() => {
    const map = new Map<string, CatalogoItem>();
    catalogoGyp.forEach((c) => map.set(c.cuenta, c));
    return map;
  }, [catalogoGyp]);

  // Detectar cuentas repetidas (misma cuenta, distintas descripciones de cobro)
  const cuentasRepetidas = useMemo(() => {
    const count = new Map<string, number>();
    cuentas.forEach((c) => {
      count.set(c.cuenta, (count.get(c.cuenta) || 0) + 1);
    });
    return count;
  }, [cuentas]);

  const filtered = useMemo(() => {
    return cuentas.filter((c) => {
      const matchesSearch =
        !search ||
        c.cuenta.toLowerCase().includes(search.toLowerCase()) ||
        c.descripcion_cobro.toLowerCase().includes(search.toLowerCase());
      const matchesEstado =
        filtroEstado === 'all' ||
        (filtroEstado === 'active' && c.activa) ||
        (filtroEstado === 'inactive' && !c.activa);
      const gypItem = catalogoMap.get(c.cuenta);
      const isExistente = !!gypItem;
      const isRepetida = (cuentasRepetidas.get(c.cuenta) || 0) > 1;
      const matchesValidacion =
        filtroValidacion === 'all' ||
        (filtroValidacion === 'existente' && isExistente && !isRepetida) ||
        (filtroValidacion === 'no_existente' && !isExistente) ||
        (filtroValidacion === 'repetida' && isRepetida);
      return matchesSearch && matchesEstado && matchesValidacion;
    });
  }, [cuentas, search, filtroEstado, filtroValidacion, catalogoMap, cuentasRepetidas]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = useMemo(() => {
    const total = cuentas.length;
    const activas = cuentas.filter((c) => c.activa).length;
    const inactivas = total - activas;
    const existentes = cuentas.filter((c) => catalogoMap.has(c.cuenta)).length;
    const repetidas = Array.from(cuentasRepetidas.entries()).filter(([, count]) => count > 1).length;
    const noExistentes = total - existentes;
    return { total, activas, inactivas, existentes, noExistentes, repetidas };
  }, [cuentas, catalogoMap, cuentasRepetidas]);

  // Importar Excel del maestro (2 columnas: Cuenta + Descripción)
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress('Leyendo archivo...');
    try {
      const xlsx = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

      const getVal = (row: Record<string, unknown>, ...keys: string[]) => {
        for (const key of keys) {
          if (key in row && row[key] !== '' && row[key] !== null && row[key] !== undefined) {
            return row[key];
          }
        }
        return '';
      };

      const toInsert = json
        .map((row) => {
          const cuenta = String(
            getVal(row, 'Cuenta', 'cuenta', 'CUENTA', 'Codigo', 'codigo', 'Código', 'CODE', 'Account') || ''
          ).trim();
          const descripcion = String(
            getVal(row, 'Descripción', 'Descripcion', 'descripcion', 'DESCRIPCION', 'Desc', 'DESC', 'Nombre', 'NOMBRE') || ''
          ).trim();
          if (!cuenta || !descripcion) return null;
          return {
            cuenta,
            descripcion_cobro: descripcion,
            activa: true,
          };
        })
        .filter(Boolean) as { cuenta: string; descripcion_cobro: string; activa: boolean }[];

      if (toInsert.length === 0) {
        addToast('warning', 'No se encontraron registros válidos. Verificá que las columnas tengan Cuenta y Descripción.');
        return;
      }

      const BATCH_SIZE = 500;
      let imported = 0;
      let failed = 0;
      let duplicados = 0;

      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        setImportProgress(`Importando ${Math.min(i + batch.length, toInsert.length)} de ${toInsert.length} registros...`);
        const { error } = await supabase.from('cobros_cofersa_cuentas').upsert(batch, { onConflict: 'cuenta,descripcion_cobro' });
        if (error) {
          if (error.message.includes('duplicate') || error.code === '23505') {
            duplicados += batch.length;
          } else {
            failed += batch.length;
          }
          console.error('Error en batch:', error);
        } else {
          imported += batch.length;
        }
      }

      const msgs: string[] = [];
      if (imported > 0) msgs.push(`${imported} importadas`);
      if (duplicados > 0) msgs.push(`${duplicados} duplicadas`);
      if (failed > 0) msgs.push(`${failed} fallaron`);
      addToast('success', msgs.join(', ') || 'Importación completada');
      fetchData();
    } catch (err) {
      addToast('error', 'Error al importar: ' + (err as Error).message);
    } finally {
      setImportProgress(null);
      e.target.value = '';
    }
  };

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      if (editing) {
        const { error } = await supabase.from('cobros_cofersa_cuentas').update(formData).eq('id', editing.id);
        if (error) throw error;

        // Log historial: actualización
        const cambiosList: string[] = [];
        const campos = ['cuenta', 'descripcion_cobro'];
        campos.forEach((campo) => {
          const oldVal = (editing as Record<string, unknown>)[campo];
          const newVal = formData[campo];
          if (String(oldVal ?? '') !== String(newVal ?? '')) {
            cambiosList.push(`${campo}: '${oldVal ?? '-'}' → '${newVal ?? '-'}'`);
          }
        });
        if (cambiosList.length === 0) cambiosList.push('Sin cambios detectados');

        await supabase.from('cobros_cofersa_cuentas_historico').insert({
          cuenta_cobro_id: editing.id,
          cuenta: String(formData.cuenta || editing.cuenta),
          descripcion_cobro: String(formData.descripcion_cobro || editing.descripcion_cobro),
          accion: 'actualizacion',
          cambios: cambiosList.join('; '),
          resumen: `Cuenta de cobro ${formData.cuenta || editing.cuenta} actualizada`,
        });

        addToast('success', 'Cuenta de cobro actualizada');
      } else {
        const { data: inserted, error } = await supabase.from('cobros_cofersa_cuentas').insert(formData).select('id').single();
        if (error) throw error;

        // Log historial: creación
        if (inserted) {
          await supabase.from('cobros_cofersa_cuentas_historico').insert({
            cuenta_cobro_id: inserted.id,
            cuenta: String(formData.cuenta || ''),
            descripcion_cobro: String(formData.descripcion_cobro || ''),
            accion: 'creacion',
            resumen: `Cuenta de cobro ${formData.cuenta} creada`,
          });
        }

        addToast('success', 'Cuenta de cobro creada');
      }
      setModalOpen(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleDelete = async (item: CobroCofersaCuenta) => {
    try {
      // Log historial: eliminación (antes de borrar)
      await supabase.from('cobros_cofersa_cuentas_historico').insert({
        cuenta_cobro_id: item.id,
        cuenta: item.cuenta,
        descripcion_cobro: item.descripcion_cobro,
        accion: 'eliminacion',
        resumen: `Cuenta de cobro ${item.cuenta} eliminada`,
      });

      const { error } = await supabase.from('cobros_cofersa_cuentas').delete().eq('id', item.id);
      if (error) throw error;
      addToast('success', 'Cuenta de cobro eliminada');
      setConfirmDelete(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const toggleActiva = async (item: CobroCofersaCuenta) => {
    try {
      const nuevoEstado = !item.activa;
      const { error } = await supabase.from('cobros_cofersa_cuentas').update({ activa: nuevoEstado }).eq('id', item.id);
      if (error) throw error;

      // Log historial: cambio de estado
      await supabase.from('cobros_cofersa_cuentas_historico').insert({
        cuenta_cobro_id: item.id,
        cuenta: item.cuenta,
        descripcion_cobro: item.descripcion_cobro,
        accion: 'actualizacion',
        cambios: `activa: '${item.activa}' → '${nuevoEstado}'`,
        resumen: `Cuenta de cobro ${item.cuenta} ${nuevoEstado ? 'activada' : 'desactivada'}`,
      });

      addToast('success', `Cuenta ${nuevoEstado ? 'activada' : 'desactivada'}`);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Total Cuentas</p>
          <p className="text-xl font-bold text-foreground-950">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Activas</p>
          <p className="text-xl font-bold text-primary-500">{stats.activas}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Inactivas</p>
          <p className="text-xl font-bold text-foreground-700">{stats.inactivas}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">En Catálogo GYP</p>
          <p className="text-xl font-bold text-emerald-600">{stats.existentes}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">No en GYP</p>
          <p className="text-xl font-bold text-amber-600">{stats.noExistentes}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Repetidas</p>
          <p className="text-xl font-bold text-rose-600">{stats.repetidas}</p>
        </div>
      </div>

      {/* Actions + Filters */}
      <div className="rounded-xl bg-background-50 p-4 border border-background-200 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-700 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar por cuenta o descripción..."
              className="w-full rounded-lg border border-background-200 bg-background-100 py-2 pl-10 pr-4 text-sm text-foreground-950 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => { setFiltroEstado(e.target.value as typeof filtroEstado); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[140px]"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
          <select
            value={filtroValidacion}
            onChange={(e) => { setFiltroValidacion(e.target.value as typeof filtroValidacion); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[160px]"
          >
            <option value="all">Todas las validaciones</option>
            <option value="existente">Existente en GYP</option>
            <option value="no_existente">No existe en GYP</option>
            <option value="repetida">Repetida</option>
          </select>
          <div className="flex gap-2 ml-auto">
            {canWrite && (
              <>
                <label className="inline-flex items-center gap-2 rounded-lg bg-foreground-950 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-foreground-900 cursor-pointer transition-colors whitespace-nowrap">
                  <i className="ri-file-upload-line w-5 h-5 flex items-center justify-center"></i>
                  {importProgress || 'Importar Excel'}
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={!!importProgress} />
                </label>
                <button
                  onClick={() => { setEditing(null); setModalOpen(true); }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
                  Nueva Cuenta
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200 text-left text-foreground-700">
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Cuenta</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Descripción Cobro</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Descripción GYP</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">En GYP</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Repetida</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Org.</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">País</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Cía.</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">CC</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Estado</th>
                {canWrite && <th className="py-3 pr-4 font-medium whitespace-nowrap">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-background-100">
                    {Array.from({ length: canWrite ? 9 : 8 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4"><div className="h-4 bg-background-200 rounded animate-pulse w-24"></div></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 11 : 10} className="py-8 text-center text-foreground-600">
                    No se encontraron cuentas configuradas
                  </td>
                </tr>
              ) : (
                paginated.map((item) => {
                  const gypItem = catalogoMap.get(item.cuenta);
                  const isRepetida = (cuentasRepetidas.get(item.cuenta) || 0) > 1;
                  return (
                    <tr key={item.id} className="border-b border-background-100 hover:bg-background-100/70">
                      <td className="py-3 pr-4 font-medium text-foreground-950 whitespace-nowrap font-mono text-xs">{item.cuenta}</td>
                      <td className="py-3 pr-4 text-foreground-900 min-w-[200px]">{item.descripcion_cobro}</td>
                      <td className="py-3 pr-4 text-foreground-700 min-w-[200px]">
                        {gypItem ? (
                          <span className="text-foreground-700">{gypItem.descripcion}</span>
                        ) : (
                          <span className="text-foreground-400 italic">No existe en GYP</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {gypItem ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                            <i className="ri-check-line"></i> Sí
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                            <i className="ri-close-line"></i> No
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {isRepetida ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700">
                            <i className="ri-error-warning-line"></i> Repetida ({cuentasRepetidas.get(item.cuenta)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-background-100 text-foreground-700">
                            <i className="ri-check-line"></i> Única
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">
                        {organizacionesMap.get(item.organizacion_id || '') || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">
                        {paisesMap.get(item.pais_id || '') || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">
                        {companiasMap.get(item.compania_id || '') || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">
                        {centrosCostosMap.get(item.centro_costo_id || '') || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleActiva(item)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                            item.activa
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-background-100 text-foreground-700 hover:bg-background-200'
                          }`}
                          title={item.activa ? 'Haz clic para desactivar' : 'Haz clic para activar'}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${item.activa ? 'bg-emerald-500' : 'bg-foreground-400'}`}></span>
                          {item.activa ? 'Activa' : 'Inactiva'}
                        </button>
                      </td>
                      {canWrite && (
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setEditing(item); setModalOpen(true); }}
                              className="rounded-md p-1.5 text-foreground-700 hover:bg-background-100 hover:text-foreground-950"
                              title="Editar"
                            >
                              <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                            </button>
                            <button
                              onClick={() => setConfirmDelete(item)}
                              className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                              title="Eliminar"
                            >
                              <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-foreground-700">
              Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-lg border border-background-200 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100 disabled:opacity-50">Anterior</button>
              <span className="flex items-center px-2 text-sm text-foreground-700">Página {page + 1} de {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-lg border border-background-200 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100 disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Cuenta */}
      {modalOpen && (
        <CuentaCobroModal
          item={editing}
          organizaciones={organizaciones}
          paises={paises}
          companias={companias}
          centrosCostos={centrosCostos}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <i className="ri-delete-bin-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Confirmar eliminación</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              ¿Eliminar <strong className="text-slate-900">{confirmDelete.descripcion_cobro || confirmDelete.cuenta}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)} className="rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CuentaCobroModal({ item, organizaciones, paises, companias, centrosCostos, onClose, onSave }: { item: CobroCofersaCuenta | null; organizaciones: Organizacion[]; paises: Pais[]; companias: Compania[]; centrosCostos: CentroCosto[]; onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    cuenta: item?.cuenta || '',
    descripcion_cobro: item?.descripcion_cobro || '',
    activa: item?.activa ?? true,
    pais_id: item?.pais_id || '',
    centro_costo_id: item?.centro_costo_id || '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{item ? 'Editar Cuenta de Cobro' : 'Nueva Cuenta de Cobro'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta *</label>
            <input type="text" value={form.cuenta} onChange={(e) => setForm({ ...form, cuenta: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="Ej: 6.1.1.12.1.001" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción para Cobro *</label>
            <input type="text" value={form.descripcion_cobro} onChange={(e) => setForm({ ...form, descripcion_cobro: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="Ej: Diferencial cambiario" required />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="activa-cuenta" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            <label htmlFor="activa-cuenta" className="text-sm text-slate-700">Activa</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
              <select value={form.pais_id} onChange={(e) => setForm({ ...form, pais_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar país...</option>
                {paises.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Centro de Costo</label>
              <select value={form.centro_costo_id} onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar centro de costo...</option>
                {centrosCostos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// TAB: REGISTROS DE COBROS
// ==========================================
function RegistrosTab() {
  const [cobros, setCobros] = useState<CobroCofersa[]>([]);
  const [cuentasCobro, setCuentasCobro] = useState<CobroCofersaCuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroAnio, setFiltroAnio] = useState<number | ''>('');
  const [filtroMes, setFiltroMes] = useState<number | ''>('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroCuenta, setFiltroCuenta] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'active' | 'inactive'>('all');
  const [filtroOrganizacion, setFiltroOrganizacion] = useState('');
  const [filtroPais, setFiltroPais] = useState('');
  const [filtroCompania, setFiltroCompania] = useState('');
  const [filtroCentroCosto, setFiltroCentroCosto] = useState('');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CobroCofersa | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CobroCofersa | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const { organizaciones, paises, companias, centrosCostos, organizacionesMap, paisesMap, companiasMap, centrosCostosMap } = useUbicaciones();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [cobRes, ccRes] = await Promise.all([
      supabase.from('cobros_cofersa').select('*').order('created_at', { ascending: false }),
      supabase.from('cobros_cofersa_cuentas').select('*').eq('activa', true).order('cuenta', { ascending: true }),
    ]);
    if (cobRes.data) setCobros(cobRes.data as CobroCofersa[]);
    if (ccRes.data) setCuentasCobro(ccRes.data as CobroCofersaCuenta[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return cobros.filter((c) => {
      const matchesSearch = !search || (c.descripcion_cobro && c.descripcion_cobro.toLowerCase().includes(search.toLowerCase())) || c.cuenta.toLowerCase().includes(search.toLowerCase());
      const matchesAnio = filtroAnio === '' || c.anio === filtroAnio;
      const matchesMes = filtroMes === '' || c.mes === filtroMes;
      const matchesCat = !filtroCategoria || c.categoria === filtroCategoria;
      const matchesCuenta = !filtroCuenta || c.cuenta === filtroCuenta;
      const matchesEstado = filtroEstado === 'all' || (filtroEstado === 'active' && c.activa) || (filtroEstado === 'inactive' && !c.activa);
      const matchesOrganizacion = !filtroOrganizacion || c.organizacion_id === filtroOrganizacion;
      const matchesPais = !filtroPais || c.pais_id === filtroPais;
      const matchesCompania = !filtroCompania || c.compania_id === filtroCompania;
      const matchesCentroCosto = !filtroCentroCosto || c.centro_costo_id === filtroCentroCosto;
      return matchesSearch && matchesAnio && matchesMes && matchesCat && matchesCuenta && matchesEstado && matchesOrganizacion && matchesPais && matchesCompania && matchesCentroCosto;
    });
  }, [cobros, search, filtroAnio, filtroMes, filtroCategoria, filtroCuenta, filtroEstado, filtroOrganizacion, filtroPais, filtroCompania, filtroCentroCosto]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const resumen = useMemo(() => {
    const periodo = filtered.filter((c) => (filtroAnio === '' || c.anio === filtroAnio) && (filtroMes === '' || c.mes === filtroMes));
    const cats = ['Gastos varios', 'Suministros', 'Fletes', 'Personal', 'Alquileres'];
    const porCat: Record<string, number> = {};
    cats.forEach((cat) => { porCat[cat] = periodo.filter((c) => c.categoria === cat).reduce((s, c) => s + (c.monto_usd || 0), 0); });
    const totalUSD = Object.values(porCat).reduce((a, b) => a + b, 0);
    const totalCRC = periodo.reduce((s, c) => s + (c.monto_local || 0), 0);
    const margen5 = totalUSD * 1.05;
    return { porCat, totalUSD, totalCRC, margen5 };
  }, [filtered, filtroAnio, filtroMes]);

  const cuentasUnicas = useMemo(() => [...new Set(cobros.map((c) => c.cuenta))].sort(), [cobros]);
  const aniosUnicos = useMemo(() => [...new Set(cobros.map((c) => c.anio))].sort((a, b) => b - a), [cobros]);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress('Cargando...');
    try {
      const xlsx = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = xlsx.utils.sheet_to_json(sheet) as Record<string, unknown>[];

      const parseDate = (val: unknown): string | null => {
        if (!val) return null;
        if (typeof val === 'string') {
          if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val;
          const d = new Date(val);
          if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
        }
        if (typeof val === 'number') {
          const epoch = new Date(1899, 11, 30);
          const d = new Date(epoch.getTime() + val * 86400000);
          return d.toISOString().split('T')[0];
        }
        return null;
      };

      const toInsert = json.map((row) => {
        const cuenta = String(row['cuenta'] || row['Cuenta'] || '');
        const anio = Number(row['anio'] || row['Año'] || new Date().getFullYear());
        const mes = Number(row['mes'] || row['Mes'] || 1);
        const desc = String(row['descripcion_cobro'] || row['Descripción'] || '');
        return {
          cuenta,
          descripcion_cobro: desc,
          anio,
          mes,
          fecha_factura: parseDate(row['fecha_factura'] || row['Fecha Factura']),
          monto_usd: row['monto_usd'] || row['Monto USD'] || 0,
          tipo_cambio: row['tipo_cambio'] || row['Tipo Cambio'] || 0,
          monto_local: row['monto_local'] || row['Monto Local'] || 0,
          categoria: String(row['categoria'] || row['Categoría'] || 'Otros'),
          activa: row['activa'] === true || row['activa'] === 'true' || row['Activa'] === true || row['Activa'] === 'true' || true,
        };
      }).filter((r) => r.cuenta && r.descripcion_cobro);

      setImportProgress(`Importando ${toInsert.length} registros...`);
      const { error } = await supabase.from('cobros_cofersa').upsert(toInsert, { onConflict: 'cuenta,anio,mes,descripcion_cobro' });
      if (error) throw error;
      addToast('success', `${toInsert.length} cobros importados`);
      fetchData();
    } catch (err) {
      addToast('error', 'Error al importar: ' + (err as Error).message);
    } finally {
      setImportProgress(null);
      e.target.value = '';
    }
  };

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      const payload = { ...formData };
      if (payload.monto_usd && payload.tipo_cambio && !payload.monto_local) {
        payload.monto_local = Number(payload.monto_usd) * Number(payload.tipo_cambio);
      }
      if (editing) {
        const { error } = await supabase.from('cobros_cofersa').update(payload).eq('id', editing.id);
        if (error) throw error;

        // Log historial: actualización
        const cambiosList: string[] = [];
        const campos = ['cuenta', 'descripcion_cobro', 'anio', 'mes', 'monto_usd', 'tipo_cambio', 'monto_local', 'categoria'];
        campos.forEach((campo) => {
          const oldVal = (editing as Record<string, unknown>)[campo];
          const newVal = payload[campo];
          if (String(oldVal ?? '') !== String(newVal ?? '')) {
            cambiosList.push(`${campo}: '${oldVal ?? '-'}' → '${newVal ?? '-'}'`);
          }
        });
        if (cambiosList.length === 0) cambiosList.push('Sin cambios detectados');

        await supabase.from('cobros_cofersa_historico').insert({
          cobro_id: editing.id,
          cuenta: String(payload.cuenta || editing.cuenta),
          descripcion_cobro: String(payload.descripcion_cobro || editing.descripcion_cobro || ''),
          anio: Number(payload.anio || editing.anio),
          mes: Number(payload.mes || editing.mes),
          accion: 'actualizacion',
          cambios: cambiosList.join('; '),
          resumen: `Cobro ${payload.cuenta || editing.cuenta} (${MESES[Number(payload.mes || editing.mes) - 1]} ${payload.anio || editing.anio}) actualizado`,
        });

        addToast('success', 'Cobro actualizado');
      } else {
        const { data: inserted, error } = await supabase.from('cobros_cofersa').insert(payload).select('id').single();
        if (error) throw error;

        // Log historial: creación
        if (inserted) {
          await supabase.from('cobros_cofersa_historico').insert({
            cobro_id: inserted.id,
            cuenta: String(payload.cuenta || ''),
            descripcion_cobro: String(payload.descripcion_cobro || ''),
            anio: Number(payload.anio),
            mes: Number(payload.mes),
            accion: 'creacion',
            resumen: `Cobro ${payload.cuenta} (${MESES[Number(payload.mes) - 1]} ${payload.anio}) creado`,
          });
        }

        addToast('success', 'Cobro creado');
      }
      setModalOpen(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleDelete = async (item: CobroCofersa) => {
    try {
      // Log historial: eliminación (antes de borrar)
      await supabase.from('cobros_cofersa_historico').insert({
        cobro_id: item.id,
        cuenta: item.cuenta,
        descripcion_cobro: item.descripcion_cobro || '',
        anio: item.anio,
        mes: item.mes,
        accion: 'eliminacion',
        resumen: `Cobro ${item.cuenta} (${MESES[item.mes - 1]} ${item.anio}) eliminado`,
      });

      const { error } = await supabase.from('cobros_cofersa').delete().eq('id', item.id);
      if (error) throw error;
      addToast('success', 'Cobro eliminado');
      setConfirmDelete(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="rounded-xl bg-background-50 p-4 border border-background-200">
        <h3 className="text-sm font-semibold text-foreground-950 mb-3">Resumen por Período</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          {(['Gastos varios', 'Suministros', 'Fletes', 'Personal', 'Alquileres'] as string[]).map((cat) => (
            <div key={cat} className="rounded-lg bg-background-100 p-3">
              <p className="text-xs text-foreground-700">{cat}</p>
              <p className="text-sm font-semibold text-foreground-950">{formatUSD(resumen.porCat[cat] || 0)}</p>
            </div>
          ))}
          <div className="rounded-lg bg-primary-100 p-3">
            <p className="text-xs text-primary-700">TOTAL USD</p>
            <p className="text-sm font-semibold text-primary-900">{formatUSD(resumen.totalUSD)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-background-100 p-3">
            <p className="text-xs text-foreground-700">Total Colones</p>
            <p className="text-sm font-semibold text-foreground-950">{formatCRC(resumen.totalCRC)}</p>
          </div>
          <div className="rounded-lg bg-background-100 p-3">
            <p className="text-xs text-foreground-700">Margen 5%</p>
            <p className="text-sm font-semibold text-foreground-950">{formatUSD(resumen.margen5)}</p>
          </div>
          <div className="rounded-lg bg-primary-100 p-3">
            <p className="text-xs text-primary-700">Ingreso a Facturar</p>
            <p className="text-sm font-semibold text-primary-900">{formatUSD(resumen.margen5)}</p>
          </div>
        </div>
      </div>

      {/* Filters + Actions */}
      <div className="rounded-xl bg-background-50 p-4 border border-background-200 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-700 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar..."
              className="w-full rounded-lg border border-background-200 bg-background-100 py-2 pl-10 pr-4 text-sm text-foreground-950 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <select value={filtroAnio} onChange={(e) => { setFiltroAnio(e.target.value === '' ? '' : Number(e.target.value)); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500">
            <option value="">Todos los años</option>
            {aniosUnicos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filtroMes} onChange={(e) => { setFiltroMes(e.target.value === '' ? '' : Number(e.target.value)); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500">
            <option value="">Todos los meses</option>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={filtroCategoria} onChange={(e) => { setFiltroCategoria(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500">
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroCuenta} onChange={(e) => { setFiltroCuenta(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500">
            <option value="">Todas las cuentas</option>
            {cuentasUnicas.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value as typeof filtroEstado); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500">
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <select value={filtroOrganizacion} onChange={(e) => { setFiltroOrganizacion(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500 min-w-[140px]">
            <option value="">Todas las organizaciones</option>
            {organizaciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          <select value={filtroPais} onChange={(e) => { setFiltroPais(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500 min-w-[140px]">
            <option value="">Todos los países</option>
            {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
          </select>
          <select value={filtroCompania} onChange={(e) => { setFiltroCompania(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500 min-w-[140px]">
            <option value="">Todas las compañías</option>
            {companias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select value={filtroCentroCosto} onChange={(e) => { setFiltroCentroCosto(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500 min-w-[160px]">
            <option value="">Todos los centros de costo</option>
            {centrosCostos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <div className="flex gap-2 ml-auto">
            {isAdmin && (
              <>
                <label className="inline-flex items-center gap-2 rounded-lg bg-foreground-950 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-foreground-900 cursor-pointer transition-colors whitespace-nowrap">
                  <i className="ri-file-upload-line w-5 h-5 flex items-center justify-center"></i>
                  {importProgress || 'Importar Excel'}
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={!!importProgress} />
                </label>
                <button
                  onClick={() => { setEditing(null); setModalOpen(true); }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i> Nuevo Cobro
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200 text-left text-foreground-700">
                <th className="py-3 pr-4 font-medium">Período</th>
                <th className="py-3 pr-4 font-medium">Cuenta</th>
                <th className="py-3 pr-4 font-medium">Descripción</th>
                <th className="py-3 pr-4 font-medium">Categoría</th>
                <th className="py-3 pr-4 font-medium">Monto USD</th>
                <th className="py-3 pr-4 font-medium">Tipo Cambio</th>
                <th className="py-3 pr-4 font-medium">Monto Local</th>
                <th className="py-3 pr-4 font-medium">Org.</th>
                <th className="py-3 pr-4 font-medium">País</th>
                <th className="py-3 pr-4 font-medium">Cía.</th>
                <th className="py-3 pr-4 font-medium">CC</th>
                <th className="py-3 pr-4 font-medium">Estado</th>
                {isAdmin && <th className="py-3 pr-4 font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-background-100">
                    {Array.from({ length: isAdmin ? 13 : 12 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4"><div className="h-4 bg-background-200 rounded animate-pulse w-20"></div></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr><td colSpan={isAdmin ? 13 : 12} className="py-8 text-center text-foreground-600">No se encontraron resultados</td></tr>
              ) : (
                paginated.map((item) => (
                  <tr key={item.id} className="border-b border-background-100 hover:bg-background-100/70">
                    <td className="py-3 pr-4 text-foreground-950">{MESES[item.mes - 1]?.substring(0, 3)} {item.anio}</td>
                    <td className="py-3 pr-4 font-medium text-foreground-950 font-mono text-xs">{item.cuenta}</td>
                    <td className="py-3 pr-4 text-foreground-900">{item.descripcion_cobro || '-'}</td>
                    <td className="py-3 pr-4 text-foreground-700">{item.categoria}</td>
                    <td className="py-3 pr-4 text-foreground-950">{formatUSD(item.monto_usd || 0)}</td>
                    <td className="py-3 pr-4 text-foreground-700">{item.tipo_cambio}</td>
                    <td className="py-3 pr-4 text-foreground-950">{formatCRC(item.monto_local || 0)}</td>
                    <td className="py-3 pr-4 text-foreground-700 text-xs">
                      {organizacionesMap.get(item.organizacion_id || '') || <span className="text-foreground-400 italic">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-foreground-700 text-xs">
                      {paisesMap.get(item.pais_id || '') || <span className="text-foreground-400 italic">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-foreground-700 text-xs">
                      {companiasMap.get(item.compania_id || '') || <span className="text-foreground-400 italic">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-foreground-700 text-xs">
                      {centrosCostosMap.get(item.centro_costo_id || '') || <span className="text-foreground-400 italic">—</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${item.activa ? 'bg-emerald-100 text-emerald-700' : 'bg-background-100 text-foreground-700'}`}>
                        {item.activa ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="py-3 pr-4">
                        <div className="flex gap-2">
                          <button onClick={() => { setEditing(item); setModalOpen(true); }} className="rounded-md p-1.5 text-foreground-700 hover:bg-background-100 hover:text-foreground-950" title="Editar">
                            <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                          </button>
                          <button onClick={() => setConfirmDelete(item)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50" title="Eliminar">
                            <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-foreground-700">Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-lg border border-background-200 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100 disabled:opacity-50">Anterior</button>
              <span className="flex items-center px-2 text-sm text-foreground-700">Página {page + 1} de {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-lg border border-background-200 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100 disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Cobro */}
      {modalOpen && (
        <CobroModal
          item={editing}
          cuentasCobro={cuentasCobro}
          organizaciones={organizaciones}
          paises={paises}
          companias={companias}
          centrosCostos={centrosCostos}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <i className="ri-delete-bin-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Confirmar eliminación</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              ¿Eliminar <strong className="text-slate-900">{confirmDelete.descripcion_cobro || confirmDelete.cuenta}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)} className="rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CobroModal({ item, cuentasCobro, organizaciones, paises, companias, centrosCostos, onClose, onSave }: { item: CobroCofersa | null; cuentasCobro: CobroCofersaCuenta[]; organizaciones: Organizacion[]; paises: Pais[]; companias: Compania[]; centrosCostos: CentroCosto[]; onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    cuenta: item?.cuenta || '',
    descripcion_cobro: item?.descripcion_cobro || '',
    anio: item?.anio || new Date().getFullYear(),
    mes: item?.mes || 1,
    fecha_factura: item?.fecha_factura || '',
    monto_usd: item?.monto_usd || '',
    tipo_cambio: item?.tipo_cambio || '',
    monto_local: item?.monto_local || '',
    categoria: item?.categoria || 'Gastos varios',
    activa: item?.activa ?? true,
    pais_id: item?.pais_id || '',
    centro_costo_id: item?.centro_costo_id || '',
  });
  const [cuentaSearch, setCuentaSearch] = useState('');

  const filteredCuentas = useMemo(() => {
    if (!cuentaSearch) return cuentasCobro.slice(0, 10);
    return cuentasCobro.filter((c) => c.cuenta.toLowerCase().includes(cuentaSearch.toLowerCase()) || c.descripcion_cobro.toLowerCase().includes(cuentaSearch.toLowerCase())).slice(0, 10);
  }, [cuentaSearch, cuentasCobro]);

  const calcMontoLocal = () => {
    const usd = Number(form.monto_usd) || 0;
    const tc = Number(form.tipo_cambio) || 0;
    if (usd && tc) {
      setForm((f) => ({ ...f, monto_local: Number((usd * tc).toFixed(2)) }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{item ? 'Editar Cobro' : 'Nuevo Cobro'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta *</label>
            <input
              type="text"
              value={cuentaSearch}
              onChange={(e) => setCuentaSearch(e.target.value)}
              placeholder={form.cuenta || 'Buscar cuenta de cobro...'}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            {cuentaSearch && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-40 overflow-y-auto">
                {filteredCuentas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setForm({ ...form, cuenta: c.cuenta, descripcion_cobro: c.descripcion_cobro }); setCuentaSearch(''); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-mono text-xs text-slate-500">{c.cuenta}</span> — {c.descripcion_cobro}
                  </button>
                ))}
                {filteredCuentas.length === 0 && <div className="px-3 py-2 text-sm text-slate-500">Sin resultados</div>}
              </div>
            )}
            {form.cuenta && <p className="mt-1 text-xs text-emerald-700 font-medium">Cuenta seleccionada: {form.cuenta}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <input type="text" value={form.descripcion_cobro} onChange={(e) => setForm({ ...form, descripcion_cobro: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Año</label>
              <input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mes</label>
              <select value={form.mes} onChange={(e) => setForm({ ...form, mes: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Factura</label>
            <input type="date" value={form.fecha_factura} onChange={(e) => setForm({ ...form, fecha_factura: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto USD</label>
              <input type="number" step="0.01" value={form.monto_usd} onChange={(e) => setForm({ ...form, monto_usd: e.target.value })} onBlur={calcMontoLocal} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo Cambio</label>
              <input type="number" step="0.01" value={form.tipo_cambio} onChange={(e) => setForm({ ...form, tipo_cambio: e.target.value })} onBlur={calcMontoLocal} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monto Local</label>
              <input type="number" step="0.01" value={form.monto_local} onChange={(e) => setForm({ ...form, monto_local: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="activa-cobro" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            <label htmlFor="activa-cobro" className="text-sm text-slate-700">Activo</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Organización</label>
              <select value={form.organizacion_id} onChange={(e) => setForm({ ...form, organizacion_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar organización...</option>
                {organizaciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
              <select value={form.pais_id} onChange={(e) => setForm({ ...form, pais_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar país...</option>
                {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Compañía</label>
              <select value={form.compania_id} onChange={(e) => setForm({ ...form, compania_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar compañía...</option>
                {companias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Centro de Costo</label>
              <select value={form.centro_costo_id} onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar centro de costo...</option>
                {centrosCostos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">Guardar</button>
        </div>
      </div>
    </div>
  );
}