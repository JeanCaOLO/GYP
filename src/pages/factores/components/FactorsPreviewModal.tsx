import { useMemo } from 'react';
import type { Organizacion, Pais, Compania, CentroCosto } from '@/types';

interface FactorPreviewRow {
  tipo: string;
  tipo_existente: boolean;
  valor: number;
  fecha: string | null;
  descripcion: string;
  org_nombre: string;
  org_id: string | null;
  pais_nombre: string;
  pais_id: string | null;
  cia_nombre: string;
  cia_id: string | null;
  cc_nombre: string;
  cc_id: string | null;
  simbolo_moneda: string;
  valido: boolean;
  error: string | null;
}

interface FactorsPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  headers: string[];
  data: FactorPreviewRow[];
  total: number;
  tiposExistentes: string[];
  loading: boolean;
  importProgress: string | null;
}

export default function FactorsPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  headers,
  data,
  total,
  tiposExistentes,
  loading,
  importProgress,
}: FactorsPreviewModalProps) {
  const previewRows = data.slice(0, 20);

  const validCount = useMemo(() => data.filter((r) => r.valido).length, [data]);
  const tiposNuevos = useMemo(() => {
    const nuevos = new Set<string>();
    data.forEach((r) => {
      if (r.valido && !r.tipo_existente) nuevos.add(r.tipo);
    });
    return nuevos.size;
  }, [data]);
  const tiposValidados = useMemo(() => {
    const existentes = new Set<string>();
    data.forEach((r) => {
      if (r.valido && r.tipo_existente) existentes.add(r.tipo);
    });
    return existentes.size;
  }, [data]);
  const invalidos = useMemo(() => data.filter((r) => !r.valido).length, [data]);

  const stats = useMemo(
    () => [
      { label: 'Total filas', value: total },
      { label: 'Listas para importar', value: validCount },
      { label: 'Tipos nuevos (se crearán)', value: tiposNuevos },
      { label: 'Tipos existentes (validados)', value: tiposValidados },
      { label: 'Filas con error', value: invalidos },
    ],
    [total, validCount, tiposNuevos, tiposValidados, invalidos],
  );

  const formatNumero = (n: number) =>
    new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n);

  const formatFecha = (f: string | null) => {
    if (!f) return '—';
    const d = new Date(f + (f.includes('T') ? '' : 'T00:00:00'));
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative w-full max-w-6xl max-h-[90vh] rounded-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Previsualización de Tasas</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Revisá los datos antes de confirmar. Los tipos nuevos se crearán automáticamente.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>

        {/* Stats */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex flex-wrap gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                <span className="text-slate-500">{s.label}:</span>{' '}
                <span className="font-semibold text-slate-900">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Headers detectados */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-medium text-slate-600 mb-1">Columnas detectadas en el Excel:</p>
          <div className="flex flex-wrap gap-1">
            {headers.map((h) => (
              <span key={h} className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700">
                {h}
              </span>
            ))}
          </div>
        </div>

        {/* Progress bar during import */}
        {importProgress && (
          <div className="px-6 py-3 border-b border-slate-100">
            <div className="rounded-lg bg-primary-50 border border-primary-200 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center text-primary-500"></i>
                  <span className="text-sm font-medium text-primary-800">{importProgress}</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-primary-200 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        )}

        {/* Preview table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">#</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Tipo</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Estado Tipo</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Valor</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Moneda</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Fecha</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Descripción</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Org.</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">País</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Cía.</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">CC</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Validación</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-t border-slate-100 ${row.valido ? 'hover:bg-slate-50' : 'bg-red-50'}`}
                  >
                    <td className="py-2 px-3 text-slate-500 text-xs whitespace-nowrap">{idx + 1}</td>
                    <td className="py-2 px-3 text-slate-900 font-semibold whitespace-nowrap text-xs">{row.tipo || '-'}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {!row.tipo ? (
                        <span className="text-slate-400 italic text-xs">—</span>
                      ) : row.tipo_existente ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          <i className="ri-check-line"></i> Existente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          <i className="ri-add-line"></i> Nuevo (se creará)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-900 font-mono font-medium text-right whitespace-nowrap text-xs">
                      {row.valor ? formatNumero(row.valor) : '—'}
                    </td>
                    <td className="py-2 px-3 text-slate-600 text-xs whitespace-nowrap text-center">
                      {row.simbolo_moneda || '—'}
                    </td>
                    <td className="py-2 px-3 text-slate-600 text-xs whitespace-nowrap">{formatFecha(row.fecha)}</td>
                    <td className="py-2 px-3 text-slate-700 min-w-[150px] text-xs">{row.descripcion || <span className="text-slate-400 italic">—</span>}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.org_id ? (
                        <span className="text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">{row.org_nombre || 'OK'}</span>
                      ) : row.org_nombre ? (
                        <span className="text-xs text-rose-700 bg-rose-100 rounded-full px-2 py-0.5">No encontrada</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.pais_id ? (
                        <span className="text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">{row.pais_nombre || 'OK'}</span>
                      ) : row.pais_nombre ? (
                        <span className="text-xs text-rose-700 bg-rose-100 rounded-full px-2 py-0.5">No encontrado</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.cia_id ? (
                        <span className="text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">{row.cia_nombre || 'OK'}</span>
                      ) : row.cia_nombre ? (
                        <span className="text-xs text-rose-700 bg-rose-100 rounded-full px-2 py-0.5">No encontrada</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.cc_id ? (
                        <span className="text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">{row.cc_nombre || 'OK'}</span>
                      ) : row.cc_nombre ? (
                        <span className="text-xs text-rose-700 bg-rose-100 rounded-full px-2 py-0.5">No encontrado</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.valido ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          <i className="ri-check-line"></i> Válido
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          <i className="ri-close-line"></i> {row.error || 'Inválido'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 20 && (
            <p className="text-xs text-slate-500 mt-2 text-center">
              Mostrando las primeras 20 filas de {data.length} totales.
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 gap-3">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{validCount}</span> de{' '}
            <span className="font-semibold text-slate-900">{total}</span> filas listas.{' '}
            {tiposNuevos > 0 && (
              <span className="text-amber-600">
                <span className="font-semibold">{tiposNuevos}</span> tipo{tiposNuevos !== 1 ? 's' : ''} nuevo{tiposNuevos !== 1 ? 's' : ''} se creará{tiposNuevos !== 1 ? 'n' : ''}.
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={loading || validCount === 0}
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {loading && <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>}
              {loading ? 'Importando...' : `Importar ${validCount} tasas`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { FactorPreviewRow };