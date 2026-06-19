import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { FactorHistorico } from '@/types';

interface CuentaAjustadaHistorico {
  id: string;
  cuenta_ajustada_id: string;
  cuenta_contable: string;
  descripcion_ajuste: string;
  accion: string;
  cambios: string | null;
  resumen: string | null;
  created_at: string;
}

interface CatalogoGypHistorico {
  id: string;
  catalogo_id: string;
  cuenta: string;
  descripcion: string;
  accion: string;
  cambios: string | null;
  resumen: string | null;
  created_at: string;
}

interface CobroCofersaHistorico {
  id: string;
  cobro_id: string;
  cuenta: string;
  descripcion_cobro: string | null;
  anio: number | null;
  mes: number | null;
  accion: string;
  cambios: string | null;
  resumen: string | null;
  created_at: string;
}

interface CobroCofersaCuentaHistorico {
  id: string;
  cuenta_cobro_id: string;
  cuenta: string;
  descripcion_cobro: string;
  accion: string;
  cambios: string | null;
  resumen: string | null;
  created_at: string;
}

interface EntradaUnificada {
  id: string;
  modulo: string;
  accion: string;
  tipo_registro: string;
  resumen: string;
  detalle: string | null;
  created_at: string;
}

const MODULO_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  tasas: { bg: 'bg-accent-100', text: 'text-accent-700', icon: 'ri-line-chart-line' },
  'cuentas-ajustadas': { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'ri-scales-3-line' },
  catalogo: { bg: 'bg-sky-100', text: 'text-sky-700', icon: 'ri-book-open-line' },
  'cobros-cuentas': { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'ri-bank-card-line' },
  'cobros-registros': { bg: 'bg-orange-100', text: 'text-orange-700', icon: 'ri-file-list-3-line' },
};

const ACCION_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  creacion: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: 'ri-add-circle-line' },
  actualizacion: { bg: 'bg-amber-100', text: 'text-amber-700', icon: 'ri-edit-line' },
  eliminacion: { bg: 'bg-rose-100', text: 'text-rose-700', icon: 'ri-delete-bin-line' },
};

const MODULO_LABELS: Record<string, string> = {
  tasas: 'Tasas',
  'cuentas-ajustadas': 'Cuentas Ajustadas',
  catalogo: 'Catálogo GYP',
  'cobros-cuentas': 'Cobros - Cuentas',
  'cobros-registros': 'Cobros - Registros',
};

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatFecha(fecha: string | null) {
  if (!fecha) return '—';
  const d = new Date(fecha + (fecha.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatNumero(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n);
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function HistorialCambiosPage() {
  const [factoresHist, setFactoresHist] = useState<FactorHistorico[]>([]);
  const [cuentasHist, setCuentasHist] = useState<CuentaAjustadaHistorico[]>([]);
  const [catalogoHist, setCatalogoHist] = useState<CatalogoGypHistorico[]>([]);
  const [cobrosCuentasHist, setCobrosCuentasHist] = useState<CobroCofersaCuentaHistorico[]>([]);
  const [cobrosRegistrosHist, setCobrosRegistrosHist] = useState<CobroCofersaHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroModulo, setFiltroModulo] = useState<string>('todos');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [factRes, cuenRes, catRes, cobCtaRes, cobRegRes] = await Promise.all([
      supabase.from('factores_historico').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('cuentas_ajustadas_historico').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('catalogo_gyp_historico').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('cobros_cofersa_cuentas_historico').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('cobros_cofersa_historico').select('*').order('created_at', { ascending: false }).limit(500),
    ]);
    if (factRes.data) setFactoresHist(factRes.data as FactorHistorico[]);
    if (cuenRes.data) setCuentasHist(cuenRes.data as CuentaAjustadaHistorico[]);
    if (catRes.data) setCatalogoHist(catRes.data as CatalogoGypHistorico[]);
    if (cobCtaRes.data) setCobrosCuentasHist(cobCtaRes.data as CobroCofersaCuentaHistorico[]);
    if (cobRegRes.data) setCobrosRegistrosHist(cobRegRes.data as CobroCofersaHistorico[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Unify all histories
  const entradas: EntradaUnificada[] = useMemo(() => {
    const result: EntradaUnificada[] = [];

    // Tasas
    factoresHist.forEach((h) => {
      const esCreacion = h.valor_anterior === null;
      const esEliminacion = h.descripcion === 'Tasa eliminada';
      const accion = esEliminacion ? 'eliminacion' : h.descripcion?.includes('Renombrado') ? 'actualizacion' : esCreacion ? 'creacion' : 'actualizacion';
      const diff = esCreacion ? null : h.valor_nuevo - (h.valor_anterior ?? 0);

      result.push({
        id: `tasas-${h.id}`,
        modulo: 'tasas',
        accion,
        tipo_registro: h.tipo,
        resumen: h.descripcion || (esCreacion ? 'Tasa creada' : 'Valor actualizado'),
        detalle: esCreacion
          ? `Nuevo: ₡${formatNumero(h.valor_nuevo)} — Vigencia: ${formatFecha(h.fecha)}`
          : diff !== null
            ? `₡${formatNumero(h.valor_anterior)} → ₡${formatNumero(h.valor_nuevo)} (${diff >= 0 ? '+' : ''}₡${formatNumero(Math.abs(diff))}) — Vigencia: ${formatFecha(h.fecha)}`
            : `₡${formatNumero(h.valor_anterior)} → ₡${formatNumero(h.valor_nuevo)} — Vigencia: ${formatFecha(h.fecha)}`,
        created_at: h.created_at,
      });
    });

    // Cuentas Ajustadas
    cuentasHist.forEach((h) => {
      result.push({
        id: `cuentas-${h.id}`,
        modulo: 'cuentas-ajustadas',
        accion: h.accion,
        tipo_registro: h.cuenta_contable,
        resumen: h.resumen || h.accion,
        detalle: h.cambios || `${h.cuenta_contable} — ${h.descripcion_ajuste}`,
        created_at: h.created_at,
      });
    });

    // Catálogo GYP
    catalogoHist.forEach((h) => {
      result.push({
        id: `catalogo-${h.id}`,
        modulo: 'catalogo',
        accion: h.accion,
        tipo_registro: h.cuenta,
        resumen: h.resumen || `${h.accion === 'creacion' ? 'Cuenta creada' : h.accion === 'eliminacion' ? 'Cuenta eliminada' : 'Cuenta actualizada'}`,
        detalle: h.cambios || `${h.cuenta} — ${h.descripcion}`,
        created_at: h.created_at,
      });
    });

    // Cobros - Cuentas
    cobrosCuentasHist.forEach((h) => {
      result.push({
        id: `cobros-cta-${h.id}`,
        modulo: 'cobros-cuentas',
        accion: h.accion,
        tipo_registro: h.cuenta,
        resumen: h.resumen || `${h.accion === 'creacion' ? 'Cuenta de cobro creada' : h.accion === 'eliminacion' ? 'Cuenta de cobro eliminada' : 'Cuenta de cobro actualizada'}`,
        detalle: h.cambios || `${h.cuenta} — ${h.descripcion_cobro}`,
        created_at: h.created_at,
      });
    });

    // Cobros - Registros
    cobrosRegistrosHist.forEach((h) => {
      const periodo = h.anio && h.mes ? ` (${MESES[h.mes - 1]} ${h.anio})` : '';
      result.push({
        id: `cobros-reg-${h.id}`,
        modulo: 'cobros-registros',
        accion: h.accion,
        tipo_registro: h.cuenta,
        resumen: h.resumen || `Cobro ${h.cuenta}${periodo} ${h.accion === 'creacion' ? 'creado' : h.accion === 'eliminacion' ? 'eliminado' : 'actualizado'}`,
        detalle: h.cambios || `${h.cuenta} — ${h.descripcion_cobro || 'Sin descripción'}${periodo}`,
        created_at: h.created_at,
      });
    });

    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [factoresHist, cuentasHist, catalogoHist, cobrosCuentasHist, cobrosRegistrosHist]);

  const filtered = useMemo(() => {
    return entradas.filter((e) => {
      const matchModulo = filtroModulo === 'todos' || e.modulo === filtroModulo;
      const matchSearch = !search
        || e.tipo_registro.toLowerCase().includes(search.toLowerCase())
        || (e.resumen || '').toLowerCase().includes(search.toLowerCase())
        || (e.detalle || '').toLowerCase().includes(search.toLowerCase());
      return matchModulo && matchSearch;
    });
  }, [entradas, filtroModulo, search]);

  // Stats
  const stats = useMemo(() => {
    const total = entradas.length;
    const tasas = entradas.filter((e) => e.modulo === 'tasas').length;
    const cuentas = entradas.filter((e) => e.modulo === 'cuentas-ajustadas').length;
    const catalogo = entradas.filter((e) => e.modulo === 'catalogo').length;
    const cobrosCtas = entradas.filter((e) => e.modulo === 'cobros-cuentas').length;
    const cobrosReg = entradas.filter((e) => e.modulo === 'cobros-registros').length;
    const creaciones = entradas.filter((e) => e.accion === 'creacion').length;
    const actualizaciones = entradas.filter((e) => e.accion === 'actualizacion').length;
    const eliminaciones = entradas.filter((e) => e.accion === 'eliminacion').length;
    return { total, tasas, cuentas, catalogo, cobrosCtas, cobrosReg, creaciones, actualizaciones, eliminaciones };
  }, [entradas]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground-950">Historial de Cambios</h1>
          <p className="text-sm text-foreground-700">Registro de todas las modificaciones realizadas en el sistema</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Total Registros</p>
          <p className="text-xl font-bold text-foreground-950">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Tasas</p>
          <p className="text-xl font-bold text-accent-600">{stats.tasas}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Cuentas Ajustadas</p>
          <p className="text-xl font-bold text-emerald-600">{stats.cuentas}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Catálogo GYP</p>
          <p className="text-xl font-bold text-sky-600">{stats.catalogo}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Cobros Cofersa</p>
          <p className="text-xl font-bold text-amber-600">{stats.cobrosCtas + stats.cobrosReg}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Creaciones</p>
          <p className="text-xl font-bold text-emerald-600">{stats.creaciones}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Actualizaciones</p>
          <p className="text-xl font-bold text-amber-600">{stats.actualizaciones}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Eliminaciones</p>
          <p className="text-xl font-bold text-rose-600">{stats.eliminaciones}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-700 w-5 h-5 flex items-center justify-center"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por tipo, resumen o detalle..."
            className="w-full rounded-lg border border-background-200 bg-background-100 py-2 pl-10 pr-4 text-sm text-foreground-950 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFiltroModulo('todos')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${filtroModulo === 'todos' ? 'bg-foreground-950 text-background-50' : 'bg-background-100 text-foreground-700 hover:bg-background-200'}`}
          >
            Todos
          </button>
          {(['tasas', 'cuentas-ajustadas', 'catalogo', 'cobros-cuentas', 'cobros-registros'] as string[]).map((mod) => {
            const modColor = MODULO_COLORS[mod];
            const count = mod === 'tasas' ? stats.tasas
              : mod === 'cuentas-ajustadas' ? stats.cuentas
              : mod === 'catalogo' ? stats.catalogo
              : mod === 'cobros-cuentas' ? stats.cobrosCtas
              : stats.cobrosReg;
            return (
              <button
                key={mod}
                onClick={() => setFiltroModulo(mod)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                  filtroModulo === mod
                    ? `${modColor.bg} ${modColor.text} ring-1 ring-current/30`
                    : 'bg-background-100 text-foreground-700 hover:bg-background-200'
                }`}
              >
                <i className={`${modColor.icon} w-4 h-4 flex items-center justify-center`}></i>
                {MODULO_LABELS[mod]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200 text-left text-foreground-700 sticky top-0 bg-background-50 z-10">
                <th className="py-3 pr-4 pl-4 font-medium whitespace-nowrap">Fecha y Hora</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Módulo</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Acción</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Tipo / Cuenta</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Resumen</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-background-100">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4 pl-4"><div className="h-4 bg-background-200 rounded animate-pulse w-20"></div></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-foreground-600">
                    <div className="flex flex-col items-center gap-2">
                      <i className="ri-history-line text-4xl text-foreground-400 w-10 h-10 flex items-center justify-center"></i>
                      <p>Sin registros en el historial</p>
                      {search && <p className="text-xs text-foreground-500">Intentá con otros términos de búsqueda</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => {
                  const modBadge = MODULO_COLORS[entry.modulo] || MODULO_COLORS.tasas;
                  const accBadge = ACCION_COLORS[entry.accion] || ACCION_COLORS.actualizacion;
                  return (
                    <tr key={entry.id} className="border-b border-background-100 hover:bg-background-100/70">
                      <td className="py-2.5 pr-4 pl-4 text-foreground-700 whitespace-nowrap text-xs">
                        {formatTimestamp(entry.created_at)}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${modBadge.bg} ${modBadge.text}`}>
                          <i className={`${modBadge.icon} w-3 h-3 flex items-center justify-center`}></i>
                          {MODULO_LABELS[entry.modulo] || entry.modulo}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${accBadge.bg} ${accBadge.text}`}>
                          <i className={`${accBadge.icon} w-3 h-3 flex items-center justify-center`}></i>
                          {entry.accion === 'creacion' ? 'Creación' : entry.accion === 'eliminacion' ? 'Eliminación' : 'Actualización'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-foreground-950 font-medium whitespace-nowrap text-xs font-mono">
                        {entry.tipo_registro}
                      </td>
                      <td className="py-2.5 pr-4 text-foreground-700 text-xs min-w-[150px]">
                        {entry.resumen || '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-foreground-600 text-xs min-w-[250px]">
                        {entry.detalle || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-foreground-600">
        <span>Mostrando {filtered.length} de {entradas.length} registros</span>
        <span className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 border border-background-200 bg-background-100 hover:bg-background-200 transition-colors"
          >
            <i className="ri-refresh-line w-4 h-4 flex items-center justify-center"></i>
            Actualizar
          </button>
        </span>
      </div>
    </div>
  );
}