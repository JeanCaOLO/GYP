import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase';
import type { Pais, CentroCosto, Organizacion, Compania } from '@/types';

interface UbicacionesData {
  organizaciones: Organizacion[];
  paises: Pais[];
  companias: Compania[];
  centrosCostos: CentroCosto[];
  organizacionesMap: Map<string, string>;
  paisesMap: Map<string, string>;
  companiasMap: Map<string, string>;
  centrosCostosMap: Map<string, string>;
  loading: boolean;
  refetch: () => Promise<void>;
  setOrganizaciones: Dispatch<SetStateAction<Organizacion[]>>;
  setPaises: Dispatch<SetStateAction<Pais[]>>;
  setCompanias: Dispatch<SetStateAction<Compania[]>>;
  setCentrosCostos: Dispatch<SetStateAction<CentroCosto[]>>;
}

const UbicacionesContext = createContext<UbicacionesData | null>(null);

export function UbicacionesProvider({ children }: { children: ReactNode }) {
  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  const [paises, setPaises] = useState<Pais[]>([]);
  const [companias, setCompanias] = useState<Compania[]>([]);
  const [centrosCostos, setCentrosCostos] = useState<CentroCosto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgRes, paisesRes, compRes, centrosRes] = await Promise.all([
        supabase.from('organizaciones').select('*').order('nombre'),
        supabase.from('paises').select('*').order('nombre'),
        supabase.from('companias').select('*').order('nombre'),
        supabase.from('centros_costos').select('*').order('nombre'),
      ]);
      if (orgRes.data) setOrganizaciones(orgRes.data as Organizacion[]);
      if (paisesRes.data) setPaises(paisesRes.data as Pais[]);
      if (compRes.data) setCompanias(compRes.data as Compania[]);
      if (centrosRes.data) setCentrosCostos(centrosRes.data as CentroCosto[]);
    } catch (err) {
      console.error('Error fetching ubicaciones:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const organizacionesMap = useMemo(() => {
    const map = new Map<string, string>();
    organizaciones.forEach((o) => map.set(o.id, o.nombre));
    return map;
  }, [organizaciones]);

  const paisesMap = useMemo(() => {
    const map = new Map<string, string>();
    paises.forEach((p) => map.set(p.id, p.nombre));
    return map;
  }, [paises]);

  const companiasMap = useMemo(() => {
    const map = new Map<string, string>();
    companias.forEach((c) => map.set(c.id, c.nombre));
    return map;
  }, [companias]);

  const centrosCostosMap = useMemo(() => {
    const map = new Map<string, string>();
    centrosCostos.forEach((c) => map.set(c.id, c.nombre));
    return map;
  }, [centrosCostos]);

  const value = useMemo<UbicacionesData>(() => ({
    organizaciones,
    paises,
    companias,
    centrosCostos,
    organizacionesMap,
    paisesMap,
    companiasMap,
    centrosCostosMap,
    loading,
    refetch: fetchData,
    setOrganizaciones,
    setPaises,
    setCompanias,
    setCentrosCostos,
  }), [organizaciones, paises, companias, centrosCostos, organizacionesMap, paisesMap, companiasMap, centrosCostosMap, loading, fetchData]);

  return (
    <UbicacionesContext.Provider value={value}>
      {children}
    </UbicacionesContext.Provider>
  );
}

export function useUbicaciones(): UbicacionesData {
  const ctx = useContext(UbicacionesContext);
  if (!ctx) throw new Error('useUbicaciones must be used within UbicacionesProvider');
  return ctx;
}