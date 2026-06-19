import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { PresupuestoCarga, PresupuestoLinea, CatalogoItem, Pais, CentroCosto } from '@/types';
import { MESES } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useUbicaciones } from '@/hooks/useUbicaciones';
import { usePermissions } from '@/hooks/usePermissions';

const PAGE_SIZE = 50;

type Tab = 'cargas' | 'lineas';

function formatCurrency(n: number) {
  return new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 }).format(n);
}

function parseExcelDate(val: unknown): { anio: number; mes: number } | null {
  if (val === null || val === undefined || val === '') return null;

  // If it's a JS Date object (xlsx can parse dates automatically)
  if (val instanceof Date) {
    const anio = val.getFullYear();
    const mes = val.getMonth() + 1;
    if (mes < 1 || mes > 12) return null;
    return { anio, mes };
  }

  const str = String(val).trim();

  // Excel serial date number (e.g. 45123)
  const serial = Number(str);
  if (!Number.isNaN(serial) && serial > 1000 && serial < 60000) {
    // Excel epoch: Jan 1, 1900 = 1 (but Excel incorrectly treats 1900 as leap year, so subtract 1)
    const date = new Date((serial - 25569) * 86400 * 1000);
    const anio = date.getUTCFullYear();
    const mes = date.getUTCMonth() + 1;
    if (mes < 1 || mes > 12) return null;
    return { anio, mes };
  }

  // Format: MM-DD-YY, MM/DD/YY, DD-MM-YYYY, YYYY-MM-DD, etc.
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) return null;

    // YYYY-MM-DD
    if (a > 31) {
      const anio = a;
      const mes = b;
      if (mes < 1 || mes > 12) return null;
      return { anio, mes };
    }
    // MM-DD-YY or MM/DD/YY (most common from US Excel)
    const mm = a;
    let yy = c;
    if (mm < 1 || mm > 12) return null;
    if (yy < 50) yy += 2000; else if (yy < 100) yy += 1900;
    return { anio: yy, mes: mm };
  }

  // Try ISO string date "2025-03-01T00:00:00"
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
  }

  return null;
}

export default function PresupuestosPage() {
  const [tab, setTab] = useState<Tab>('cargas');
  const [cargaFiltro, setCargaFiltro] = useState<string>('');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground-950">Presupuestos</h1>
          <p className="text-sm text-foreground-700">Carga y gestión de presupuestos desde Excel</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-full bg-background-100 p-1 w-fit">
        <button
          onClick={() => setTab('cargas')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'cargas'
              ? 'bg-primary-500 text-background-50'
              : 'text-foreground-700 hover:text-foreground-950'
          }`}
        >
          Cargas / Histórico
        </button>
        <button
          onClick={() => setTab('lineas')}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
            tab === 'lineas'
              ? 'bg-primary-500 text-background-50'
              : 'text-foreground-700 hover:text-foreground-950'
          }`}
        >
          Líneas de Presupuesto
        </button>
      </div>

      {tab === 'cargas' ? (
        <CargasTab onVerLineas={(cargaId) => { setCargaFiltro(cargaId); setTab('lineas'); }} />
      ) : (
        <LineasTab cargaFiltroExterno={cargaFiltro} onLimpiarFiltro={() => setCargaFiltro('')} />
      )}
    </div>
  );
}

// ==========================================
// TAB: CARGAS / HISTÓRICO
// ==========================================
function CargasTab({ onVerLineas }: { onVerLineas: (cargaId: string) => void }) {
  const [cargas, setCargas] = useState<PresupuestoCarga[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [filtroPais, setFiltroPais] = useState('');
  const [filtroCentroCosto, setFiltroCentroCosto] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PresupuestoCarga | null>(null);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const { paises, centrosCostos } = useUbicaciones();
  const { isSuperAdmin, userScope, canEdit, canDelete } = usePermissions();
  const canWrite = canEdit;

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('presupuestos_cargas')
      .select('*');
    if (!isSuperAdmin && userScope.pais_id) query = query.eq('pais_id', userScope.pais_id);
    else if (!isSuperAdmin && userScope.compania_id) query = query.eq('compania_id', userScope.compania_id);
    else if (!isSuperAdmin && userScope.organizacion_id) query = query.eq('organizacion_id', userScope.organizacion_id);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      addToast('error', 'Error cargando cargas: ' + error.message);
    } else if (data) {
      setCargas(data as PresupuestoCarga[]);
    }
    setLoading(false);
  }, [addToast, isSuperAdmin, userScope]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCargarExcelInicial = async () => {
    setCargandoExcel(true);
    try {
      const { data, error } = await supabase.functions.invoke('cargar-presupuesto-excel');
      if (error) throw error;
      addToast('success', `Datos cargados: ${data?.totalRows || 0} líneas`);
      fetchData();
    } catch (err) {
      addToast('error', 'Error cargando Excel: ' + (err as Error).message);
    } finally {
      setCargandoExcel(false);
    }
  };

  const filtered = useMemo(() => {
    return cargas.filter((c) => {
      if (!search) {
        const matchesPais = !filtroPais || c.pais_id === filtroPais;
        const matchesCC = !filtroCentroCosto || c.centro_costo_id === filtroCentroCosto;
        return matchesPais && matchesCC;
      }
      const s = search.toLowerCase();
      const matchesPais = !filtroPais || c.pais_id === filtroPais;
      const matchesCC = !filtroCentroCosto || c.centro_costo_id === filtroCentroCosto;
      return (
        (c.nombre.toLowerCase().includes(s) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(s))) && matchesPais && matchesCC
      );
    });
  }, [cargas, search, filtroPais, filtroCentroCosto]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleDelete = async (item: PresupuestoCarga) => {
    try {
      const { error } = await supabase.from('presupuestos_cargas').delete().eq('id', item.id);
      if (error) throw error;
      addToast('success', 'Carga eliminada');
      setConfirmDelete(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress('Leyendo archivo...');
    try {
      const xlsx = await import('xlsx');
      const data = await file.arrayBuffer();
      // cellDates: true → xlsx convierte los números seriales de fecha a objetos Date
      const workbook = xlsx.read(data, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

      // Fetch catalogo for cross-reference
      setImportProgress('Consultando catálogo GYP...');
      const { data: catData } = await supabase.from('catalogo_gyp').select('cuenta, descripcion').eq('activa', true);
      const catalogoMap = new Map<string, string>();
      (catData || []).forEach((c) => catalogoMap.set(c.cuenta, c.descripcion));

      // Parse rows and deduplicate by (cuenta, anio, mes)
      const map = new Map<string, { cuenta: string; anio: number; mes: number; monto: number; descripcion_gyp: string }>();
      let skipped = 0;
      let notInCatalogo = 0;

      for (const row of json) {
        const cuenta = String(row['Cuenta'] || row['cuenta'] || row['CUENTA'] || '').trim();
        const fecha = row['Fecha'] || row['fecha'] || row['FECHA'] || '';
        const montoRaw = row['Monto'] || row['monto'] || row['MONTO'] || 0;
        let monto = Number(montoRaw);
        if (!cuenta || !fecha) { skipped++; continue; }
        const parsed = parseExcelDate(fecha);
        if (!parsed) { skipped++; continue; }
        const descGyp = catalogoMap.get(cuenta) || '';
        if (!descGyp) notInCatalogo++;
        const key = `${cuenta}|${parsed.anio}|${parsed.mes}`;
        map.set(key, {
          cuenta,
          anio: parsed.anio,
          mes: parsed.mes,
          monto: Number.isNaN(monto) ? 0 : monto,
          descripcion_gyp: descGyp,
        });
      }

      const rows = Array.from(map.values());
      if (rows.length === 0) {
        addToast('warning', 'No se encontraron registros válidos.');
        return;
      }

      const totalMonto = rows.reduce((s, r) => s + r.monto, 0);

      // Create carga
      setImportProgress(`Creando carga con ${rows.length} registros...`);
      const { data: cargaData, error: cargaError } = await supabase
        .from('presupuestos_cargas')
        .insert({
          nombre: file.name.replace(/\.[^/.]+$/, ''),
          descripcion: `Importado desde Excel. ${rows.length} registros. ${notInCatalogo} cuentas no encontradas en catálogo GYP.`,
          cantidad_registros: rows.length,
          total_monto: totalMonto,
        })
        .select('id')
        .single();

      if (cargaError || !cargaData) {
        throw new Error(cargaError?.message || 'Error creando carga');
      }

      const cargaId = cargaData.id;

      // Insert lineas in batches
      const BATCH_SIZE = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, carga_id: cargaId }));
        setImportProgress(`Guardando ${Math.min(i + batch.length, rows.length)} de ${rows.length}...`);
        const { error } = await supabase.from('presupuestos_lineas').insert(batch);
        if (error) {
          console.error('Batch error:', error);
        } else {
          inserted += batch.length;
        }
      }

      addToast('success', `${inserted} líneas importadas. ${notInCatalogo} cuentas no en catálogo GYP.`);
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
      const { error } = await supabase.from('presupuestos_cargas').insert(formData);
      if (error) throw error;
      addToast('success', 'Carga creada');
      setModalOpen(false);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Botón de carga inicial del Excel */}
      {cargas.length === 0 && !loading && (
        <div className="rounded-xl bg-primary-50 border border-primary-200 p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
              <i className="ri-file-excel-line text-primary-600 w-5 h-5 flex items-center justify-center"></i>
            </div>
            <div>
              <p className="text-sm font-medium text-primary-900">Excel de presupuesto detectado</p>
              <p className="text-xs text-primary-700">Tienes un archivo Excel adjunto. ¿Querés cargar los datos ahora?</p>
            </div>
          </div>
          <button
            onClick={handleCargarExcelInicial}
            disabled={cargandoExcel}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-primary-600 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <i className="ri-download-cloud-line w-5 h-5 flex items-center justify-center"></i>
            {cargandoExcel ? 'Cargando...' : 'Cargar datos del Excel'}
          </button>
        </div>
      )}

      {/* Actions + Filters */}
      <div className="rounded-xl bg-background-50 p-4 border border-background-200 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-700 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar cargas..."
              className="w-full rounded-lg border border-background-200 bg-background-100 py-2 pl-10 pr-4 text-sm text-foreground-950 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <select value={filtroPais} onChange={(e) => { setFiltroPais(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[140px]">
              <option value="">Todos los países</option>
              {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
            </select>
            <select value={filtroCentroCosto} onChange={(e) => { setFiltroCentroCosto(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[160px]">
              <option value="">Todos los centros de costo</option>
              {centrosCostos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {canWrite && (
              <>
                <label className={`inline-flex items-center gap-2 rounded-lg bg-foreground-950 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-foreground-900 cursor-pointer transition-colors whitespace-nowrap ${importProgress ? 'opacity-60 pointer-events-none' : ''}`}>
                  <i className="ri-file-upload-line w-5 h-5 flex items-center justify-center"></i>
                  {importProgress ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20"/></svg>
                      {importProgress}
                    </span>
                  ) : 'Cargar Excel'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleImportExcel}
                  />
                </label>
                <button
                  onClick={() => setModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
                  Nueva Carga
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
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Nombre</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Fecha Carga</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Registros</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Total Monto</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Estado</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-background-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4"><div className="h-4 bg-background-200 rounded animate-pulse w-24"></div></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-foreground-600">
                    No se encontraron cargas
                  </td>
                </tr>
              ) : (
                paginated.map((item) => (
                  <tr key={item.id} className="border-b border-background-100 hover:bg-background-100/70">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-foreground-950">{item.nombre}</div>
                      {item.descripcion && <div className="text-xs text-foreground-600 mt-0.5">{item.descripcion}</div>}
                    </td>
                    <td className="py-3 pr-4 text-foreground-700 whitespace-nowrap">
                      {item.fecha_carga ? new Date(item.fecha_carga).toLocaleDateString('es-CR') : '-'}
                    </td>
                    <td className="py-3 pr-4 text-foreground-950 whitespace-nowrap">
                      {item.cantidad_registros ?? 0}
                    </td>
                    <td className="py-3 pr-4 text-foreground-950 whitespace-nowrap font-medium">
                      {formatCurrency(item.total_monto || 0)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${item.activa ? 'bg-emerald-100 text-emerald-700' : 'bg-background-100 text-foreground-700'}`}>
                        {item.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onVerLineas(item.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-200 transition-colors"
                          title="Ver líneas"
                        >
                          <i className="ri-eye-line w-4 h-4 flex items-center justify-center"></i>
                          Ver líneas
                        </button>
                        {canWrite && (
                          <button
                            onClick={() => setConfirmDelete(item)}
                            className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                            title="Eliminar carga"
                          >
                            <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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

      {/* Modal Nueva Carga */}
      {modalOpen && (
        <CargaModal
          paises={paises}
          centrosCostos={centrosCostos}
          onClose={() => setModalOpen(false)}
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
              ¿Eliminar la carga <strong className="text-slate-900">{confirmDelete.nombre}</strong>? Se eliminarán todas sus líneas de presupuesto.
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

function CargaModal({ paises, centrosCostos, onClose, onSave }: { paises: Pais[]; centrosCostos: CentroCosto[]; onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    pais_id: '',
    centro_costo_id: '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Nueva Carga</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="Ej: Presupuesto 2026" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" rows={3} placeholder="Descripción opcional..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
              <select value={form.pais_id} onChange={(e) => setForm({ ...form, pais_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar país...</option>
                {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
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

// ==========================================
// TAB: LÍNEAS DE PRESUPUESTO
// ==========================================
function LineasTab({ cargaFiltroExterno, onLimpiarFiltro }: { cargaFiltroExterno: string; onLimpiarFiltro: () => void }) {
  const [lineas, setLineas] = useState<PresupuestoLinea[]>([]);
  const [cargas, setCargas] = useState<PresupuestoCarga[]>([]);
  const [catalogoGyp, setCatalogoGyp] = useState<CatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroCarga, setFiltroCarga] = useState<string>(cargaFiltroExterno || '');
  const [filtroAnio, setFiltroAnio] = useState<number | ''>('');
  const [filtroMes, setFiltroMes] = useState<number | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'active' | 'inactive'>('all');
  const [filtroEnCatalogo, setFiltroEnCatalogo] = useState<'all' | 'existente' | 'no_existente'>('all');
  const [filtroPais, setFiltroPais] = useState('');
  const [filtroCentroCosto, setFiltroCentroCosto] = useState('');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PresupuestoLinea | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PresupuestoLinea | null>(null);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const { paises, centrosCostos } = useUbicaciones();
  const { isSuperAdmin: lisScope, userScope: luserScope, canEdit: lcanEdit } = usePermissions();
  const canWriteLineas = lcanEdit;

  // Sync external filter
  useEffect(() => {
    if (cargaFiltroExterno) {
      setFiltroCarga(cargaFiltroExterno);
    }
  }, [cargaFiltroExterno]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let lineasQuery = supabase.from('presupuestos_lineas').select('*');
    if (!lisScope && luserScope.pais_id) lineasQuery = lineasQuery.eq('pais_id', luserScope.pais_id);
    else if (!lisScope && luserScope.compania_id) lineasQuery = lineasQuery.eq('compania_id', luserScope.compania_id);
    else if (!lisScope && luserScope.organizacion_id) lineasQuery = lineasQuery.eq('organizacion_id', luserScope.organizacion_id);
    lineasQuery = lineasQuery.order('created_at', { ascending: false });
    const [lineasRes, cargasRes, catRes] = await Promise.all([
      lineasQuery,
      supabase.from('presupuestos_cargas').select('id, nombre').eq('activa', true).order('created_at', { ascending: false }),
      supabase.from('catalogo_gyp').select('id, cuenta, descripcion').eq('activa', true),
    ]);
    if (lineasRes.data) setLineas(lineasRes.data as PresupuestoLinea[]);
    if (cargasRes.data) setCargas(cargasRes.data as PresupuestoCarga[]);
    if (catRes.data) setCatalogoGyp(catRes.data as CatalogoItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const catalogoMap = useMemo(() => {
    const map = new Map<string, CatalogoItem>();
    catalogoGyp.forEach((c) => map.set(c.cuenta, c));
    return map;
  }, [catalogoGyp]);

  const cargasMap = useMemo(() => {
    const map = new Map<string, string>();
    cargas.forEach((c) => map.set(c.id, c.nombre));
    return map;
  }, [cargas]);

  const aniosUnicos = useMemo(() => {
    const s = new Set(lineas.map((l) => l.anio));
    return [...s].sort((a, b) => b - a);
  }, [lineas]);

  const filtered = useMemo(() => {
    return lineas.filter((l) => {
      const matchesSearch = !search || l.cuenta.toLowerCase().includes(search.toLowerCase()) || (l.descripcion_gyp && l.descripcion_gyp.toLowerCase().includes(search.toLowerCase()));
      const matchesCarga = !filtroCarga || l.carga_id === filtroCarga;
      const matchesAnio = filtroAnio === '' || l.anio === filtroAnio;
      const matchesMes = filtroMes === '' || l.mes === filtroMes;
      const matchesEstado = filtroEstado === 'all' || (filtroEstado === 'active' && l.activa) || (filtroEstado === 'inactive' && !l.activa);
      const gypItem = catalogoMap.get(l.cuenta);
      const matchesCatalogo = filtroEnCatalogo === 'all' || (filtroEnCatalogo === 'existente' && !!gypItem) || (filtroEnCatalogo === 'no_existente' && !gypItem);
      const matchesPais = !filtroPais || l.pais_id === filtroPais;
      const matchesCC = !filtroCentroCosto || l.centro_costo_id === filtroCentroCosto;
      return matchesSearch && matchesCarga && matchesAnio && matchesMes && matchesEstado && matchesCatalogo && matchesPais && matchesCC;
    });
  }, [lineas, search, filtroCarga, filtroAnio, filtroMes, filtroEstado, filtroEnCatalogo, catalogoMap, filtroPais, filtroCentroCosto]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = useMemo(() => {
    const total = filtered.length;
    const activas = filtered.filter((l) => l.activa).length;
    const inactivas = total - activas;
    const existentes = filtered.filter((l) => catalogoMap.has(l.cuenta)).length;
    const noExistentes = total - existentes;
    const totalMonto = filtered.reduce((s, l) => s + (l.monto || 0), 0);
    return { total, activas, inactivas, existentes, noExistentes, totalMonto };
  }, [filtered, catalogoMap]);

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      if (editing) {
        const { error } = await supabase.from('presupuestos_lineas').update(formData).eq('id', editing.id);
        if (error) throw error;
        addToast('success', 'Línea actualizada');
      } else {
        const { error } = await supabase.from('presupuestos_lineas').insert(formData);
        if (error) throw error;
        addToast('success', 'Línea creada');
      }
      setModalOpen(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleDelete = async (item: PresupuestoLinea) => {
    try {
      const { error } = await supabase.from('presupuestos_lineas').delete().eq('id', item.id);
      if (error) throw error;
      addToast('success', 'Línea eliminada');
      setConfirmDelete(null);
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
          <p className="text-xs text-foreground-700">Total Líneas</p>
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
          <p className="text-xs text-foreground-700">Total Monto</p>
          <p className="text-xl font-bold text-foreground-950">{formatCurrency(stats.totalMonto)}</p>
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
              placeholder="Buscar por cuenta o descripción..."
              className="w-full rounded-lg border border-background-200 bg-background-100 py-2 pl-10 pr-4 text-sm text-foreground-950 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <select
            value={filtroCarga}
            onChange={(e) => { setFiltroCarga(e.target.value); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[160px]"
          >
            <option value="">Todas las cargas</option>
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <select
            value={filtroAnio}
            onChange={(e) => { setFiltroAnio(e.target.value === '' ? '' : Number(e.target.value)); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500"
          >
            <option value="">Todos los años</option>
            {aniosUnicos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select
            value={filtroMes}
            onChange={(e) => { setFiltroMes(e.target.value === '' ? '' : Number(e.target.value)); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500"
          >
            <option value="">Todos los meses</option>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={filtroEnCatalogo}
            onChange={(e) => { setFiltroEnCatalogo(e.target.value as typeof filtroEnCatalogo); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500"
          >
            <option value="all">Todas las validaciones</option>
            <option value="existente">Existente en GYP</option>
            <option value="no_existente">No existe en GYP</option>
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => { setFiltroEstado(e.target.value as typeof filtroEstado); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <select value={filtroPais} onChange={(e) => { setFiltroPais(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500 min-w-[140px]">
            <option value="">Todos los países</option>
            {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
          </select>
          <select value={filtroCentroCosto} onChange={(e) => { setFiltroCentroCosto(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm outline-none focus:border-primary-500 min-w-[160px]">
            <option value="">Todos los centros de costo</option>
            {centrosCostos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <div className="flex gap-2 ml-auto">
            {filtroCarga && (
              <button
                onClick={() => { setFiltroCarga(''); onLimpiarFiltro(); }}
                className="inline-flex items-center gap-1 rounded-lg bg-secondary-100 px-3 py-2 text-sm font-medium text-secondary-700 hover:bg-secondary-200 transition-colors"
              >
                <i className="ri-filter-off-line w-4 h-4 flex items-center justify-center"></i>
                Limpiar filtro
              </button>
            )}
            {canWriteLineas && (
              <button
                onClick={() => { setEditing(null); setModalOpen(true); }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
              >
                <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
                Nueva Línea
              </button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200 text-left text-foreground-700">
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Carga</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Cuenta</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Descripción GYP</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">En GYP</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Período</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Monto</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Estado</th>
                {canWriteLineas && <th className="py-3 pr-4 font-medium whitespace-nowrap">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-background-100">
                    {Array.from({ length: canWriteLineas ? 8 : 7 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4"><div className="h-4 bg-background-200 rounded animate-pulse w-24"></div></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={canWriteLineas ? 8 : 7} className="py-8 text-center text-foreground-600">
                    No se encontraron líneas de presupuesto
                  </td>
                </tr>
              ) : (
                paginated.map((item) => {
                  const gypItem = catalogoMap.get(item.cuenta);
                  const cargaNombre = cargasMap.get(item.carga_id) || 'Carga eliminada';
                  return (
                    <tr key={item.id} className="border-b border-background-100 hover:bg-background-100/70">
                      <td className="py-3 pr-4 text-foreground-700 whitespace-nowrap text-xs">{cargaNombre}</td>
                      <td className="py-3 pr-4 font-medium text-foreground-950 whitespace-nowrap font-mono text-xs">{item.cuenta}</td>
                      <td className="py-3 pr-4 text-foreground-900 min-w-[200px]">
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
                      <td className="py-3 pr-4 text-foreground-700 whitespace-nowrap">{MESES[item.mes - 1]?.substring(0, 3)} {item.anio}</td>
                      <td className="py-3 pr-4 text-foreground-950 whitespace-nowrap font-medium">{formatCurrency(item.monto)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${item.activa ? 'bg-emerald-100 text-emerald-700' : 'bg-background-100 text-foreground-700'}`}>
                          {item.activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      {canWriteLineas && (
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

      {/* Modal Línea */}
      {modalOpen && (
        <LineaModal
          item={editing}
          cargas={cargas}
          catalogoMap={catalogoMap}
          paises={paises}
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
              ¿Eliminar la línea <strong className="text-slate-900">{confirmDelete.cuenta}</strong> — {MESES[confirmDelete.mes - 1]} {confirmDelete.anio}?
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

function LineaModal({
  item,
  cargas,
  catalogoMap,
  paises,
  centrosCostos,
  onClose,
  onSave,
}: {
  item: PresupuestoLinea | null;
  cargas: PresupuestoCarga[];
  catalogoMap: Map<string, CatalogoItem>;
  paises: Pais[];
  centrosCostos: CentroCosto[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    carga_id: item?.carga_id || (cargas[0]?.id || ''),
    cuenta: item?.cuenta || '',
    anio: item?.anio || new Date().getFullYear(),
    mes: item?.mes || 1,
    monto: item?.monto || '',
    activa: item?.activa ?? true,
    pais_id: item?.pais_id || '',
    centro_costo_id: item?.centro_costo_id || '',
  });
  const [cuentaSearch, setCuentaSearch] = useState('');

  const filteredCatalogo = useMemo(() => {
    if (!cuentaSearch) return [];
    return Array.from(catalogoMap.values()).filter((c) =>
      c.cuenta.toLowerCase().includes(cuentaSearch.toLowerCase()) ||
      c.descripcion.toLowerCase().includes(cuentaSearch.toLowerCase())
    ).slice(0, 10);
  }, [cuentaSearch, catalogoMap]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{item ? 'Editar Línea' : 'Nueva Línea'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Carga *</label>
            <select
              value={form.carga_id}
              onChange={(e) => setForm({ ...form, carga_id: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            >
              {cargas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta *</label>
            <input
              type="text"
              value={cuentaSearch || form.cuenta}
              onChange={(e) => { setCuentaSearch(e.target.value); setForm({ ...form, cuenta: e.target.value }); }}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="Buscar o ingresar cuenta..."
              required
            />
            {cuentaSearch && filteredCatalogo.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-40 overflow-y-auto">
                {filteredCatalogo.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setForm({ ...form, cuenta: c.cuenta }); setCuentaSearch(''); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-mono text-xs text-slate-500">{c.cuenta}</span> — {c.descripcion}
                  </button>
                ))}
              </div>
            )}
            {form.cuenta && catalogoMap.get(form.cuenta) && (
              <p className="mt-1 text-xs text-emerald-700">
                {catalogoMap.get(form.cuenta)?.descripcion}
              </p>
            )}
            {form.cuenta && !catalogoMap.get(form.cuenta) && (
              <p className="mt-1 text-xs text-amber-600">Cuenta no encontrada en catálogo GYP</p>
            )}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Monto</label>
            <input type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.00" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="activa-linea" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            <label htmlFor="activa-linea" className="text-sm text-slate-700">Activa</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
              <select value={form.pais_id} onChange={(e) => setForm({ ...form, pais_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar país...</option>
                {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
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