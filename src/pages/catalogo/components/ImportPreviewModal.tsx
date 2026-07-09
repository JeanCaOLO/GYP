import { useMemo } from 'react';
import type { Organizacion, Pais, Compania, CentroCosto } from '@/types';

interface ImportPreviewRow {
  cuenta: string;
  descripcion: string;
  clasificacion: string;
  clasificacion_1: string;
  clasificacion_2: string;
  linea: number | null;
  grupo: number | null;
  saldo_normal: string;
  comercializadora: string;
  balance_gyp: string;
  orden_clasificacion: number | null;
  pais_nombre: string;
  pais_id: string | null;
  org_nombre: string;
  org_id: string | null;
  cia_nombre: string;
  cia_id: string | null;
  cc_nombre: string;
  cc_id: string | null;
  valido: boolean;
  error: string | null;
}

interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  headers: string[];
  data: ImportPreviewRow[];
  total: number;
  skipped: number;
  invalidNumbers: number;
  missingUbicacion: number;
  paisCount: number;
  orgCount: number;
  ccCount: number;
  duplicates: number;
  loading: boolean;
  paises: Pais[];
  companias: Compania[];
  centrosCostos: CentroCosto[];
}

export default function ImportPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  headers,
  data,
  total,
  skipped,
  invalidNumbers,
  missingUbicacion,
  paisCount,
  orgCount,
  ccCount,
  duplicates,
  loading,
  paises,
  companias,
  centrosCostos,
}: ImportPreviewModalProps) {
  const validCount = data.filter((r) => r.valido).length;
  const previewRows = data.slice(0, 20);

  const stats = useMemo(
    () => [
      { label: 'Total filas', value: total },
      { label: 'Listos para importar', value: validCount },
      { label: 'Sin cuenta/descripción', value: skipped },
      { label: 'Números inválidos', value: invalidNumbers },
      { label: 'Duplicados en lote', value: duplicates },
      { label: 'País no encontrado', value: missingUbicacion },
      { label: 'Con país asignado', value: paisCount },
      { label: 'Con org. asignada', value: orgCount },
      { label: 'Con CC asignado', value: ccCount },
    ],
    [total, validCount, skipped, invalidNumbers, duplicates, missingUbicacion, paisCount, orgCount, ccCount],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className="relative w-full max-w-6xl max-h-[90vh] rounded-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Previsualización de Importación</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Revisá los datos antes de confirmar. Solo se importarán las filas válidas.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500"></i>
          </button>
        </div>

        {/* Stats */}
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="flex flex-wrap gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
              >
                <span className="text-slate-500">{s.label}:</span>{' '}
                <span className="font-semibold text-slate-900">{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Headers detectados */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-xs font-medium text-slate-600 mb-1">Headers detectados en el Excel:</p>
          <div className="flex flex-wrap gap-1">
            {headers.map((h) => (
              <span
                key={h}
                className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700"
              >
                {h}
              </span>
            ))}
          </div>
        </div>

        {/* Preview table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">#</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Cuenta</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Descripción</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Clasificación</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Clasif. 1</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Clasif. 2</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">País</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Org.</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Cía.</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">CC</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Estado</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-t border-slate-100 ${row.valido ? 'hover:bg-slate-50' : 'bg-red-50'}`}
                  >
                    <td className="py-2 px-3 text-slate-500 text-xs whitespace-nowrap">{idx + 1}</td>
                    <td className="py-2 px-3 text-slate-900 font-medium whitespace-nowrap">{row.cuenta || '-'}</td>
                    <td className="py-2 px-3 text-slate-700 min-w-[180px]">{row.descripcion || '-'}</td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{row.clasificacion || '-'}</td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{row.clasificacion_1 || '-'}</td>
                    <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{row.clasificacion_2 || '-'}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.pais_id ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          {row.pais_nombre || 'OK'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          {row.pais_nombre ? 'No encontrado' : 'Sin país'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.org_id ? (
                        <span className="text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                          {row.org_nombre || 'OK'}
                        </span>
                      ) : row.org_nombre ? (
                        <span className="text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5">No encontrado</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.cia_id ? (
                        <span className="text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                          {row.cia_nombre || 'OK'}
                        </span>
                      ) : row.cia_nombre ? (
                        <span className="text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5">No encontrado</span>
                      ) : (
                        <span className="text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5">Requerido</span>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {row.cc_id ? (
                        <span className="text-xs text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                          {row.cc_nombre || 'OK'}
                        </span>
                      ) : row.cc_nombre ? (
                        <span className="text-xs text-red-700 bg-red-100 rounded-full px-2 py-0.5">No encontrado</span>
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
            <span className="font-semibold text-slate-900">{total}</span> filas listas para importar
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
              className="rounded-lg px-4 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {loading && <i className="ri-loader-4-line animate-spin"></i>}
              {loading ? 'Importando...' : `Importar ${validCount} registros`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ImportPreviewRow };