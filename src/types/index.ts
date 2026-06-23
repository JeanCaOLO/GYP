export interface Organizacion {
  id: string;
  codigo: string;
  nombre: string;
  created_at: string;
}

export interface Compania {
  id: string;
  pais_id: string;
  codigo: string;
  nombre: string;
  created_at: string;
}

export interface Pais {
  id: string;
  codigo: string;
  nombre: string;
  moneda: string;
  simbolo_moneda: string;
  organizacion_id: string | null;
  created_at: string;
}

export interface CentroCosto {
  id: string;
  pais_id: string;
  compania_id: string | null;
  codigo: string;
  nombre: string;
  created_at: string;
}

export interface Factor {
  id: string;
  tipo: string;
  valor: number;
  fecha: string;
  descripcion: string | null;
  activa: boolean;
  pais_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FactorHistorico {
  id: string;
  factor_id: string;
  valor_anterior: number | null;
  valor_nuevo: number;
  fecha: string;
  tipo: string;
  descripcion: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
  created_at: string;
}

export interface CatalogoItem {
  id: string;
  linea: number | null;
  grupo: number | null;
  cuenta: string;
  descripcion: string;
  saldo_normal: string | null;
  comercializadora: string | null;
  balance_gyp: string | null;
  clasificacion: string | null;
  clasificacion_1: string | null;
  clasificacion_2: string | null;
  orden_clasificacion: number | null;
  activa: boolean;
  created_at: string;
  pais_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
}

export interface CobroCofersaCuenta {
  id: string;
  cuenta: string;
  descripcion_cobro: string;
  activa: boolean;
  created_at: string;
  updated_at: string;
  pais_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
}

export interface CobroCofersa {
  id: string;
  cuenta: string;
  descripcion_cobro: string | null;
  anio: number;
  mes: number;
  fecha_factura: string | null;
  monto_usd: number | null;
  tipo_cambio: number | null;
  monto_local: number | null;
  categoria: string | null;
  activa: boolean;
  created_at: string;
  pais_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
}

export interface CuentaAjustada {
  id: string;
  asiento_id: string | null;
  cuenta_contable: string;
  descripcion_ajuste: string;
  tipo_saldo: 'acreedor' | 'deudor';
  ajuste: number;
  fecha: string | null;
  vista: string | null;
  categoria_padre: string | null;
  es_cuenta_padre: boolean;
  activa: boolean;
  created_at: string;
  updated_at: string;
  pais_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
}

export interface CuentaAjustadaMontoMensual {
  id: string;
  cuenta_ajustada_id: string;
  anio: number;
  mes: number;
  monto: number;
  formula: string | null;
  created_at: string;
  updated_at: string;
  pais_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
}

export type RolUsuario = 'super_admin' | 'admin' | 'editor' | 'viewer';

export interface Usuario {
  id: string;
  nombre: string | null;
  email: string | null;
  rol: RolUsuario;
  pais_id: string | null;
  compania_id: string | null;
  organizacion_id: string | null;
  created_at: string;
}

export interface UserScope {
  pais_id: string | null;
  compania_id: string | null;
  organizacion_id: string | null;
}

export type ModuleName = 'catalogo' | 'cobros-cofersa' | 'cuentas-ajustadas' | 'presupuestos' | 'activacion-cuentas' | 'factores' | 'historial-cambios' | 'configuracion';

export type CategoriaCobro =
  | 'Gastos varios'
  | 'Suministros'
  | 'Fletes'
  | 'Personal'
  | 'Alquileres'
  | 'Otros';

export const CATEGORIAS_COBRO: CategoriaCobro[] = [
  'Gastos varios',
  'Suministros',
  'Fletes',
  'Personal',
  'Alquileres',
  'Otros',
];

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface PresupuestoCarga {
  id: string;
  nombre: string;
  descripcion: string | null;
  fecha_carga: string | null;
  cantidad_registros: number | null;
  total_monto: number | null;
  activa: boolean;
  created_at: string;
  pais_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
}

export interface PresupuestoLinea {
  id: string;
  carga_id: string;
  cuenta: string;
  anio: number;
  mes: number;
  monto: number;
  monto_local: number | null;
  monto_usd: number | null;
  descripcion_gyp: string | null;
  activa: boolean;
  created_at: string;
  pais_id: string | null;
  centro_costo_id: string | null;
  organizacion_id: string | null;
  compania_id: string | null;
}

export interface PremisaProyeccion {
  id: string;
  organizacion_id: string | null;
  pais_id: string;
  compania_id: string;
  cuenta_contable: string;
  centro_costo_id: string | null;
  anio: number;
  mes: number;
  metodo: 'valor_directo' | 'calculado';
  valor_dolar: number | null;
  pct_venta: number | null;
  base_venta: 'actual' | 'proyectada' | null;
  pct_semineto: number | null;
  formula: string | null;
  valor_proyectado: number;
  activa: boolean;
  created_at: string;
}

export interface VentaProyeccion {
  id: string;
  organizacion_id: string | null;
  pais_id: string;
  compania_id: string;
  cuenta_contable: string | null;
  centro_costo_id: string | null;
  anio: number;
  mes: number;
  venta_actual: number;
  venta_proyectada: number;
  semi_neto: number;
  activa: boolean;
  created_at: string;
}