import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { CuentaAjustada, CatalogoItem, CuentaAjustadaMontoMensual } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { evaluarFormula } from '@/lib/formulaEngine';
import type { FormulaContext } from '@/lib/formulaEngine';
import { useFactores } from '@/hooks/useFactores';
import { useUbicaciones } from '@/hooks/useUbicaciones';
import { usePermissions } from '@/hooks/usePermissions';
import CuentaAjustadaModal from './components/CuentaAjustadaModal';
import EditMontosMensualesModal from './components/EditMontosMensualesModal';
import GypProyectadaView from './components/GypProyectadaView';

const PAGE_SIZE = 50;
const ANIO_DEFAULT = 2026;
const MESES_LABELS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

function formatNumero(n: number | null) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatNumero2(n: number) {
  return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function CuentasAjustadasPage() {
  const [cuentas, setCuentas] = useState<CuentaAjustada[]>([]);
  const [montosMensuales, setMontosMensuales] = useState<CuentaAjustadaMontoMensual[]>([]);
  const [catalogoGyp, setCatalogoGyp] = useState<CatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'all' | 'active' | 'inactive'>('all');
  const [filtroValidacion, setFiltroValidacion] = useState<'all' | 'existente' | 'no_existente' | 'repetida'>('all');
  const [filtroTipoSaldo, setFiltroTipoSaldo] = useState<'all' | 'acreedor' | 'deudor'>('all');
  const [filtroVista, setFiltroVista] = useState<'all' | 'GYP' | 'GYP Gerencial' | 'GYP Proyectada'>('all');
  const [filtroOrganizacion, setFiltroOrganizacion] = useState('');
  const [filtroPais, setFiltroPais] = useState('');
  const [filtroCompania, setFiltroCompania] = useState('');
  const [filtroCentroCosto, setFiltroCentroCosto] = useState('');
  const [page, setPage] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CuentaAjustada | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CuentaAjustada | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [editMesesOpen, setEditMesesOpen] = useState(false);
  const [editingMesesItem, setEditingMesesItem] = useState<CuentaAjustada | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const { isAdmin } = useAuth();
  const { addToast } = useToast();
  const { factoresMap } = useFactores();
  const { organizaciones, paises, companias, centrosCostos, organizacionesMap, paisesMap, companiasMap, centrosCostosMap } = useUbicaciones();
  const { isSuperAdmin, userScope, canEdit, canDelete } = usePermissions();
  const canWrite = canEdit;

  const fetchData = useCallback(async () => {
    setLoading(true);
    let cuentasQuery = supabase.from('cuentas_ajustadas').select('*').order('cuenta_contable', { ascending: true });
    let montosQuery = supabase.from('cuentas_ajustadas_montos_mensuales').select('*');
    if (!isSuperAdmin && userScope.pais_id) {
      cuentasQuery = cuentasQuery.eq('pais_id', userScope.pais_id);
      montosQuery = montosQuery.eq('pais_id', userScope.pais_id);
    } else if (!isSuperAdmin && userScope.compania_id) {
      cuentasQuery = cuentasQuery.eq('compania_id', userScope.compania_id);
      montosQuery = montosQuery.eq('compania_id', userScope.compania_id);
    } else if (!isSuperAdmin && userScope.organizacion_id) {
      cuentasQuery = cuentasQuery.eq('organizacion_id', userScope.organizacion_id);
      montosQuery = montosQuery.eq('organizacion_id', userScope.organizacion_id);
    }
    const [cuentasRes, catRes, montosRes] = await Promise.all([
      cuentasQuery,
      supabase.from('catalogo_gyp').select('id, cuenta, descripcion').eq('activa', true),
      montosQuery,
    ]);
    if (cuentasRes.data) setCuentas(cuentasRes.data as CuentaAjustada[]);
    if (catRes.data) setCatalogoGyp(catRes.data as CatalogoItem[]);
    if (montosRes.data) setMontosMensuales(montosRes.data as CuentaAjustadaMontoMensual[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const catalogoMap = useMemo(() => {
    const map = new Map<string, CatalogoItem>();
    catalogoGyp.forEach((c) => map.set(c.cuenta, c));
    return map;
  }, [catalogoGyp]);

  const cuentasRepetidas = useMemo(() => {
    const count = new Map<string, number>();
    cuentas.forEach((c) => {
      // GYP Gerencial permite duplicados — no se cuentan como repetidas
      if (c.vista === 'GYP Gerencial') return;
      const key = `${c.cuenta_contable}|${c.vista || 'null'}`;
      count.set(key, (count.get(key) || 0) + 1);
    });
    return count;
  }, [cuentas]);

  const montosMap = useMemo(() => {
    const map = new Map<string, Map<number, Map<number, number>>>();
    montosMensuales.forEach((m) => {
      if (!map.has(m.cuenta_ajustada_id)) {
        map.set(m.cuenta_ajustada_id, new Map());
      }
      const yearMap = map.get(m.cuenta_ajustada_id)!;
      if (!yearMap.has(m.anio)) {
        yearMap.set(m.anio, new Map());
      }
      yearMap.get(m.anio)!.set(m.mes, m.monto);
    });
    return map;
  }, [montosMensuales]);

  const filtered = useMemo(() => {
    return cuentas.filter((c) => {
      const matchesSearch =
        !search ||
        c.cuenta_contable.toLowerCase().includes(search.toLowerCase()) ||
        c.descripcion_ajuste.toLowerCase().includes(search.toLowerCase()) ||
        (c.categoria_padre && c.categoria_padre.toLowerCase().includes(search.toLowerCase()));
      const matchesEstado =
        filtroEstado === 'all' ||
        (filtroEstado === 'active' && c.activa) ||
        (filtroEstado === 'inactive' && !c.activa);
      const matchesTipoSaldo =
        filtroTipoSaldo === 'all' ||
        c.tipo_saldo === filtroTipoSaldo;
      const matchesVista =
        filtroVista === 'all' ||
        c.vista === filtroVista;
      const matchesOrganizacion = !filtroOrganizacion || c.organizacion_id === filtroOrganizacion;
      const matchesPais = !filtroPais || c.pais_id === filtroPais;
      const matchesCompania = !filtroCompania || c.compania_id === filtroCompania;
      const matchesCentroCosto = !filtroCentroCosto || c.centro_costo_id === filtroCentroCosto;
      const gypItem = catalogoMap.get(c.cuenta_contable);
      const isExistente = !!gypItem;
      const isRepetida = c.vista !== 'GYP Gerencial' && (cuentasRepetidas.get(`${c.cuenta_contable}|${c.vista || 'null'}`) || 0) > 1;
      const matchesValidacion =
        filtroValidacion === 'all' ||
        (filtroValidacion === 'existente' && isExistente && !isRepetida) ||
        (filtroValidacion === 'no_existente' && !isExistente) ||
        (filtroValidacion === 'repetida' && isRepetida);
      return matchesSearch && matchesEstado && matchesValidacion && matchesTipoSaldo && matchesVista && matchesOrganizacion && matchesPais && matchesCompania && matchesCentroCosto;
    });
  }, [cuentas, search, filtroEstado, filtroValidacion, filtroTipoSaldo, filtroVista, filtroOrganizacion, filtroPais, filtroCompania, filtroCentroCosto, catalogoMap, cuentasRepetidas]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const stats = useMemo(() => {
    const total = cuentas.length;
    const activas = cuentas.filter((c) => c.activa).length;
    const inactivas = total - activas;
    const existentes = cuentas.filter((c) => catalogoMap.has(c.cuenta_contable)).length;
    const repetidas = Array.from(cuentasRepetidas.entries()).filter(([, count]) => count > 1).length;
    const noExistentes = total - existentes;
    const acreedor = cuentas.filter((c) => c.tipo_saldo === 'acreedor').length;
    const deudor = cuentas.filter((c) => c.tipo_saldo === 'deudor').length;
    const gypGerencial = cuentas.filter((c) => c.vista === 'GYP Gerencial').length;
    const gypProyectada = cuentas.filter((c) => c.vista === 'GYP Proyectada').length;
    return { total, activas, inactivas, existentes, noExistentes, repetidas, acreedor, deudor, gypGerencial, gypProyectada };
  }, [cuentas, catalogoMap, cuentasRepetidas]);

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
        for (const key of keys) {
          if (key in row && row[key] !== '' && row[key] !== null && row[key] !== undefined) {
            return row[key];
          }
        }
        return '';
      };

      const toInsert = json
        .map((row) => {
          const cuenta_contable = String(
            getVal(row, 'Cuenta', 'cuenta', 'CUENTA', 'CUENTA_CONTABLE', 'cuenta_contable', 'Codigo', 'codigo', 'Código', 'CODE', 'Account') || ''
          ).trim();
          const descripcion = String(
            getVal(row, 'Descripción', 'Descripcion', 'descripcion', 'DESCRIPCION', 'Desc', 'DESC', 'Nombre', 'NOMBRE') || ''
          ).trim();
          const tipoSaldo = String(
            getVal(row, 'Tipo Saldo', 'tipo_saldo', 'Tipo', 'TIPO', 'Saldo', 'SALDO', 'Nature') || ''
          ).trim().toLowerCase();
          const ajusteVal = Number(
            getVal(row, 'Ajuste', 'ajuste', 'AJUSTE', 'Saldo', 'saldo', 'SALDO', 'Monto', 'MONTO', 'Amount', 'AMOUNT') || 0
          );
          const fechaRaw = getVal(row, 'Fecha', 'fecha', 'FECHA', 'Date', 'DATE');
          const fechaVal = fechaRaw ? String(fechaRaw).trim() : null;
          const vistaVal = String(getVal(row, 'Vista', 'vista', 'VISTA', 'View', 'VIEW') || '').trim();
          const categoriaPadre = String(getVal(row, 'Categoria', 'categoria', 'CATEGORIA', 'Categoria Padre', 'categoria_padre', 'CATEGORIA_PADRE') || '').trim();
          if (!cuenta_contable || !descripcion) return null;
          return {
            cuenta_contable,
            descripcion_ajuste: descripcion,
            tipo_saldo: tipoSaldo.includes('deudor') ? 'deudor' : 'acreedor',
            ajuste: ajusteVal || 0,
            fecha: fechaVal,
            vista: ['GYP', 'GYP Gerencial'].includes(vistaVal) ? vistaVal : null,
            categoria_padre: categoriaPadre || null,
            es_cuenta_padre: false,
            activa: true,
          };
        })
        .filter(Boolean) as { cuenta_contable: string; descripcion_ajuste: string; tipo_saldo: 'acreedor' | 'deudor'; ajuste: number; fecha: string | null; vista: string | null; categoria_padre: string | null; es_cuenta_padre: boolean; activa: boolean }[];

      if (toInsert.length === 0) {
        addToast('warning', 'No se encontraron registros válidos. Verificá las columnas.');
        return;
      }

      const BATCH_SIZE = 500;
      let imported = 0;
      let failed = 0;
      let duplicados = 0;

      // GYP Gerencial ya no tiene restricción única — se insertan siempre
      const gypRows = toInsert.filter((r) => r.vista !== 'GYP Gerencial');
      const gerencialRows = toInsert.filter((r) => r.vista === 'GYP Gerencial');

      for (let i = 0; i < gypRows.length; i += BATCH_SIZE) {
        const batch = gypRows.slice(i, i + BATCH_SIZE);
        setImportProgress(`Importando ${Math.min(i + batch.length, gypRows.length)} de ${gypRows.length} registros...`);
        const { error } = await supabase.from('cuentas_ajustadas').upsert(batch, { onConflict: 'cuenta_contable,vista' });
        if (error) {
          if (error.message.includes('duplicate') || error.code === '23505') {
            duplicados += batch.length;
          } else {
            failed += batch.length;
          }
          console.error('Error en batch:', error);
        } else {
          imported += batch.length;
        }
      }

      for (let i = 0; i < gerencialRows.length; i += BATCH_SIZE) {
        const batch = gerencialRows.slice(i, i + BATCH_SIZE);
        setImportProgress(`Importando GYP Gerencial ${Math.min(i + batch.length, gerencialRows.length)} de ${gerencialRows.length} registros...`);
        const { error } = await supabase.from('cuentas_ajustadas').insert(batch);
        if (error) {
          failed += batch.length;
          console.error('Error en batch GYP Gerencial:', error);
        } else {
          imported += batch.length;
        }
      }

      const msgs: string[] = [];
      if (imported > 0) msgs.push(`${imported} importadas`);
      if (duplicados > 0) msgs.push(`${duplicados} duplicadas`);
      if (failed > 0) msgs.push(`${failed} fallaron`);
      addToast('success', msgs.join(', ') || 'Importación completada');
      fetchData();
    } catch (err) {
      addToast('error', 'Error al importar: ' + (err as Error).message);
    } finally {
      setImportProgress(null);
      e.target.value = '';
    }
  };

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      if (editing) {
        // Build change summary for history
        const cambiosArr: string[] = [];
        const fields: (keyof CuentaAjustada)[] = ['cuenta_contable', 'descripcion_ajuste', 'tipo_saldo', 'ajuste', 'fecha', 'vista', 'categoria_padre', 'es_cuenta_padre', 'activa', 'pais_id', 'centro_costo_id'];
        for (const f of fields) {
          const oldVal = editing[f];
          const newVal = formData[f];
          if (String(oldVal ?? '') !== String(newVal ?? '')) {
            cambiosArr.push(`${f}: "${oldVal ?? ''}" → "${newVal ?? ''}"`);
          }
        }

        const { error } = await supabase.from('cuentas_ajustadas').update(formData).eq('id', editing.id);
        if (error) throw error;

        // Log to history
        if (cambiosArr.length > 0) {
          await supabase.from('cuentas_ajustadas_historico').insert({
            cuenta_ajustada_id: editing.id,
            cuenta_contable: editing.cuenta_contable,
            descripcion_ajuste: editing.descripcion_ajuste,
            accion: 'actualizacion',
            cambios: cambiosArr.join('; '),
            resumen: `Editados ${cambiosArr.length} campo(s)`,
          });
        }
        addToast('success', 'Cuenta ajustada actualizada');
      } else {
        const { data, error } = await supabase.from('cuentas_ajustadas').insert(formData).select('id').single();
        if (error) throw error;

        // Log creation to history
        if (data) {
          await supabase.from('cuentas_ajustadas_historico').insert({
            cuenta_ajustada_id: data.id,
            cuenta_contable: formData.cuenta_contable as string,
            descripcion_ajuste: formData.descripcion_ajuste as string,
            accion: 'creacion',
            resumen: 'Cuenta creada',
          });
        }
        addToast('success', 'Cuenta ajustada creada');
      }
      setModalOpen(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleSaveMontos = async (cuentaId: string, montos: { anio: number; mes: number; monto: number; formula: string | null }[]) => {
    try {
      const cuenta = cuentas.find((c) => c.id === cuentaId);
      const locationFields = {
        pais_id: cuenta?.pais_id || null,
        centro_costo_id: cuenta?.centro_costo_id || null,
        organizacion_id: cuenta?.organizacion_id || null,
        compania_id: cuenta?.compania_id || null,
      };
      const rows = montos.map((m) => ({
        cuenta_ajustada_id: cuentaId,
        anio: m.anio,
        mes: m.mes,
        monto: m.monto,
        formula: m.formula,
        ...locationFields,
      }));
      const { error } = await supabase.from('cuentas_ajustadas_montos_mensuales').upsert(rows, {
        onConflict: 'cuenta_ajustada_id,anio,mes',
      });
      if (error) throw error;

      // Guardar el total sumado del año actual en la columna ajuste de cuentas_ajustadas
      const sumaTotal = montos
        .filter((m) => m.anio === ANIO_DEFAULT)
        .reduce((acc, m) => acc + m.monto, 0);
      const { error: updateError } = await supabase
        .from('cuentas_ajustadas')
        .update({ ajuste: sumaTotal })
        .eq('id', cuentaId);
      if (updateError) throw updateError;

      addToast('success', 'Montos mensuales actualizados');
      setEditMesesOpen(false);
      setEditingMesesItem(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const handleRecalcularFormulas = async () => {
    setRecalculando(true);
    try {
      // 1. Obtener todos los montos con fórmula
      const { data: montosConFormula, error: fetchErr } = await supabase
        .from('cuentas_ajustadas_montos_mensuales')
        .select('*')
        .not('formula', 'is', null)
        .neq('formula', '');
      if (fetchErr) throw fetchErr;
      if (!montosConFormula || montosConFormula.length === 0) {
        addToast('info', 'No hay fórmulas para recalcular');
        return;
      }

      // 2. Build lookups
      const cuentaIdToCodigo = new Map<string, string>();
      cuentas.forEach((c) => cuentaIdToCodigo.set(c.id, c.cuenta_contable));

      // cuenta_contable -> categoria_padre (only for non-padre GYP Gerencial)
      const cuentaToCategoria = new Map<string, string>();
      cuentas.forEach((c) => {
        if (c.vista === 'GYP Gerencial' && !c.es_cuenta_padre && c.categoria_padre) {
          cuentaToCategoria.set(c.cuenta_contable, c.categoria_padre);
        }
      });

      // All montos lookup: (anio, mes, cuenta_contable) -> monto
      const montosLookup = new Map<string, number>();
      montosMensuales.forEach((m) => {
        const codigo = cuentaIdToCodigo.get(m.cuenta_ajustada_id);
        if (codigo) {
          montosLookup.set(`${m.anio}|${m.mes}|${codigo}`, m.monto);
        }
      });

      // Helper: build categoriaTotales for a given (anio, mes)
      const buildCategoriaTotales = (anio: number, mes: number): Map<string, number> => {
        const cats = new Map<string, number>();
        montosLookup.forEach((monto, key) => {
          const [a, m, cuenta] = key.split('|');
          if (Number(a) === anio && Number(m) === mes) {
            const cat = cuentaToCategoria.get(cuenta);
            if (cat) cats.set(cat, (cats.get(cat) || 0) + monto);
          }
        });
        return cats;
      };

      // 3. Recalculate iteratively (up to 10 passes for formula chains)
      const MAX_PASSES = 10;
      let changes = montosConFormula.length;
      let pass = 0;
      const updates = new Map<string, { monto: number; formula: string }>(); // key: `${id}`

      while (changes > 0 && pass < MAX_PASSES) {
        changes = 0;
        pass++;
        for (const m of montosConFormula) {
          const codigo = cuentaIdToCodigo.get(m.cuenta_ajustada_id);
          if (!codigo || !m.formula) continue;

          const saldos = new Map<string, number>();
          montosLookup.forEach((monto, key) => {
            const [a, mes, cuenta] = key.split('|');
            if (Number(a) === m.anio && Number(mes) === m.mes && cuenta !== codigo) {
              saldos.set(cuenta, monto);
            }
          });

          const categoriaTotales = buildCategoriaTotales(m.anio, m.mes);
          const ctx: FormulaContext = { anio: m.anio, mes: m.mes, saldos, categoriaTotales };
          const nuevoMonto = evaluarFormula(m.formula, ctx);

          if (nuevoMonto !== null && Math.abs(nuevoMonto - m.monto) > 0.001) {
            updates.set(m.id, { monto: nuevoMonto, formula: m.formula });
            // Update the lookup so subsequent formulas in this pass can use the new value
            montosLookup.set(`${m.anio}|${m.mes}|${codigo}`, nuevoMonto);
            changes++;
          }
        }
      }

      if (updates.size === 0) {
        addToast('info', 'Todas las fórmulas ya están actualizadas');
        return;
      }

      // 4. Upsert recalculated montos in batches
      const rows = Array.from(updates.entries()).map(([id, val]) => ({
        id,
        monto: val.monto,
        formula: val.formula,
      }));

      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase
          .from('cuentas_ajustadas_montos_mensuales')
          .upsert(batch, { onConflict: 'id' });
        if (error) throw error;
      }

      // 5. Update ajuste field for ANIO_DEFAULT accounts whose total changed
      const cuentasAfectadas = new Set<string>();
      montosConFormula.forEach((m) => {
        if (m.anio === ANIO_DEFAULT) cuentasAfectadas.add(m.cuenta_ajustada_id);
      });

      const cuentasUpdates: { id: string; ajuste: number }[] = [];
      for (const cuentaId of cuentasAfectadas) {
        let total = 0;
        montosMensuales.forEach((m) => {
          if (m.cuenta_ajustada_id === cuentaId && m.anio === ANIO_DEFAULT) {
            const upd = updates.get(m.id);
            total += upd ? upd.monto : m.monto;
          }
        });
        cuentasUpdates.push({ id: cuentaId, ajuste: total });
      }

      for (let i = 0; i < cuentasUpdates.length; i += BATCH) {
        const batch = cuentasUpdates.slice(i, i + BATCH);
        for (const upd of batch) {
          const { error } = await supabase
            .from('cuentas_ajustadas')
            .update({ ajuste: upd.ajuste })
            .eq('id', upd.id);
          if (error) throw error;
        }
      }

      addToast('success', `${updates.size} celdas recalculadas en ${pass} ${pass === 1 ? 'pasada' : 'pasadas'}`);
      fetchData();
    } catch (err) {
      addToast('error', 'Error al recalcular: ' + (err as Error).message);
    } finally {
      setRecalculando(false);
    }
  };

  const handleDelete = async (item: CuentaAjustada) => {
    try {
      const { error } = await supabase.from('cuentas_ajustadas').delete().eq('id', item.id);
      if (error) throw error;
      addToast('success', 'Cuenta ajustada eliminada');
      setConfirmDelete(null);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const toggleActiva = async (item: CuentaAjustada) => {
    try {
      const nuevoEstado = !item.activa;
      const { error } = await supabase.from('cuentas_ajustadas').update({ activa: nuevoEstado }).eq('id', item.id);
      if (error) throw error;
      addToast('success', `Cuenta ${nuevoEstado ? 'activada' : 'desactivada'}`);
      fetchData();
    } catch (err) {
      addToast('error', 'Error: ' + (err as Error).message);
    }
  };

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return <span className="text-foreground-400 italic">—</span>;
    const d = new Date(fecha + 'T00:00:00');
    return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const isGypGerencial = filtroVista === 'GYP Gerencial';
  const isGypProyectada = filtroVista === 'GYP Proyectada';

  // GYP Gerencial table helpers
  const gerencialCuentas = useMemo(() => {
    if (!isGypGerencial) return [];
    return filtered;
  }, [filtered, isGypGerencial]);

  const gerencialCategorias = useMemo(() => {
    const cats = new Set<string>();
    gerencialCuentas.forEach((c) => {
      if (c.categoria_padre) cats.add(c.categoria_padre);
    });
    return Array.from(cats).sort();
  }, [gerencialCuentas]);

  const getMontoMes = (cuentaId: string, mes: number, anio: number = ANIO_DEFAULT) => {
    const cuentaMap = montosMap.get(cuentaId);
    if (!cuentaMap) return 0;
    const yearMap = cuentaMap.get(anio);
    if (!yearMap) return 0;
    return yearMap.get(mes) || 0;
  };

  const getTotalCuenta = (cuentaId: string, anio: number = ANIO_DEFAULT) => {
    const cuentaMap = montosMap.get(cuentaId);
    if (!cuentaMap) return 0;
    const yearMap = cuentaMap.get(anio);
    if (!yearMap) return 0;
    let total = 0;
    for (let mes = 1; mes <= 12; mes++) {
      total += yearMap.get(mes) || 0;
    }
    return total;
  };

  const getTotalCategoria = (categoria: string) => {
    let total = 0;
    gerencialCuentas
      .filter((c) => c.categoria_padre === categoria && !c.es_cuenta_padre)
      .forEach((c) => {
        total += getTotalCuenta(c.id);
      });
    return total;
  };

  const getTotalCategoriaMes = (categoria: string, mes: number) => {
    let total = 0;
    gerencialCuentas
      .filter((c) => c.categoria_padre === categoria && !c.es_cuenta_padre)
      .forEach((c) => {
        total += getMontoMes(c.id, mes);
      });
    return total;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground-950">Asientos Extracontables</h1>
          <p className="text-sm text-foreground-700">Gestión de asientos con ajustes y validación contra catálogo GYP</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-10 gap-3">
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Total Cuentas</p>
          <p className="text-xl font-bold text-foreground-950">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Activas</p>
          <p className="text-xl font-bold text-primary-500">{stats.activas}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Inactivas</p>
          <p className="text-xl font-bold text-foreground-700">{stats.inactivas}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">En Catálogo GYP</p>
          <p className="text-xl font-bold text-emerald-600">{stats.existentes}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">No en GYP</p>
          <p className="text-xl font-bold text-amber-600">{stats.noExistentes}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Repetidas</p>
          <p className="text-xl font-bold text-rose-600">{stats.repetidas}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Acreedor</p>
          <p className="text-xl font-bold text-sky-600">{stats.acreedor}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">Deudor</p>
          <p className="text-xl font-bold text-orange-600">{stats.deudor}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">GYP Gerencial</p>
          <p className="text-xl font-bold text-accent-600">{stats.gypGerencial}</p>
        </div>
        <div className="rounded-xl bg-background-50 p-4 border border-background-200">
          <p className="text-xs text-foreground-700">GYP Proyectada</p>
          <p className="text-xl font-bold text-amber-600">{stats.gypProyectada}</p>
        </div>
      </div>

      {/* Actions + Filters */}
      <div className="rounded-xl bg-background-50 p-4 border border-background-200 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-foreground-700 w-5 h-5 flex items-center justify-center"></i>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar por cuenta contable o descripción..."
              className="w-full rounded-lg border border-background-200 bg-background-100 py-2 pl-10 pr-4 text-sm text-foreground-950 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <select
            value={filtroEstado}
            onChange={(e) => { setFiltroEstado(e.target.value as typeof filtroEstado); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[140px]"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
          <select
            value={filtroValidacion}
            onChange={(e) => { setFiltroValidacion(e.target.value as typeof filtroValidacion); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[160px]"
          >
            <option value="all">Todas las validaciones</option>
            <option value="existente">Existente en GYP</option>
            <option value="no_existente">No existe en GYP</option>
            <option value="repetida">Repetida</option>
          </select>
          <select
            value={filtroTipoSaldo}
            onChange={(e) => { setFiltroTipoSaldo(e.target.value as typeof filtroTipoSaldo); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[140px]"
          >
            <option value="all">Todos los saldos</option>
            <option value="acreedor">Acreedor</option>
            <option value="deudor">Deudor</option>
          </select>
          <select
            value={filtroVista}
            onChange={(e) => { setFiltroVista(e.target.value as typeof filtroVista); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[160px]"
          >
            <option value="all">Todas las vistas</option>
            <option value="GYP">GYP</option>
            <option value="GYP Gerencial">GYP Gerencial</option>
            <option value="GYP Proyectada">GYP Proyectada</option>
          </select>
          <select
            value={filtroOrganizacion}
            onChange={(e) => { setFiltroOrganizacion(e.target.value); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[140px]"
          >
            <option value="">Todas las organizaciones</option>
            {organizaciones.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
          <select
            value={filtroPais}
            onChange={(e) => { setFiltroPais(e.target.value); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[150px]"
          >
            <option value="">Todos los países</option>
            {paises.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
            ))}
          </select>
          <select
            value={filtroCompania}
            onChange={(e) => { setFiltroCompania(e.target.value); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[140px]"
          >
            <option value="">Todas las compañías</option>
            {companias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <select
            value={filtroCentroCosto}
            onChange={(e) => { setFiltroCentroCosto(e.target.value); setPage(0); }}
            className="rounded-lg border border-background-200 bg-background-100 px-3 py-2 text-sm text-foreground-950 outline-none focus:border-primary-500 min-w-[170px]"
          >
            <option value="">Todos los centros de costo</option>
            {centrosCostos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <div className="flex gap-2 ml-auto">
            {canWrite && (
              <>
                <label className="inline-flex items-center gap-2 rounded-lg bg-foreground-950 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-foreground-900 cursor-pointer transition-colors whitespace-nowrap">
                  <i className="ri-file-upload-line w-5 h-5 flex items-center justify-center"></i>
                  {importProgress || 'Importar Excel'}
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={!!importProgress} />
                </label>
                <button
                  onClick={() => { setEditing(null); setModalOpen(true); }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
                >
                  <i className="ri-add-line w-5 h-5 flex items-center justify-center"></i>
                  Nuevo Ajuste
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabla GYP Gerencial */}
        {isGypProyectada ? (
          <GypProyectadaView
            organizaciones={organizaciones}
            paises={paises}
            companias={companias}
            centrosCostos={centrosCostos}
            organizacionesMap={organizacionesMap}
            paisesMap={paisesMap}
            companiasMap={companiasMap}
            centrosCostosMap={centrosCostosMap}
          />
        ) : isGypGerencial ? (
          <>
            {/* Info panel - Qué es cuenta padre */}
            <div className="rounded-lg bg-accent-50 border border-accent-200 p-4 mb-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center shrink-0 mt-0.5">
                  <i className="ri-information-line text-accent-600 w-5 h-5 flex items-center justify-center"></i>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-accent-800">¿Qué es una Cuenta Padre?</p>
                  <p className="text-xs text-accent-700 leading-relaxed">
                    Una <strong>cuenta padre</strong> es una fila de total que agrupa varias sub-cuentas dentro de una misma categoría. Por ejemplo, la cuenta padre <strong>"Personal"</strong> agrupa sub-cuentas como Nómina, Vacaciones, Aguinaldos, Aporte Patronal y Seguro Social. La cuenta padre aparece resaltada en <span className="italic">itálica</span> debajo de sus sub-cuentas y te permite ver o ingresar el total consolidado por mes. Las sub-cuentas normales se muestran primero y la cuenta padre al final de cada categoría, justo arriba de la fila de totales automáticos.
                  </p>
                </div>
              </div>
            </div>

            {/* Toolbar GYP Gerencial */}
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <span className="text-xs text-foreground-600">
                {(() => {
                  const totalFormulas = montosMensuales.filter(
                    (m) => m.formula && m.formula.trim()
                  ).length;
                  return totalFormulas > 0
                    ? `${totalFormulas} celda${totalFormulas !== 1 ? 's' : ''} con fórmula`
                    : 'Sin fórmulas definidas';
                })()}
              </span>
              <button
                onClick={handleRecalcularFormulas}
                disabled={recalculando}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <i className={`w-5 h-5 flex items-center justify-center ${recalculando ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`}></i>
                {recalculando ? 'Recalculando...' : 'Recalcular todas las fórmulas'}
              </button>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-background-200 text-left text-foreground-700">
                  <th className="py-3 pr-4 font-medium whitespace-nowrap sticky left-0 bg-background-50 z-10">Cuenta</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap sticky left-0 bg-background-50 z-10">Descripción</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap">Categoría</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap text-xs">País</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap text-xs">Centro de Costo</th>
                  {MESES_LABELS.map((mes) => (
                    <th key={mes} className="py-3 pr-3 font-medium whitespace-nowrap text-right">{mes}-{String(ANIO_DEFAULT).slice(-2)}</th>
                  ))}
                  <th className="py-3 pr-3 font-medium whitespace-nowrap text-right">Total</th>
                  <th className="py-3 pr-4 font-medium whitespace-nowrap text-center">Montos</th>
                  {isAdmin && <th className="py-3 pr-4 font-medium whitespace-nowrap">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={19} className="py-8 text-center text-foreground-600">
                      <div className="flex items-center justify-center gap-2">
                        <i className="ri-loader-4-line animate-spin w-5 h-5 flex items-center justify-center"></i>
                        Cargando...
                      </div>
                    </td>
                  </tr>
                ) : gerencialCategorias.length === 0 && gerencialCuentas.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="py-8 text-center text-foreground-600">
                      No se encontraron cuentas GYP Gerencial
                    </td>
                  </tr>
                ) : (
                  gerencialCategorias.map((categoria) => {
                    const cuentasCategoria = gerencialCuentas.filter(
                      (c) => c.categoria_padre === categoria && !c.es_cuenta_padre
                    );
                    const cuentaPadre = gerencialCuentas.find(
                      (c) => c.categoria_padre === categoria && c.es_cuenta_padre
                    );
                    return (
                      <>
                        {/* Cuentas de la categoría */}
                        {cuentasCategoria.map((item) => (
                          <tr key={item.id} className="border-b border-background-100 hover:bg-background-100/70">
                            <td className="py-2 pr-4 font-medium text-foreground-950 whitespace-nowrap font-mono text-xs pl-6">{item.cuenta_contable}</td>
                            <td className="py-2 pr-4 text-foreground-900 min-w-[200px]">{item.descripcion_ajuste}</td>
                            <td className="py-2 pr-4 text-foreground-700 text-xs">{item.categoria_padre}</td>
                            <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700">
                              {organizacionesMap.get(item.organizacion_id || '') || <span className="text-foreground-400 italic">—</span>}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700">
                              {paisesMap.get(item.pais_id || '') || <span className="text-foreground-400 italic">—</span>}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700">
                              {companiasMap.get(item.compania_id || '') || <span className="text-foreground-400 italic">—</span>}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700">
                              {centrosCostosMap.get(item.centro_costo_id || '') || <span className="text-foreground-400 italic">—</span>}
                            </td>
                            {MESES_LABELS.map((_, idx) => {
                              const mes = idx + 1;
                              const monto = getMontoMes(item.id, mes);
                              return (
                                <td key={mes} className={`py-2 pr-3 whitespace-nowrap text-right ${monto === 0 ? 'text-foreground-400' : 'text-foreground-950 font-medium'}`}>
                                  {monto === 0 ? '—' : formatNumero(monto)}
                                </td>
                              );
                            })}
                            <td className="py-2 pr-3 whitespace-nowrap text-right font-bold text-foreground-950">
                              {formatNumero(getTotalCuenta(item.id))}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-center">
                              <button
                                onClick={() => { setEditingMesesItem(item); setEditMesesOpen(true); }}
                                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
                                title="Editar montos mensuales"
                              >
                                <i className="ri-calendar-line w-3.5 h-3.5 flex items-center justify-center"></i>
                                Editar montos
                              </button>
                            </td>
                            {canWrite && (
                              <td className="py-2 pr-4 whitespace-nowrap">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => { setEditing(item); setModalOpen(true); }}
                                    className="rounded-md p-1.5 text-foreground-700 hover:bg-background-100 hover:text-foreground-950"
                                    title="Editar cuenta"
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
                        ))}
                        {/* Cuenta padre / Total categoría */}
                        {cuentaPadre ? (
                          <tr key={`padre-${cuentaPadre.id}`} className="border-b border-background-200 bg-accent-100/40 hover:bg-accent-100/60">
                            <td className="py-2 pr-4 font-bold text-foreground-950 whitespace-nowrap font-mono text-xs">{cuentaPadre.cuenta_contable}</td>
                            <td className="py-2 pr-4 font-bold text-foreground-950 min-w-[200px] italic">{cuentaPadre.descripcion_ajuste}</td>
                            <td className="py-2 pr-4 text-foreground-700 text-xs font-bold">{cuentaPadre.categoria_padre}</td>
                            <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700 font-bold">
                              {organizacionesMap.get(cuentaPadre.organizacion_id || '') || <span className="text-foreground-400 italic">—</span>}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700 font-bold">
                              {paisesMap.get(cuentaPadre.pais_id || '') || <span className="text-foreground-400 italic">—</span>}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700 font-bold">
                              {companiasMap.get(cuentaPadre.compania_id || '') || <span className="text-foreground-400 italic">—</span>}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700 font-bold">
                              {centrosCostosMap.get(cuentaPadre.centro_costo_id || '') || <span className="text-foreground-400 italic">—</span>}
                            </td>
                            {MESES_LABELS.map((_, idx) => {
                              const mes = idx + 1;
                              const monto = getMontoMes(cuentaPadre.id, mes);
                              return (
                                <td key={mes} className="py-2 pr-3 whitespace-nowrap text-right font-bold text-foreground-950">
                                  {monto === 0 ? '—' : formatNumero(monto)}
                                </td>
                              );
                            })}
                            <td className="py-2 pr-3 whitespace-nowrap text-right font-bold text-foreground-950">
                              {formatNumero(getTotalCuenta(cuentaPadre.id))}
                            </td>
                            <td className="py-2 pr-4 whitespace-nowrap text-center">
                              <button
                                onClick={() => { setEditingMesesItem(cuentaPadre); setEditMesesOpen(true); }}
                                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
                                title="Editar montos mensuales"
                              >
                                <i className="ri-calendar-line w-3.5 h-3.5 flex items-center justify-center"></i>
                                Editar montos
                              </button>
                            </td>
                            {canWrite && (
                              <td className="py-2 pr-4 whitespace-nowrap">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => { setEditing(cuentaPadre); setModalOpen(true); }}
                                    className="rounded-md p-1.5 text-foreground-700 hover:bg-background-100 hover:text-foreground-950"
                                    title="Editar cuenta"
                                  >
                                    <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(cuentaPadre)}
                                    className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                                    title="Eliminar"
                                  >
                                    <i className="ri-delete-bin-line w-4 h-4 flex items-center justify-center"></i>
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ) : (
                          <tr className="border-b border-background-200 bg-background-100/50">
                            <td className="py-2 pr-4 font-bold text-foreground-700 whitespace-nowrap text-xs pl-6">Total {categoria}</td>
                            <td className="py-2 pr-4"></td>
                            <td className="py-2 pr-4"></td>
                            <td className="py-2 pr-4"></td>
                            <td className="py-2 pr-4"></td>
                            <td className="py-2 pr-4"></td>
                            <td className="py-2 pr-4"></td>
                            {MESES_LABELS.map((_, idx) => {
                              const mes = idx + 1;
                              const total = getTotalCategoriaMes(categoria, mes);
                              return (
                                <td key={mes} className="py-2 pr-3 whitespace-nowrap text-right font-bold text-foreground-700">
                                  {total === 0 ? '—' : formatNumero(total)}
                                </td>
                              );
                            })}
                            <td className="py-2 pr-3 whitespace-nowrap text-right font-bold text-foreground-950">
                              {formatNumero(getTotalCategoria(categoria))}
                            </td>
                            <td className="py-2 pr-4"></td>
                            {canWrite && <td className="py-2 pr-4"></td>}
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
                {/* Cuentas sin categoría */}
                {gerencialCuentas.filter((c) => !c.categoria_padre).map((item) => (
                  <tr key={item.id} className="border-b border-background-100 hover:bg-background-100/70">
                    <td className="py-2 pr-4 font-medium text-foreground-950 whitespace-nowrap font-mono text-xs">{item.cuenta_contable}</td>
                    <td className="py-2 pr-4 text-foreground-900 min-w-[200px]">{item.descripcion_ajuste}</td>
                    <td className="py-2 pr-4 text-foreground-400 text-xs italic">Sin categoría</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700">
                      {organizacionesMap.get(item.organizacion_id || '') || <span className="text-foreground-400 italic">—</span>}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700">
                      {paisesMap.get(item.pais_id || '') || <span className="text-foreground-400 italic">—</span>}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700">
                      {companiasMap.get(item.compania_id || '') || <span className="text-foreground-400 italic">—</span>}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-[11px] text-foreground-700">
                      {centrosCostosMap.get(item.centro_costo_id || '') || <span className="text-foreground-400 italic">—</span>}
                    </td>
                    {MESES_LABELS.map((_, idx) => {
                      const mes = idx + 1;
                      const monto = getMontoMes(item.id, mes);
                      return (
                        <td key={mes} className={`py-2 pr-3 whitespace-nowrap text-right ${monto === 0 ? 'text-foreground-400' : 'text-foreground-950 font-medium'}`}>
                          {monto === 0 ? '—' : formatNumero(monto)}
                        </td>
                      );
                    })}
                    <td className="py-2 pr-3 whitespace-nowrap text-right font-bold text-foreground-950">
                      {formatNumero(getTotalCuenta(item.id))}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => { setEditingMesesItem(item); setEditMesesOpen(true); }}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
                        title="Editar montos mensuales"
                      >
                        <i className="ri-calendar-line w-3.5 h-3.5 flex items-center justify-center"></i>
                        Editar montos
                      </button>
                    </td>
                    {canWrite && (
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditing(item); setModalOpen(true); }}
                            className="rounded-md p-1.5 text-foreground-700 hover:bg-background-100 hover:text-foreground-950"
                            title="Editar cuenta"
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
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <>
            {/* Tabla Normal */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-background-200 text-left text-foreground-700">
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Asiento</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Cuenta Contable</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Descripción Ajuste</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Descripción GYP</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">En GYP</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Repetida</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Tipo Saldo</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Ajuste</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Fecha</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Vista</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Org.</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">País</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Cía.</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">CC</th>
                    <th className="py-3 pr-4 font-medium whitespace-nowrap">Estado</th>
                    {canWrite && <th className="py-3 pr-4 font-medium whitespace-nowrap">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-background-100">
                        {Array.from({ length: canWrite ? 14 : 13 }).map((_, j) => (
                          <td key={j} className="py-3 pr-4"><div className="h-4 bg-background-200 rounded animate-pulse w-24"></div></td>
                        ))}
                      </tr>
                    ))
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite ? 16 : 15} className="py-8 text-center text-foreground-600">
                        No se encontraron cuentas ajustadas
                      </td>
                    </tr>
                  ) : (
                    paginated.map((item) => {
                      const gypItem = catalogoMap.get(item.cuenta_contable);
                      const isRepetida = (cuentasRepetidas.get(`${item.cuenta_contable}|${item.vista || 'null'}`) || 0) > 1;
                      return (
                        <tr key={item.id} className="border-b border-background-100 hover:bg-background-100/70">
                          <td className="py-3 pr-4 font-mono text-xs text-foreground-950 whitespace-nowrap font-bold">{item.asiento_id || '—'}</td>
                          <td className="py-3 pr-4 font-medium text-foreground-950 whitespace-nowrap font-mono text-xs">{item.cuenta_contable}</td>
                          <td className="py-3 pr-4 text-foreground-900 min-w-[200px]">{item.descripcion_ajuste}</td>
                          <td className="py-3 pr-4 text-foreground-700 min-w-[200px]">
                            {gypItem ? (
                              <span className="text-foreground-700">{gypItem.descripcion}</span>
                            ) : (
                              <span className="text-foreground-400 italic">No existe en GYP</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap">
                            {gypItem ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
                                <i className="ri-check-line"></i> Sí
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
                                <i className="ri-close-line"></i> No
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap">
                            {isRepetida ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700">
                                <i className="ri-error-warning-line"></i> Repetida ({cuentasRepetidas.get(`${item.cuenta_contable}|${item.vista || 'null'}`)})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-background-100 text-foreground-700">
                                <i className="ri-check-line"></i> Única
                              </span>
                            )}
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              item.tipo_saldo === 'acreedor'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              <i className={item.tipo_saldo === 'acreedor' ? 'ri-arrow-up-line' : 'ri-arrow-down-line'}></i>
                              {item.tipo_saldo === 'acreedor' ? 'Acreedor' : 'Deudor'}
                            </span>
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap font-medium text-foreground-950">
                            {item.vista === 'GYP Gerencial'
                              ? formatNumero2(getTotalCuenta(item.id))
                              : formatNumero2(item.ajuste)}
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap text-foreground-700">
                            {formatFecha(item.fecha)}
                          </td>
                          <td className="py-3 pr-4 whitespace-nowrap">
                            {item.vista ? (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                item.vista === 'GYP'
                                  ? 'bg-primary-100 text-primary-700'
                                  : 'bg-accent-100 text-accent-700'
                              }`}>
                                {item.vista}
                              </span>
                            ) : (
                              <span className="text-foreground-400 italic">—</span>
                            )}
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
                              title={item.activa ? 'Haz clic para desactivar' : 'Haz clic para activar'}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${item.activa ? 'bg-emerald-500' : 'bg-foreground-400'}`}></span>
                              {item.activa ? 'Activa' : 'Inactiva'}
                            </button>
                          </td>
                          {canWrite && (
                            <td className="py-3 pr-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {item.vista === 'GYP Gerencial' && (
                                  <button
                                    onClick={() => { setEditingMesesItem(item); setEditMesesOpen(true); }}
                                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary-500 text-background-50 hover:bg-primary-600 transition-colors whitespace-nowrap"
                                    title="Editar montos mensuales"
                                  >
                                    <i className="ri-calendar-line w-3.5 h-3.5 flex items-center justify-center"></i>
                                    Editar montos
                                  </button>
                                )}
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

            {totalPages > 1 && (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-foreground-700">
                  Mostrando {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-lg border border-background-200 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100 disabled:opacity-50">Anterior</button>
                  <span className="flex items-center px-2 text-sm text-foreground-700">Página {page + 1} de {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="rounded-lg border border-background-200 px-3 py-1.5 text-sm text-foreground-700 hover:bg-background-100 disabled:opacity-50">Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Cuenta */}
      {modalOpen && (
        <CuentaAjustadaModal
          item={editing}
          todasLasCuentas={cuentas}
          todosLosMontos={montosMensuales}
          factoresMap={factoresMap}
          organizaciones={organizaciones}
          paises={paises}
          companias={companias}
          centrosCostos={centrosCostos}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {/* Modal Montos Mensuales */}
      {editMesesOpen && editingMesesItem && (
        <EditMontosMensualesModal
          item={editingMesesItem}
          itemMontos={montosMap.get(editingMesesItem.id) || new Map()}
          todasLasCuentas={cuentas}
          todosLosMontos={montosMensuales}
          factoresMap={factoresMap}
          onClose={() => { setEditMesesOpen(false); setEditingMesesItem(null); }}
          onSave={handleSaveMontos}
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
              ¿Eliminar la cuenta <strong className="text-slate-900">{confirmDelete.cuenta_contable}</strong> — {confirmDelete.descripcion_ajuste}?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete)} className="rounded-lg px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}