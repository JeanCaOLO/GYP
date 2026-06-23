import { useEffect, useMemo, useState, useCallback } from 'react';
import type { CuentaAjustada, CuentaAjustadaMontoMensual } from '@/types';
import { evaluarFormula, extraerCuentasReferenciadas, extraerCategoriasReferenciadas } from '@/lib/formulaEngine';
import type { FormulaContext } from '@/lib/formulaEngine';

const ANIO_DEFAULT = 2026;
const MESES_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatNumero(n: number) {
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

interface EditMontosMensualesModalProps {
  item: CuentaAjustada;
  itemMontos: Map<number, Map<number, number>>;
  todasLasCuentas: CuentaAjustada[];
  todosLosMontos: CuentaAjustadaMontoMensual[];
  factoresMap: Map<string, number>;
  onClose: () => void;
  onSave: (cuentaId: string, montos: { anio: number; mes: number; monto: number; formula: string | null }[]) => void;
}

export default function EditMontosMensualesModal({
  item,
  itemMontos,
  todasLasCuentas,
  todosLosMontos,
  factoresMap,
  onClose,
  onSave,
}: EditMontosMensualesModalProps) {
  const cuentaIdToCodigo = useMemo(() => {
    const map = new Map<string, string>();
    todasLasCuentas.forEach((c) => map.set(c.id, c.cuenta_contable));
    return map;
  }, [todasLasCuentas]);

  const montosGlobales = useMemo(() => {
    const map = new Map<string, number>();
    todosLosMontos.forEach((m) => {
      const codigo = cuentaIdToCodigo.get(m.cuenta_ajustada_id);
      if (codigo) map.set(`${m.anio}|${m.mes}|${codigo}`, m.monto);
    });
    return map;
  }, [todosLosMontos, cuentaIdToCodigo]);

  const codigoToDescripcion = useMemo(() => {
    const map = new Map<string, string>();
    todasLasCuentas.forEach((c) => map.set(c.cuenta_contable, c.descripcion_ajuste));
    return map;
  }, [todasLasCuentas]);

  const categoriaTotalesGlobales = useMemo(() => {
    const map = new Map<string, number>();
    const cuentaToCategoria = new Map<string, string>();
    todasLasCuentas.forEach((c) => {
      if (c.vista === 'GYP Gerencial' && !c.es_cuenta_padre && c.categoria_padre) {
        cuentaToCategoria.set(c.cuenta_contable, c.categoria_padre);
      }
    });
    montosGlobales.forEach((monto, key) => {
      const [anio, mes, cuenta] = key.split('|');
      const categoria = cuentaToCategoria.get(cuenta);
      if (categoria) {
        const catKey = `${anio}|${mes}|${categoria}`;
        map.set(catKey, (map.get(catKey) || 0) + monto);
      }
    });
    return map;
  }, [montosGlobales, todasLasCuentas]);

  const buildFormulaContext = useCallback((anio: number, mes: number): FormulaContext => {
    const saldos = new Map<string, number>();
    montosGlobales.forEach((monto, key) => {
      const [a, m, cuenta] = key.split('|');
      if (Number(a) === anio && Number(m) === mes && cuenta !== item.cuenta_contable) {
        saldos.set(cuenta, monto);
      }
    });
    const categoriaTotales = new Map<string, number>();
    categoriaTotalesGlobales.forEach((total, key) => {
      const [a, m, categoria] = key.split('|');
      if (Number(a) === anio && Number(m) === mes) categoriaTotales.set(categoria, total);
    });
    return { anio, mes, saldos, categoriaTotales, factores: factoresMap };
  }, [montosGlobales, categoriaTotalesGlobales, item.cuenta_contable, factoresMap]);

  const [years, setYears] = useState<number[]>(() => {
    const existing = Array.from(itemMontos.keys());
    if (!existing.includes(ANIO_DEFAULT)) return [...existing, ANIO_DEFAULT].sort((a, b) => b - a);
    return existing.sort((a, b) => b - a);
  });
  const [selectedYear, setSelectedYear] = useState(ANIO_DEFAULT);

  const [cellsByYear, setCellsByYear] = useState<Map<number, { mes: number; monto: number; formula: string; mode: 'manual' | 'formula' }[]>>(() => {
    const map = new Map<number, { mes: number; monto: number; formula: string; mode: 'manual' | 'formula' }[]>();
    const initYears = Array.from(itemMontos.keys());
    if (!initYears.includes(ANIO_DEFAULT)) initYears.push(ANIO_DEFAULT);
    initYears.forEach((year) => {
      const yearData = itemMontos.get(year);
      const arr = Array.from({ length: 12 }, (_, i) => {
        const mes = i + 1;
        const monto = yearData?.get(mes) ?? 0;
        const savedFormula = todosLosMontos.find((m) => m.cuenta_ajustada_id === item.id && m.anio === year && m.mes === mes)?.formula;
        return { mes, monto, formula: savedFormula || '', mode: (savedFormula && savedFormula.trim() ? 'formula' : 'manual') as 'manual' | 'formula' };
      });
      map.set(year, arr);
    });
    return map;
  });
  const [showAddYear, setShowAddYear] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');

  const handleChangeMonto = (year: number, mes: number, value: string) => {
    const num = value === '' ? 0 : Number(value);
    setCellsByYear((prev) => {
      const next = new Map(prev);
      const yearData = next.get(year);
      if (yearData) next.set(year, yearData.map((c) => (c.mes === mes ? { ...c, monto: num } : c)));
      return next;
    });
  };

  const handleChangeFormula = (year: number, mes: number, value: string) => {
    setCellsByYear((prev) => {
      const next = new Map(prev);
      const yearData = next.get(year);
      if (yearData) next.set(year, yearData.map((c) => (c.mes === mes ? { ...c, formula: value } : c)));
      return next;
    });
  };

  const toggleMode = (year: number, mes: number) => {
    setCellsByYear((prev) => {
      const next = new Map(prev);
      const yearData = next.get(year);
      if (yearData) {
        next.set(year, yearData.map((c) => {
          if (c.mes !== mes) return c;
          if (c.mode === 'manual') return { ...c, mode: 'formula' as const, formula: '' };
          const ctx = buildFormulaContext(year, mes);
          const calc = evaluarFormula(c.formula, ctx);
          return { ...c, mode: 'manual' as const, monto: calc ?? c.monto, formula: '' };
        }));
      }
      return next;
    });
  };

  const getFormulaPreview = (year: number, mes: number, formula: string) => {
    if (!formula.trim()) return { monto: 0, error: null };
    const ctx = buildFormulaContext(year, mes);
    try {
      const result = evaluarFormula(formula, ctx);
      if (result === null) return { monto: 0, error: 'La fórmula no produjo un resultado válido' };
      return { monto: result, error: null };
    } catch (e) { return { monto: 0, error: (e as Error).message }; }
  };

  const getReferencias = (formula: string) => {
    const cuentas = extraerCuentasReferenciadas(formula).map((c) => ({ type: 'cuenta' as const, value: c }));
    const categorias = extraerCategoriasReferenciadas(formula).map((c) => ({ type: 'categoria' as const, value: c }));
    return [...cuentas, ...categorias];
  };

  const addYear = () => {
    const y = parseInt(newYearInput, 10);
    if (isNaN(y) || y < 2000 || y > 2100) return;
    if (years.includes(y)) return;
    setYears((prev) => [...prev, y].sort((a, b) => b - a));
    setCellsByYear((prev) => {
      const next = new Map(prev);
      next.set(y, Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, monto: 0, formula: '', mode: 'manual' as const })));
      return next;
    });
    setSelectedYear(y);
    setShowAddYear(false);
    setNewYearInput('');
  };

  const removeYear = (year: number) => {
    if (year === ANIO_DEFAULT) return;
    setYears((prev) => prev.filter((y) => y !== year));
    setCellsByYear((prev) => { const next = new Map(prev); next.delete(year); return next; });
    if (selectedYear === year) setSelectedYear(ANIO_DEFAULT);
  };

  const getYearTotal = (year: number) => {
    const data = cellsByYear.get(year);
    if (!data) return 0;
    return data.reduce((acc, c) => {
      if (c.mode === 'formula' && c.formula.trim()) {
        const preview = getFormulaPreview(year, c.mes, c.formula);
        return acc + (preview.error ? 0 : preview.monto);
      }
      return acc + c.monto;
    }, 0);
  };

  const handleSave = () => {
    const allData: { anio: number; mes: number; monto: number; formula: string | null }[] = [];
    cellsByYear.forEach((data, year) => {
      data.forEach((c) => {
        if (c.mode === 'formula' && c.formula.trim()) {
          const preview = getFormulaPreview(year, c.mes, c.formula);
          allData.push({ anio: year, mes: c.mes, monto: preview.error ? 0 : preview.monto, formula: c.formula.trim() });
        } else {
          allData.push({ anio: year, mes: c.mes, monto: c.monto, formula: null });
        }
      });
    });
    onSave(item.id, allData);
  };

  const currentYearData = cellsByYear.get(selectedYear) || [];

  const cuentasDisponibles = useMemo(() => {
    return todasLasCuentas.filter((c) => c.id !== item.id && c.vista === 'GYP Gerencial' && !c.es_cuenta_padre).sort((a, b) => a.cuenta_contable.localeCompare(b.cuenta_contable));
  }, [todasLasCuentas, item.id]);

  const categoriasDisponibles = useMemo(() => {
    const cats = new Set<string>();
    todasLasCuentas.filter((c) => c.vista === 'GYP Gerencial' && !c.es_cuenta_padre && c.categoria_padre).forEach((c) => cats.add(c.categoria_padre!));
    return Array.from(cats).sort();
  }, [todasLasCuentas]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[90vh] rounded-xl bg-white shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Editar Montos Mensuales</h3>
            <p className="text-sm text-slate-500 mt-0.5">{item.cuenta_contable} — {item.descripcion_ajuste}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100"><i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i></button>
        </div>
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {years.map((year) => (
              <div key={year} className="flex items-center">
                <button onClick={() => setSelectedYear(year)} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${selectedYear === year ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  {year}
                  {year !== ANIO_DEFAULT && <span onClick={(e) => { e.stopPropagation(); removeYear(year); }} className={`ml-1 w-4 h-4 rounded-full flex items-center justify-center text-xs cursor-pointer ${selectedYear === year ? 'hover:bg-emerald-500' : 'hover:bg-slate-300'}`} title={`Quitar ${year}`}><i className="ri-close-line w-3 h-3 flex items-center justify-center"></i></span>}
                  {year === ANIO_DEFAULT && <span className="ml-1 text-[10px] opacity-70">actual</span>}
                </button>
              </div>
            ))}
            {showAddYear ? (
              <div className="flex items-center gap-1">
                <input type="number" value={newYearInput} onChange={(e) => setNewYearInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addYear(); if (e.key === 'Escape') { setShowAddYear(false); setNewYearInput(''); } }} placeholder="Año" className="w-20 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" autoFocus />
                <button onClick={addYear} className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 transition-colors" title="Confirmar"><i className="ri-check-line w-3.5 h-3.5 flex items-center justify-center"></i></button>
                <button onClick={() => { setShowAddYear(false); setNewYearInput(''); }} className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300 transition-colors" title="Cancelar"><i className="ri-close-line w-3.5 h-3.5 flex items-center justify-center"></i></button>
              </div>
            ) : (
              <button onClick={() => setShowAddYear(true)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium border border-dashed border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors whitespace-nowrap"><i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>Añadir año</button>
            )}
          </div>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-2.5 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Año {selectedYear}</p>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><i className="ri-edit-line w-3.5 h-3.5 flex items-center justify-center"></i> Manual</span>
              <span className="inline-flex items-center gap-1"><span className="font-mono text-emerald-600 font-medium">f(x)</span> Fórmula</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentYearData.map((cell) => {
              const isFormula = cell.mode === 'formula';
              const preview = isFormula && cell.formula.trim() ? getFormulaPreview(selectedYear, cell.mes, cell.formula) : null;
              const refs = isFormula ? getReferencias(cell.formula) : [];
              return (
                <div key={cell.mes} className={`rounded-xl border-2 p-4 transition-colors ${isFormula ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-slate-700">{MESES_LABELS[cell.mes - 1]}-{String(selectedYear).slice(-2)}</span>
                    <button onClick={() => toggleMode(selectedYear, cell.mes)} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${isFormula ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`} title={isFormula ? 'Cambiar a modo manual' : 'Cambiar a modo fórmula'}>
                      {isFormula ? <><span className="font-mono font-bold">f(x)</span> Fórmula</> : <><i className="ri-edit-line w-3 h-3 flex items-center justify-center"></i> Manual</>}
                    </button>
                  </div>
                  {isFormula ? (
                    <div className="space-y-2">
                      <input type="text" value={cell.formula} onChange={(e) => handleChangeFormula(selectedYear, cell.mes, e.target.value)} placeholder="Ej: 7.1.1.01.1.005 * 0.5 + 1000" className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" spellCheck={false} />
                      {cell.formula.trim() && preview && (
                        <div className={`rounded-lg px-3 py-1.5 text-xs ${preview.error ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                          {preview.error ? <span className="flex items-center gap-1"><i className="ri-error-warning-line w-3.5 h-3.5 flex items-center justify-center"></i>{preview.error}</span> : <span>= {formatNumero(preview.monto)}</span>}
                        </div>
                      )}
                      {refs.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {refs.map((ref) => {
                            if (ref.type === 'categoria') {
                              const catTotal = categoriaTotalesGlobales.get(`${selectedYear}|${cell.mes}|${ref.value}`) ?? 0;
                              return <span key={`cat-${ref.value}`} className="inline-flex items-center gap-1 rounded-full bg-accent-100 border border-accent-200 px-2 py-0.5 text-[10px] text-accent-700"><i className="ri-folder-line w-3 h-3 flex items-center justify-center"></i><span className="font-medium">{ref.value}</span><span className="text-accent-500">({formatNumero(catTotal)})</span></span>;
                            }
                            const desc = codigoToDescripcion.get(ref.value);
                            const saldo = montosGlobales.get(`${selectedYear}|${cell.mes}|${ref.value}`) ?? 0;
                            return <span key={`cuenta-${ref.value}`} className="inline-flex items-center gap-1 rounded-full bg-background-100 border border-background-200 px-2 py-0.5 text-[10px] text-foreground-700"><span className="font-mono font-medium">{ref.value}</span><span className="text-foreground-500">({formatNumero(saldo)})</span></span>;
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <input type="number" step="0.01" value={cell.monto || ''} onChange={(e) => handleChangeMonto(selectedYear, cell.mes, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-right font-medium" placeholder="0" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Total {selectedYear}</span>
            <span className="text-lg font-bold text-slate-900">{formatNumero(getYearTotal(selectedYear))}</span>
          </div>
          {selectedYear === ANIO_DEFAULT && (
            <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200 flex items-center gap-2">
              <i className="ri-information-line text-emerald-600 w-5 h-5 flex items-center justify-center"></i>
              <p className="text-xs text-emerald-700">El total del año <strong>{ANIO_DEFAULT}</strong> se guardará como <strong>Ajuste</strong> en la tabla principal.</p>
            </div>
          )}
          {cuentasDisponibles.length > 0 && (
            <details className="rounded-xl border border-slate-200 overflow-hidden">
              <summary className="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 select-none"><span className="inline-flex items-center gap-2"><i className="ri-list-check w-4 h-4 flex items-center justify-center text-slate-500"></i>Cuentas disponibles ({cuentasDisponibles.length})</span></summary>
              <div className="p-3 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {cuentasDisponibles.map((c) => (
                    <button key={c.id} type="button" className="text-left rounded-lg px-3 py-2 hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors cursor-pointer" onClick={() => navigator.clipboard.writeText(c.cuenta_contable).catch(() => {})} title="Clic para copiar código de cuenta">
                      <span className="font-mono text-xs font-medium text-emerald-700">{c.cuenta_contable}</span><span className="text-xs text-slate-500 ml-2">{c.descripcion_ajuste}</span>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          )}
          {categoriasDisponibles.length > 0 && (
            <details className="rounded-xl border border-slate-200 overflow-hidden">
              <summary className="px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 select-none"><span className="inline-flex items-center gap-2"><i className="ri-folder-line w-4 h-4 flex items-center justify-center text-accent-500"></i>Categorías disponibles ({categoriasDisponibles.length})</span></summary>
              <div className="p-3 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {categoriasDisponibles.map((cat) => (
                    <button key={cat} type="button" className="text-left rounded-lg px-3 py-2 hover:bg-accent-50 border border-transparent hover:border-accent-200 transition-colors cursor-pointer" onClick={() => navigator.clipboard.writeText(`[${cat}]`).catch(() => {})} title={`Clic para copiar [${cat}]`}>
                      <span className="inline-flex items-center gap-1.5"><i className="ri-folder-line w-3.5 h-3.5 flex items-center justify-center text-accent-500"></i><span className="font-mono text-xs font-medium text-accent-700">[{cat}]</span></span>
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