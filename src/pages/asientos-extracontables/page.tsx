import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useUbicaciones } from '@/hooks/useUbicaciones';
import { usePermissions } from '@/hooks/usePermissions';
import AsientosPreviewModal from '@/pages/asientos-extracontables/components/AsientosPreviewModal';
import type { AsientosPreviewRow } from '@/pages/asientos-extracontables/components/AsientosPreviewModal';

interface AsientoCarga {
  id: string;
  nombre: string;
  descripcion: string | null;
  fecha_carga: string | null;
  cantidad_registros: number | null;
  total_debito_local: number | null;
  total_credito_local: number | null;
  total_debito_dolar: number | null;
  total_credito_dolar: number | null;
  activa: boolean;
  organizacion_id: string | null;
  created_at: string;
}

interface AsientoLinea {
  id: string;
  carga_id: string;
  asiento: string | null;
  consecutivo: string | null;
  nit: string | null;
  centro_costo: string | null;
  cuenta_contable: string;
  fuente: string | null;
  referencia: string | null;
  debito_local: number | null;
  credito_local: number | null;
  debito_dolar: number | null;
  credito_dolar: number | null;
  fecha: string | null;
  empresa: string | null;
  paquete: string | null;
  compania_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  activa: boolean;
  created_at: string;
}

const PAGE_SIZE = 20;

export default function AsientosExtracontablesPage() {
  const [cargas, setCargas] = useState<AsientoCarga[]>([]);
  const [lineas, setLineas] = useState<Map<string, AsientoLinea[]>>(new Map());
  const [expandedCarga, setExpandedCarga] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<AsientosPreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewStats, setPreviewStats] = useState({
    total: 0,
    skipped: 0,
    validos: 0,
    invalidos: 0,
    totalDebitoLocal: 0,
    totalCreditoLocal: 0,
    totalDebitoDolar: 0,
    totalCreditoDolar: 0,
  });
  const [toInsert, setToInsert] = useState<Record<string, unknown>[]>([]);
  const [toInsertNombre, setToInsertNombre] = useState('');
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [confirmDeleteCarga, setConfirmDeleteCarga] = useState<AsientoCarga | null>(null);

  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const { organizaciones, paises, companias, centrosCostos, organizacionesMap, paisesMap, companiasMap, centrosCostosMap } = useUbicaciones();
  const { isSuperAdmin, userScope, canEdit, canDelete } = usePermissions();
  const canWrite = canEdit;

  const fetchCargas = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('asientos_extracontables_cargas').select('*').order('created_at', { ascending: false });
      if (!isSuperAdmin && userScope.organizacion_id) {
        query = query.eq('organizacion_id', userScope.organizacion_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      setCargas(data || []);
    } catch (err) {
      addToast('error', 'Error al cargar: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [addToast, isSuperAdmin, userScope]);

  useEffect(() => { fetchCargas(); }, [fetchCargas]);

  const fetchLineas = async (cargaId: string) => {
    if (lineas.has(cargaId)) return;
    try {
      const { data, error } = await supabase
        .from('asientos_extracontables_lineas')
        .select('*')
        .eq('carga_id', cargaId)
        .order('cuenta_contable', { ascending: true });
      if (error) throw error;
      setLineas((prev) => {
        const next = new Map(prev);
        next.set(cargaId, (data || []) as AsientoLinea[]);
        return next;
      });
    } catch (err) {
      addToast('error', 'Error al cargar líneas: ' + (err as Error).message);
    }
  };

  const toggleExpand = (cargaId: string) => {
    if (expandedCarga === cargaId) {
      setExpandedCarga(null);
    } else {
      setExpandedCarga(cargaId);
      fetchLineas(cargaId);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return cargas;
    const q = search.toLowerCase();
    return cargas.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.descripcion && c.descripcion.toLowerCase().includes(q)),
    );
  }, [cargas, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = useMemo(() => {
    const totalCargas = cargas.length;
    const totalLineas = cargas.reduce((s, c) => s + (c.cantidad_registros || 0), 0);
    const totalDebitoLocal = cargas.reduce((s, c) => s + (c.total_debito_local || 0), 0);
    const totalCreditoLocal = cargas.reduce((s, c) => s + (c.total_credito_local || 0), 0);
    const totalDebitoDolar = cargas.reduce((s, c) => s + (c.total_debito_dolar || 0), 0);
    const totalCreditoDolar = cargas.reduce((s, c) => s + (c.total_credito_dolar || 0), 0);
    return { totalCargas, totalLineas, totalDebitoLocal, totalCreditoLocal, totalDebitoDolar, totalCreditoDolar };
  }, [cargas]);

  const formatNum = (n: number | null) => {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  };

  const formatNum0 = (n: number | null) => {
    if (n === null || n === undefined) return '—';
    return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  };

  // --- DESCARGAR PLANTILLA ---
  const handleDownloadTemplate = async () => {
    try {
      const xlsx = await import('xlsx');
      const headers = [
        'Asiento', 'Consecutivo', 'NIT', 'Centro Costo', 'Cuenta Contable',
        'Fuente', 'Referencia', 'Debito Local', 'Credito Local',
        'Debito Dolar', 'Credito Dolar', 'Fecha', 'Empresa', 'Paquete',
        'Organizacion', 'Pais', 'Compania',
      ];
      const ejemplo = [
        'AS-001', '1', '123456789', 'Cofersa Central', '7.1.1.01.1.001',
        'SAP', 'REF-2026-001', 1500000, 0,
        0, 1500000, '2026-01-15', 'COFERSA', 'PK-001',
        'Mayoreo', 'Colombia', 'BEVAL',
      ];
      const ws = xlsx.utils.aoa_to_sheet([headers, ejemplo]);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Asientos');
      const wbout = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plantilla_Asientos_Extracontables.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      addToast('error', 'Error al generar plantilla: ' + (err as Error).message);
    }
  };

  // --- UTILIDADES DE MATCHING ---
  const normalizeText = (text: string): string =>
    text.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');

  const findEntity = <T extends { nombre: string; codigo: string; id: string }>(
    search: string,
    entities: T[],
  ): T | null => {
    if (!search || !search.trim()) return null;
    const normSearch = normalizeText(search);
    const exact = entities.find(
      (e) => normalizeText(e.nombre) === normSearch || normalizeText(e.codigo) === normSearch,
    );
    if (exact) return exact;
    const orig = entities.find(
      (e) => e.nombre.toLowerCase().trim() === search.toLowerCase().trim() || e.codigo.toLowerCase().trim() === search.toLowerCase().trim(),
    );
    if (orig) return orig;
    const contains = entities.find(
      (e) => normalizeText(e.nombre).includes(normSearch) || normalizeText(e.codigo).includes(normSearch),
    );
    if (contains) return contains;
    const reverseContains = entities.find(
      (e) => normSearch.includes(normalizeText(e.nombre)) || normSearch.includes(normalizeText(e.codigo)),
    );
    if (reverseContains) return reverseContains;
    return null;
  };

  // --- CARGADOR DE EXCEL ---
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress('Leyendo archivo...');
    try {
      const xlsx = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      // Leer headers exactos
      const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
      const headerRow: string[] = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[xlsx.utils.encode_cell({ r: range.s.r, c: C })];
        headerRow.push(cell ? String(cell.v || '') : '');
      }
      const rawHeaders = headerRow.filter((h) => h.trim() !== '');
      setPreviewHeaders(rawHeaders);

      const json = xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      if (json.length === 0) {
        addToast('warning', 'El archivo está vacío.');
        return;
      }

      const normalizeHeader = (h: string) =>
        h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\-_\/]+/g, '').trim();

      const headerMap: Record<string, string> = {};
      rawHeaders.forEach((h) => { headerMap[normalizeHeader(h)] = h; });

      const getVal = (row: Record<string, unknown>, ...variants: string[]) => {
        for (const v of variants) {
          const norm = normalizeHeader(v);
          const originalKey = headerMap[norm];
          if (originalKey && originalKey in row && row[originalKey] !== '' && row[originalKey] !== null && row[originalKey] !== undefined) {
            return row[originalKey];
          }
        }
        return '';
      };

      const cuentaTest = getVal(json[0], 'Cuenta Contable', 'CuentaContable', 'cuenta_contable', 'Cuenta', 'cuenta', 'CUENTA');
      if (cuentaTest === '') {
        addToast('warning', `No se encontró la columna 'Cuenta Contable'. Headers: ${rawHeaders.join(', ')}`);
        return;
      }

      let skipped = 0;
      let invalidos = 0;
      let totDL = 0; let totCL = 0; let totDD = 0; let totCD = 0;
      const parsed: AsientosPreviewRow[] = [];
      const batchToInsert: Record<string, unknown>[] = [];

      for (const row of json) {
        const cuentaContable = String(getVal(row, 'Cuenta Contable', 'CuentaContable', 'cuenta_contable', 'Cuenta', 'cuenta', 'CUENTA', 'CUENTA_CONTABLE', 'Codigo') || '').trim();
        if (!cuentaContable) { skipped++; continue; }

        const asientoVal = String(getVal(row, 'Asiento', 'asiento', 'ASIENTO', 'No Asiento', 'NO_ASIENTO') || '').trim();
        const consecutivoVal = String(getVal(row, 'Consecutivo', 'consecutivo', 'CONSECUTIVO') || '').trim();
        const nitVal = String(getVal(row, 'NIT', 'Nit', 'nit', 'NIT/CC') || '').trim();
        const centroCostoNom = String(getVal(row, 'Centro Costo', 'CentroCosto', 'centro_costo', 'CENTRO_COSTO', 'CC') || '').trim();
        const fuenteVal = String(getVal(row, 'Fuente', 'fuente', 'FUENTE') || '').trim();
        const referenciaVal = String(getVal(row, 'Referencia', 'referencia', 'REFERENCIA', 'Ref') || '').trim();
        const fechaVal = String(getVal(row, 'Fecha', 'fecha', 'FECHA', 'Date') || '').trim();
        const empresaVal = String(getVal(row, 'Empresa', 'empresa', 'EMPRESA') || '').trim();
        const paqueteVal = String(getVal(row, 'Paquete', 'paquete', 'PAQUETE') || '').trim();

        const debitoLocal = Number(getVal(row, 'Debito Local', 'DebitoLocal', 'debito_local', 'DEBITO_LOCAL', 'Debito') || 0);
        const creditoLocal = Number(getVal(row, 'Credito Local', 'CreditoLocal', 'credito_local', 'CREDITO_LOCAL', 'Credito') || 0);
        const debitoDolar = Number(getVal(row, 'Debito Dolar', 'DebitoDolar', 'debito_dolar', 'DEBITO_DOLAR') || 0);
        const creditoDolar = Number(getVal(row, 'Credito Dolar', 'CreditoDolar', 'credito_dolar', 'CREDITO_DOLAR') || 0);

        // Ubicación
        const orgNombre = String(getVal(row, 'Organizacion', 'organizacion', 'ORGANIZACION', 'Org', 'ORG') || '').trim();
        const paisNombre = String(getVal(row, 'Pais', 'pais', 'PAIS', 'Country', 'COUNTRY') || '').trim();
        const ciaNombre = String(getVal(row, 'Compania', 'compania', 'COMPANIA', 'Cia', 'CIA', 'Company', 'COMPANY') || '').trim();

        const orgMatch = findEntity(orgNombre, organizaciones);
        const paisMatch = findEntity(paisNombre, paises);
        let ciaMatch = findEntity(ciaNombre, companias);
        const ccMatch = findEntity(centroCostoNom, centrosCostos);

        // Inferir compañía del CC si no se encontró directo
        if (!ciaMatch && ciaNombre && centroCostoNom) {
          for (const c of companias) {
            if (normalizeText(centroCostoNom).includes(normalizeText(c.nombre)) || normalizeText(centroCostoNom).includes(normalizeText(c.codigo))) {
              ciaMatch = c;
              break;
            }
          }
        }

        // Validar
        const errores: string[] = [];
        if (orgNombre && !orgMatch) errores.push(`Org "${orgNombre}" no encontrada`);
        if (paisNombre && !paisMatch) errores.push(`País "${paisNombre}" no encontrado`);
        if (!ciaNombre) errores.push('Compañía requerida');
        else if (!ciaMatch) errores.push(`Cía "${ciaNombre}" no encontrada`);
        if (centroCostoNom && !ccMatch) errores.push(`CC "${centroCostoNom}" no encontrado`);

        const rowValido = errores.length === 0;
        if (!rowValido) invalidos++;

        totDL += debitoLocal;
        totCL += creditoLocal;
        totDD += debitoDolar;
        totCD += creditoDolar;

        const rowData: Record<string, unknown> = {
          cuenta_contable: cuentaContable,
          asiento: asientoVal || null,
          consecutivo: consecutivoVal || null,
          nit: nitVal || null,
          centro_costo: centroCostoNom || null,
          fuente: fuenteVal || null,
          referencia: referenciaVal || null,
          debito_local: debitoLocal || 0,
          credito_local: creditoLocal || 0,
          debito_dolar: debitoDolar || 0,
          credito_dolar: creditoDolar || 0,
          fecha: fechaVal ? fechaVal.substring(0, 10) : null,
          empresa: empresaVal || null,
          paquete: paqueteVal || null,
          activa: true,
          ...(orgMatch ? { organizacion_id: orgMatch.id } : {}),
          ...(ciaMatch ? { compania_id: ciaMatch.id } : {}),
          ...(ccMatch ? { centro_costo_id: ccMatch.id } : {}),
        };
        batchToInsert.push(rowData);

        parsed.push({
          asiento: asientoVal,
          consecutivo: consecutivoVal,
          nit: nitVal,
          centro_costo: centroCostoNom,
          cuenta_contable: cuentaContable,
          fuente: fuenteVal,
          referencia: referenciaVal,
          debito_local: debitoLocal,
          credito_local: creditoLocal,
          debito_dolar: debitoDolar,
          credito_dolar: creditoDolar,
          fecha: fechaVal,
          empresa: empresaVal,
          paquete: paqueteVal,
          org_nombre: orgNombre,
          org_id: orgMatch?.id || null,
          pais_nombre: paisNombre,
          pais_id: paisMatch?.id || null,
          cia_nombre: ciaNombre,
          cia_id: ciaMatch?.id || null,
          cc_nombre: centroCostoNom,
          cc_id: ccMatch?.id || null,
          valido: rowValido,
          error: rowValido ? null : errores.join('; '),
        });
      }

      setPreviewData(parsed);
      setPreviewStats({
        total: json.length,
        skipped,
        validos: parsed.filter((r) => r.valido).length,
        invalidos,
        totalDebitoLocal: totDL,
        totalCreditoLocal: totCL,
        totalDebitoDolar: totDD,
        totalCreditoDolar: totCD,
      });
      setToInsert(batchToInsert);
      setToInsertNombre(file.name.replace(/\.[^/.]+$/, ''));
      setImportProgress(null);
      setPreviewOpen(true);
    } catch (err) {
      addToast('error', 'Error al importar: ' + (err as Error).message);
      setImportProgress(null);
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (toInsert.length === 0) {
      addToast('warning', 'No hay registros válidos para importar.');
      return;
    }
    setImportProgress('Importando...');
    try {
      // 1. Crear la carga
      const { data: carga, error: cargaErr } = await supabase
        .from('asientos_extracontables_cargas')
        .insert({
          nombre: toInsertNombre || 'Importación ' + new Date().toISOString().slice(0, 10),
          descripcion: `${toInsert.length} registros importados`,
          cantidad_registros: toInsert.length,
          total_debito_local: previewStats.totalDebitoLocal,
          total_credito_local: previewStats.totalCreditoLocal,
          total_debito_dolar: previewStats.totalDebitoDolar,
          total_credito_dolar: previewStats.totalCreditoDolar,
          organizacion_id: toInsert[0]?.organizacion_id as string | undefined || null,
        })
        .select('id')
        .single();

      if (cargaErr || !carga) throw new Error(cargaErr?.message || 'Error creando carga');

      // 2. Insertar líneas en batches
      const cargaId = carga.id;
      const BATCH_SIZE = 200;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, carga_id: cargaId }));
        setImportProgress(`Importando ${Math.min(i + batch.length, toInsert.length)} de ${toInsert.length} líneas...`);
        const { error } = await supabase.from('asientos_extracontables_lineas').insert(batch);
        if (error) throw error;
      }

      // 3. Registrar historial
      await supabase.from('asientos_extracontables_historico').insert({
        carga_id: cargaId,
        nombre: toInsertNombre,
        accion: 'creacion',
        resumen: `Carga: ${toInsert.length} registros`,
      });

      addToast('success', `${toInsert.length} líneas importadas en nueva carga`);
      setPreviewOpen(false);
      setPreviewData([]);
      setToInsert([]);
      fetchCargas();
      setLineas(new Map());
      setExpandedCarga(null);
    } catch (err) {
      addToast('error', 'Error al importar: ' + (err as Error).message);
    } finally {
      setImportProgress(null);
    }
  };

  const handleDeleteCarga = async (carga: AsientoCarga) => {
    try {
      await supabase.from('asientos_extracontables_historico').insert({
        carga_id: carga.id,
        nombre: carga.nombre,
        accion: 'eliminacion',
        resumen: `Carga eliminada: ${carga.cantidad_registros || 0} registros`,
      });
      await supabase.from('asientos_extracontables_lineas').delete().eq('carga_id', carga.id);
      await supabase.from('asientos_extracontables_cargas').delete().eq('id', carga.id);
      addToast('success', 'Carga eliminada');
      setConfirmDeleteCarga(null);
      setExpandedCarga(null);
      setLineas(new Map());
      fetchCargas();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Asientos Extracontables</h1>
          <p className="text-sm text-slate-500">Carga masiva de asientos contables</p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-all whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-line w-5 h-5 flex items-center justify-center"></i>
                Descargar Plantilla
              </button>
              <label className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 cursor-pointer transition-all whitespace-nowrap">
                <i className="ri-file-upload-line w-5 h-5 flex items-center justify-center"></i>
                {importProgress || 'Importar Excel'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={!!importProgress} />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Total Cargas</p>
          <p className="text-2xl font-bold text-slate-900">{stats.totalCargas}</p>
        </div>
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Total Líneas</p>
          <p className="text-2xl font-bold text-slate-900">{formatNum0(stats.totalLineas)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Débito Local</p>
          <p className="text-2xl font-bold text-emerald-600">{formatNum0(stats.totalDebitoLocal)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Crédito Local</p>
          <p className="text-2xl font-bold text-rose-600">{formatNum0(stats.totalCreditoLocal)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 border border-slate-200">
          <p className="text-sm text-slate-500">Débito Dólar</p>
          <p className="text-2xl font-bold text-sky-600">{formatNum0(stats.totalDebitoDolar)}</p>
        </div>
      </div>

      {/* Search + Lista de Cargas */}
      <div className="rounded-xl bg-white p-4 border border-slate-200 space-y-4">
        <div className="relative max-w-md">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 flex items-center justify-center"></i>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar carga por nombre o descripción..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-200 rounded animate-pulse"></div>
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <p className="text-center text-slate-400 py-8">
            {search ? 'No se encontraron cargas con ese criterio' : 'No hay cargas aún. Importá un Excel para empezar.'}
          </p>
        ) : (
          <div className="space-y-2">
            {paginated.map((carga) => (
              <div key={carga.id} className="rounded-lg border border-slate-200 overflow-hidden">
                {/* Carga header */}
                <button
                  onClick={() => toggleExpand(carga.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform ${expandedCarga === carga.id ? 'bg-emerald-100 rotate-90' : 'bg-slate-100'}`}>
                      <i className="ri-arrow-right-s-line text-slate-600 w-5 h-5 flex items-center justify-center"></i>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{carga.nombre}</p>
                      <p className="text-xs text-slate-500">
                        {carga.cantidad_registros || 0} registros
                        {carga.descripcion && ` · ${carga.descripcion}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 ml-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Débito Local</p>
                      <p className="text-sm font-semibold text-emerald-600">{formatNum(carga.total_debito_local)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Crédito Local</p>
                      <p className="text-sm font-semibold text-rose-600">{formatNum(carga.total_credito_local)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Débito Dólar</p>
                      <p className="text-sm font-semibold text-sky-600">{formatNum(carga.total_debito_dolar)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Org.</p>
                      <p className="text-sm text-slate-700">
                        {carga.organizacion_id ? organizacionesMap.get(carga.organizacion_id) || '—' : '—'}
                      </p>
                    </div>
                    {canWrite && (
                      <button
                        onClick={(ev) => { ev.stopPropagation(); setConfirmDeleteCarga(carga); }}
                        className="rounded-md p-2 text-red-500 hover:bg-red-50 cursor-pointer"
                        title="Eliminar carga"
                      >
                        <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
                      </button>
                    )}
                  </div>
                </button>

                {/* Líneas expandidas */}
                {expandedCarga === carga.id && (
                  <div className="border-t border-slate-200">
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-100 z-10">
                          <tr className="text-left text-slate-500">
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Cuenta</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Asiento</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Cons.</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">NIT</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">CC</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Fuente</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Ref.</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Débito Local</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Crédito Local</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Débito Dólar</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap text-right">Crédito Dólar</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Fecha</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Empresa</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Paquete</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Org.</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">País</th>
                            <th className="py-2 px-3 font-medium whitespace-nowrap">Cía.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {!lineas.has(carga.id) ? (
                            <tr>
                              <td colSpan={17} className="py-8 text-center text-slate-400">
                                <i className="ri-loader-4-line animate-spin mr-2"></i>
                                Cargando líneas...
                              </td>
                            </tr>
                          ) : (lineas.get(carga.id) || []).length === 0 ? (
                            <tr>
                              <td colSpan={17} className="py-4 text-center text-slate-400">Sin líneas</td>
                            </tr>
                          ) : (
                            (lineas.get(carga.id) || []).map((linea) => (
                              <tr key={linea.id} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="py-2 px-3 text-slate-900 font-mono text-xs font-medium whitespace-nowrap">{linea.cuenta_contable}</td>
                                <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{linea.asiento || '—'}</td>
                                <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{linea.consecutivo || '—'}</td>
                                <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{linea.nit || '—'}</td>
                                <td className="py-2 px-3 text-slate-600 text-xs whitespace-nowrap">{linea.centro_costo || '—'}</td>
                                <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{linea.fuente || '—'}</td>
                                <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{linea.referencia || '—'}</td>
                                <td className="py-2 px-3 text-emerald-600 text-right font-medium whitespace-nowrap">{formatNum(linea.debito_local)}</td>
                                <td className="py-2 px-3 text-rose-600 text-right font-medium whitespace-nowrap">{formatNum(linea.credito_local)}</td>
                                <td className="py-2 px-3 text-sky-600 text-right font-medium whitespace-nowrap">{formatNum(linea.debito_dolar)}</td>
                                <td className="py-2 px-3 text-amber-600 text-right font-medium whitespace-nowrap">{formatNum(linea.credito_dolar)}</td>
                                <td className="py-2 px-3 text-slate-600 text-xs whitespace-nowrap">{linea.fecha || '—'}</td>
                                <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{linea.empresa || '—'}</td>
                                <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{linea.paquete || '—'}</td>
                                <td className="py-2 px-3 text-slate-600 text-xs whitespace-nowrap">
                                  {linea.organizacion_id ? organizacionesMap.get(linea.organizacion_id) || '—' : '—'}
                                </td>
                                <td className="py-2 px-3 text-slate-600 text-xs whitespace-nowrap">
                                  {linea.compania_id ? paisesMap.get(linea.compania_id) || '—' : '—'}
                                </td>
                                <td className="py-2 px-3 text-slate-600 text-xs whitespace-nowrap">
                                  {linea.compania_id ? companiasMap.get(linea.compania_id) || '—' : '—'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-slate-500">
              Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Anterior</button>
              <span className="flex items-center px-2 text-sm text-slate-500">Página {page + 1} de {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <AsientosPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onConfirm={handleConfirmImport}
        headers={previewHeaders}
        data={previewData}
        total={previewStats.total}
        skipped={previewStats.skipped}
        validos={previewStats.validos}
        invalidos={previewStats.invalidos}
        totalDebitoLocal={previewStats.totalDebitoLocal}
        totalCreditoLocal={previewStats.totalCreditoLocal}
        totalDebitoDolar={previewStats.totalDebitoDolar}
        totalCreditoDolar={previewStats.totalCreditoDolar}
        loading={!!importProgress}
        paises={paises}
        companias={companias}
        centrosCostos={centrosCostos}
      />

      {/* Confirm Delete */}
      {confirmDeleteCarga && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDeleteCarga(null)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <i className="ri-delete-bin-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Eliminar Carga</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              ¿Eliminar la carga <strong className="text-slate-900">{confirmDeleteCarga.nombre}</strong> con {confirmDeleteCarga.cantidad_registros || 0} líneas? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDeleteCarga(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
              <button onClick={() => handleDeleteCarga(confirmDeleteCarga)} className="rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}