import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { CatalogoItem, Organizacion, Pais, Compania, CentroCosto } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ConfirmModal } from '@/components/base/ConfirmModal';
import { CatalogoModal } from '@/pages/catalogo/components/CatalogoModal';
import { useUbicaciones } from '@/hooks/useUbicaciones';
import { usePermissions } from '@/hooks/usePermissions';

const PAGE_SIZE = 50;

export default function CatalogoPage() {
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtroClasificacion, setFiltroClasificacion] = useState('');
  const [filtroClasificacion1, setFiltroClasificacion1] = useState('');
  const [filtroClasificacion2, setFiltroClasificacion2] = useState('');
  const [filtroComercializadora, setFiltroComercializadora] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'active' | 'inactive'>('all');
  const [filtroOrganizacion, setFiltroOrganizacion] = useState('');
  const [filtroPais, setFiltroPais] = useState('');
  const [filtroCompania, setFiltroCompania] = useState('');
  const [filtroCentroCosto, setFiltroCentroCosto] = useState('');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogoItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CatalogoItem | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const { isAdmin, user } = useAuth();
  const { addToast } = useToast();
  const { organizaciones, paises, companias, centrosCostos, organizacionesMap, paisesMap, companiasMap, centrosCostosMap } = useUbicaciones();
  const { isSuperAdmin, userScope, canEdit, canDelete } = usePermissions();
  const canWrite = canEdit;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('catalogo_gyp')
        .select('*');
      // Scope filter
      if (!isSuperAdmin && userScope.pais_id) {
        query = query.eq('pais_id', userScope.pais_id);
      } else if (!isSuperAdmin && userScope.compania_id) {
        query = query.eq('compania_id', userScope.compania_id);
      } else if (!isSuperAdmin && userScope.organizacion_id) {
        query = query.eq('organizacion_id', userScope.organizacion_id);
      }
      const { data, error } = await query
        .order('orden_clasificacion', { ascending: true, nullsFirst: false })
        .order('cuenta', { ascending: true });
      if (error) {
        console.error('Supabase error:', error);
        setError(error.message);
        addToast('error', `Error al cargar catálogo: ${error.message}`);
      } else {
        setItems(data || []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      const msg = (err as Error).message;
      setError(msg);
      addToast('error', `Error inesperado: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [addToast, isSuperAdmin, userScope]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const clasificaciones = useMemo(() => [...new Set(items.map((i) => i.clasificacion).filter(Boolean))].sort(), [items]);
  const clasificaciones1 = useMemo(() => [...new Set(items.map((i) => i.clasificacion_1).filter(Boolean))].sort(), [items]);
  const clasificaciones2 = useMemo(() => [...new Set(items.map((i) => i.clasificacion_2).filter(Boolean))].sort(), [items]);
  const comercializadoras = useMemo(() => [...new Set(items.map((i) => i.comercializadora).filter(Boolean))].sort(), [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !search ||
        item.cuenta.toLowerCase().includes(search.toLowerCase()) ||
        item.descripcion.toLowerCase().includes(search.toLowerCase()) ||
        (item.clasificacion && item.clasificacion.toLowerCase().includes(search.toLowerCase()));
      const matchesClas = !filtroClasificacion || item.clasificacion === filtroClasificacion;
      const matchesClas1 = !filtroClasificacion1 || item.clasificacion_1 === filtroClasificacion1;
      const matchesClas2 = !filtroClasificacion2 || item.clasificacion_2 === filtroClasificacion2;
      const matchesCom = !filtroComercializadora || item.comercializadora === filtroComercializadora;
      const matchesEstado =
        filtroEstado === 'all' ||
        (filtroEstado === 'active' && item.activa) ||
        (filtroEstado === 'inactive' && !item.activa);
      const matchesOrganizacion = !filtroOrganizacion || item.organizacion_id === filtroOrganizacion;
      const matchesPais = !filtroPais || item.pais_id === filtroPais;
      const matchesCompania = !filtroCompania || item.compania_id === filtroCompania;
      const matchesCentroCosto = !filtroCentroCosto || item.centro_costo_id === filtroCentroCosto;
      return matchesSearch && matchesClas && matchesClas1 && matchesClas2 && matchesCom && matchesEstado && matchesOrganizacion && matchesPais && matchesCompania && matchesCentroCosto;
    });
  }, [items, search, filtroClasificacion, filtroClasificacion1, filtroClasificacion2, filtroComercializadora, filtroEstado, filtroOrganizacion, filtroPais, filtroCompania, filtroCentroCosto]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = {
    total: items.length,
    activas: items.filter((i) => i.activa).length,
    inactivas: items.filter((i) => !i.activa).length,
  };

  // --- DESCARGAR PLANTILLA ---
  const handleDownloadTemplate = async () => {
    try {
      const xlsx = await import('xlsx');
      const headers = [
        'Linea',
        'Grupo',
        'Cuenta',
        'Descripción',
        'Saldo Normal',
        'Comercializadora',
        'Balance / GyP',
        'Clasificación',
        'Clasificación 1',
        'Clasificación 2',
        'Orden Clasificacion',
        'Organización',
        'País',
        'Compañía',
        'Centro de Costo',
      ];
      const ws = xlsx.utils.aoa_to_sheet([headers]);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Catalogo GYP');
      const wbout = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plantilla_Catalogo_GYP.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      addToast('error', 'Error al generar plantilla: ' + (err as Error).message);
    }
  };

  // --- CARGADOR DE EXCEL ---
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

      // Buscador flexible de columnas
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
          // Buscamos por las columnas exactas del Excel del usuario
          const cuenta = String(
            getVal(
              row,
              'Cuenta',
              'cuenta',
              'CUENTA',
              'Codigo',
              'codigo',
              'Código',
              'CODIGO',
              'Code',
              'CODE',
            ) || '',
          ).trim();
          const descripcion = String(
            getVal(
              row,
              'Descripción',
              'Descripcion',
              'descripcion',
              'DESCRIPCION',
              'Desc',
              'DESC',
              'Nombre',
              'NOMBRE',
              'nombre',
            ) || '',
          ).trim();
          if (!cuenta || !descripcion) return null;

          const lineaRaw = getVal(row, 'Linea', 'Línea', 'linea', 'LINEA', 'Line', 'LINE');
          const grupoRaw = getVal(row, 'Grupo', 'grupo', 'GRUPO', 'Group', 'GROUP');
          const saldoNormal = String(
            getVal(row, 'Saldo Normal', 'Saldo_Normal', 'saldo_normal', 'Saldo', 'SALDO', 'SALDO_NORMAL') || '',
          ).trim();
          const comercializadora = String(
            getVal(row, 'Comercializadora', 'comercializadora', 'COMERCIALIZADORA', 'Comercial', 'COMERCIAL') || '',
          ).trim();
          const balanceGyp = String(
            getVal(row, 'Balance / GyP', 'Balance / GYP', 'Balance/GyP', 'Balance/GYP', 'balance_gyp', 'Balance', 'BALANCE') || '',
          ).trim();
          const clasificacion = String(
            getVal(
              row,
              'Clasificación',
              'Clasificacion',
              'clasificacion',
              'CLASIFICACION',
              'Clase',
              'CLASE',
              'Categoria',
              'CATEGORIA',
            ) || '',
          ).trim();
          const clasificacion1 = String(
            getVal(
              row,
              'Clasificación 1',
              'Clasificacion 1',
              'Clasificacion_1',
              'clasificacion_1',
              'CLASIFICACION_1',
              'Sub Clasificacion',
              'Sub Clasificación',
              'Subclasificacion',
              'Subclasificación',
            ) || '',
          ).trim();
          const clasificacion2 = String(
            getVal(
              row,
              'Clasificación 2',
              'Clasificacion 2',
              'Clasificacion_2',
              'clasificacion_2',
              'CLASIFICACION_2',
              'Sub Clasificacion 2',
              'Subclasificacion 2',
            ) || '',
          ).trim();
          const ordenRaw = getVal(
            row,
            'OrdenClasificacion',
            'Orden Clasificacion',
            'Orden Clasificación',
            'orden_clasificacion',
            'Orden_Clasificacion',
            'Orden',
            'ORDEN',
            'ORDER',
          );

          // Ubicación: buscar por nombre o código
          const orgNombre = String(getVal(row, 'Organización', 'Organizacion', 'organizacion', 'ORGANIZACION', 'Org', 'ORG') || '').trim();
          const paisNombre = String(getVal(row, 'País', 'Pais', 'pais', 'PAIS', 'País', 'Country', 'COUNTRY') || '').trim();
          const ciaNombre = String(getVal(row, 'Compañía', 'Compania', 'compania', 'COMPANIA', 'Cía', 'CIA', 'Cia', 'Company', 'COMPANY') || '').trim();
          const ccNombre = String(getVal(row, 'Centro de Costo', 'Centro Costo', 'centro_costo', 'CENTRO_COSTO', 'CC', 'cc', 'Cost Center', 'COST_CENTER') || '').trim();

          const orgId = orgNombre ? (organizaciones.find((o) => o.nombre.toLowerCase() === orgNombre.toLowerCase() || o.codigo.toLowerCase() === orgNombre.toLowerCase())?.id || null) : null;
          const paisId = paisNombre ? (paises.find((p) => p.nombre.toLowerCase() === paisNombre.toLowerCase() || p.codigo.toLowerCase() === paisNombre.toLowerCase())?.id || null) : null;
          const ciaId = ciaNombre ? (companias.find((c) => c.nombre.toLowerCase() === ciaNombre.toLowerCase() || c.codigo.toLowerCase() === ciaNombre.toLowerCase())?.id || null) : null;
          const ccId = ccNombre ? (centrosCostos.find((cc) => cc.nombre.toLowerCase() === ccNombre.toLowerCase() || cc.codigo.toLowerCase() === ccNombre.toLowerCase())?.id || null) : null;

          return {
            linea: lineaRaw !== '' ? Number(lineaRaw) : null,
            grupo: grupoRaw !== '' ? Number(grupoRaw) : null,
            cuenta,
            descripcion,
            saldo_normal: saldoNormal,
            comercializadora,
            balance_gyp: balanceGyp,
            clasificacion,
            clasificacion_1: clasificacion1,
            clasificacion_2: clasificacion2,
            orden_clasificacion: ordenRaw !== '' ? Number(ordenRaw) : null,
            activa: true,
            ...(orgId ? { organizacion_id: orgId } : {}),
            ...(paisId ? { pais_id: paisId } : {}),
            ...(ciaId ? { compania_id: ciaId } : {}),
            ...(ccId ? { centro_costo_id: ccId } : {}),
          };
        })
        .filter(Boolean) as Record<string, unknown>[];

      if (toInsert.length === 0) {
        addToast('warning', 'No se encontraron registros válidos. Verificá que las columnas tengan Cuenta y Descripción.');
        return;
      }

      const BATCH_SIZE = 500;
      let imported = 0;
      let failed = 0;

      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        setImportProgress(`Importando ${Math.min(i + batch.length, toInsert.length)} de ${toInsert.length} registros...`);
        const { error } = await supabase.from('catalogo_gyp').upsert(batch, { onConflict: 'cuenta' });
        if (error) {
          failed += batch.length;
          console.error('Error en batch:', error);
        } else {
          imported += batch.length;
        }
      }

      if (failed > 0) {
        addToast('error', `${imported} importadas, ${failed} fallaron.`);
      } else {
        addToast('success', `${imported} cuentas importadas/actualizadas`);
      }
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
        const { error } = await supabase.from('catalogo_gyp').update(formData).eq('id', editing.id);
        if (error) throw error;

        // Log historial: actualización
        const cambiosList: string[] = [];
        const campos = ['linea', 'grupo', 'cuenta', 'descripcion', 'saldo_normal', 'comercializadora', 'balance_gyp', 'clasificacion', 'clasificacion_1', 'clasificacion_2', 'orden_clasificacion'];
        campos.forEach((campo) => {
          const oldVal = (editing as Record<string, unknown>)[campo];
          const newVal = formData[campo];
          if (String(oldVal ?? '') !== String(newVal ?? '')) {
            cambiosList.push(`${campo}: '${oldVal ?? '-'}' → '${newVal ?? '-'}'`);
          }
        });
        if (cambiosList.length === 0) cambiosList.push('Sin cambios detectados');

        await supabase.from('catalogo_gyp_historico').insert({
          catalogo_id: editing.id,
          cuenta: String(formData.cuenta || editing.cuenta),
          descripcion: String(formData.descripcion || editing.descripcion),
          accion: 'actualizacion',
          cambios: cambiosList.join('; '),
          resumen: `Cuenta ${formData.cuenta || editing.cuenta} actualizada`,
        });

        addToast('success', 'Cuenta actualizada');
      } else {
        const { data: inserted, error } = await supabase.from('catalogo_gyp').insert(formData).select('id').single();
        if (error) throw error;

        // Log historial: creación
        if (inserted) {
          await supabase.from('catalogo_gyp_historico').insert({
            catalogo_id: inserted.id,
            cuenta: String(formData.cuenta || ''),
            descripcion: String(formData.descripcion || ''),
            accion: 'creacion',
            resumen: `Cuenta ${formData.cuenta} creada`,
          });
        }

        addToast('success', 'Cuenta creada');
      }
      setModalOpen(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleDelete = async (item: CatalogoItem) => {
    try {
      // Log historial: eliminación (antes de borrar para que sobreviva)
      await supabase.from('catalogo_gyp_historico').insert({
        catalogo_id: item.id,
        cuenta: item.cuenta,
        descripcion: item.descripcion,
        accion: 'eliminacion',
        resumen: `Cuenta ${item.cuenta} eliminada`,
      });

      const { error } = await supabase.from('catalogo_gyp').delete().eq('id', item.id);
      if (error) throw error;
      addToast('success', 'Cuenta eliminada');
      setConfirmDelete(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const toggleActiva = async (item: CatalogoItem) => {
    try {
      const nuevoEstado = !item.activa;
      const { error } = await supabase.from('catalogo_gyp').update({ activa: nuevoEstado }).eq('id', item.id);
      if (error) throw error;

      // Log historial: cambio de estado
      await supabase.from('catalogo_gyp_historico').insert({
        catalogo_id: item.id,
        cuenta: item.cuenta,
        descripcion: item.descripcion,
        accion: 'actualizacion',
        cambios: `activa: '${item.activa}' → '${nuevoEstado}'`,
        resumen: `Cuenta ${item.cuenta} ${nuevoEstado ? 'activada' : 'desactivada'}`,
      });

      addToast('success', `Cuenta ${nuevoEstado ? 'activada' : 'desactivada'}`);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Catálogo GYP</h1>
          <p className="text-sm text-slate-500">Gestión de cuentas contables</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <i className="ri-download-line w-5 h-5 flex items-center justify-center"></i>
                Descargar Plantilla
              </button>
              <label className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 cursor-pointer transition-colors whitespace-nowrap">
                <i className="ri-file-upload-line w-5 h-5 flex items-center justify-center"></i>
                {importProgress || 'Importar Excel'}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImportExcel}
                  disabled={!!importProgress}
                />
              </label>
              <button
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap"
              >
                <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
                Nueva Cuenta
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

      {/* Filtros */}
      <div className="rounded-xl bg-white p-4 border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Buscar por cuenta, descripción o clasificación..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <select
            value={filtroClasificacion}
            onChange={(e) => {
              setFiltroClasificacion(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[160px]"
          >
            <option value="">Todas las clasificaciones</option>
            {clasificaciones.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtroClasificacion1}
            onChange={(e) => {
              setFiltroClasificacion1(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[160px]"
          >
            <option value="">Todas las sub-clasificaciones</option>
            {clasificaciones1.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtroClasificacion2}
            onChange={(e) => {
              setFiltroClasificacion2(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[160px]"
          >
            <option value="">Todas las clasificaciones 2</option>
            {clasificaciones2.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtroComercializadora}
            onChange={(e) => {
              setFiltroComercializadora(e.target.value);
              setPage(0);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[160px]"
          >
            <option value="">Todas las comercializadoras</option>
            {comercializadoras.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => {
              setFiltroEstado(e.target.value as typeof filtroEstado);
              setPage(0);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[140px]"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
          <select
            value={filtroOrganizacion}
            onChange={(e) => { setFiltroOrganizacion(e.target.value); setPage(0); }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[140px]"
          >
            <option value="">Todas las organizaciones</option>
            {organizaciones.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
          <select
            value={filtroPais}
            onChange={(e) => { setFiltroPais(e.target.value); setPage(0); }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[160px]"
          >
            <option value="">Todos los países</option>
            {paises.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
            ))}
          </select>
          <select
            value={filtroCompania}
            onChange={(e) => { setFiltroCompania(e.target.value); setPage(0); }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[140px]"
          >
            <option value="">Todas las compañías</option>
            {companias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <select
            value={filtroCentroCosto}
            onChange={(e) => { setFiltroCentroCosto(e.target.value); setPage(0); }}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 min-w-[160px]"
          >
            <option value="">Todos los centros de costo</option>
            {centrosCostos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Línea</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Grupo</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Cuenta</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Descripción</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Saldo Normal</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Comercializadora</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Balance / GYP</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Clasificación</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Clasificación 1</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Clasificación 2</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Orden</th>
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
                  <tr key={i} className="border-b border-slate-100">
                    {Array.from({ length: canWrite ? 15 : 14 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4">
                        <div className="h-4 bg-slate-200 rounded animate-pulse w-20"></div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr>
                  <td colSpan={canWrite ? 17 : 16} className="py-12">
                    <div className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                        <i className="ri-error-warning-line text-red-500 text-xl"></i>
                      </div>
                      <p className="text-sm font-medium text-slate-700">No se pudo cargar el catálogo</p>
                      <p className="text-xs text-slate-500 max-w-xs">{error}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => fetchData()}
                          className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                        >
                          Reintentar
                        </button>
                      </div>
                      {!user && (
                        <p className="text-xs text-slate-400 mt-1">
                          ¿No hay sesión activa?{' '}
                          <a href="/login" className="text-emerald-600 hover:underline">
                            Ir al login
                          </a>
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={canWrite ? 17 : 16} className="py-8 text-center text-slate-400">
                    No se encontraron resultados
                  </td>
                </tr>
              ) : (
                paginated.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-4 text-slate-900 whitespace-nowrap">{item.linea ?? '-'}</td>
                    <td className="py-3 pr-4 text-slate-900 whitespace-nowrap">{item.grupo ?? '-'}</td>
                    <td className="py-3 pr-4 font-medium text-slate-900 whitespace-nowrap">{item.cuenta}</td>
                    <td className="py-3 pr-4 text-slate-700 min-w-[200px]">{item.descripcion}</td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{item.saldo_normal || '-'}</td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{item.comercializadora || '-'}</td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{item.balance_gyp || '-'}</td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{item.clasificacion || '-'}</td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{item.clasificacion_1 || '-'}</td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{item.clasificacion_2 || '-'}</td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{item.orden_clasificacion ?? '-'}</td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap text-xs">
                      {organizacionesMap.get(item.organizacion_id || '') || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap text-xs">
                      {paisesMap.get(item.pais_id || '') || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap text-xs">
                      {companiasMap.get(item.compania_id || '') || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 whitespace-nowrap text-xs">
                      {centrosCostosMap.get(item.centro_costo_id || '') || <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleActiva(item)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                          item.activa
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        title={item.activa ? 'Haz clic para desactivar' : 'Haz clic para activar'}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${item.activa ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {item.activa ? 'Activa' : 'Inactiva'}
                      </button>
                    </td>
                    {canWrite && (
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditing(item);
                              setModalOpen(true);
                            }}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            title="Editar"
                          >
                            <i className="ri-edit-line"></i>
                          </button>
                          <button
                            onClick={() => setConfirmDelete(item)}
                            className="rounded-md p-1.5 text-red-500 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <i className="ri-delete-bin-line"></i>
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

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-slate-500">
              Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="flex items-center px-2 text-sm text-slate-500">
                Página {page + 1} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      <CatalogoModal
        isOpen={modalOpen}
        item={editing}
        organizaciones={organizaciones}
        paises={paises}
        companias={companias}
        centrosCostos={centrosCostos}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="Eliminar Cuenta"
        message={`¿Eliminar la cuenta "${confirmDelete?.cuenta}" - ${confirmDelete?.descripcion}? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  );
}