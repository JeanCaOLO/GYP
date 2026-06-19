import { useState, useEffect } from 'react';
import { Modal } from '@/components/base/Modal';
import type { CatalogoItem, Organizacion, Pais, Compania, CentroCosto } from '@/types';

interface CatalogoModalProps {
  isOpen: boolean;
  item: CatalogoItem | null;
  organizaciones: Organizacion[];
  paises: Pais[];
  companias: Compania[];
  centrosCostos: CentroCosto[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}

const initialForm = {
  linea: '',
  grupo: '',
  cuenta: '',
  descripcion: '',
  saldo_normal: '',
  comercializadora: '',
  balance_gyp: '',
  clasificacion: '',
  clasificacion_1: '',
  clasificacion_2: '',
  orden_clasificacion: '',
  activa: true,
  organizacion_id: '',
  pais_id: '',
  compania_id: '',
  centro_costo_id: '',
};

export function CatalogoModal({ isOpen, item, organizaciones, paises, companias, centrosCostos, onClose, onSave }: CatalogoModalProps) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setErrors({});
      setSaving(false);
      if (item) {
        setForm({
          linea: item.linea ?? '',
          grupo: item.grupo ?? '',
          cuenta: item.cuenta,
          descripcion: item.descripcion,
          saldo_normal: item.saldo_normal ?? '',
          comercializadora: item.comercializadora ?? '',
          balance_gyp: item.balance_gyp ?? '',
          clasificacion: item.clasificacion ?? '',
          clasificacion_1: item.clasificacion_1 ?? '',
          clasificacion_2: item.clasificacion_2 ?? '',
          orden_clasificacion: item.orden_clasificacion ?? '',
          activa: item.activa,
          organizacion_id: item.organizacion_id ?? '',
          pais_id: item.pais_id ?? '',
          compania_id: item.compania_id ?? '',
          centro_costo_id: item.centro_costo_id ?? '',
        });
      } else {
        setForm(initialForm);
      }
    }
  }, [isOpen, item]);

  const handleChange = (field: string, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.cuenta.trim()) next.cuenta = 'La cuenta es obligatoria';
    if (!form.descripcion.trim()) next.descripcion = 'La descripción es obligatoria';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      cuenta: form.cuenta.trim(),
      descripcion: form.descripcion.trim(),
      activa: form.activa,
    };
    if (form.linea !== '') payload.linea = Number(form.linea);
    if (form.grupo !== '') payload.grupo = Number(form.grupo);
    if (form.saldo_normal.trim()) payload.saldo_normal = form.saldo_normal.trim();
    if (form.comercializadora.trim()) payload.comercializadora = form.comercializadora.trim();
    if (form.balance_gyp.trim()) payload.balance_gyp = form.balance_gyp.trim();
    if (form.clasificacion.trim()) payload.clasificacion = form.clasificacion.trim();
    if (form.clasificacion_1.trim()) payload.clasificacion_1 = form.clasificacion_1.trim();
    if (form.clasificacion_2.trim()) payload.clasificacion_2 = form.clasificacion_2.trim();
    if (form.orden_clasificacion !== '') payload.orden_clasificacion = Number(form.orden_clasificacion);
    if (form.organizacion_id) payload.organizacion_id = form.organizacion_id;
    if (form.pais_id) payload.pais_id = form.pais_id;
    if (form.compania_id) payload.compania_id = form.compania_id;
    if (form.centro_costo_id) payload.centro_costo_id = form.centro_costo_id;
    onSave(payload);
  };

  const inputClass = (field: string) =>
    `w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
      errors[field]
        ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-50'
        : 'border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-slate-50'
    }`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item ? 'Editar Cuenta' : 'Nueva Cuenta'} size="lg">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Cuenta <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.cuenta}
            onChange={(e) => handleChange('cuenta', e.target.value)}
            className={inputClass('cuenta')}
            disabled={!!item}
            placeholder="Ej: 7.1.1.01.1.001"
          />
          {errors.cuenta && <p className="text-xs text-red-500 mt-1">{errors.cuenta}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Orden Clasificación</label>
          <input
            type="number"
            value={form.orden_clasificacion}
            onChange={(e) => handleChange('orden_clasificacion', e.target.value)}
            className={inputClass('orden_clasificacion')}
            placeholder="1"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Descripción <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.descripcion}
            onChange={(e) => handleChange('descripcion', e.target.value)}
            className={inputClass('descripcion')}
            placeholder="Descripción de la cuenta"
          />
          {errors.descripcion && <p className="text-xs text-red-500 mt-1">{errors.descripcion}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Línea</label>
          <input
            type="number"
            value={form.linea}
            onChange={(e) => handleChange('linea', e.target.value)}
            className={inputClass('linea')}
            placeholder="7"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Grupo</label>
          <input
            type="number"
            value={form.grupo}
            onChange={(e) => handleChange('grupo', e.target.value)}
            className={inputClass('grupo')}
            placeholder="7"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Saldo Normal</label>
          <input
            type="text"
            value={form.saldo_normal}
            onChange={(e) => handleChange('saldo_normal', e.target.value)}
            className={inputClass('saldo_normal')}
            placeholder="Deudor / Acreedor"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Comercializadora</label>
          <input
            type="text"
            value={form.comercializadora}
            onChange={(e) => handleChange('comercializadora', e.target.value)}
            className={inputClass('comercializadora')}
            placeholder="OLO"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Balance / GYP</label>
          <input
            type="text"
            value={form.balance_gyp}
            onChange={(e) => handleChange('balance_gyp', e.target.value)}
            className={inputClass('balance_gyp')}
            placeholder="GYP"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Clasificación</label>
          <input
            type="text"
            value={form.clasificacion}
            onChange={(e) => handleChange('clasificacion', e.target.value)}
            className={inputClass('clasificacion')}
            placeholder="Gastos Operativos"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Clasificación 1</label>
          <input
            type="text"
            value={form.clasificacion_1}
            onChange={(e) => handleChange('clasificacion_1', e.target.value)}
            className={inputClass('clasificacion_1')}
            placeholder="Gastos Varios"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Clasificación 2</label>
          <input
            type="text"
            value={form.clasificacion_2}
            onChange={(e) => handleChange('clasificacion_2', e.target.value)}
            className={inputClass('clasificacion_2')}
            placeholder="Otros Gastos"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Organización</label>
          <select
            value={form.organizacion_id}
            onChange={(e) => handleChange('organizacion_id', e.target.value)}
            className={inputClass('organizacion_id')}
          >
            <option value="">Seleccionar organización...</option>
            {organizaciones.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
          <select
            value={form.pais_id}
            onChange={(e) => handleChange('pais_id', e.target.value)}
            className={inputClass('pais_id')}
          >
            <option value="">Seleccionar país...</option>
            {paises.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} ({p.codigo})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Compañía</label>
          <select
            value={form.compania_id}
            onChange={(e) => handleChange('compania_id', e.target.value)}
            className={inputClass('compania_id')}
          >
            <option value="">Seleccionar compañía...</option>
            {companias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Centro de Costo</label>
          <select
            value={form.centro_costo_id}
            onChange={(e) => handleChange('centro_costo_id', e.target.value)}
            className={inputClass('centro_costo_id')}
          >
            <option value="">Seleccionar centro de costo...</option>
            {centrosCostos.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 sm:pt-6">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="activa"
              checked={form.activa}
              onChange={(e) => handleChange('activa', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="activa" className="text-sm text-slate-700 select-none cursor-pointer">
              Cuenta activa
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
          disabled={saving}
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors flex items-center gap-2"
        >
          {saving && <i className="ri-loader-4-line animate-spin"></i>}
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  );
}