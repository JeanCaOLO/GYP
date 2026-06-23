import { useMemo, useState, useCallback } from 'react';
import type { CuentaAjustada, Organizacion, Pais, Compania, CentroCosto } from '@/types';
import { evaluarFormula, extraerCuentasReferenciadas, extraerCategoriasReferenciadas } from '@/lib/formulaEngine';
import type { FormulaContext } from '@/lib/formulaEngine';

const ANIO_DEFAULT = 2026;

function formatNumero(n: number | null) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface CuentaAjustadaModalProps {
  item: CuentaAjustada | null;
  todasLasCuentas: CuentaAjustada[];
  todosLosMontos: { cuenta_ajustada_id: string; anio: number; mes: number; monto: number; formula?: string | null }[];
  factoresMap: Map<string, number>;
  organizaciones: Organizacion[];
  paises: Pais[];
  companias: Compania[];
  centrosCostos: CentroCosto[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}

export default function CuentaAjustadaModal({
  item,
  todasLasCuentas,
  todosLosMontos,
  factoresMap,
  organizaciones,
  paises,
  companias,
  centrosCostos,
  onClose,
  onSave,
}: CuentaAjustadaModalProps) {
  const [form, setForm] = useState({
    cuenta_contable: item?.cuenta_contable || '',
    descripcion_ajuste: item?.descripcion_ajuste || '',
    tipo_saldo: item?.tipo_saldo || 'acreedor',
    ajuste: item?.ajuste ?? 0,
    fecha: item?.fecha || '',
    vista: item?.vista || '',
    categoria_padre: item?.categoria_padre || '',
    es_cuenta_padre: item?.es_cuenta_padre ?? false,
    activa: item?.activa ?? true,
    pais_id: item?.pais_id || '',
    compania_id: item?.compania_id || '',
    centro_costo_id: item?.centro_costo_id || '',
    organizacion_id: item?.organizacion_id || '',
  });
  const [modoAjuste, setModoAjuste] = useState<'manual' | 'formula'>('manual');
  const [formulaAjuste, setFormulaAjuste] = useState('');

  const cuentaIdToCodigo = useMemo(() => {
    const map = new Map<string, string>();
    todasLasCuentas.forEach((c) => map.set(c.id, c.cuenta_contable));
    return map;
  }, [todasLasCuentas]);

  const montosGlobales = useMemo(() => {
    const map = new Map<string, number>();
    todosLosMontos.forEach((m) => {
      const codigo = cuentaIdToCodigo.get(m.cuenta_ajustada_id);
      if (codigo) {
        map.set(`${m.anio}|${m.mes}|${codigo}`, m.monto);
      }
    });
    return map;
  }, [todosLosMontos, cuentaIdToCodigo]);

  const buildAjusteContext = useCallback((): FormulaContext => {
    const saldos = new Map<string, number>();
    montosGlobales.forEach((monto, key) => {
      const [anio, _mes, cuenta] = key.split('|');
      if (Number(anio) === ANIO_DEFAULT && cuenta !== form.cuenta_contable) {
        saldos.set(cuenta, (saldos.get(cuenta) || 0) + monto);
      }
    });

    const cuentaToCategoria = new Map<string, string>();
    todasLasCuentas.forEach((c) => {
      if (c.vista === 'GYP Gerencial' && !c.es_cuenta_padre && c.categoria_padre) {
        cuentaToCategoria.set(c.cuenta_contable, c.categoria_padre);
      }
    });

    const categoriaTotales = new Map<string, number>();
    saldos.forEach((totalCuenta, cuenta) => {
      const cat = cuentaToCategoria.get(cuenta);
      if (cat) {
        categoriaTotales.set(cat, (categoriaTotales.get(cat) || 0) + totalCuenta);
      }
    });

    return { anio: ANIO_DEFAULT, mes: 1, saldos, categoriaTotales, factores: factoresMap };
  }, [montosGlobales, todasLasCuentas, form.cuenta_contable, factoresMap]);

  const ajustePreview = useMemo(() => {
    if (modoAjuste !== 'formula' || !formulaAjuste.trim()) return null;
    const ctx = buildAjusteContext();
    try {
      const result = evaluarFormula(formulaAjuste, ctx);
      if (result === null) return { monto: 0, error: 'La fórmula no produjo un resultado válido' };
      return { monto: result, error: null };
    } catch (e) {
      return { monto: 0, error: (e as Error).message };
    }
  }, [modoAjuste, formulaAjuste, buildAjusteContext]);

  const ajusteRefs = useMemo(() => {
    if (modoAjuste !== 'formula') return [];
    const cuentas = extraerCuentasReferenciadas(formulaAjuste).map((c) => ({ type: 'cuenta' as const, value: c }));
    const categorias = extraerCategoriasReferenciadas(formulaAjuste).map((c) => ({ type: 'categoria' as const, value: c }));
    return [...cuentas, ...categorias];
  }, [modoAjuste, formulaAjuste]);

  const codigoToDescripcion = useMemo(() => {
    const map = new Map<string, string>();
    todasLasCuentas.forEach((c) => map.set(c.cuenta_contable, c.descripcion_ajuste));
    return map;
  }, [todasLasCuentas]);

  const cuentasDisponibles = useMemo(() => {
    return todasLasCuentas
      .filter((c) => c.vista === 'GYP Gerencial' && !c.es_cuenta_padre && c.cuenta_contable !== form.cuenta_contable)
      .sort((a, b) => a.cuenta_contable.localeCompare(b.cuenta_contable));
  }, [todasLasCuentas, form.cuenta_contable]);

  const categoriasDisponibles = useMemo(() => {
    const cats = new Set<string>();
    todasLasCuentas
      .filter((c) => c.vista === 'GYP Gerencial' && !c.es_cuenta_padre && c.categoria_padre)
      .forEach((c) => cats.add(c.categoria_padre!));
    return Array.from(cats).sort();
  }, [todasLasCuentas]);

  const handleSave = () => {
    let ajusteVal = form.ajuste;
    if (modoAjuste === 'formula' && formulaAjuste.trim() && ajustePreview && !ajustePreview.error) {
      ajusteVal = ajustePreview.monto;
    }
    onSave({ ...form, ajuste: ajusteVal });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-slate-900">{item ? 'Editar Ajuste' : 'Nuevo Ajuste'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta Contable *</label>
            <input type="text" value={form.cuenta_contable} onChange={(e) => setForm({ ...form, cuenta_contable: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="Ej: 7.1.1.01.1.005" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción para Ajuste *</label>
            <input type="text" value={form.descripcion_ajuste} onChange={(e) => setForm({ ...form, descripcion_ajuste: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="Ej: Vacaciones" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Saldo</label>
              <select value={form.tipo_saldo} onChange={(e) => setForm({ ...form, tipo_saldo: e.target.value as 'acreedor' | 'deudor' })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="acreedor">Acreedor</option>
                <option value="deudor">Deudor</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-slate-700">Ajuste</label>
                <button
                  type="button"
                  onClick={() => {
                    if (modoAjuste === 'manual') {
                      setModoAjuste('formula');
                      setFormulaAjuste('');
                    } else {
                      setModoAjuste('manual');
                      if (ajustePreview && !ajustePreview.error) {
                        setForm({ ...form, ajuste: ajustePreview.monto });
                      }
                      setFormulaAjuste('');
                    }
                  }}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    modoAjuste === 'formula'
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                  }`}
                >
                  {modoAjuste === 'formula' ? (
                    <><span className="font-mono font-bold">f(x)</span> Fórmula</>
                  ) : (
                    <><i className="ri-edit-line w-3 h-3 flex items-center justify-center"></i> Manual</>
                  )}
                </button>
              </div>
              {modoAjuste === 'formula' ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={formulaAjuste}
                    onChange={(e) => setFormulaAjuste(e.target.value)}
                    placeholder="Ej: 7.1.1.01.1.005 * 0.5 + [Gastos varios]"
                    className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    spellCheck={false}
                  />
                  {formulaAjuste.trim() && ajustePreview && (
                    <div className={`rounded-lg px-3 py-1.5 text-xs ${ajustePreview.error ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                      {ajustePreview.error ? (
                        <span className="flex items-center gap-1">
                          <i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>
                          {ajustePreview.error}
                        </span>
                      ) : (
                        <span>= {formatNumero(ajustePreview.monto)}</span>
                      )}
                    </div>
                  )}
                  {ajusteRefs.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {ajusteRefs.map((ref) => {
                        if (ref.type === 'categoria') {
                          const catTotal = buildAjusteContext().categoriaTotales.get(ref.value) ?? 0;
                          return (
                            <span key={`cat-${ref.value}`} className="inline-flex items-center gap-1 rounded-full bg-accent-100 border border-accent-200 px-2 py-0.5 text-[10px] text-accent-700" title={`Categoría: ${ref.value}`}>
                              <i className="ri-folder-line w-3 h-3 flex items-center justify-center"></i>
                              <span className="font-medium">{ref.value}</span>
                              <span className="text-accent-500">({formatNumero(catTotal)})</span>
                            </span>
                          );
                        }
                        const desc = codigoToDescripcion.get(ref.value);
                        const saldo = buildAjusteContext().saldos.get(ref.value) ?? 0;
                        return (
                          <span key={`cuenta-${ref.value}`} className="inline-flex items-center gap-1 rounded-full bg-background-100 border border-background-200 px-2 py-0.5 text-[10px] text-foreground-700" title={desc || ref.value}>
                            <span className="font-mono font-medium">{ref.value}</span>
                            <span className="text-foreground-500">({formatNumero(saldo)})</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <input type="number" step="0.01" value={form.ajuste} onChange={(e) => setForm({ ...form, ajuste: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.00 (puede ser negativo)" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vista</label>
              <select value={form.vista} onChange={(e) => setForm({ ...form, vista: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar...</option>
                <option value="GYP">GYP</option>
                <option value="GYP Gerencial">GYP Gerencial</option>
                <option value="GYP Proyectada">GYP Proyectada</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Categoría Padre</label>
              <input type="text" value={form.categoria_padre} onChange={(e) => setForm({ ...form, categoria_padre: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="Ej: Personal, Gastos varios" />
            </div>
            <div className="flex flex-col gap-1 pt-1">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="es-padre" checked={form.es_cuenta_padre} onChange={(e) => setForm({ ...form, es_cuenta_padre: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="es-padre" className="text-sm text-slate-700">Es cuenta padre (fila de total)</label>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="activa-ajuste" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            <label htmlFor="activa-ajuste" className="text-sm text-slate-700">Activa</label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Organización</label>
              <select value={form.organizacion_id} onChange={(e) => setForm({ ...form, organizacion_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar organización...</option>
                {organizaciones.map((o) => (<option key={o.id} value={o.id}>{o.nombre}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
              <select value={form.pais_id} onChange={(e) => setForm({ ...form, pais_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar país...</option>
                {paises.map((p) => (<option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Compañía</label>
              <select value={form.compania_id} onChange={(e) => setForm({ ...form, compania_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar compañía...</option>
                {companias.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Centro de Costo</label>
              <select value={form.centro_costo_id} onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar centro de costo...</option>
                {centrosCostos.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
            </div>
          </div>

          {cuentasDisponibles.length > 0 && (
            <details className="rounded-xl border border-slate-200 overflow-hidden">
              <summary className="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 select-none">
                <span className="inline-flex items-center gap-2">
                  <i className="ri-list-check w-4 h-4 flex items-center justify-center text-slate-500"></i>
                  Cuentas disponibles ({cuentasDisponibles.length})
                </span>
              </summary>
              <div className="p-3 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {cuentasDisponibles.map((c) => (
                    <button key={c.id} type="button" className="text-left rounded-lg px-3 py-2 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors cursor-pointer" onClick={() => navigator.clipboard.writeText(c.cuenta_contable).catch(() => {})} title="Clic para copiar código de cuenta">
                      <span className="font-mono text-xs font-medium text-emerald-700">{c.cuenta_contable}</span>
                      <span className="text-xs text-slate-500 ml-2">{c.descripcion_ajuste}</span>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          )}

          {categoriasDisponibles.length > 0 && (
            <details className="rounded-xl border border-slate-200 overflow-hidden">
              <summary className="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 select-none">
                <span className="inline-flex items-center gap-2">
                  <i className="ri-folder-line w-4 h-4 flex items-center justify-center text-accent-500"></i>
                  Categorías disponibles ({categoriasDisponibles.length})
                </span>
              </summary>
              <div className="p-3 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {categoriasDisponibles.map((cat) => (
                    <button key={cat} type="button" className="text-left rounded-lg px-3 py-2 hover:bg-accent-50 border border-transparent hover:border-accent-200 transition-colors cursor-pointer" onClick={() => navigator.clipboard.writeText(`[${cat}]`).catch(() => {})} title={`Clic para copiar [${cat}]`}>
                      <span className="inline-flex items-center gap-1.5">
                        <i className="ri-folder-line w-3.5 h-3.5 flex items-center justify-center text-accent-500"></i>
                        <span className="font-mono text-xs font-medium text-accent-700">[{cat}]</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          )}
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
          <button onClick={handleSave} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">Guardar</button>
        </div>
      </div>
    </div>
  );
}