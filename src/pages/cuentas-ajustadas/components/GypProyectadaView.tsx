import { useMemo, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { PremisaProyeccion, VentaProyeccion, Organizacion, Pais, Compania, CentroCosto } from '@/types';
import { calcularValorProyectado, evaluarFormula } from '@/lib/formulaEngine';
import type { FormulaContext } from '@/lib/formulaEngine';
import { useFactores } from '@/hooks/useFactores';
import { usePermissions } from '@/hooks/usePermissions';
import PremisaModal from './PremisaModal';
import VentasProyeccionPanel from './VentasProyeccionPanel';

const PAGE_SIZE = 30;
const ANIO_DEFAULT = 2026;

function formatNumero(n: number | null) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatNumero0(n: number | null) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface GypProyectadaViewProps {
  organizaciones: Organizacion[];
  paises: Pais[];
  companias: Compania[];
  centrosCostos: CentroCosto[];
  organizacionesMap: Map<string, string>;
  paisesMap: Map<string, string>;
  companiasMap: Map<string, string>;
  centrosCostosMap: Map<string, string>;
}

export default function GypProyectadaView({
  organizaciones, paises, companias, centrosCostos,
  organizacionesMap, paisesMap, companiasMap, centrosCostosMap,
}: GypProyectadaViewProps) {
  const [premisas, setPremisas] = useState<PremisaProyeccion[]>([]);
  const [ventas, setVentas] = useState<VentaProyeccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroPais, setFiltroPais] = useState('');
  const [filtroCompania, setFiltroCompania] = useState('');
  const [filtroCentroCosto, setFiltroCentroCosto] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState<'all' | 'valor_directo' | 'calculado'>('all');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PremisaProyeccion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PremisaProyeccion | null>(null);
  const [ventasPanelOpen, setVentasPanelOpen] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const { factoresMap } = useFactores();
  const { canEdit, canDelete } = usePermissions();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [premRes, ventRes] = await Promise.all([
      supabase.from('premisas_proyeccion').select('*').order('cuenta_contable', { ascending: true }).order('anio', { ascending: false }).order('mes', { ascending: false }),
      supabase.from('ventas_proyeccion').select('*').order('anio', { ascending: false }).order('mes', { ascending: false }),
    ]);
    if (premRes.data) setPremisas(premRes.data as PremisaProyeccion[]);
    if (ventRes.data) setVentas(ventRes.data as VentaProyeccion[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build ventas lookup for calculating valor_proyectado
  const ventasLookup = useMemo(() => {
    const map = new Map<string, VentaProyeccion>();
    ventas.forEach((v) => {
      // General company-level ventas
      map.set(`${v.organizacion_id || ''}|${v.pais_id}|${v.compania_id}|general|${v.anio}|${v.mes}`, v);
    });
    return map;
  }, [ventas]);

  const getVentasForPremisa = useCallback((p: PremisaProyeccion) => {
    const key = `${p.organizacion_id || ''}|${p.pais_id}|${p.compania_id}|general|${p.anio}|${p.mes}`;
    const v = ventasLookup.get(key);
    return {
      venta_actual: v?.venta_actual ?? 0,
      venta_proyectada: v?.venta_proyectada ?? 0,
      semi_neto: v?.semi_neto ?? 0,
    };
  }, [ventasLookup]);

  const filtered = useMemo(() => {
    return premisas.filter((p) => {
      const matchesSearch = !search || p.cuenta_contable.toLowerCase().includes(search.toLowerCase());
      const matchesPais = !filtroPais || p.pais_id === filtroPais;
      const matchesCompania = !filtroCompania || p.compania_id === filtroCompania;
      const matchesCC = !filtroCentroCosto || p.centro_costo_id === filtroCentroCosto;
      const matchesMetodo = filtroMetodo === 'all' || p.metodo === filtroMetodo;
      return matchesSearch && matchesPais && matchesCompania && matchesCC && matchesMetodo;
    });
  }, [premisas, search, filtroPais, filtroCompania, filtroCentroCosto, filtroMetodo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = useMemo(() => {
    const total = premisas.length;
    const directo = premisas.filter((p) => p.metodo === 'valor_directo').length;
    const calculado = premisas.filter((p) => p.metodo === 'calculado').length;
    const totalProyectado = premisas.reduce((acc, p) => acc + (p.valor_proyectado || 0), 0);
    return { total, directo, calculado, totalProyectado };
  }, [premisas]);

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      // Calculate valor_proyectado before saving
      const ventasData = getVentasForPremisa({
        ...formData,
        organizacion_id: formData.organizacion_id as string,
        pais_id: formData.pais_id as string,
        compania_id: formData.compania_id as string,
        anio: formData.anio as number,
        mes: formData.mes as number,
      } as PremisaProyeccion);

      const saldos = new Map<string, number>();
      const ctx: FormulaContext = {
        anio: formData.anio as number,
        mes: formData.mes as number,
        saldos,
        categoriaTotales: new Map(),
        factores: factoresMap,
        variables: new Map([
          ['Venta Actual', ventasData.venta_actual],
          ['Venta Proyectada', ventasData.venta_proyectada],
          ['Semi Neto', ventasData.semi_neto],
        ]),
      };

      const valorProyectado = calcularValorProyectado({
        metodo: (formData.metodo as 'valor_directo' | 'calculado') || 'valor_directo',
        valor_dolar: (formData.valor_dolar as number) ?? null,
        pct_venta: (formData.pct_venta as number) ?? null,
        base_venta: (formData.base_venta as 'actual' | 'proyectada') ?? null,
        pct_semineto: (formData.pct_semineto as number) ?? null,
        formula: (formData.formula as string) || null,
        venta_actual: ventasData.venta_actual,
        venta_proyectada: ventasData.venta_proyectada,
        semi_neto: ventasData.semi_neto,
        ctx,
      });

      const payload = { ...formData, valor_proyectado: Math.round(valorProyectado * 100) / 100 };

      if (editing) {
        const cambiosArr: string[] = [];
        const fields = ['cuenta_contable', 'metodo', 'valor_dolar', 'pct_venta', 'base_venta', 'pct_semineto', 'formula', 'valor_proyectado'];
        for (const f of fields) {
          const oldVal = (editing as Record<string, unknown>)[f];
          const newVal = payload[f];
          if (String(oldVal ?? '') !== String(newVal ?? '')) {
            cambiosArr.push(`${f}: "${oldVal ?? ''}" → "${newVal ?? ''}"`);
          }
        }
        const { error } = await supabase.from('premisas_proyeccion').update(payload).eq('id', editing.id);
        if (error) throw error;

        if (cambiosArr.length > 0) {
          await supabase.from('premisas_proyeccion_historico').insert({
            premisa_id: editing.id,
            cuenta_contable: editing.cuenta_contable,
            accion: 'actualizacion',
            cambios: cambiosArr.join('; '),
            resumen: `Editados ${cambiosArr.length} campo(s)`,
            organizacion_id: editing.organizacion_id,
          });
        }
      } else {
        const { data, error } = await supabase.from('premisas_proyeccion').insert(payload).select('id').single();
        if (error) throw error;
        if (data) {
          await supabase.from('premisas_proyeccion_historico').insert({
            premisa_id: data.id,
            cuenta_contable: payload.cuenta_contable as string,
            accion: 'creacion',
            resumen: 'Premisa creada',
            organizacion_id: payload.organizacion_id as string,
          });
        }
      }
      setModalOpen(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      console.error('Error saving premisa:', err);
    }
  };

  const handleDelete = async (item: PremisaProyeccion) => {
    try {
      await supabase.from('premisas_proyeccion_historico').insert({
        premisa_id: item.id, cuenta_contable: item.cuenta_contable,
        accion: 'eliminacion', resumen: 'Premisa eliminada', organizacion_id: item.organizacion_id,
      });
      const { error } = await supabase.from('premisas_proyeccion').delete().eq('id', item.id);
      if (error) throw error;
      setConfirmDelete(null);
      fetchData();
    } catch (err) {
      console.error('Error deleting premisa:', err);
    }
  };

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
        for (const key of keys) { if (key in row && row[key] !== '' && row[key] !== null && row[key] !== undefined) return row[key]; }
        return '';
      };

      const BATCH = 200;
      let imported = 0;
      const rows = json.map((row) => {
        const cuenta = String(getVal(row, 'Cuenta', 'cuenta', 'CUENTA_CONTABLE', 'cuenta_contable') || '').trim();
        const anio = Number(getVal(row, 'Año', 'Anio', 'anio', 'ANO', 'Periodo') || ANIO_DEFAULT);
        const mes = Number(getVal(row, 'Mes', 'mes', 'MES') || 1);
        const metodoVal = String(getVal(row, 'Metodo', 'metodo', 'METODO', 'Tipo') || 'valor_directo').trim().toLowerCase();
        const valorDolar = parseFloat(String(getVal(row, 'Valor USD', 'valor_dolar', 'Valor', 'VALOR') || ''));
        const pctVenta = parseFloat(String(getVal(row, '% Venta', 'pct_venta', 'Porcentaje', 'PCT_VENTA', 'PCV') || ''));
        const baseVenta = String(getVal(row, 'Base Venta', 'base_venta', 'BASE', 'Base') || 'actual').trim().toLowerCase();
        if (!cuenta || isNaN(anio) || isNaN(mes)) return null;
        return {
          cuenta_contable: cuenta, anio, mes,
          metodo: metodoVal === 'calculado' ? 'calculado' : 'valor_directo',
          valor_dolar: isNaN(valorDolar) ? null : valorDolar,
          pct_venta: isNaN(pctVenta) ? null : pctVenta,
          base_venta: baseVenta === 'proyectada' ? 'proyectada' : null,
          pct_semineto: null,
          formula: null,
          valor_proyectado: isNaN(valorDolar) ? 0 : valorDolar,
          activa: true,
        };
      }).filter(Boolean);

      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        setImportProgress(`Importando ${Math.min(i + batch.length, rows.length)} de ${rows.length}...`);
        const { error } = await supabase.from('premisas_proyeccion').insert(batch);
        if (!error) imported += batch.length;
      }
      setImportProgress(null);
      e.target.value = '';
      fetchData();
    } catch (err) {
      setImportProgress(null);
      e.target.value = '';
      console.error('Error importing:', err);
    }
  };

  const handleVentasUpdated = () => {
    fetchData();
  };

  const handleRecalcularTodo = async () => {
    if (premisas.length === 0) return;
    const updates = premisas.map((p) => {
      const ventasData = getVentasForPremisa(p);
      const saldos = new Map<string, number>();
      const ctx: FormulaContext = {
        anio: p.anio, mes: p.mes, saldos, categoriaTotales: new Map(), factores: factoresMap,
        variables: new Map([
          ['Venta Actual', ventasData.venta_actual],
          ['Venta Proyectada', ventasData.venta_proyectada],
          ['Semi Neto', ventasData.semi_neto],
        ]),
      };
      const nuevoValor = calcularValorProyectado({
        metodo: p.metodo,
        valor_dolar: p.valor_dolar,
        pct_venta: p.pct_venta,
        base_venta: p.base_venta,
        pct_semineto: p.pct_semineto,
        formula: p.formula,
        venta_actual: ventasData.venta_actual,
        venta_proyectada: ventasData.venta_proyectada,
        semi_neto: ventasData.semi_neto,
        ctx,
      });
      return { id: p.id, valor_proyectado: Math.round(nuevoValor * 100) / 100 };
    });

    const BATCH = 200;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      for (const u of batch) {
        await supabase.from('premisas_proyeccion').update({ valor_proyectado: u.valor_proyectado }).eq('id', u.id);
      }
    }
    fetchData();
  };

  return (
    <div className="space-y-6">
      {/* Info panel */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <i className="ri-lightbulb-line text-amber-600 w-5 h-5 flex items-center justify-center"></i>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-amber-800">Vista GYP Proyectada</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Esta vista proyecta los valores de cuentas GYP usando <strong>premisas</strong> (valor en USD, % de venta, % de semi neto) y <strong>variables de venta</strong> por empresa/período. Los valores proyectados quedan precalculados y disponibles para Power BI en la vista <code className="bg-amber-100 px-1 rounded text-[11px]">gyp_proyectado_consumo</code>.
            </p>
            <p className="text-xs text-amber-600 italic">
              // CONFIRMAR: Las premisas deben cargarse con scope Mayoreo. Las variables de venta se administran en el panel de Ventas.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Premisas</p>
          <p className="text-xl font-bold text-foreground-950">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Valor Directo</p>
          <p className="text-xl font-bold text-primary-500">{stats.directo}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Calculado</p>
          <p className="text-xl font-bold text-accent-600">{stats.calculado}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Total Proyectado</p>
          <p className="text-xl font-bold text-emerald-600">{formatNumero0(stats.totalProyectado)}</p>
        </div>
      </div>

      {/* Actions & Filters */}
      <div className="rounded-xl bg-background-50 p-4 border border-background-200 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-700 w-5 h-5 flex items-center justify-center"></i>
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar cuenta contable..." className="w-full rounded-lg border border-background-200 bg-background-100 py-2 pl-10 pr-4 text-sm text-foreground-950 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
          </div>
          <select value={filtroMetodo} onChange={(e) => { setFiltroMetodo(e.target.value as typeof filtroMetodo); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[140px]">
            <option value="all">Todos los métodos</option>
            <option value="valor_directo">Valor Directo</option>
            <option value="calculado">Calculado</option>
          </select>
          <select value={filtroPais} onChange={(e) => { setFiltroPais(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[150px]">
            <option value="">Todos los países</option>
            {paises.map((p) => (<option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>))}
          </select>
          <select value={filtroCompania} onChange={(e) => { setFiltroCompania(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[140px]">
            <option value="">Todas las empresas</option>
            {companias.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
          </select>
          <select value={filtroCentroCosto} onChange={(e) => { setFiltroCentroCosto(e.target.value); setPage(0); }} className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[170px]">
            <option value="">Todos los centros de costo</option>
            {centrosCostos.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
          </select>
          <div className="flex gap-2 ml-auto">
            {canEdit && (
              <>
                <button onClick={() => setVentasPanelOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 transition-colors whitespace-nowrap">
                  <i className="ri-line-chart-line w-5 h-5 flex items-center justify-center"></i>
                  Variables de Venta
                </button>
                <button onClick={handleRecalcularTodo} className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-700 transition-colors whitespace-nowrap">
                  <i className="ri-refresh-line w-5 h-5 flex items-center justify-center"></i>
                  Recalcular Todo
                </button>
                <label className="inline-flex items-center gap-2 rounded-lg bg-foreground-950 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-foreground-900 cursor-pointer transition-colors whitespace-nowrap">
                  <i className="ri-file-upload-line w-5 h-5 flex items-center justify-center"></i>
                  {importProgress || 'Importar Excel'}
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={!!importProgress} />
                </label>
                <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap">
                  <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
                  Nueva Premisa
                </button>
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200 text-left text-foreground-700">
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Cuenta Contable</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Empresa</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">País</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">CC</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Periodo</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Método</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Componentes</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap text-right">Valor Proyectado</th>
                {canEdit && <th className="py-3 pr-4 font-medium whitespace-nowrap">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-background-100">
                    {Array.from({ length: canEdit ? 9 : 8 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4"><div className="h-4 bg-background-200 rounded animate-pulse w-20"></div></td>
                    ))}
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr><td colSpan={canEdit ? 9 : 8} className="py-12 text-center text-foreground-600">No se encontraron premisas. Creá una nueva o importá desde Excel.</td></tr>
              ) : (
                paginated.map((p) => {
                  const componentes: string[] = [];
                  if (p.valor_dolar) componentes.push(`$${formatNumero0(p.valor_dolar)}`);
                  if (p.pct_venta) componentes.push(`${(p.pct_venta * 100).toFixed(1)}% venta ${p.base_venta === 'proyectada' ? 'proy.' : 'actual'}`);
                  if (p.pct_semineto) componentes.push(`${(p.pct_semineto * 100).toFixed(1)}% semi neto`);
                  if (p.formula) componentes.push(`f(x)`);
                  return (
                    <tr key={p.id} className="border-b border-background-100 hover:bg-background-100/70">
                      <td className="py-3 pr-4 font-medium text-foreground-950 whitespace-nowrap font-mono text-xs">{p.cuenta_contable}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">{companiasMap.get(p.compania_id) || '—'}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">{paisesMap.get(p.pais_id) || '—'}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">{p.centro_costo_id ? (centrosCostosMap.get(p.centro_costo_id) || '—') : <span className="text-foreground-400 italic">General</span>}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">{p.mes}/{p.anio}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${p.metodo === 'valor_directo' ? 'bg-primary-100 text-primary-700' : 'bg-accent-100 text-accent-700'}`}>
                          {p.metodo === 'valor_directo' ? 'Valor Directo' : 'Calculado'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-xs text-foreground-700 min-w-[180px]">{componentes.length > 0 ? componentes.join(' + ') : '—'}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-right font-bold text-foreground-950">{formatNumero(p.valor_proyectado)}</td>
                      {canEdit && (
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <div className="flex gap-2">
                            <button onClick={() => { setEditing(p); setModalOpen(true); }} className="rounded-md p-1.5 text-foreground-700 hover:bg-background-100 hover:text-foreground-950" title="Editar premisa">
                              <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                            </button>
                            {canDelete && (
                              <button onClick={() => setConfirmDelete(p)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50" title="Eliminar">
                                <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
                              </button>
                            )}
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
            <p className="text-sm text-foreground-700">Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-lg border border-background-200 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100 disabled:opacity-50">Anterior</button>
              <span className="flex items-center px-2 text-sm text-foreground-700">Página {page + 1} de {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-lg border border-background-200 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100 disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modalOpen && (
        <PremisaModal
          item={editing}
          organizaciones={organizaciones}
          paises={paises}
          companias={companias}
          centrosCostos={centrosCostos}
          ventasLookup={ventasLookup}
          factoresMap={factoresMap}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {ventasPanelOpen && (
        <VentasProyeccionPanel
          ventas={ventas}
          organizaciones={organizaciones}
          paises={paises}
          companias={companias}
          centrosCostos={centrosCostos}
          organizacionesMap={organizacionesMap}
          paisesMap={paisesMap}
          companiasMap={companiasMap}
          centrosCostosMap={centrosCostosMap}
          onClose={() => setVentasPanelOpen(false)}
          onUpdated={handleVentasUpdated}
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
            <p className="text-sm text-slate-600 mb-6">¿Eliminar la premisa de <strong>{confirmDelete.cuenta_contable}</strong> para {confirmDelete.mes}/{confirmDelete.anio}?</p>
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