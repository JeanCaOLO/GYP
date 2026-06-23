import { useMemo, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { VentaProyeccion, Organizacion, Pais, Compania, CentroCosto } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';

const ANIO_DEFAULT = 2026;

function formatNumero2(n: number) {
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

interface VentasProyeccionPanelProps {
  ventas: VentaProyeccion[];
  organizaciones: Organizacion[];
  paises: Pais[];
  companias: Compania[];
  centrosCostos: CentroCosto[];
  organizacionesMap: Map<string, string>;
  paisesMap: Map<string, string>;
  companiasMap: Map<string, string>;
  centrosCostosMap: Map<string, string>;
  onClose: () => void;
  onUpdated: () => void;
}

export default function VentasProyeccionPanel({
  ventas, organizaciones, paises, companias, centrosCostos,
  organizacionesMap, paisesMap, companiasMap, centrosCostosMap,
  onClose, onUpdated,
}: VentasProyeccionPanelProps) {
  const [editingVenta, setEditingVenta] = useState<VentaProyeccion | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const { canEdit, canDelete } = usePermissions();
  const [confirmDelete, setConfirmDelete] = useState<VentaProyeccion | null>(null);

  // Form state for new venta
  const [form, setForm] = useState({
    organizacion_id: '',
    pais_id: '',
    compania_id: '',
    anio: ANIO_DEFAULT,
    mes: 1,
    venta_actual: 0,
    venta_proyectada: 0,
    semi_neto: 0,
  });

  const resetForm = () => {
    setForm({ organizacion_id: '', pais_id: '', compania_id: '', anio: ANIO_DEFAULT, mes: 1, venta_actual: 0, venta_proyectada: 0, semi_neto: 0 });
    setEditingVenta(null);
    setShowForm(false);
  };

  const handleSaveVenta = async () => {
    try {
      const payload = {
        organizacion_id: form.organizacion_id || null,
        pais_id: form.pais_id,
        compania_id: form.compania_id,
        anio: form.anio,
        mes: form.mes,
        venta_actual: form.venta_actual,
        venta_proyectada: form.venta_proyectada,
        semi_neto: form.semi_neto,
        activa: true,
      };
      if (editingVenta) {
        await supabase.from('ventas_proyeccion').update(payload).eq('id', editingVenta.id);
      } else {
        await supabase.from('ventas_proyeccion').insert(payload);
      }
      resetForm();
      onUpdated();
    } catch (err) {
      console.error('Error saving venta:', err);
    }
  };

  const handleDeleteVenta = async (item: VentaProyeccion) => {
    try {
      await supabase.from('ventas_proyeccion').delete().eq('id', item.id);
      setConfirmDelete(null);
      onUpdated();
    } catch (err) { console.error('Error deleting:', err); }
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

      const rows = json.map((row) => {
        const anio = Number(getVal(row, 'Año', 'Anio', 'anio', 'ANO') || ANIO_DEFAULT);
        const mes = Number(getVal(row, 'Mes', 'mes', 'MES') || 1);
        const ventaActual = parseFloat(String(getVal(row, 'Venta Actual', 'venta_actual', 'VENTA_ACTUAL', 'Actual') || '0'));
        const ventaProyectada = parseFloat(String(getVal(row, 'Venta Proyectada', 'venta_proyectada', 'VENTA_PROYECTADA', 'Proyectada') || '0'));
        const semiNeto = parseFloat(String(getVal(row, 'Semi Neto', 'semi_neto', 'SEMI_NETO', 'SN') || '0'));
        if (isNaN(anio) || isNaN(mes)) return null;
        return { organizacion_id: null, pais_id: '', compania_id: '', anio, mes, venta_actual: isNaN(ventaActual) ? 0 : ventaActual, venta_proyectada: isNaN(ventaProyectada) ? 0 : ventaProyectada, semi_neto: isNaN(semiNeto) ? 0 : semiNeto, activa: true };
      }).filter(Boolean);

      // Import without scope - user assigns scope manually after import
      const BATCH = 200;
      let imported = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        setImportProgress(`Importando ${Math.min(i + batch.length, rows.length)} de ${rows.length}...`);
        const { error } = await supabase.from('ventas_proyeccion').insert(batch);
        if (!error) imported += batch.length;
      }
      setImportProgress(null);
      e.target.value = '';
      onUpdated();
    } catch (err) { setImportProgress(null); e.target.value = ''; console.error('Error importing:', err); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-5xl max-h-[90vh] rounded-xl bg-white shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Variables de Venta para Proyección</h3>
            <p className="text-sm text-slate-500 mt-0.5">Administrá venta actual, venta proyectada y semi neto por empresa y período. Las premisas usan estas variables para calcular el valor proyectado.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 shrink-0 flex items-center gap-3">
          {canEdit && (
            <>
              <button onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors whitespace-nowrap">
                <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
                Nueva Variable
              </button>
              <label className="inline-flex items-center gap-2 rounded-lg bg-foreground-950 px-4 py-2 text-sm font-medium text-background-50 hover:bg-foreground-900 cursor-pointer transition-colors whitespace-nowrap">
                <i className="ri-file-upload-line w-4 h-4 flex items-center justify-center"></i>
                {importProgress || 'Importar Excel'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={!!importProgress} />
              </label>
            </>
          )}
          <span className="text-xs text-foreground-600 ml-auto">{ventas.length} registros</span>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Form */}
          {showForm && (
            <div className="mb-6 rounded-xl bg-slate-50 border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-4">{editingVenta ? 'Editar Variable' : 'Nueva Variable de Venta'}</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">País *</label>
                  <select value={form.pais_id} onChange={(e) => setForm({ ...form, pais_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
                    <option value="">Seleccionar...</option>
                    {paises.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Empresa *</label>
                  <select value={form.compania_id} onChange={(e) => setForm({ ...form, compania_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
                    <option value="">Seleccionar...</option>
                    {companias.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Año</label>
                  <input type="number" value={form.anio} onChange={(e) => setForm({ ...form, anio: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Mes</label>
                  <select value={form.mes} onChange={(e) => setForm({ ...form, mes: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (<option key={m} value={m}>{m}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Venta Actual</label>
                  <input type="number" step="0.01" value={form.venta_actual} onChange={(e) => setForm({ ...form, venta_actual: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 text-right" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Venta Proyectada</label>
                  <input type="number" step="0.01" value={form.venta_proyectada} onChange={(e) => setForm({ ...form, venta_proyectada: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 text-right" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Semi Neto</label>
                  <input type="number" step="0.01" value={form.semi_neto} onChange={(e) => setForm({ ...form, semi_neto: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 text-right" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={resetForm} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
                <button onClick={handleSaveVenta} disabled={!form.pais_id || !form.compania_id} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">Guardar</button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-background-200 text-left text-foreground-700">
                  <th className="py-3 pr-4 font-medium whitespace-nowrap">País</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap">Empresa</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap">Periodo</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap text-right">Venta Actual</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap text-right">Venta Proyectada</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap text-right">Semi Neto</th>
                  {canEdit && <th className="py-3 pr-4 font-medium whitespace-nowrap">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {ventas.length === 0 ? (
                  <tr><td colSpan={canEdit ? 7 : 6} className="py-8 text-center text-foreground-600">No hay variables de venta cargadas.</td></tr>
                ) : (
                  ventas.map((v) => (
                    <tr key={v.id} className="border-b border-background-100 hover:bg-background-100/70">
                      <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-foreground-700">{paisesMap.get(v.pais_id) || '—'}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-foreground-700">{companiasMap.get(v.compania_id) || '—'}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-xs text-foreground-700">{v.mes}/{v.anio}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-right font-medium text-foreground-950">{formatNumero2(v.venta_actual)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-right font-medium text-accent-700">{formatNumero2(v.venta_proyectada)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-right font-medium text-primary-700">{formatNumero2(v.semi_neto)}</td>
                      {canEdit && (
                        <td className="py-2.5 pr-4 whitespace-nowrap">
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingVenta(v); setForm({ organizacion_id: v.organizacion_id || '', pais_id: v.pais_id, compania_id: v.compania_id, anio: v.anio, mes: v.mes, venta_actual: v.venta_actual, venta_proyectada: v.venta_proyectada, semi_neto: v.semi_neto }); setShowForm(true); }} className="rounded-md p-1.5 text-foreground-700 hover:bg-background-100" title="Editar">
                              <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                            </button>
                            {canDelete && (
                              <button onClick={() => setConfirmDelete(v)} className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50" title="Eliminar">
                                <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
                              </button>
                            )}
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

        <div className="p-4 border-t border-slate-100 shrink-0 flex justify-end">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cerrar</button>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <i className="ri-delete-bin-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Confirmar eliminación</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">¿Eliminar la variable de venta de {paisesMap.get(confirmDelete.pais_id)} — {companiasMap.get(confirmDelete.compania_id)} para {confirmDelete.mes}/{confirmDelete.anio}?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
              <button onClick={() => handleDeleteVenta(confirmDelete)} className="rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}