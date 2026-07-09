import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { supabase } from '@/lib/supabase';
import type { Factor, Organizacion, Pais, Compania, CentroCosto } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useUbicaciones } from '@/hooks/useUbicaciones';
import FactorsPreviewModal from '@/pages/factores/components/FactorsPreviewModal';
import type { FactorPreviewRow } from '@/pages/factores/components/FactorsPreviewModal';

// Colores para las líneas del gráfico de comparación
const CHART_COLORS = [
  '#0d9488', // teal-600
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#84cc16', // lime-500
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#a3e635', // lime-400
  '#d946ef', // fuchsia-500
];
const BADGE_PALETTES = [
  { bg: 'bg-primary-100', text: 'text-primary-700', dot: 'bg-primary-500' },
  { bg: 'bg-accent-100', text: 'text-accent-700', dot: 'bg-accent-500' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  { bg: 'bg-rose-100', text: 'text-rose-700', dot: 'bg-rose-500' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  { bg: 'bg-teal-100', text: 'text-teal-700', dot: 'bg-teal-500' },
  { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getBadgeColors(tipo: string) {
  return BADGE_PALETTES[hashString(tipo) % BADGE_PALETTES.length];
}

function getBadgeIcon(tipo: string) {
  const lower = tipo.toLowerCase();
  if (lower.includes('acumulad')) return 'ri-line-chart-line';
  if (lower.includes('pasada') || lower.includes('anterior')) return 'ri-arrow-go-back-line';
  if (lower.includes('mensual')) return 'ri-calendar-check-line';
  if (lower.includes('compra') || lower.includes('venta')) return 'ri-exchange-dollar-line';
  if (lower.includes('banco') || lower.includes('central')) return 'ri-bank-line';
  if (lower.includes('dolar') || lower.includes('dólar') || lower.includes('usd')) return 'ri-money-dollar-circle-line';
  return 'ri-funds-line';
}

function formatNumero(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n);
}

function formatFecha(fecha: string | null) {
  if (!fecha) return '—';
  const d = new Date(fecha + (fecha.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Convierte cualquier formato de fecha a YYYY-MM-DD.
 * Soporta: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY,
 * DD.MM.YYYY, DD MMM YYYY, MMM DD YYYY, YYYYMMDD,
 * números seriales de Excel, y cualquier string que new Date() entienda.
 */
function parseAnyDate(raw: unknown): string {
  // Si ya es un número (Excel serial date)
  if (typeof raw === 'number' && !isNaN(raw) && raw >= 1 && raw <= 100000) {
    const excelEpoch = new Date(1899, 11, 30);
    const result = new Date(excelEpoch.getTime() + Math.round(raw) * 86400000);
    if (!isNaN(result.getTime())) {
      return result.toISOString().slice(0, 10);
    }
  }

  const s = String(raw ?? '').trim();
  if (!s) return new Date().toISOString().slice(0, 10);

  // Número entero en string (Excel serial date como texto)
  if (/^\d{4,5}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial >= 30000 && serial <= 80000) {
      const excelEpoch = new Date(1899, 11, 30);
      const result = new Date(excelEpoch.getTime() + serial * 86400000);
      if (!isNaN(result.getTime())) {
        return result.toISOString().slice(0, 10);
      }
    }
  }

  // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
  }

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  // Heurística: si parte1 > 12 o ambas <= 12 → DD/MM/YYYY (convención LATAM)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const p1 = parseInt(m[1], 10);
    const p2 = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (p1 >= 1 && p2 >= 1 && y >= 1900 && y <= 2100) {
      if (p1 > 12 && p2 <= 12) {
        // Claramente DD/MM/YYYY (día > 12 no puede ser mes)
        return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      }
      if (p2 > 12 && p1 <= 12) {
        // Claramente MM/DD/YYYY (segundo > 12 no puede ser mes en DD/MM)
        return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
      }
      if (p1 <= 31 && p2 <= 12) {
        // Ambiguo (ambos <= 12). Convención LATAM: DD/MM/YYYY
        return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      }
    }
  }

  // DD MMM YYYY  o  MMM DD, YYYY (inglés y español)
  const monthsMap: Record<string, number> = {
    ene: 1, jan: 1, enero: 1, january: 1,
    feb: 2, febrero: 2, february: 2,
    mar: 3, marzo: 3, march: 3,
    abr: 4, apr: 4, abril: 4, april: 4,
    may: 5, mayo: 5,
    jun: 6, junio: 6, june: 6,
    jul: 7, julio: 7, july: 7,
    ago: 8, aug: 8, agosto: 8, august: 8,
    sep: 9, set: 9, sept: 9, septiembre: 9, september: 9,
    oct: 10, octubre: 10, october: 10,
    nov: 11, noviembre: 11, november: 11,
    dic: 12, dec: 12, diciembre: 12, december: 12,
  };

  // DD MMM YYYY (ej: "01 Ene 2026", "15 Jan 2025")
  m = s.match(/^(\d{1,2})\s+([a-zA-Záéíóúñü]{3,})\s*,?\s*(\d{4})$/i);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = monthsMap[m[2].toLowerCase().slice(0, 3)];
    const y = parseInt(m[3], 10);
    if (mo && d >= 1 && d <= 31) {
      return `${m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
  }

  // MMM DD, YYYY (ej: "Ene 01 2026", "Jan 15, 2025")
  m = s.match(/^([a-zA-Záéíóúñü]{3,})\s+(\d{1,2}),?\s*(\d{4})$/i);
  if (m) {
    const mo = monthsMap[m[1].toLowerCase().slice(0, 3)];
    const d = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (mo && d >= 1 && d <= 31) {
      return `${m[3]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }
  }

  // YYYYMMDD (8 dígitos sin separadores)
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
  }

  // Último recurso: dejar que new Date() intente parsear
  // Agregar T00:00:00 para evitar offsets de zona horaria
  const dt = new Date(s + (s.includes('T') ? '' : 'T00:00:00'));
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    if (y >= 1900 && y <= 2100) {
      return dt.toISOString().slice(0, 10);
    }
  }

  // Fallback final: fecha de hoy
  return new Date().toISOString().slice(0, 10);
}

const MIN_TIPOS_PARA_SCROLL = 5;

export default function FactoresPage() {
  const [factores, setFactores] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Factor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Factor | null>(null);
  const [tiposSeleccionados, setTiposSeleccionados] = useState<Set<string>>(new Set());
  const [tiposExpandidos, setTiposExpandidos] = useState(false);
  const [filtroOrganizacion, setFiltroOrganizacion] = useState('');
  const [filtroPais, setFiltroPais] = useState('');
  const [filtroCompania, setFiltroCompania] = useState('');
  const [filtroCentroCosto, setFiltroCentroCosto] = useState('');

  // Conversor
  const [montoColones, setMontoColones] = useState('');
  const [tasaSeleccionada, setTasaSeleccionada] = useState('');

  // Renombrar tipo masivo
  const [renameTipoOpen, setRenameTipoOpen] = useState(false);
  const [renameTipoFrom, setRenameTipoFrom] = useState('');
  const [renameTipoTo, setRenameTipoTo] = useState('');

  // Importación masiva
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<FactorPreviewRow[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [toInsert, setToInsert] = useState<Record<string, unknown>[]>([]);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const { organizaciones, paises, companias, centrosCostos, organizacionesMap, paisesMap, companiasMap, centrosCostosMap } = useUbicaciones();

  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const factoresRes = await supabase.from('factores').select('*').order('fecha', { ascending: false });
    if (factoresRes.data) setFactores(factoresRes.data as Factor[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Tipos únicos ordenados
  const tipos = useMemo(() => {
    const map = new Map<string, number>();
    factores.forEach((f) => {
      map.set(f.tipo, (map.get(f.tipo) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [factores]);

  const filtered = useMemo(() => {
    let result = factores;
    if (tiposSeleccionados.size > 0) result = result.filter((f) => tiposSeleccionados.has(f.tipo));
    if (filtroOrganizacion) result = result.filter((f) => f.organizacion_id === filtroOrganizacion);
    if (filtroPais) result = result.filter((f) => f.pais_id === filtroPais);
    if (filtroCompania) result = result.filter((f) => f.compania_id === filtroCompania);
    if (filtroCentroCosto) result = result.filter((f) => f.centro_costo_id === filtroCentroCosto);
    return result;
  }, [factores, tiposSeleccionados, filtroOrganizacion, filtroPais, filtroCompania, filtroCentroCosto]);

  // Último valor por tipo
  const ultimoPorTipo = useMemo(() => {
    const map = new Map<string, Factor>();
    factores.forEach((f) => {
      if (!map.has(f.tipo) || new Date(f.fecha) > new Date(map.get(f.tipo)!.fecha)) {
        map.set(f.tipo, f);
      }
    });
    return map;
  }, [factores]);

  // Inicializar tasa seleccionada con el primer tipo disponible
  useEffect(() => {
    if (tipos.length > 0 && !tasaSeleccionada) {
      setTasaSeleccionada(tipos[0][0]);
    }
  }, [tipos, tasaSeleccionada]);

  // Conversión
  const resultadoConversion = useMemo(() => {
    const monto = parseFloat(montoColones);
    if (isNaN(monto) || monto <= 0) return null;
    const factor = ultimoPorTipo.get(tasaSeleccionada);
    if (!factor || factor.valor <= 0) return null;
    return monto / factor.valor;
  }, [montoColones, tasaSeleccionada, ultimoPorTipo]);

  // Datos para el gráfico de evolución - múltiples tipos
  const chartData = useMemo(() => {
    if (tiposSeleccionados.size === 0) return [];

    // Recolectar todas las fechas únicas y los valores por tipo
    const dateSet = new Set<string>();
    const typeDataMap = new Map<string, Map<string, number>>();

    tiposSeleccionados.forEach((tipo) => {
      const data = factores
        .filter((f) => f.tipo === tipo)
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
      const dateMap = new Map<string, number>();
      data.forEach((f) => {
        dateSet.add(f.fecha);
        dateMap.set(f.fecha, f.valor);
      });
      typeDataMap.set(tipo, dateMap);
    });

    const sortedDates = Array.from(dateSet).sort();
    return sortedDates.map((date) => {
      const point: Record<string, unknown> = { fecha: formatFecha(date), fechaRaw: date };
      typeDataMap.forEach((dateMap, tipo) => {
        point[tipo] = dateMap.get(date) ?? null;
      });
      return point;
    });
  }, [factores, tiposSeleccionados]);

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      if (editing) {
        const valorAnterior = editing.valor;
        await supabase.from('factores_historico').insert({
          factor_id: editing.id,
          valor_anterior: valorAnterior,
          valor_nuevo: formData.valor,
          fecha: formData.fecha as string,
          tipo: formData.tipo as string,
          descripcion: (formData.descripcion as string) || null,
        });

        const { error } = await supabase.from('factores').update(formData).eq('id', editing.id);
        if (error) throw error;
        addToast('success', 'Tasa actualizada');
      } else {
        const { data, error } = await supabase.from('factores').insert(formData).select('id').single();
        if (error) throw error;

        if (data) {
          await supabase.from('factores_historico').insert({
            factor_id: data.id,
            valor_anterior: null,
            valor_nuevo: formData.valor as number,
            fecha: formData.fecha as string,
            tipo: formData.tipo as string,
            descripcion: 'Creación de la tasa',
          });
        }
        addToast('success', 'Tasa creada');
      }
      setModalOpen(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleDelete = async (item: Factor) => {
    try {
      const { error } = await supabase.from('factores').delete().eq('id', item.id);
      if (error) throw error;
      addToast('success', 'Tasa eliminada');
      setConfirmDelete(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const toggleActiva = async (item: Factor) => {
    try {
      const nuevo = !item.activa;
      const { error } = await supabase.from('factores').update({ activa: nuevo }).eq('id', item.id);
      if (error) throw error;
      addToast('success', `Tasa ${nuevo ? 'activada' : 'desactivada'}`);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleRenameTipo = async () => {
    const from = renameTipoFrom.trim();
    const to = renameTipoTo.trim();
    if (!from || !to || from === to) return;
    if (tipos.some(([t]) => t === to)) {
      addToast('error', `Ya existe un tipo llamado "${to}". Eliminalo primero o usá otro nombre.`);
      return;
    }
    try {
      const affected = factores.filter((f) => f.tipo === from);
      if (affected.length === 0) {
        addToast('error', 'No se encontraron tasas con ese tipo.');
        return;
      }
      const { error: updateError } = await supabase.from('factores').update({ tipo: to }).eq('tipo', from);
      if (updateError) throw updateError;
      const historicoInserts = affected.map((f) => ({
        factor_id: f.id,
        valor_anterior: f.valor,
        valor_nuevo: f.valor,
        fecha: f.fecha,
        tipo: to,
        descripcion: `Renombrado de "${from}" a "${to}"`,
      }));
      await supabase.from('factores_historico').insert(historicoInserts);
      addToast('success', `${affected.length} tasas renombradas de "${from}" a "${to}"`);
      setRenameTipoOpen(false);
      setRenameTipoFrom('');
      setRenameTipoTo('');
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  // --- DESCARGAR PLANTILLA ---
  const handleDownloadTemplate = async () => {
    try {
      const xlsx = await import('xlsx');
      const headers = ['Tipo', 'Valor', 'Fecha', 'Descripcion', 'Organizacion', 'Pais', 'Compania', 'Centro_Costo'];
      const ejemplos = [
        ['Tasa Acumulada', 548.25, '2026-03-15', 'Ejemplo de tasa acumulada', 'Mayoreo', 'Costa Rica', 'COFERSA', 'CC Central'],
        ['Tasa Mensual', 542.1, '2026-03-01', 'Ejemplo de tasa mensual', 'Mayoreo', 'Colombia', 'BEVAL', 'CC Norte'],
      ];

      // Hoja de datos
      const wsData = xlsx.utils.aoa_to_sheet([headers, ...ejemplos]);
      wsData['!cols'] = headers.map(() => ({ wch: 22 }));

      // Hoja de leyenda
      const leyendaHeaders = ['Tipos de Tasa Existentes'];
      const tiposExistentes = [...new Set(factores.map((f) => f.tipo))].sort();
      const leyendaRows = tiposExistentes.map((t) => [t]);
      if (tiposExistentes.length === 0) {
        leyendaRows.push(['(No hay tipos existentes aún)']);
      }
      leyendaRows.push([]);
      leyendaRows.push(['Instrucciones:']);
      leyendaRows.push(['1. Llená la hoja "Tasas" con tus datos.']);
      leyendaRows.push(['2. Si usás un Tipo que no está en esta leyenda, se creará automáticamente.']);
      leyendaRows.push(['3. Si usás un Tipo existente, se validará contra la base de datos.']);
      leyendaRows.push(['4. Las columnas Organizacion, Pais, Compania y Centro_Costo buscan coincidencia por nombre o código.']);
      leyendaRows.push(['5. La columna Fecha acepta cualquier formato: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, DD MMM YYYY, etc.']);
      const wsLeyenda = xlsx.utils.aoa_to_sheet([leyendaHeaders, ...leyendaRows]);
      wsLeyenda['!cols'] = [{ wch: 50 }];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, wsData, 'Tasas');
      xlsx.utils.book_append_sheet(wb, wsLeyenda, 'Leyenda');
      const wbout = xlsx.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Plantilla_Tasas.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      addToast('error', 'Error al generar plantilla: ' + (err as Error).message);
    }
  };

  // --- UTILIDADES ---
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

  // --- IMPORTAR EXCEL ---
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportProgress('Leyendo archivo...');
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
      setPreviewHeaders(rawHeaders);

      const json = xlsx.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];
      if (json.length === 0) {
        addToast('warning', 'El archivo está vacío.');
        setImportProgress(null);
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

      // Verificar que al menos tengamos la columna Tipo
      const tipoTest = getVal(json[0], 'Tipo', 'tipo', 'TIPO');
      if (tipoTest === '') {
        addToast('warning', `No se encontró la columna 'Tipo'. Headers: ${rawHeaders.join(', ')}`);
        setImportProgress(null);
        return;
      }

      const tiposExistentesSet = new Set(factores.map((f) => f.tipo));
      const parsed: FactorPreviewRow[] = [];
      const batchToInsert: Record<string, unknown>[] = [];

      for (const row of json) {
        const tipoVal = String(getVal(row, 'Tipo', 'tipo', 'TIPO') || '').trim();
        if (!tipoVal) continue;

        const valorVal = Number(getVal(row, 'Valor', 'valor', 'VALOR') || 0);
        if (!valorVal || valorVal <= 0) continue;

        const fechaRaw = getVal(row, 'Fecha', 'fecha', 'FECHA');
        const fechaVal = parseAnyDate(fechaRaw || new Date());
        const descripcionVal = String(getVal(row, 'Descripcion', 'descripcion', 'DESCRIPCION', 'Desc') || '').trim();

        const orgNombre = String(getVal(row, 'Organizacion', 'organizacion', 'ORGANIZACION', 'Org', 'ORG') || '').trim();
        const paisNombre = String(getVal(row, 'Pais', 'pais', 'PAIS', 'Country', 'COUNTRY') || '').trim();
        const ciaNombre = String(getVal(row, 'Compania', 'compania', 'COMPANIA', 'Cia', 'CIA') || '').trim();
        const ccNombre = String(getVal(row, 'Centro_Costo', 'CentroCosto', 'centro_costo', 'CENTRO_COSTO', 'CC') || '').trim();

        const orgMatch = findEntity(orgNombre, organizaciones);
        const paisMatch = findEntity(paisNombre, paises);
        const ciaMatch = findEntity(ciaNombre, companias);
        const ccMatch = findEntity(ccNombre, centrosCostos);

        const simboloMoneda = paisMatch?.simbolo_moneda || '';

        const tipoExiste = tiposExistentesSet.has(tipoVal);
        const errores: string[] = [];
        if (orgNombre && !orgMatch) errores.push(`Org "${orgNombre}" no encontrada`);
        if (paisNombre && !paisMatch) errores.push(`País "${paisNombre}" no encontrado`);
        if (ciaNombre && !ciaMatch) errores.push(`Cía "${ciaNombre}" no encontrada`);
        if (ccNombre && !ccMatch) errores.push(`CC "${ccNombre}" no encontrado`);

        const rowValido = errores.length === 0;

        const rowData: Record<string, unknown> = {
          tipo: tipoVal,
          valor: valorVal,
          fecha: fechaVal,
          descripcion: descripcionVal || null,
          activa: true,
          organizacion_id: orgMatch?.id || null,
          pais_id: paisMatch?.id || null,
          compania_id: ciaMatch?.id || null,
          centro_costo_id: ccMatch?.id || null,
        };
        batchToInsert.push(rowData);

        parsed.push({
          tipo: tipoVal,
          tipo_existente: tipoExiste,
          valor: valorVal,
          fecha: fechaVal,
          descripcion: descripcionVal,
          org_nombre: orgNombre,
          org_id: orgMatch?.id || null,
          pais_nombre: paisNombre,
          pais_id: paisMatch?.id || null,
          cia_nombre: ciaNombre,
          cia_id: ciaMatch?.id || null,
          cc_nombre: ccNombre,
          cc_id: ccMatch?.id || null,
          simbolo_moneda: simboloMoneda,
          valido: rowValido,
          error: rowValido ? null : errores.join('; '),
        });
      }

      if (parsed.length === 0) {
        addToast('warning', 'No se encontraron filas válidas con Tipo y Valor.');
        setImportProgress(null);
        return;
      }

      setPreviewData(parsed);
      setPreviewTotal(json.length);
      setToInsert(batchToInsert);
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
    const validRows = toInsert.filter((r, idx) => previewData[idx]?.valido);
    if (validRows.length === 0) {
      addToast('warning', 'No hay registros válidos para importar.');
      return;
    }
    setImportProgress('Importando tasas...');
    let imported = 0;
    let failed = 0;

    try {
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        setImportProgress(`Importando ${imported + 1} de ${validRows.length} tasas...`);

        const { data: inserted, error } = await supabase
          .from('factores')
          .insert(row)
          .select('id, tipo, valor, fecha');

        if (error) {
          // Si es error de RLS, mostramos el mensaje claro y paramos
          if (error.message.includes('row-level security')) {
            addToast('error', `Error RLS: La política de seguridad de Supabase está bloqueando los INSERT en la tabla "factores". Entrá al dashboard de Supabase → Table Editor → factores → Security y agregá una política de INSERT.`);
            setImportProgress(null);
            return;
          }
          failed++;
          console.error(`Fila ${i + 1} falló:`, error.message, row);
          continue;
        }

        if (inserted && inserted.length > 0) {
          imported++;
          const ins = inserted[0];
          await supabase.from('factores_historico').insert({
            factor_id: ins.id,
            valor_anterior: null,
            valor_nuevo: ins.valor,
            fecha: ins.fecha,
            tipo: ins.tipo,
            descripcion: 'Importación masiva',
          }).then(({ error: histErr }) => {
            if (histErr) console.error('Error historico:', histErr.message);
          });
        }
      }

      if (imported > 0) {
        addToast('success', `${imported} tasas importadas correctamente.${failed > 0 ? ` ${failed} fallaron.` : ''}`);
        setPreviewOpen(false);
        setPreviewData([]);
        setToInsert([]);
        fetchData();
      } else {
        addToast('error', `No se pudo importar ninguna tasa. ${failed} filas fallaron. Revisá la consola para más detalles.`);
      }
    } catch (err) {
      addToast('error', 'Error al importar: ' + (err as Error).message);
    } finally {
      setImportProgress(null);
    }
  };

  // Determinar cuántos tipos mostrar en las cards (scroll si hay muchos)
  const tiposVisibles = tiposExpandidos ? tipos : tipos.slice(0, 4);
  const necesitaExpandir = tipos.length > 4;

  // Obtener símbolo de moneda según el país
  const getSimboloMoneda = useCallback((paisId: string | null | undefined): string => {
    if (!paisId) return '';
    return paisesMap.get(paisId) || '';
  }, [paisesMap]);

  // Mapa rápido de pais_id -> símbolo
  const paisSimboloMap = useMemo(() => {
    const m = new Map<string, string>();
    paises.forEach((p) => m.set(p.id, p.simbolo_moneda));
    return m;
  }, [paises]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground-950">Tasas</h1>
          <p className="text-sm text-foreground-700">Gestión de tasas de cambio que afectan los montos del sistema</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <>
              <button
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-all whitespace-nowrap cursor-pointer"
              >
                <i className="ri-download-line w-5 h-5 flex items-center justify-center"></i>
                Descargar Plantilla
              </button>
              <label className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 cursor-pointer transition-all whitespace-nowrap">
                <i className="ri-file-upload-line w-5 h-5 flex items-center justify-center"></i>
                {importProgress || 'Importar Excel'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={!!importProgress} />
              </label>
              <button
                onClick={() => { setEditing(null); setModalOpen(true); }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
              >
                <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
                Nueva Tasa
              </button>
            </>
          )}
        </div>
      </div>

      {/* Cards de valores actuales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiposVisibles.map(([tipo]) => {
          const factor = ultimoPorTipo.get(tipo);
          const badge = getBadgeColors(tipo);
          const icon = getBadgeIcon(tipo);
          return (
            <div key={tipo} className="rounded-xl bg-background-50 p-5 border border-background-200">
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${badge.bg}`}>
                  <i className={`${icon} ${badge.text} w-4 h-4 flex items-center justify-center`}></i>
                </span>
                <p className="text-xs text-foreground-700 uppercase tracking-wide font-medium truncate">{tipo}</p>
              </div>
              {factor ? (
                <>
                  <p className="text-2xl font-bold text-foreground-950">{paisSimboloMap.get(factor.pais_id || '') || ''}{formatNumero(factor.valor)}</p>
                  <p className="text-xs text-foreground-600 mt-1">Vigente desde: {formatFecha(factor.fecha)}</p>
                  {factor.descripcion && (
                    <p className="text-xs text-foreground-500 mt-0.5 italic truncate">{factor.descripcion}</p>
                  )}
                </>
              ) : (
                <p className="text-lg text-foreground-400 mt-1 italic">Sin datos</p>
              )}
            </div>
          );
        })}
      </div>

      {necesitaExpandir && (
        <div className="text-center">
          <button
            onClick={() => setTiposExpandidos(!tiposExpandidos)}
            className="inline-flex items-center gap-1.5 text-sm text-foreground-600 hover:text-foreground-950 transition-colors"
          >
            {tiposExpandidos ? (
              <>Mostrar menos <i className="ri-arrow-up-s-line w-4 h-4 flex items-center justify-center"></i></>
            ) : (
              <>Ver todos los tipos ({tipos.length}) <i className="ri-arrow-down-s-line w-4 h-4 flex items-center justify-center"></i></>
            )}
          </button>
        </div>
      )}

      {/* Conversor de moneda */}
      <div className="rounded-xl bg-background-50 p-6 border border-background-200">
        <h3 className="text-base font-semibold text-foreground-950 mb-4 flex items-center gap-2">
          <i className="ri-swap-line w-5 h-5 flex items-center justify-center text-primary-500"></i>
          Conversor de Colones a Dólares
        </h3>
        <div className="flex flex-col lg:flex-row gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-foreground-700 mb-1">Monto en Colones (₡)</label>
            <input
              type="number"
              step="0.01"
              value={montoColones}
              onChange={(e) => setMontoColones(e.target.value)}
              placeholder="Ej: 500000"
              className="w-full rounded-lg border border-background-200 bg-background-100 px-3 py-2.5 text-sm text-foreground-950 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-foreground-700 mb-1">Tipo de Tasa</label>
            <select
              value={tasaSeleccionada}
              onChange={(e) => setTasaSeleccionada(e.target.value)}
              className="w-full rounded-lg border border-background-200 bg-background-100 px-3 py-2.5 text-sm text-foreground-950 outline-none focus:border-primary-500"
            >
              {tipos.length === 0 && (
                <option value="">— Sin tasas —</option>
              )}
              {tipos.map(([tipo]) => (
                <option key={tipo} value={tipo}>{tipo}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-foreground-700 mb-1">Resultado en USD</label>
            <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm">
              {resultadoConversion !== null ? (
                <span className="text-base font-bold text-emerald-700">
                  ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(resultadoConversion)}
                </span>
              ) : (
                <span className="text-foreground-400 italic">
                  {!montoColones ? 'Ingresá un monto en colones' : tipos.length === 0 ? 'No hay tasas creadas' : 'Seleccioná una tasa con valor válido'}
                </span>
              )}
            </div>
            {resultadoConversion !== null && (
              <p className="text-xs text-foreground-600 mt-1">
                Tasa usada: {paisSimboloMap.get(ultimoPorTipo.get(tasaSeleccionada)?.pais_id || '') || ''}{formatNumero(ultimoPorTipo.get(tasaSeleccionada)?.valor)} — {formatFecha(ultimoPorTipo.get(tasaSeleccionada)?.fecha || null)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs de filtro multi-select */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTiposSeleccionados(new Set())}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${tiposSeleccionados.size === 0 ? 'bg-foreground-950 text-background-50' : 'bg-background-100 text-foreground-700 hover:bg-background-200'}`}
        >
          Todos ({factores.length})
        </button>
        {tipos.map(([tipo, count]) => {
          const selected = tiposSeleccionados.has(tipo);
          return (
            <button
              key={tipo}
              onClick={() => {
                const next = new Set(tiposSeleccionados);
                if (selected) next.delete(tipo);
                else next.add(tipo);
                setTiposSeleccionados(next);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${selected ? 'bg-foreground-950 text-background-50' : 'bg-background-100 text-foreground-700 hover:bg-background-200'}`}
            >
              {selected && <i className="ri-check-line w-3.5 h-3.5 flex items-center justify-center"></i>}
              {tipo} ({count})
            </button>
          );
        })}
        <button
          onClick={() => navigate('/historial-cambios')}
          className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 bg-background-100 text-foreground-700 hover:bg-background-200"
        >
          <i className="ri-history-line w-4 h-4 flex items-center justify-center"></i>
          Historial de Cambios
        </button>
        {isAdmin && tipos.length > 0 && (
          <button
            onClick={() => { setRenameTipoOpen(true); setRenameTipoFrom(''); setRenameTipoTo(''); }}
            className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5 bg-background-100 text-foreground-700 hover:bg-background-200"
            title="Renombrar un tipo de tasa en todas sus ocurrencias"
          >
            <i className="ri-edit-2-line w-4 h-4 flex items-center justify-center"></i>
            Renombrar Tipo
          </button>
        )}
      </div>

      {/* Filtros de Ubicación */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filtroOrganizacion}
          onChange={(e) => setFiltroOrganizacion(e.target.value)}
          className="rounded-full px-4 py-1.5 text-sm font-medium bg-background-100 text-foreground-700 hover:bg-background-200 transition-colors outline-none border-none cursor-pointer"
        >
          <option value="">Todas las organizaciones</option>
          {organizaciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
        <select
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="rounded-full px-4 py-1.5 text-sm font-medium bg-background-100 text-foreground-700 hover:bg-background-200 transition-colors outline-none border-none cursor-pointer"
        >
          <option value="">Todos los países</option>
          {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
        </select>
        <select
          value={filtroCompania}
          onChange={(e) => setFiltroCompania(e.target.value)}
          className="rounded-full px-4 py-1.5 text-sm font-medium bg-background-100 text-foreground-700 hover:bg-background-200 transition-colors outline-none border-none cursor-pointer"
        >
          <option value="">Todas las compañías</option>
          {companias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select
          value={filtroCentroCosto}
          onChange={(e) => setFiltroCentroCosto(e.target.value)}
          className="rounded-full px-4 py-1.5 text-sm font-medium bg-background-100 text-foreground-700 hover:bg-background-200 transition-colors outline-none border-none cursor-pointer"
        >
          <option value="">Todos los centros de costo</option>
          {centrosCostos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Gráfico de evolución - cuando hay uno o más tipos seleccionados */}
      {tiposSeleccionados.size > 0 && chartData.length > 0 && (
        <div className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-base font-semibold text-foreground-950 flex items-center gap-2">
              <i className="ri-line-chart-line w-5 h-5 flex items-center justify-center text-accent-500"></i>
              Evolución{tiposSeleccionados.size > 1 ? ` — ${tiposSeleccionados.size} tipos` : ` de ${Array.from(tiposSeleccionados)[0]}`}
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              {Array.from(tiposSeleccionados).map((tipo, idx) => (
                <span key={tipo} className="inline-flex items-center gap-1.5 text-xs text-foreground-700">
                  <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}></span>
                  {tipo}
                </span>
              ))}
            </div>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--foreground-200) / 0.3)" />
                <XAxis
                  dataKey="fecha"
                  tick={{ fontSize: 11, fill: 'oklch(var(--foreground-600))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'oklch(var(--foreground-200) / 0.5)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'oklch(var(--foreground-600))' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${formatNumero(v)}`}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid oklch(var(--foreground-200) / 0.3)',
                    background: 'oklch(var(--background-50))',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    fontSize: '13px',
                  }}
                  labelFormatter={(label: string) => `Fecha: ${label}`}
                  formatter={(value: number, name: string) => [value !== null ? `${formatNumero(value)}` : 'Sin dato', name]}
                />
                <Legend />
                {Array.from(tiposSeleccionados).map((tipo, idx) => (
                  <Line
                    key={tipo}
                    type="monotone"
                    dataKey={tipo}
                    name={tipo}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: CHART_COLORS[idx % CHART_COLORS.length], strokeWidth: 2, stroke: 'oklch(var(--background-50))' }}
                    activeDot={{ r: 6, fill: CHART_COLORS[idx % CHART_COLORS.length], strokeWidth: 2, stroke: 'oklch(var(--background-50))' }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {tiposSeleccionados.size === 1 && chartData.length >= 2 && (() => {
            const first = chartData[0][Array.from(tiposSeleccionados)[0]] as number;
            const last = chartData[chartData.length - 1][Array.from(tiposSeleccionados)[0]] as number;
            if (first == null || last == null) return null;
            const cambio = last - first;
            const pct = first !== 0 ? ((cambio / first) * 100) : 0;
            return (
              <div className="px-5 py-3 border-t border-background-200 flex items-center gap-4 text-xs text-foreground-600">
                <span>Inicio: <strong className="text-foreground-950">{formatNumero(first)}</strong></span>
                <span>Actual: <strong className="text-foreground-950">{formatNumero(last)}</strong></span>
                <span className={cambio >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {cambio >= 0 ? '↑' : '↓'} {formatNumero(Math.abs(cambio))} ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Tabla de tasas */}
      <div className="rounded-xl bg-background-50 border border-background-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-background-200 text-left text-foreground-700">
                <th className="py-3 pr-4 pl-4 font-medium whitespace-nowrap">Tipo</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Valor</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Fecha</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Descripción</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Org.</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">País</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Cía.</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">CC</th>
                <th className="py-3 pr-4 font-medium whitespace-nowrap">Estado</th>
                {isAdmin && <th className="py-3 pr-4 font-medium whitespace-nowrap">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-background-100">
                    {Array.from({ length: isAdmin ? 10 : 9 }).map((_, j) => (
                      <td key={j} className="py-3 pr-4 pl-4"><div className="h-4 bg-background-200 rounded animate-pulse w-20"></div></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-8 text-center text-foreground-600">
                    No se encontraron tasas
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const badge = getBadgeColors(item.tipo);
                  const icon = getBadgeIcon(item.tipo);
                  return (
                    <tr key={item.id} className="border-b border-background-100 hover:bg-background-100/70">
                      <td className="py-3 pr-4 pl-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}>
                          <i className={`w-3 h-3 flex items-center justify-center ${icon}`}></i>
                          {item.tipo}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono font-medium text-foreground-950 whitespace-nowrap">
                        {paisSimboloMap.get(item.pais_id || '') || ''}{formatNumero(item.valor)}
                      </td>
                      <td className="py-3 pr-4 text-foreground-700 whitespace-nowrap">
                        {formatFecha(item.fecha)}
                      </td>
                      <td className="py-3 pr-4 text-foreground-700 min-w-[150px]">
                        {item.descripcion || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">
                        {organizacionesMap.get(item.organizacion_id || '') || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">
                        {paisesMap.get(item.pais_id || '') || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">
                        {companiasMap.get(item.compania_id || '') || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap text-xs text-foreground-700">
                        {centrosCostosMap.get(item.centro_costo_id || '') || <span className="text-foreground-400 italic">—</span>}
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleActiva(item)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                            item.activa
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-background-100 text-foreground-700 hover:bg-background-200'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${item.activa ? 'bg-emerald-500' : 'bg-foreground-400'}`}></span>
                          {item.activa ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      {isAdmin && (
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setEditing(item); setModalOpen(true); }}
                              className="rounded-md p-1.5 text-foreground-700 hover:bg-background-100 hover:text-foreground-950"
                              title="Editar"
                            >
                              <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                            </button>
                            <button
                              onClick={() => setConfirmDelete(item)}
                              className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                              title="Eliminar"
                            >
                              <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Renombrar Tipo Masivo */}
      {renameTipoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRenameTipoOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Renombrar Tipo de Tasa</h3>
              <button onClick={() => setRenameTipoOpen(false)} className="rounded-lg p-1 hover:bg-slate-100">
                <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo a renombrar</label>
                <select
                  value={renameTipoFrom}
                  onChange={(e) => setRenameTipoFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Seleccionar tipo...</option>
                  {tipos.map(([tipo, count]) => (
                    <option key={tipo} value={tipo}>{tipo} ({count} tasas)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo nombre</label>
                <input
                  type="text"
                  value={renameTipoTo}
                  onChange={(e) => setRenameTipoTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="Nuevo nombre para este tipo..."
                />
              </div>
              {renameTipoFrom && renameTipoTo && renameTipoFrom !== renameTipoTo && (
                <div className="rounded-lg bg-amber-50 p-3 border border-amber-200">
                  <p className="text-xs text-amber-700">
                    Se renombrarán <strong>{tipos.find(([t]) => t === renameTipoFrom)?.[1] || 0} tasas</strong> de
                    <strong> "{renameTipoFrom}"</strong> a <strong>"{renameTipoTo}"</strong>.
                    Se registrará en el historial de cada una.
                  </p>
                </div>
              )}
              {renameTipoFrom && renameTipoTo && tipos.some(([t]) => t === renameTipoTo) && (
                <div className="rounded-lg bg-red-50 p-3 border border-red-200 flex items-start gap-2">
                  <i className="ri-error-warning-line text-red-600 w-5 h-5 flex items-center justify-center shrink-0 mt-0.5"></i>
                  <p className="text-xs text-red-700">
                    Ya existe un tipo llamado <strong>"{renameTipoTo}"</strong>. Eliminá ese tipo primero o usá otro nombre.
                  </p>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setRenameTipoOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
              <button
                onClick={handleRenameTipo}
                disabled={!renameTipoFrom || !renameTipoTo || renameTipoFrom === renameTipoTo || tipos.some(([t]) => t === renameTipoTo)}
                className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Renombrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <FactorModal
          item={editing}
          tiposExistentes={tipos.map(([t]) => t)}
          organizaciones={organizaciones}
          paises={paises}
          companias={companias}
          centrosCostos={centrosCostos}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <i className="ri-delete-bin-line text-red-600 w-5 h-5 flex items-center justify-center"></i>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Confirmar eliminación</h3>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              ¿Eliminar la tasa <strong className="text-slate-900">{confirmDelete.tipo}</strong> con valor {paisSimboloMap.get(confirmDelete.pais_id || '') || ''}{formatNumero(confirmDelete.valor)} del {formatFecha(confirmDelete.fecha)}?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)} className="rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Previsualización de Importación */}
      <FactorsPreviewModal
        isOpen={previewOpen}
        onClose={() => { setPreviewOpen(false); setPreviewData([]); setToInsert([]); }}
        onConfirm={handleConfirmImport}
        headers={previewHeaders}
        data={previewData}
        total={previewTotal}
        tiposExistentes={tipos.map(([t]) => t)}
        loading={!!importProgress}
        importProgress={importProgress && importProgress.startsWith('Importando') ? importProgress : null}
      />
    </div>
  );
}

function FactorModal({ item, tiposExistentes, organizaciones, paises, companias, centrosCostos, onClose, onSave }: { item: Factor | null; tiposExistentes: string[]; organizaciones: Organizacion[]; paises: Pais[]; companias: Compania[]; centrosCostos: CentroCosto[]; onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({
    tipo: item?.tipo || '',
    valor: item?.valor ?? 0,
    fecha: item?.fecha || new Date().toISOString().slice(0, 10),
    descripcion: item?.descripcion || '',
    activa: item?.activa ?? true,
    organizacion_id: item?.organizacion_id || '',
    pais_id: item?.pais_id || '',
    compania_id: item?.compania_id || '',
    centro_costo_id: item?.centro_costo_id || '',
  });
  const [tipoInput, setTipoInput] = useState(item?.tipo || '');
  const [usarExistente, setUsarExistente] = useState(!!item?.tipo && tiposExistentes.includes(item.tipo));

  // Si el dropdown cambia, actualizar el tipo
  const handleTipoDropdown = (val: string) => {
    if (val === '__nuevo__') {
      setUsarExistente(false);
      setTipoInput('');
      setForm({ ...form, tipo: '' });
    } else {
      setUsarExistente(true);
      setTipoInput(val);
      setForm({ ...form, tipo: val });
    }
  };

  const handleTipoInputChange = (val: string) => {
    setTipoInput(val);
    setForm({ ...form, tipo: val });
  };

  const handleSave = () => {
    const tipoFinal = tipoInput.trim();
    if (!tipoFinal || form.valor <= 0 || !form.fecha) return;
    onSave({ ...form, tipo: tipoFinal });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{item ? 'Editar Tasa' : 'Nueva Tasa'}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100">
            <i className="ri-close-line text-xl text-slate-500 w-6 h-6 flex items-center justify-center"></i>
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Tipo de Tasa: dropdown de existentes + opción de crear nuevo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Tasa *</label>
            {tiposExistentes.length > 0 && !item ? (
              // Modo creación: mostrar dropdown con tipos existentes + opción de nuevo
              <>
                <select
                  value={usarExistente ? tipoInput : '__nuevo__'}
                  onChange={(e) => handleTipoDropdown(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="__nuevo__" className="italic">+ Crear nuevo tipo...</option>
                  {tiposExistentes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {!usarExistente && (
                  <input
                    type="text"
                    value={tipoInput}
                    onChange={(e) => handleTipoInputChange(e.target.value)}
                    className="w-full mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    placeholder="Nombre del nuevo tipo de tasa..."
                    autoFocus
                  />
                )}
              </>
            ) : (
              // Modo edición o sin tipos existentes: input libre
              <input
                type="text"
                value={tipoInput}
                onChange={(e) => handleTipoInputChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder="Ej: Tasa Acumulada, Tasa Compra, Tasa Mensual..."
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Valor *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-medium">₡</span>
              <input
                type="number"
                step="0.000001"
                value={form.valor || ''}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                placeholder="0.00"
                required
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">Valor de la tasa (ej: tipo de cambio, porcentaje, índice)</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Vigencia *</label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
            <input
              type="text"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="Opcional: motivo del cambio, referencia..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="activa-factor"
              checked={form.activa}
              onChange={(e) => setForm({ ...form, activa: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="activa-factor" className="text-sm text-slate-700">Activo</label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Organización</label>
              <select value={form.organizacion_id} onChange={(e) => setForm({ ...form, organizacion_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar organización...</option>
                {organizaciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
              <select value={form.pais_id} onChange={(e) => setForm({ ...form, pais_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar país...</option>
                {paises.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Compañía</label>
              <select value={form.compania_id} onChange={(e) => setForm({ ...form, compania_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar compañía...</option>
                {companias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Centro de Costo</label>
              <select value={form.centro_costo_id} onChange={(e) => setForm({ ...form, centro_costo_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500">
                <option value="">Seleccionar centro de costo...</option>
                {centrosCostos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          </div>
          {item && (
            <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 flex items-start gap-2">
              <i className="ri-alert-line text-amber-600 w-5 h-5 flex items-center justify-center shrink-0 mt-0.5"></i>
              <p className="text-xs text-amber-700">
                Al modificar esta tasa se guardará un registro en el historial con el valor anterior (₡{formatNumero(item.valor)}) y el nuevo valor.
              </p>
            </div>
          )}
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
          <button onClick={handleSave} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">Guardar</button>
        </div>
      </div>
    </div>
  );
}