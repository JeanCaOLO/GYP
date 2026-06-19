import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/contexts/ToastContext';
import { useUbicaciones } from '@/contexts/UbicacionesContext';
import { Modal } from '@/components/base/Modal';
import { ConfirmModal } from '@/components/base/ConfirmModal';
import type { Pais, CentroCosto, Organizacion, Compania } from '@/types';

interface PaisForm {
  codigo: string;
  nombre: string;
  moneda: string;
  simbolo_moneda: string;
  organizacion_id: string;
}

interface CentroCostoForm {
  pais_id: string;
  compania_id: string;
  codigo: string;
  nombre: string;
}

interface OrganizacionForm {
  codigo: string;
  nombre: string;
}

interface CompaniaForm {
  pais_id: string;
  codigo: string;
  nombre: string;
}

const emptyOrgForm: OrganizacionForm = { codigo: '', nombre: '' };
const emptyPaisForm: PaisForm = { codigo: '', nombre: '', moneda: '', simbolo_moneda: '', organizacion_id: '' };
const emptyCiaForm: CompaniaForm = { pais_id: '', codigo: '', nombre: '' };
const emptyCentroForm: CentroCostoForm = { pais_id: '', compania_id: '', codigo: '', nombre: '' };

type SubTab = 'organizaciones' | 'paises' | 'companias' | 'centros';

export default function PaisesCentrosTab() {
  const { addToast } = useToast();
  const {
    organizaciones, paises, companias, centrosCostos: centros,
    loading, refetch,
    setOrganizaciones, setPaises, setCompanias, setCentrosCostos,
  } = useUbicaciones();
  const [subTab, setSubTab] = useState<SubTab>('organizaciones');

  // Organizaciones
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organizacion | null>(null);
  const [orgForm, setOrgForm] = useState<OrganizacionForm>(emptyOrgForm);
  const [savingOrg, setSavingOrg] = useState(false);
  const [deleteOrg, setDeleteOrg] = useState<Organizacion | null>(null);
  const [deletingOrg, setDeletingOrg] = useState(false);

  // Países
  const [showPaisModal, setShowPaisModal] = useState(false);
  const [editingPais, setEditingPais] = useState<Pais | null>(null);
  const [paisForm, setPaisForm] = useState<PaisForm>(emptyPaisForm);
  const [savingPais, setSavingPais] = useState(false);
  const [deletePais, setDeletePais] = useState<Pais | null>(null);
  const [deletingPais, setDeletingPais] = useState(false);

  // Compañías
  const [showCiaModal, setShowCiaModal] = useState(false);
  const [editingCia, setEditingCia] = useState<Compania | null>(null);
  const [ciaForm, setCiaForm] = useState<CompaniaForm>(emptyCiaForm);
  const [savingCia, setSavingCia] = useState(false);
  const [deleteCia, setDeleteCia] = useState<Compania | null>(null);
  const [deletingCia, setDeletingCia] = useState(false);

  // Centros de Costo
  const [showCentroModal, setShowCentroModal] = useState(false);
  const [editingCentro, setEditingCentro] = useState<CentroCosto | null>(null);
  const [centroForm, setCentroForm] = useState<CentroCostoForm>(emptyCentroForm);
  const [savingCentro, setSavingCentro] = useState(false);
  const [deleteCentro, setDeleteCentro] = useState<CentroCosto | null>(null);
  const [deletingCentro, setDeletingCentro] = useState(false);

  const getOrgNombre = (id: string) => organizaciones.find((o) => o.id === id)?.nombre || '—';
  const getPaisNombre = (id: string) => paises.find((p) => p.id === id)?.nombre || '—';
  const getCiaNombre = (id: string) => companias.find((c) => c.id === id)?.nombre || '—';

  // --- CRUD Organizaciones ---
  const openCreateOrg = () => { setEditingOrg(null); setOrgForm(emptyOrgForm); setShowOrgModal(true); };
  const openEditOrg = (org: Organizacion) => { setEditingOrg(org); setOrgForm({ codigo: org.codigo, nombre: org.nombre }); setShowOrgModal(true); };
  const handleSaveOrg = async () => {
    if (!orgForm.codigo.trim() || !orgForm.nombre.trim()) { addToast('error', 'Código y nombre son obligatorios'); return; }
    setSavingOrg(true);
    const payload = { codigo: orgForm.codigo.trim().toUpperCase(), nombre: orgForm.nombre.trim() };
    if (editingOrg) {
      const { error } = await supabase.from('organizaciones').update(payload).eq('id', editingOrg.id);
      if (error) { 
        addToast('error', error.code === '23505' ? `Ya existe una organización con el código "${payload.codigo}".` : `Error al guardar: ${error.message}`); 
        setSavingOrg(false); return; 
      }
      setOrganizaciones((prev) => prev.map((o) => o.id === editingOrg.id ? { ...o, ...payload } : o));
      addToast('success', 'Organización actualizada');
    } else {
      const { data, error } = await supabase.from('organizaciones').insert(payload).select('*').single();
      if (error || !data) { 
        addToast('error', error?.code === '23505' ? `Ya existe una organización con el código "${payload.codigo}".` : `Error al guardar: ${error?.message || 'Error desconocido'}`); 
        setSavingOrg(false); return; 
      }
      setOrganizaciones((prev) => [...prev, data as Organizacion]);
      addToast('success', 'Organización creada');
    }
    setShowOrgModal(false);
    refetch();
    setSavingOrg(false);
  };
  const handleDeleteOrg = async () => {
    if (!deleteOrg) return;
    setDeletingOrg(true);
    const { count } = await supabase.from('paises').select('*', { count: 'exact', head: true }).eq('organizacion_id', deleteOrg.id);
    if (count && count > 0) { addToast('error', `No se puede eliminar: tiene ${count} país(es) asociado(s)`); setDeletingOrg(false); setDeleteOrg(null); return; }
    const { error } = await supabase.from('organizaciones').delete().eq('id', deleteOrg.id);
    if (error) { addToast('error', `Error al eliminar: ${error.message}`); setDeletingOrg(false); setDeleteOrg(null); return; }
    setOrganizaciones((prev) => prev.filter((o) => o.id !== deleteOrg.id));
    addToast('success', 'Organización eliminada');
    refetch();
    setDeletingOrg(false);
    setDeleteOrg(null);
  };

  // --- CRUD Países ---
  const openCreatePais = () => { setEditingPais(null); setPaisForm({ ...emptyPaisForm, organizacion_id: organizaciones[0]?.id || '' }); setShowPaisModal(true); };
  const openEditPais = (pais: Pais) => { setEditingPais(pais); setPaisForm({ codigo: pais.codigo, nombre: pais.nombre, moneda: pais.moneda, simbolo_moneda: pais.simbolo_moneda, organizacion_id: pais.organizacion_id || '' }); setShowPaisModal(true); };
  const handleSavePais = async () => {
    if (!paisForm.codigo.trim() || !paisForm.nombre.trim() || !paisForm.moneda.trim()) { addToast('error', 'Código, nombre y moneda son obligatorios'); return; }
    setSavingPais(true);
    const payload = { codigo: paisForm.codigo.trim().toUpperCase(), nombre: paisForm.nombre.trim(), moneda: paisForm.moneda.trim(), simbolo_moneda: paisForm.simbolo_moneda.trim(), organizacion_id: paisForm.organizacion_id || null };
    if (editingPais) {
      const { error } = await supabase.from('paises').update(payload).eq('id', editingPais.id);
      if (error) { 
        addToast('error', error.code === '23505' ? `Ya existe un país con el código "${payload.codigo}".` : `Error al guardar: ${error.message}`); 
        setSavingPais(false); return; 
      }
      setPaises((prev) => prev.map((p) => p.id === editingPais.id ? { ...p, ...payload } : p));
      addToast('success', 'País actualizado');
    } else {
      const { data, error } = await supabase.from('paises').insert(payload).select('*').single();
      if (error || !data) { 
        addToast('error', error?.code === '23505' ? `Ya existe un país con el código "${payload.codigo}".` : `Error al guardar: ${error?.message || 'Error desconocido'}`); 
        setSavingPais(false); return; 
      }
      setPaises((prev) => [...prev, data as Pais]);
      addToast('success', 'País creado');
    }
    setShowPaisModal(false);
    refetch();
    setSavingPais(false);
  };
  const handleDeletePais = async () => {
    if (!deletePais) return;
    setDeletingPais(true);
    const { count: ccCount } = await supabase.from('centros_costos').select('*', { count: 'exact', head: true }).eq('pais_id', deletePais.id);
    const { count: ciaCount } = await supabase.from('companias').select('*', { count: 'exact', head: true }).eq('pais_id', deletePais.id);
    if ((ccCount && ccCount > 0) || (ciaCount && ciaCount > 0)) {
      addToast('error', `No se puede eliminar: tiene ${ccCount || 0} CC y ${ciaCount || 0} compañía(s) asociada(s)`);
      setDeletingPais(false); setDeletePais(null); return;
    }
    const { error } = await supabase.from('paises').delete().eq('id', deletePais.id);
    if (error) { addToast('error', `Error al eliminar: ${error.message}`); setDeletingPais(false); setDeletePais(null); return; }
    setPaises((prev) => prev.filter((p) => p.id !== deletePais.id));
    addToast('success', 'País eliminado');
    refetch();
    setDeletingPais(false);
    setDeletePais(null);
  };

  // --- CRUD Compañías ---
  const openCreateCia = () => { setEditingCia(null); setCiaForm({ ...emptyCiaForm, pais_id: paises[0]?.id || '' }); setShowCiaModal(true); };
  const openEditCia = (cia: Compania) => { setEditingCia(cia); setCiaForm({ pais_id: cia.pais_id, codigo: cia.codigo, nombre: cia.nombre }); setShowCiaModal(true); };
  const handleSaveCia = async () => {
    if (!ciaForm.pais_id || !ciaForm.codigo.trim() || !ciaForm.nombre.trim()) { addToast('error', 'País, código y nombre son obligatorios'); return; }
    setSavingCia(true);
    const payload = { pais_id: ciaForm.pais_id, codigo: ciaForm.codigo.trim().toUpperCase(), nombre: ciaForm.nombre.trim() };
    if (editingCia) {
      const { error } = await supabase.from('companias').update(payload).eq('id', editingCia.id);
      if (error) { 
        addToast('error', error.code === '23505' ? `Ya existe una compañía con el código "${payload.codigo}" en ese país.` : `Error al guardar: ${error.message}`); 
        setSavingCia(false); return; 
      }
      setCompanias((prev) => prev.map((c) => c.id === editingCia.id ? { ...c, ...payload } : c));
      addToast('success', 'Compañía actualizada');
    } else {
      const { data, error } = await supabase.from('companias').insert(payload).select('*').single();
      if (error || !data) { 
        addToast('error', error?.code === '23505' ? `Ya existe una compañía con el código "${payload.codigo}" en ese país.` : `Error al guardar: ${error?.message || 'Error desconocido'}`); 
        setSavingCia(false); return; 
      }
      setCompanias((prev) => [...prev, data as Compania]);
      addToast('success', 'Compañía creada');
    }
    setShowCiaModal(false);
    refetch();
    setSavingCia(false);
  };
  const handleDeleteCia = async () => {
    if (!deleteCia) return;
    setDeletingCia(true);
    const { count } = await supabase.from('centros_costos').select('*', { count: 'exact', head: true }).eq('compania_id', deleteCia.id);
    if (count && count > 0) { addToast('error', `No se puede eliminar: tiene ${count} centro(s) de costo asociado(s)`); setDeletingCia(false); setDeleteCia(null); return; }
    const { error } = await supabase.from('companias').delete().eq('id', deleteCia.id);
    if (error) { addToast('error', `Error al eliminar: ${error.message}`); setDeletingCia(false); setDeleteCia(null); return; }
    setCompanias((prev) => prev.filter((c) => c.id !== deleteCia.id));
    addToast('success', 'Compañía eliminada');
    refetch();
    setDeletingCia(false);
    setDeleteCia(null);
  };

  // --- CRUD Centros de Costo ---
  const openCreateCentro = () => { setEditingCentro(null); setCentroForm({ ...emptyCentroForm, pais_id: paises[0]?.id || '', compania_id: companias[0]?.id || '' }); setShowCentroModal(true); };
  const openEditCentro = (centro: CentroCosto) => { setEditingCentro(centro); setCentroForm({ pais_id: centro.pais_id, compania_id: centro.compania_id || '', codigo: centro.codigo, nombre: centro.nombre }); setShowCentroModal(true); };
  const handleSaveCentro = async () => {
    if (!centroForm.pais_id || !centroForm.codigo.trim() || !centroForm.nombre.trim()) { addToast('error', 'País, código y nombre son obligatorios'); return; }
    setSavingCentro(true);
    const payload = { pais_id: centroForm.pais_id, compania_id: centroForm.compania_id || null, codigo: centroForm.codigo.trim().toUpperCase(), nombre: centroForm.nombre.trim() };
    if (editingCentro) {
      const { data, error } = await supabase.from('centros_costos').update(payload).eq('id', editingCentro.id).select('*').single();
      if (error) { 
        addToast('error', error.code === '23505' 
          ? `Ya existe un centro de costo con el código "${payload.codigo}" en ese país y compañía. El código debe ser único por país y compañía.` 
          : `Error al guardar: ${error.message}`); 
        setSavingCentro(false); 
        return; 
      }
      // Update local state immediately
      setCentrosCostos((prev) => prev.map((c) => c.id === editingCentro.id ? { ...c, ...data } : c));
      addToast('success', 'Centro de costo actualizado');
    } else {
      const { data, error } = await supabase.from('centros_costos').insert(payload).select('*').single();
      if (error || !data) { 
        addToast('error', error?.code === '23505' 
          ? `Ya existe un centro de costo con el código "${payload.codigo}" en ese país y compañía. El código debe ser único por país y compañía.` 
          : `Error al guardar: ${error?.message || 'Error desconocido'}`); 
        setSavingCentro(false); 
        return; 
      }
      // Add to local state immediately
      setCentrosCostos((prev) => [...prev, data as CentroCosto]);
      addToast('success', 'Centro de costo creado');
    }
    setShowCentroModal(false);
    refetch();
    setSavingCentro(false);
  };
  const handleDeleteCentro = async () => {
    if (!deleteCentro) return;
    setDeletingCentro(true);
    const { error } = await supabase.from('centros_costos').delete().eq('id', deleteCentro.id);
    if (error) { addToast('error', `Error al eliminar: ${error.message}`); setDeletingCentro(false); setDeleteCentro(null); return; }
    setCentrosCostos((prev) => prev.filter((c) => c.id !== deleteCentro.id));
    addToast('success', 'Centro de costo eliminado');
    refetch();
    setDeletingCentro(false);
    setDeleteCentro(null);
  };

  const subTabs: { id: SubTab; label: string; count: number; icon: string }[] = [
    { id: 'organizaciones', label: 'Organizaciones', count: organizaciones.length, icon: 'ri-building-line' },
    { id: 'paises', label: 'Países', count: paises.length, icon: 'ri-global-line' },
    { id: 'companias', label: 'Compañías', count: companias.length, icon: 'ri-store-2-line' },
    { id: 'centros', label: 'Centros de Costo', count: centros.length, icon: 'ri-focus-2-line' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {subTabs.map((st) => (
          <button
            key={st.id}
            onClick={() => setSubTab(st.id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              subTab === st.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <i className={st.icon}></i>
            {st.label}
            <span className="text-xs opacity-60">({st.count})</span>
          </button>
        ))}
      </div>

      {subTab === 'organizaciones' && (
        <div className="rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Organizaciones</h3>
              <p className="text-xs text-slate-500">{organizaciones.length} registrada{organizaciones.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={openCreateOrg} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors whitespace-nowrap">
              <i className="ri-add-line text-sm"></i> Agregar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2.5 px-4 font-medium text-xs">Código</th>
                  <th className="py-2.5 px-4 font-medium text-xs">Nombre</th>
                  <th className="py-2.5 px-2 font-medium text-xs text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <td key={j} className="py-2.5 px-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-16"></div></td>
                      ))}
                    </tr>
                  ))
                ) : organizaciones.length === 0 ? (
                  <tr><td colSpan={3} className="py-6 text-center text-slate-400 text-xs">No hay organizaciones registradas</td></tr>
                ) : (
                  organizaciones.map((org) => (
                    <tr key={org.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4">
                        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 font-mono">{org.codigo}</span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 text-xs">{org.nombre}</td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => openEditOrg(org)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Editar"><i className="ri-pencil-line text-sm"></i></button>
                          <button onClick={() => setDeleteOrg(org)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Eliminar"><i className="ri-delete-bin-line text-sm"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'paises' && (
        <div className="rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Países</h3>
              <p className="text-xs text-slate-500">{paises.length} registrado{paises.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={openCreatePais} disabled={organizaciones.length === 0} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
              <i className="ri-add-line text-sm"></i> Agregar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2.5 px-4 font-medium text-xs">Código</th>
                  <th className="py-2.5 px-4 font-medium text-xs">Nombre</th>
                  <th className="py-2.5 px-4 font-medium text-xs">Organización</th>
                  <th className="py-2.5 px-4 font-medium text-xs">Moneda</th>
                  <th className="py-2.5 px-2 font-medium text-xs text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      {Array.from({ length: 5 }).map((_, j) => (<td key={j} className="py-2.5 px-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-16"></div></td>))}
                    </tr>
                  ))
                ) : paises.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400 text-xs">No hay países registrados</td></tr>
                ) : (
                  paises.map((pais) => (
                    <tr key={pais.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4"><span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 font-mono">{pais.codigo}</span></td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 text-xs">{pais.nombre}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{getOrgNombre(pais.organizacion_id || '')}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{pais.simbolo_moneda} {pais.moneda}</td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => openEditPais(pais)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Editar"><i className="ri-pencil-line text-sm"></i></button>
                          <button onClick={() => setDeletePais(pais)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Eliminar"><i className="ri-delete-bin-line text-sm"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'companias' && (
        <div className="rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div><h3 className="text-sm font-semibold text-slate-900">Compañías</h3><p className="text-xs text-slate-500">{companias.length} registrada{companias.length !== 1 ? 's' : ''}</p></div>
            <button onClick={openCreateCia} disabled={paises.length === 0} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"><i className="ri-add-line text-sm"></i> Agregar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2.5 px-4 font-medium text-xs">Código</th>
                  <th className="py-2.5 px-4 font-medium text-xs">Nombre</th>
                  <th className="py-2.5 px-4 font-medium text-xs">País</th>
                  <th className="py-2.5 px-2 font-medium text-xs text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 2 }).map((_, i) => (<tr key={i} className="border-b border-slate-50">{Array.from({ length: 4 }).map((_, j) => (<td key={j} className="py-2.5 px-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-16"></div></td>))}</tr>))
                ) : companias.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-slate-400 text-xs">No hay compañías registradas</td></tr>
                ) : (
                  companias.map((cia) => (
                    <tr key={cia.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4"><span className="inline-flex rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700 font-mono">{cia.codigo}</span></td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 text-xs">{cia.nombre}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{getPaisNombre(cia.pais_id)}</td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => openEditCia(cia)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Editar"><i className="ri-pencil-line text-sm"></i></button>
                          <button onClick={() => setDeleteCia(cia)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Eliminar"><i className="ri-delete-bin-line text-sm"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'centros' && (
        <div className="rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div><h3 className="text-sm font-semibold text-slate-900">Centros de Costo</h3><p className="text-xs text-slate-500">{centros.length} registrado{centros.length !== 1 ? 's' : ''}</p></div>
            <button onClick={openCreateCentro} disabled={paises.length === 0} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"><i className="ri-add-line text-sm"></i> Agregar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
                  <th className="py-2.5 px-4 font-medium text-xs">Código</th>
                  <th className="py-2.5 px-4 font-medium text-xs">Nombre</th>
                  <th className="py-2.5 px-4 font-medium text-xs">País</th>
                  <th className="py-2.5 px-4 font-medium text-xs">Compañía</th>
                  <th className="py-2.5 px-2 font-medium text-xs text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (<tr key={i} className="border-b border-slate-50">{Array.from({ length: 5 }).map((_, j) => (<td key={j} className="py-2.5 px-4"><div className="h-4 bg-slate-100 rounded animate-pulse w-16"></div></td>))}</tr>))
                ) : centros.length === 0 ? (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400 text-xs">No hay centros de costo registrados</td></tr>
                ) : (
                  centros.map((centro) => (
                    <tr key={centro.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 px-4"><span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 font-mono">{centro.codigo}</span></td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 text-xs">{centro.nombre}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{getPaisNombre(centro.pais_id)}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{getCiaNombre(centro.compania_id || '')}</td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => openEditCentro(centro)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="Editar"><i className="ri-pencil-line text-sm"></i></button>
                          <button onClick={() => setDeleteCentro(centro)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Eliminar"><i className="ri-delete-bin-line text-sm"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <i className="ri-information-line text-amber-600 text-sm"></i>
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">Jerarquía de Ubicaciones</p>
            <p className="text-xs text-amber-600 mt-1">
              El sistema maneja 4 niveles jerárquicos: <strong>Organización → País → Compañía → Centro de Costo</strong>.
              Los cambios realizados aquí se reflejan automáticamente en todos los módulos del sistema.
            </p>
          </div>
        </div>
      </div>

      {/* --- Modal Organización --- */}
      <Modal isOpen={showOrgModal} onClose={() => setShowOrgModal(false)} title={editingOrg ? 'Editar Organización' : 'Nueva Organización'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Código</label>
            <input type="text" value={orgForm.codigo} onChange={(e) => setOrgForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="OLO" maxLength={20} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 uppercase" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Nombre</label>
            <input type="text" value={orgForm.nombre} onChange={(e) => setOrgForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="OLO" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowOrgModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 whitespace-nowrap">Cancelar</button>
            <button onClick={handleSaveOrg} disabled={savingOrg} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">{savingOrg ? 'Guardando...' : editingOrg ? 'Actualizar' : 'Crear'}</button>
          </div>
        </div>
      </Modal>

      {/* --- Modal País --- */}
      <Modal isOpen={showPaisModal} onClose={() => setShowPaisModal(false)} title={editingPais ? 'Editar País' : 'Nuevo País'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">Organización</label>
            <select value={paisForm.organizacion_id} onChange={(e) => setPaisForm((f) => ({ ...f, organizacion_id: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
              <option value="" disabled>Seleccionar organización...</option>
              {organizaciones.map((o) => (<option key={o.id} value={o.id}>{o.nombre}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Código</label>
            <input type="text" value={paisForm.codigo} onChange={(e) => setPaisForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="CRC" maxLength={5} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 uppercase" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Nombre</label>
            <input type="text" value={paisForm.nombre} onChange={(e) => setPaisForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Costa Rica" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Moneda</label>
            <input type="text" value={paisForm.moneda} onChange={(e) => setPaisForm((f) => ({ ...f, moneda: e.target.value }))} placeholder="Colón Costarricense" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Símbolo de moneda</label>
            <input type="text" value={paisForm.simbolo_moneda} onChange={(e) => setPaisForm((f) => ({ ...f, simbolo_moneda: e.target.value }))} placeholder="₡" maxLength={5} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowPaisModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 whitespace-nowrap">Cancelar</button>
            <button onClick={handleSavePais} disabled={savingPais} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">{savingPais ? 'Guardando...' : editingPais ? 'Actualizar' : 'Crear'}</button>
          </div>
        </div>
      </Modal>

      {/* --- Modal Compañía --- */}
      <Modal isOpen={showCiaModal} onClose={() => setShowCiaModal(false)} title={editingCia ? 'Editar Compañía' : 'Nueva Compañía'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">País</label>
            <select value={ciaForm.pais_id} onChange={(e) => setCiaForm((f) => ({ ...f, pais_id: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
              <option value="" disabled>Seleccionar país...</option>
              {paises.map((p) => (<option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Código</label>
            <input type="text" value={ciaForm.codigo} onChange={(e) => setCiaForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="OLO" maxLength={20} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 uppercase" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Nombre</label>
            <input type="text" value={ciaForm.nombre} onChange={(e) => setCiaForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="OLO" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCiaModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 whitespace-nowrap">Cancelar</button>
            <button onClick={handleSaveCia} disabled={savingCia} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">{savingCia ? 'Guardando...' : editingCia ? 'Actualizar' : 'Crear'}</button>
          </div>
        </div>
      </Modal>

      {/* --- Modal Centro de Costo --- */}
      <Modal isOpen={showCentroModal} onClose={() => setShowCentroModal(false)} title={editingCentro ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1">País</label>
            <select value={centroForm.pais_id} onChange={(e) => setCentroForm((f) => ({ ...f, pais_id: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
              <option value="" disabled>Seleccionar país...</option>
              {paises.map((p) => (<option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Compañía</label>
            <select value={centroForm.compania_id} onChange={(e) => setCentroForm((f) => ({ ...f, compania_id: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500">
              <option value="">Sin compañía...</option>
              {companias.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Código</label>
            <input type="text" value={centroForm.codigo} onChange={(e) => setCentroForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="CEDI-COYOL" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500 uppercase" />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1">Nombre</label>
            <input type="text" value={centroForm.nombre} onChange={(e) => setCentroForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="CEDI Coyol" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCentroModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 whitespace-nowrap">Cancelar</button>
            <button onClick={handleSaveCentro} disabled={savingCentro} className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap">{savingCentro ? 'Guardando...' : editingCentro ? 'Actualizar' : 'Crear'}</button>
          </div>
        </div>
      </Modal>

      {/* --- Confirm Modals --- */}
      <ConfirmModal isOpen={!!deleteOrg} onClose={() => setDeleteOrg(null)} onConfirm={handleDeleteOrg} title="Eliminar Organización" message={`¿Eliminar ${deleteOrg?.nombre}? Solo se puede eliminar si no tiene países asociados.`} confirmText={deletingOrg ? 'Eliminando...' : 'Eliminar'} variant="danger" />
      <ConfirmModal isOpen={!!deletePais} onClose={() => setDeletePais(null)} onConfirm={handleDeletePais} title="Eliminar País" message={`¿Eliminar ${deletePais?.nombre} (${deletePais?.codigo})? Solo si no tiene compañías ni centros de costo asociados.`} confirmText={deletingPais ? 'Eliminando...' : 'Eliminar'} variant="danger" />
      <ConfirmModal isOpen={!!deleteCia} onClose={() => setDeleteCia(null)} onConfirm={handleDeleteCia} title="Eliminar Compañía" message={`¿Eliminar ${deleteCia?.nombre} (${deleteCia?.codigo})?`} confirmText={deletingCia ? 'Eliminando...' : 'Eliminar'} variant="danger" />
      <ConfirmModal isOpen={!!deleteCentro} onClose={() => setDeleteCentro(null)} onConfirm={handleDeleteCentro} title="Eliminar Centro de Costo" message={`¿Eliminar ${deleteCentro?.nombre} (${deleteCentro?.codigo})?`} confirmText={deletingCentro ? 'Eliminando...' : 'Eliminar'} variant="danger" />
    </div>
  );
}