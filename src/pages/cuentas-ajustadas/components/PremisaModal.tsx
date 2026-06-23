import { useMemo, useState, useCallback, useEffect } from 'react';
import type { PremisaProyeccion, VentaProyeccion, Organizacion, Pais, Compania, CentroCosto } from '@/types';
import { calcularValorProyectado, evaluarFormula } from '@/lib/formulaEngine';
import type { FormulaContext } from '@/lib/formulaEngine';

const ANIO_DEFAULT = 2026;

function formatNumero2(n: number) {
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

interface PremisaModalProps {
  item: PremisaProyeccion | null;
  organizaciones: Organizacion[];
  paises: Pais[];
  companias: Compania[];
  centrosCostos: CentroCosto[];
  ventasLookup: Map<string, VentaProyeccion>;
  factoresMap: Map<string, number>;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}

export default function PremisaModal({ item, organizaciones, paises, companias, centrosCostos, ventasLookup, factoresMap, onClose, onSave }: PremisaModalProps) {
  const [form, setForm] = useState({
    organizacion_id: item?.organizacion_id || '',
    pais_id: item?.pais_id || '',
    compania_id: item?.compania_id || '',
    cuenta_contable: item?.cuenta_contable || '',
    centro_costo_id: item?.centro_costo_id || '',
    anio: item?.anio ?? ANIO_DEFAULT,
    mes: item?.mes ?? 1,
    metodo: item?.metodo || 'valor_directo' as 'valor_directo' | 'calculado',
    valor_dolar: item?.valor_dolar ?? null as number | null,
    pct_venta: item?.pct_venta ?? null as number | null,
    base_venta: item?.base_venta || (null as 'actual' | 'proyectada' | null),
    pct_semineto: item?.pct_semineto ?? null as number | null,
    formula: item?.formula || '',
  });

  // Resolve ventas for the selected scope
  const ventasResolved = useMemo(() => {
    const key = `${form.organizacion_id}|${form.pais_id}|${form.compania_id}|general|${form.anio}|${form.mes}`;
    const v = ventasLookup.get(key);
    return {
      venta_actual: v?.venta_actual ?? 0,
      venta_proyectada: v?.venta_proyectada ?? 0,
      semi_neto: v?.semi_neto ?? 0,
    };
  }, [ventasLookup, form.organizacion_id, form.pais_id, form.compania_id, form.anio, form.mes]);

  // Build formula context
  const formulaCtx: FormulaContext = useMemo(() => ({
    anio: form.anio,
    mes: form.mes,
    saldos: new Map(),
    categoriaTotales: new Map(),
    factores: factoresMap,
    variables: new Map([
      ['Venta Actual', ventasResolved.venta_actual],
      ['Venta Proyectada', ventasResolved.venta_proyectada],
      ['Semi Neto', ventasResolved.semi_neto],
    ]),
  }), [form.anio, form.mes, factoresMap, ventasResolved]);

  // Live preview of valor_proyectado
  const preview = useMemo(() => {
    return calcularValorProyectado({
      metodo: form.metodo,
      valor_dolar: form.valor_dolar,
      pct_venta: form.pct_venta,
      base_venta: form.base_venta,
      pct_semineto: form.pct_semineto,
      formula: (form.formula && form.formula.trim()) || null,
      venta_actual: ventasResolved.venta_actual,
      venta_proyectada: ventasResolved.venta_proyectada,
      semi_neto: ventasResolved.semi_neto,
      ctx: formulaCtx,
    });
  }, [form, ventasResolved, formulaCtx]);

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      ...form,
      valor_dolar: form.valor_dolar ?? null,
      pct_venta: form.pct_venta ?? null,
      base_venta: form.base_venta || null,
      pct_semineto: form.pct_semineto ?? null,
      formula: (form.formula && form.formula.trim()) || null,
    };
    onSave(payload);
  };

  const updateField = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value } as typeof prev));
  };

  const handleMetodoChange = (m: 'valor_directo' | 'calculado') => {
    setForm((prev) => ({
      ...prev,
      metodo: m,
      ...(m === 'valor_directo' ? { pct_venta: null, base_venta: null, pct_semineto: null, formula: '' } : {}),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <h3 className="text-lg font-semibold text-slate-900">{item ? 'Editar Premisa' : 'Nueva Premisa'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Scope */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Organización</label>
              <select value={form.organizacion_id} onChange={(e) => updateField('organizacion_id', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar...</option>
                {organizaciones.map((o) => (<option key={o.id} value={o.id}>{o.nombre}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País *</label>
              <select value={form.pais_id} onChange={(e) => updateField('pais_id', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" required>
                <option value="">Seleccionar país...</option>
                {paises.map((p) => (<option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Empresa *</label>
              <select value={form.compania_id} onChange={(e) => updateField('compania_id', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" required>
                <option value="">Seleccionar empresa...</option>
                {companias.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Centro de Costo</label>
              <select value={form.centro_costo_id} onChange={(e) => updateField('centro_costo_id', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">General (aplica a toda la cuenta)</option>
                {centrosCostos.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta Contable *</label>
            <input type="text" value={form.cuenta_contable} onChange={(e) => updateField('cuenta_contable', e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono" placeholder="Ej: 7.1.1.01.1.005" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Año</label>
              <input type="number" value={form.anio} onChange={(e) => updateField('anio', Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" min={2020} max={2100} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mes</label>
              <select value={form.mes} onChange={(e) => updateField('mes', Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
          </div>

          {/* Método selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Método</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => handleMetodoChange('valor_directo')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${form.metodo === 'valor_directo' ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                Valor Directo
              </button>
              <button type="button" onClick={() => handleMetodoChange('calculado')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${form.metodo === 'calculado' ? 'bg-accent-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                Calculado
              </button>
            </div>
          </div>

          {/* Fields based on method */}
          {form.metodo === 'valor_directo' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valor en USD</label>
              <input type="number" step="0.01" value={form.valor_dolar ?? ''} onChange={(e) => updateField('valor_dolar', e.target.value === '' ? null : Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.00" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Valor fijo en USD (opcional)</label>
                <input type="number" step="0.01" value={form.valor_dolar ?? ''} onChange={(e) => updateField('valor_dolar', e.target.value === '' ? null : Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.00" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">% Venta</label>
                  <input type="number" step="0.000001" value={form.pct_venta ?? ''} onChange={(e) => updateField('pct_venta', e.target.value === '' ? null : Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.05 = 5%" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Base de venta</label>
                  <select value={form.base_venta || ''} onChange={(e) => updateField('base_venta', e.target.value || null)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                    <option value="">Venta Actual</option>
                    <option value="actual">Venta Actual</option>
                    <option value="proyectada">Venta Proyectada</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">% Semi Neto</label>
                <input type="number" step="0.000001" value={form.pct_semineto ?? ''} onChange={(e) => updateField('pct_semineto', e.target.value === '' ? null : Number(e.target.value))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="0.03 = 3%" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fórmula (opcional, tiene prioridad)</label>
                <input type="text" value={form.formula} onChange={(e) => updateField('formula', e.target.value)} className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" placeholder="Ej: [Venta Proyectada] * 0.15 + 5000" spellCheck={false} />
                <p className="text-xs text-slate-500 mt-1">Variables: [Venta Actual], [Venta Proyectada], [Semi Neto]</p>
              </div>
            </div>
          )}

          {/* Variables de venta actuales */}
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
            <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Variables de venta para {form.mes}/{form.anio}</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-slate-400">Venta Actual</p>
                <p className="text-sm font-semibold text-slate-700">{ventasResolved.venta_actual === 0 ? '—' : `$${formatNumero2(ventasResolved.venta_actual)}`}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Venta Proyectada</p>
                <p className="text-sm font-semibold text-slate-700">{ventasResolved.venta_proyectada === 0 ? '—' : `$${formatNumero2(ventasResolved.venta_proyectada)}`}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Semi Neto</p>
                <p className="text-sm font-semibold text-slate-700">{ventasResolved.semi_neto === 0 ? '—' : `$${formatNumero2(ventasResolved.semi_neto)}`}</p>
              </div>
            </div>
            {(ventasResolved.venta_actual === 0 && ventasResolved.venta_proyectada === 0 && ventasResolved.semi_neto === 0) && (
              <p className="text-[10px] text-amber-600 mt-2">Sin variables de venta cargadas para este período. Cargalas en el panel "Variables de Venta".</p>
            )}
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-emerald-50 p-4 border border-emerald-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-emerald-700">Valor Proyectado (vista previa)</span>
              <span className="text-xl font-bold text-emerald-800">{formatNumero2(preview)}</span>
            </div>
            <p className="text-[10px] text-emerald-600 mt-1">Este valor se persistirá al guardar y se expondrá en gyp_proyectado_consumo para Power BI.</p>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
          <button onClick={handleSave} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">Guardar</button>
        </div>
      </div>
    </div>
  );
}