import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/contexts/ToastContext';
import type { CatalogoItem, Organizacion, Pais, Compania, CentroCosto } from '@/types';

interface BulkUpdateExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  items: CatalogoItem[];
  organizaciones: Organizacion[];
  paises: Pais[];
  companias: Compania[];
  centrosCostos: CentroCosto[];
}

type RowAction = 'update' | 'create' | 'error';

interface ParsedRow {
  linea: number | null;
  grupo: number | null;
  cuenta: string;
  descripcion: string;
  saldo_normal: string;
  comercializadora: string;
  balance_gyp: string;
  clasificacion: string;
  clasificacion_1: string;
  clasificacion_2: string;
  clasificacion_combinado_1: string;
  clasificacion_combinado_2: string;
  clasificacion_combinado_3: string;
  orden_clasificacion: number | null;
  org_nombre: string;
  org_id: string | null;
  pais_nombre: string;
  pais_id: string | null;
  cia_nombre: string;
  cia_id: string | null;
  cc_nombre: string;
  cc_id: string | null;
  action: RowAction;
  existingId: string | null;
  cambios: string;
  error: string;
}

const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

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
    (e) =>
      e.nombre.toLowerCase().trim() === search.toLowerCase().trim() ||
      e.codigo.toLowerCase().trim() === search.toLowerCase().trim(),
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

const normalizeHeader = (h: string): string =>
  h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_\/]+/g, '')
    .trim();

const DIFF_FIELDS = [
  'linea',
  'grupo',
  'descripcion',
  'saldo_normal',
  'comercializadora',
  'balance_gyp',
  'clasificacion',
  'clasificacion_1',
  'clasificacion_2',
  'clasificacion_combinado_1',
  'clasificacion_combinado_2',
  'clasificacion_combinado_3',
  'orden_clasificacion',
  'organizacion_id',
  'pais_id',
  'compania_id',
  'centro_costo_id',
];

export function BulkUpdateExcelModal({
  isOpen,
  onClose,
  onComplete,
  items,
  organizaciones,
  paises,
  companias,
  centrosCostos,
}: BulkUpdateExcelModalProps) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const resetState = () => {
    setRows([]);
    setHeaders([]);
    setFileName('');
    setReading(false);
    setProcessing(false);
    setProgress('');
    setDone(false);
  };

  const close = () => {
    if (processing) return;
    resetState();
    onClose();
  };

  const safeNumber = (raw: unknown): number | null => {
    if (raw === '' || raw === null || raw === undefined) return null;
    const n = Number(raw);
    if (Number.isNaN(n)) return null;
    return n;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReading(true);
    setDone(false);
    setRows([]);
    setHeaders([]);
    setFileName(file.name);
    try {
      const xlsx = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = xlsx.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1');
      const headerRow: string[] = [];
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[xlsx.utils.encode_cell({ r: range.s.r, c: C })];
        headerRow.push(cell ? String(cell.v || '') : '');
      }
      const rawHeaders = headerRow.filter((h) => h.trim() !== '');
      setHeaders(rawHeaders);

      const json = xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      if (json.length === 0) {
        addToast('warning', 'El archivo está vacío o no tiene datos.');
        setReading(false);
        return;
      }

      const headerMap: Record<string, string> = {};
      rawHeaders.forEach((h) => {
        headerMap[normalizeHeader(h)] = h;
      });

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

      const cuentaTest = getVal(json[0], 'Cuenta', 'cuenta', 'CUENTA');
      if (cuentaTest === '') {
        addToast('warning', `No se encontró la columna 'Cuenta'. Headers: ${rawHeaders.join(', ')}`);
        setReading(false);
        return;
      }

      // Índice de cuentas existentes por llave compuesta: cuenta || pais_id || compania_id
      const existingMap = new Map<string, CatalogoItem>();
      items.forEach((item) => {
        const key = `${item.cuenta}||${item.pais_id || 'NULL'}||${item.compania_id || 'NULL'}`;
        existingMap.set(key, item);
      });

      const parsed: ParsedRow[] = [];

      for (const row of json) {
        const cuenta = String(getVal(row, 'Cuenta', 'cuenta', 'CUENTA', 'Codigo', 'codigo', 'CODIGO', 'Code', 'CODE') || '').trim();
        const descripcion = String(getVal(row, 'Descripcion', 'descripcion', 'DESCRIPCION', 'Desc', 'DESC', 'Nombre', 'NOMBRE', 'nombre') || '').trim();

        const lineaRaw = getVal(row, 'Linea', 'linea', 'LINEA', 'Line', 'LINE');
        const grupoRaw = getVal(row, 'Grupo', 'grupo', 'GRUPO', 'Group', 'GROUP');
        const saldoNormal = String(getVal(row, 'Saldo Normal', 'SaldoNormal', 'saldo_normal', 'Saldo', 'SALDO') || '').trim();
        const comercializadora = String(getVal(row, 'Comercializadora', 'comercializadora', 'COMERCIALIZADORA', 'Comercial', 'COMERCIAL') || '').trim();
        const balanceGyp = String(getVal(row, 'Balance GyP', 'BalanceGyP', 'balance_gyp', 'Balance', 'BALANCE', 'BalanceGYP') || '').trim();
        const clasificacion = String(getVal(row, 'Clasificacion', 'clasificacion', 'CLASIFICACION', 'Clase', 'CLASE', 'Categoria', 'CATEGORIA') || '').trim();
        const clasificacion1 = String(getVal(row, 'Clasificacion 1', 'Clasificacion1', 'clasificacion_1', 'CLASIFICACION_1', 'Sub Clasificacion', 'Subclasificacion') || '').trim();
        const clasificacion2 = String(getVal(row, 'Clasificacion 2', 'Clasificacion2', 'clasificacion_2', 'CLASIFICACION_2', 'Sub Clasificacion 2', 'Subclasificacion 2') || '').trim();
        const clasificacionCombinado1 = String(getVal(row, 'Clasificacion Combinado 1', 'ClasificacionCombinado1', 'clasificacion_combinado_1', 'CLASIFICACION_COMBINADO_1', 'Combinado 1') || '').trim();
        const clasificacionCombinado2 = String(getVal(row, 'Clasificacion Combinado 2', 'ClasificacionCombinado2', 'clasificacion_combinado_2', 'CLASIFICACION_COMBINADO_2', 'Combinado 2') || '').trim();
        const clasificacionCombinado3 = String(getVal(row, 'Clasificacion Combinado 3', 'ClasificacionCombinado3', 'clasificacion_combinado_3', 'CLASIFICACION_COMBINADO_3', 'Combinado 3') || '').trim();
        const ordenRaw = getVal(row, 'Orden Clasificacion', 'OrdenClasificacion', 'orden_clasificacion', 'Orden', 'ORDEN', 'ORDER');

        const orgNombre = String(getVal(row, 'Organizacion', 'organizacion', 'ORGANIZACION', 'Org', 'ORG') || '').trim();
        const paisNombre = String(getVal(row, 'Pais', 'pais', 'PAIS', 'Country', 'COUNTRY') || '').trim();
        const ciaNombre = String(getVal(row, 'Compania', 'compania', 'COMPANIA', 'Cia', 'CIA', 'Company', 'COMPANY') || '').trim();
        const ccNombre = String(getVal(row, 'Centro Costo', 'CentroCosto', 'centro_costo', 'CENTRO_COSTO', 'CC', 'cc', 'Cost Center', 'COSTCENTER') || '').trim();

        const orgMatch = findEntity(orgNombre, organizaciones);
        const paisMatch = findEntity(paisNombre, paises);

        let ciaMatch = paisMatch ? findEntity(ciaNombre, companias.filter((c) => c.pais_id === paisMatch.id)) : null;
        if (!ciaMatch) ciaMatch = findEntity(ciaNombre, companias);
        if (!ciaMatch && ciaNombre && ccNombre) {
          for (const c of companias) {
            if (normalizeText(ccNombre).includes(normalizeText(c.nombre)) || normalizeText(ccNombre).includes(normalizeText(c.codigo))) {
              ciaMatch = c;
              break;
            }
          }
        }

        let ccMatch = paisMatch ? findEntity(ccNombre, centrosCostos.filter((cc) => cc.pais_id === paisMatch.id)) : null;
        if (!ccMatch) ccMatch = findEntity(ccNombre, centrosCostos);

        const orgId = orgMatch?.id || null;
        const paisId = paisMatch?.id || null;
        const ciaId = ciaMatch?.id || null;
        const ccId = ccMatch?.id || null;

        const errores: string[] = [];
        if (!cuenta) errores.push('Cuenta requerida');
        if (!descripcion) errores.push('Descripción requerida');
        if (!ciaNombre) errores.push('Compañía requerida');
        else if (!ciaId) {
          const ctxPais = paisMatch ? ` en ${paisMatch.nombre}` : '';
          errores.push(`Cía "${ciaNombre}" no encontrada${ctxPais}`);
        }
        if (paisNombre && !paisId) errores.push(`País "${paisNombre}" no encontrado`);
        if (orgNombre && !orgId) errores.push(`Org "${orgNombre}" no encontrada`);
        if (ccNombre && !ccId) {
          const ctxPais = paisMatch ? ` en ${paisMatch.nombre}` : '';
          errores.push(`CC "${ccNombre}" no encontrado${ctxPais}`);
        }

        const linea = safeNumber(lineaRaw);
        const grupo = safeNumber(grupoRaw);
        const orden = safeNumber(ordenRaw);

        let action: RowAction = 'error';
        let existingId: string | null = null;
        let cambios = '';

        if (errores.length === 0) {
          const key = `${cuenta}||${paisId || 'NULL'}||${ciaId || 'NULL'}`;
          const existing = existingMap.get(key);
          if (existing) {
            action = 'update';
            existingId = existing.id;
            const newValues: Record<string, unknown> = {
              linea,
              grupo,
              descripcion,
              saldo_normal: saldoNormal || null,
              comercializadora: comercializadora || null,
              balance_gyp: balanceGyp || null,
              clasificacion: clasificacion || null,
              clasificacion_1: clasificacion1 || null,
              clasificacion_2: clasificacion2 || null,
              clasificacion_combinado_1: clasificacionCombinado1 || null,
              clasificacion_combinado_2: clasificacionCombinado2 || null,
              clasificacion_combinado_3: clasificacionCombinado3 || null,
              orden_clasificacion: orden,
              organizacion_id: orgId,
              pais_id: paisId,
              compania_id: ciaId,
              centro_costo_id: ccId,
            };
            const diff: string[] = [];
            DIFF_FIELDS.forEach((campo) => {
              const oldVal = (existing as unknown as Record<string, unknown>)[campo];
              const newVal = newValues[campo];
              if (String(oldVal ?? '') !== String(newVal ?? '')) {
                diff.push(`${campo}: '${oldVal ?? '-'}' → '${newVal ?? '-'}'`);
              }
            });
            cambios = diff.length > 0 ? diff.join('; ') : 'Sin cambios detectados';
          } else {
            action = 'create';
          }
        }

        parsed.push({
          linea,
          grupo,
          cuenta,
          descripcion,
          saldo_normal: saldoNormal,
          comercializadora,
          balance_gyp: balanceGyp,
          clasificacion,
          clasificacion_1: clasificacion1,
          clasificacion_2: clasificacion2,
          clasificacion_combinado_1: clasificacionCombinado1,
          clasificacion_combinado_2: clasificacionCombinado2,
          clasificacion_combinado_3: clasificacionCombinado3,
          orden_clasificacion: orden,
          org_nombre: orgNombre,
          org_id: orgId,
          pais_nombre: paisNombre,
          pais_id: paisId,
          cia_nombre: ciaNombre,
          cia_id: ciaId,
          cc_nombre: ccNombre,
          cc_id: ccId,
          action,
          existingId,
          cambios,
          error: errores.join('; '),
        });
      }

      setRows(parsed);
      setReading(false);
    } catch (err) {
      addToast('error', 'Error al leer el archivo: ' + (err as Error).message);
      setReading(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const buildPayload = (row: ParsedRow): Record<string, unknown> => ({
    linea: row.linea,
    grupo: row.grupo,
    descripcion: row.descripcion,
    saldo_normal: row.saldo_normal || null,
    comercializadora: row.comercializadora || null,
    balance_gyp: row.balance_gyp || null,
    clasificacion: row.clasificacion || null,
    clasificacion_1: row.clasificacion_1 || null,
    clasificacion_2: row.clasificacion_2 || null,
    clasificacion_combinado_1: row.clasificacion_combinado_1 || null,
    clasificacion_combinado_2: row.clasificacion_combinado_2 || null,
    clasificacion_combinado_3: row.clasificacion_combinado_3 || null,
    orden_clasificacion: row.orden_clasificacion,
    organizacion_id: row.org_id,
    pais_id: row.pais_id,
    compania_id: row.cia_id,
    centro_costo_id: row.cc_id,
  });

  const handleConfirm = async () => {
    const updates = rows.filter((r) => r.action === 'update');
    const creates = rows.filter((r) => r.action === 'create');
    if (updates.length === 0 && creates.length === 0) {
      addToast('warning', 'No hay registros para procesar.');
      return;
    }
    setProcessing(true);
    setDone(false);
    let ok = 0;
    let failed = 0;
    let lastError = '';

    try {
      // Actualizaciones (una por una para registrar historial con cambios)
      const UPDATE_CHUNK = 50;
      for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
        const chunk = updates.slice(i, i + UPDATE_CHUNK);
        setProgress(`Actualizando ${Math.min(i + chunk.length, updates.length)} de ${updates.length} cuentas...`);
        const results = await Promise.all(
          chunk.map(async (row) => {
            try {
              const { error } = await supabase
                .from('catalogo_gyp')
                .update(buildPayload(row))
                .eq('id', row.existingId as string);
              if (error) throw error;
              await supabase.from('catalogo_gyp_historico').insert({
                catalogo_id: row.existingId,
                cuenta: row.cuenta,
                descripcion: row.descripcion,
                accion: 'actualizacion',
                cambios: row.cambios,
                resumen: `Actualización masiva desde Excel`,
              });
              return { ok: true };
            } catch (err) {
              return { ok: false, msg: (err as Error).message };
            }
          }),
        );
        results.forEach((r) => {
          if (r.ok) ok++;
          else {
            failed++;
            if (r.msg) lastError = r.msg;
          }
        });
      }

      // Creaciones (en batch)
      const INSERT_CHUNK = 200;
      for (let i = 0; i < creates.length; i += INSERT_CHUNK) {
        const chunk = creates.slice(i, i + INSERT_CHUNK);
        setProgress(`Creando ${Math.min(i + chunk.length, creates.length)} de ${creates.length} cuentas...`);
        const payload = chunk.map((row) => ({
          ...buildPayload(row),
          cuenta: row.cuenta,
          activa: true,
        }));
        const { data: inserted, error } = await supabase
          .from('catalogo_gyp')
          .insert(payload)
          .select('id, cuenta, descripcion');
        if (error) {
          failed += chunk.length;
          lastError = error.message;
        } else {
          ok += (inserted || []).length;
          const historial = (inserted || []).map((ins: { id: string; cuenta: string; descripcion: string }) => ({
            catalogo_id: ins.id,
            cuenta: ins.cuenta,
            descripcion: ins.descripcion,
            accion: 'creacion',
            resumen: 'Cuenta creada desde actualización masiva',
          }));
          if (historial.length > 0) {
            await supabase.from('catalogo_gyp_historico').insert(historial);
          }
        }
      }

      setDone(true);
      if (failed > 0) {
        addToast('error', `${ok} procesadas, ${failed} fallaron. ${lastError ? 'Error: ' + lastError : ''}`);
      } else {
        addToast('success', `${ok} cuentas procesadas correctamente (${updates.length} actualizadas, ${creates.length} creadas).`);
      }
      onComplete();
    } catch (err) {
      addToast('error', 'Error en la actualización masiva: ' + (err as Error).message);
    } finally {
      setProcessing(false);
      setProgress('');
    }
  };

  const updateCount = rows.filter((r) => r.action === 'update').length;
  const createCount = rows.filter((r) => r.action === 'create').length;
  const errorCount = rows.filter((r) => r.action === 'error').length;
  const previewRows = rows.slice(0, 15);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={close}></div>
      <div className="relative w-full max-w-6xl max-h-[90vh] rounded-xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Actualización Masiva por Excel</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Lee un Excel completo y sobreescribe el catálogo. Se identifica por cuenta + país + compañía.
            </p>
          </div>
          <button onClick={close} className="rounded-lg p-1 hover:bg-slate-100" disabled={processing}>
            <i className="ri-close-line text-xl text-slate-500"></i>
          </button>
        </div>

        {/* Zona de carga */}
        {rows.length === 0 ? (
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <i className="ri-file-excel-2-line text-2xl text-emerald-600"></i>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Seleccioná el archivo Excel con el catálogo completo</p>
                <p className="text-xs text-slate-500 mt-1">
                  Las cuentas que ya existen se <strong>sobreescriben</strong>, los campos vacíos se limpian y las que no existen se crean.
                </p>
              </div>
              <div className="flex gap-3">
                <label className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 cursor-pointer transition-colors whitespace-nowrap">
                  <i className="ri-upload-line"></i>
                  {reading ? 'Leyendo...' : 'Seleccionar Excel'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleFile}
                    disabled={reading}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-400">
                Usá la misma estructura de la <span className="font-medium">Descargar Plantilla</span> del catálogo.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Resumen de acciones */}
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm text-slate-600 mr-1">Archivo: <strong className="text-slate-900">{fileName}</strong></span>
                <div className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-sm">
                  <i className="ri-refresh-line text-amber-700"></i>
                  <span className="text-amber-800"><strong>{updateCount}</strong> actualizar</span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1.5 text-sm">
                  <i className="ri-add-line text-emerald-700"></i>
                  <span className="text-emerald-800"><strong>{createCount}</strong> crear</span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 text-sm">
                  <i className="ri-error-warning-line text-red-700"></i>
                  <span className="text-red-800"><strong>{errorCount}</strong> con error</span>
                </div>
              </div>
              {headers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {headers.map((h) => (
                    <span key={h} className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">#</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Cuenta</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Descripción</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">País</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Cía.</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Acción</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-600 whitespace-nowrap">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className={`border-t border-slate-100 ${row.action === 'error' ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                        <td className="py-2 px-3 text-slate-500 text-xs whitespace-nowrap">{idx + 1}</td>
                        <td className="py-2 px-3 text-slate-900 font-medium whitespace-nowrap">{row.cuenta || '-'}</td>
                        <td className="py-2 px-3 text-slate-700 min-w-[160px]">{row.descripcion || '-'}</td>
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{row.pais_nombre || '-'}</td>
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{row.cia_nombre || '-'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {row.action === 'update' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                              <i className="ri-refresh-line"></i> Actualizar
                            </span>
                          )}
                          {row.action === 'create' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                              <i className="ri-add-line"></i> Crear
                            </span>
                          )}
                          {row.action === 'error' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                              <i className="ri-close-line"></i> Error
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs text-slate-500 max-w-[260px]">
                          {row.action === 'error' ? row.error : row.action === 'update' ? row.cambios : 'Se creará como nueva cuenta'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 15 && (
                <p className="text-xs text-slate-500 mt-2 text-center">
                  Mostrando las primeras 15 filas de {rows.length} totales.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 gap-3">
              <div className="text-sm text-slate-600">
                {progress ? (
                  <span className="inline-flex items-center gap-2 text-emerald-700">
                    <i className="ri-loader-4-line animate-spin"></i> {progress}
                  </span>
                ) : (
                  <span>
                    <span className="font-semibold text-slate-900">{updateCount + createCount}</span> cuentas listas para procesar
                    {errorCount > 0 && <span className="text-red-600"> · {errorCount} con error se omitirán</span>}
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => resetState()}
                  disabled={processing}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50"
                >
                  Elegir otro archivo
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={processing || (updateCount === 0 && createCount === 0)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {processing && <i className="ri-loader-4-line animate-spin"></i>}
                  {processing ? 'Procesando...' : `Sobreescribir ${updateCount} y crear ${createCount}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}