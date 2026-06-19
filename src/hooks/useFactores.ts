import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Factor } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';

export function useFactores() {
  const [factores, setFactores] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const { isSuperAdmin, userScope } = usePermissions();

  const fetchFactores = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('factores')
      .select('*')
      .eq('activa', true);
    if (!isSuperAdmin && userScope.pais_id) {
      query = query.eq('pais_id', userScope.pais_id);
    } else if (!isSuperAdmin && userScope.compania_id) {
      query = query.eq('compania_id', userScope.compania_id);
    } else if (!isSuperAdmin && userScope.organizacion_id) {
      query = query.eq('organizacion_id', userScope.organizacion_id);
    }
    query = query.order('fecha', { ascending: false });
    const { data } = await query;
    if (data) setFactores(data as Factor[]);
    setLoading(false);
  }, [isSuperAdmin, userScope]);

  useEffect(() => { fetchFactores(); }, [fetchFactores]);

  // Último valor por tipo
  const ultimoPorTipo = useMemo(() => {
    const map = new Map<string, Factor>();
    factores.forEach((f) => {
      if (!map.has(f.tipo)) {
        map.set(f.tipo, f);
      }
    });
    return map;
  }, [factores]);

  // Lista de todos los tipos únicos existentes
  const tipos = useMemo(() => {
    const set = new Set<string>();
    factores.forEach((f) => set.add(f.tipo));
    return Array.from(set).sort();
  }, [factores]);

  // Mapa para usar en fórmulas: nombre_factor -> valor
  const factoresMap = useMemo(() => {
    const map = new Map<string, number>();
    ultimoPorTipo.forEach((f, tipo) => {
      map.set(tipo, f.valor);
    });
    return map;
  }, [ultimoPorTipo]);

  /** Convierte colones a dólares usando la tasa especificada */
  const convertirADolares = useCallback(
    (montoColones: number, tipoTasa: string = 'Tasa Acumulada'): number | null => {
      const factor = ultimoPorTipo.get(tipoTasa);
      if (!factor || factor.valor <= 0) return null;
      return montoColones / factor.valor;
    },
    [ultimoPorTipo]
  );

  /** Convierte dólares a colones usando la tasa especificada */
  const convertirAColones = useCallback(
    (montoDolares: number, tipoTasa: string = 'Tasa Acumulada'): number | null => {
      const factor = ultimoPorTipo.get(tipoTasa);
      if (!factor || factor.valor <= 0) return null;
      return montoDolares * factor.valor;
    },
    [ultimoPorTipo]
  );

  return {
    factores,
    loading,
    ultimoPorTipo,
    tipos,
    factoresMap,
    convertirADolares,
    convertirAColones,
    refetch: fetchFactores,
  };
}