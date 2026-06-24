import { useState } from 'react';

export interface AsientosPreviewRow {
  asiento: string;
  consecutivo: string;
  nit: string;
  centro_costo: string;
  cuenta_contable: string;
  fuente: string;
  referencia: string;
  debito_local: number;
  credito_local: number;
  debito_dolar: number;
  credito_dolar: number;
  fecha: string;
  empresa: string;
  paquete: string;
  org_nombre: string;
  org_id: string | null;
  pais_nombre: string;
  pais_id: string | null;
  cia_nombre: string;
  cia_id: string | null;
  cc_nombre: string;
  cc_id: string | null;
  valido: boolean;
  error: string | null;
}

interface PaisItem {
  id: string;
  nombre: string;
  codigo: string;
}

interface CompaniaItem {
  id: string;
  nombre: string;
  codigo: string;
}

interface CentroCostoItem {
  id: string;
  nombre: string;
  codigo: string;
}

interface AsientosPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  headers: string[];
  data: AsientosPreviewRow[];
  total: number;
  skipped: number;
  validos: number;
  invalidos: number;
  totalDebitoLocal: number;
  totalCreditoLocal: number;
  totalDebitoDolar: number;
  totalCreditoDolar: number;
  loading: boolean;
  paises: PaisItem[];
  companias: CompaniaItem[];
  centrosCostos: CentroCostoItem[];
}

const PAGE_SIZE = 20;

export default function AsientosPreviewModal({
  isOpen,
  onClose,
  onConfirm,
  headers,
  data,
  total,
  skipped,
  validos,
  invalidos,
  totalDebitoLocal,
  totalCreditoLocal,
  totalDebitoDolar,
  totalCreditoDolar,
  loading,
  paises,
  companias,
  centrosCostos,
}: AsientosPreviewModalProps) {
  const [tab, setTab] = useState<'header' | 'valids' | 'invalids'>('valids');
  const [page, setPage] = useState(0);

  const valids = data.filter((r) => r.valido);
  const invalidsList = data.filter((r) => !r.valido);
  const current = tab === 'valids' ? valids : tab === 'invalids' ? invalidsList : [];
  const totalPages = Math.ceil(current.length / PAGE_SIZE);
  const paginated = current.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatNum = (n: number | null) => {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-7xl max-h-[90vh] rounded-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Vista Previa de Importación</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {total} filas totales · {valids.length} válidas · {invalidsList.length} con errores · {skipped} vacías
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            title="Cerrar"
          >
            <i className="ri-close-line text-xl w-5 h-5 flex items-center justify-center"></i>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-slate-200 shrink-0">
          <button
            onClick={() => { setTab('header'); setPage(0); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${tab === 'header' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Mapeo de Columnas
          </button>
          <button
            onClick={() => { setTab('valids'); setPage(0); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${tab === 'valids' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            Válidos ({valids.length})
          </button>
          <button
            onClick={() => { setTab('invalids'); setPage(0); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${tab === 'invalids' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'} ${invalidsList.length > 0 ? '' : ''}`}
          >
            {invalidsList.length > 0 ? (
              <span className="flex items-center gap-1">
                <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
                Errores ({invalidsList.length})
              </span>
            ) : (
              `Errores (0)`
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {tab === 'header' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <p className="text-sm font-semibold text-emerald-800 mb-2">Columnas detectadas ({headers.length})</p>
                <div className="flex flex-wrap gap-2">
                  {headers.map((h, i) => (
                    <span key={i} className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs px-3 py-1 font-medium">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-800 mb-2">Columnas esperadas</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Asiento', 'Consecutivo', 'NIT', 'Centro Costo', 'Cuenta Contable',
                    'Fuente', 'Referencia', 'Debito Local', 'Credito Local',
                    'Debito Dolar', 'Credito Dolar', 'Fecha', 'Empresa', 'Paquete',
                    'Organizacion', 'Pais', 'Compania',
                  ].map((h, i) => (
                    <span key={i} className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 text-xs px-3 py-1 border border-amber-200 font-medium">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(tab === 'valids' || tab === 'invalids') && (
            <>
              {/* Totales */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Débito Local</p>
                  <p className="text-lg font-bold text-emerald-600">{formatNum(totalDebitoLocal)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Crédito Local</p>
                  <p className="text-lg font-bold text-rose-600">{formatNum(totalCreditoLocal)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Débito Dólar</p>
                  <p className="text-lg font-bold text-sky-600">{formatNum(totalDebitoDolar)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Crédito Dólar</p>
                  <p className="text-lg font-bold text-amber-600">{formatNum(totalCreditoDolar)}</p>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="text-left text-slate-500">
                      <th className="py-2 px-2 font-medium whitespace-nowrap">#</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">Cuenta</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">Asiento</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">NIT</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">CC</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">Ref.</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap text-right">Débito Loc</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap text-right">Crédito Loc</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap text-right">Débito USD</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap text-right">Crédito USD</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">Fecha</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">Emp.</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">Org.</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">País</th>
                      <th className="py-2 px-2 font-medium whitespace-nowrap">Cía.</th>
                      {tab === 'invalids' && <th className="py-2 px-2 font-medium whitespace-nowrap text-red-600">Error</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={tab === 'invalids' ? 16 : 15} className="py-8 text-center text-slate-400">
                          {tab === 'valids' ? 'No hay filas válidas' : 'No hay filas con errores — ¡todo bien!'}
                        </td>
                      </tr>
                    ) : (
                      paginated.map((row, idx) => {
                        const rowNum = page * PAGE_SIZE + idx + 1;
                        return (
                          <tr key={idx} className={`border-t border-slate-100 ${!row.valido ? 'bg-red-50/60' : 'hover:bg-slate-50'}`}>
                            <td className="py-1.5 px-2 text-slate-400 text-xs">{rowNum}</td>
                            <td className="py-1.5 px-2 text-slate-900 font-mono text-xs font-medium">{row.cuenta_contable}</td>
                            <td className="py-1.5 px-2 text-slate-700 text-xs">{row.asiento || '—'}</td>
                            <td className="py-1.5 px-2 text-slate-700 text-xs">{row.nit || '—'}</td>
                            <td className="py-1.5 px-2 text-slate-600 text-xs">{row.cc_nombre || '—'}</td>
                            <td className="py-1.5 px-2 text-slate-700 text-xs">{row.referencia || '—'}</td>
                            <td className="py-1.5 px-2 text-emerald-600 text-right font-medium text-xs">{formatNum(row.debito_local)}</td>
                            <td className="py-1.5 px-2 text-rose-600 text-right font-medium text-xs">{formatNum(row.credito_local)}</td>
                            <td className="py-1.5 px-2 text-sky-600 text-right font-medium text-xs">{formatNum(row.debito_dolar)}</td>
                            <td className="py-1.5 px-2 text-amber-600 text-right font-medium text-xs">{formatNum(row.credito_dolar)}</td>
                            <td className="py-1.5 px-2 text-slate-600 text-xs">{row.fecha || '—'}</td>
                            <td className="py-1.5 px-2 text-slate-700 text-xs">{row.empresa || '—'}</td>
                            <td className="py-1.5 px-2 text-slate-600 text-xs">{row.org_nombre || '—'}</td>
                            <td className="py-1.5 px-2 text-slate-600 text-xs">{row.pais_nombre || '—'}</td>
                            <td className="py-1.5 px-2 text-slate-600 text-xs">{row.cia_nombre || '—'}</td>
                            {tab === 'invalids' && (
                              <td className="py-1.5 px-2 text-red-600 text-xs">{row.error}</td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-slate-500">
                    {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, current.length)} de {current.length}
                  </p>
                  <div className="flex gap-1">
                    <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-md px-2.5 py-1 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">Anterior</button>
                    <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-md px-2.5 py-1 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">Siguiente</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-slate-200 shrink-0">
          {invalidsList.length > 0 && (
            <p className="text-sm text-amber-600 flex items-center gap-1.5">
              <i className="ri-error-warning-line w-4 h-4 flex items-center justify-center"></i>
              {invalidsList.length} filas con errores serán omitidas
            </p>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={valids.length === 0 || loading}
              className="rounded-lg px-6 py-2.5 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <i className="ri-loader-4-line animate-spin w-4 h-4 flex items-center justify-center"></i>
                  Importando...
                </span>
              ) : (
                `Confirmar e Importar ${valids.length} líneas`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}