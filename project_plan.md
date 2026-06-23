# GestorGYP

## 1. Project Description
GestorGYP es una aplicación web de gestión financiera para **OLO Logistics**. Permite administrar el catálogo de cuentas (GYP), registrar cobros de Cofersa, activar/desactivar cuentas en masa, visualizar dashboards comparativos, gestionar presupuestos, administrar factores de tasa de cambio con conversión de moneda, y organizar los datos en una jerarquía de 4 niveles: **Organización → País → Compañía → Centro de Costo**. Dirigida a administradores financieros y equipos de logística que necesitan control contable eficiente con soporte multi-entidad.

## 2. Page Structure
| Ruta | Página | Descripción |
|------|--------|-------------|
| `/login` | Login | Pantalla de inicio de sesión con email/contraseña |
| `/` | Dashboard | Resumen visual con cards y gráficos comparativos |
| `/catalogo` | Catálogo GYP | Tabla paginada del catálogo de cuentas con CRUD |
| `/cobros-cofersa` | Cobros Cofersa | Registro de cobros con resumen por período |
| `/cuentas-ajustadas` | Asientos Extracontables | Gestión de asientos extracontables con montos mensuales multi-año, fórmulas, vistas GYP, GYP Gerencial, y GYP Proyectada, ID de asiento automático |
| `/presupuestos` | Presupuestos | Carga de presupuestos desde Excel, histórico, cruce con catálogo GYP, CRUD |
| `/activacion-cuentas` | Activación de Cuentas | Gestión masiva de estado activo/inactivo de cuentas |
| `/factores` | Tasas | Gestión de tasas de cambio, gráfico de evolución multi-tipo, conversor colones↔dólares |
| `/historial-cambios` | Historial de Cambios | Registro unificado de todas las modificaciones del sistema (Tasas, Cuentas Ajustadas, Catálogo GYP, Cobros Cofersa) |
| `/configuracion` | Configuración | Ajustes del sistema |

## 3. Core Features
- [x] Autenticación con Supabase (login, logout, rutas protegidas)
- [x] Dashboard con cards KPI y gráfico comparativo 2025 vs 2026
- [x] Catálogo GYP: tabla paginada, búsqueda, filtros, importar Excel, CRUD
- [x] Cobros Cofersa: tabla con filtros, resumen por período, importar Excel, CRUD
- [x] Asientos Extracontables: gestión de asientos con montos mensuales por año, fórmulas, vistas GYP/Gerencial/Proyectada, ID de asiento automático (ASI-XXX)
- [x] Presupuestos: carga de presupuestos desde Excel, histórico, cruce con catálogo GYP, CRUD
- [x] Tasas: CRUD de tasas de cambio, gráfico de evolución con comparación multi-tipo, conversor de moneda, renombrado masivo de tipos, integración con motor de fórmulas
- [x] Historial de Cambios: registro unificado de modificaciones (Tasas, Cuentas Ajustadas, Catálogo GYP, Cobros Cofersa - cuentas y registros), filtros por módulo y búsqueda
- [x] Activación de Cuentas: toggles, acciones masivas, filtros
- [x] Sidebar de navegación con roles (super_admin/admin/editor/viewer)
- [x] Toasts de notificación y estados de carga
- [x] Sistema de países y centros de costo (multi-entidad)
- [x] Sistema de roles y permisos con scope por país/compañía/organización

## 4. Data Model Design

### Table: `organizaciones`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| codigo | varchar(20) | Código de la organización |
| nombre | varchar(200) | Nombre de la organización |
| created_at | timestamptz | Fecha de creación |

### Table: `paises`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| codigo | varchar(5) | Código ISO (ej: CRC) |
| nombre | varchar(100) | Nombre del país |
| moneda | varchar(50) | Moneda local |
| simbolo_moneda | varchar(5) | Símbolo (₡, $) |
| organizacion_id | uuid | FK a organizaciones |
| created_at | timestamptz | Fecha de creación |

### Table: `companias`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| pais_id | uuid | FK a paises |
| codigo | varchar(20) | Código de la compañía |
| nombre | varchar(200) | Nombre de la compañía |
| created_at | timestamptz | Fecha de creación |

### Table: `centros_costos`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| pais_id | uuid | FK a paises |
| compania_id | uuid | FK a companias |
| codigo | varchar(20) | Código del centro |
| nombre | varchar(200) | Nombre del centro |
| created_at | timestamptz | Fecha de creación |

### Table: `factores`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| tipo | varchar(50) | Tasa Acumulada / Tasa Pasada / Tasa Mensual |
| valor | numeric(18,6) | Valor de la tasa |
| fecha | date | Fecha de vigencia |
| descripcion | text | Descripción opcional |
| activa | boolean | Estado activo/inactivo |
| created_at | timestamptz | Fecha de creación |
| updated_at | timestamptz | Fecha de actualización |

### Table: `factores_historico`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| factor_id | uuid | FK a factores |
| valor_anterior | numeric(18,6) | Valor previo (null si es creación) |
| valor_nuevo | numeric(18,6) | Nuevo valor |
| fecha | date | Fecha de vigencia |
| tipo | varchar(50) | Tipo de factor |
| descripcion | text | Motivo del cambio |
| created_at | timestamptz | Fecha del cambio |

### Table: `catalogo_gyp`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| linea | integer | Línea contable |
| grupo | integer | Grupo contable |
| cuenta | varchar(30) | Código único de cuenta |
| descripcion | text | Descripción de la cuenta |
| saldo_normal | varchar(20) | Débito/Crédito |
| comercializadora | varchar(50) | Nombre comercializadora |
| balance_gyp | varchar(10) | Balance |
| clasificacion | varchar(50) | Clasificación principal |
| clasificacion_1 | varchar(50) | Sub-clasificación |
| orden_clasificacion | integer | Orden de clasificación |
| clasificacion_2 | varchar(50) | Segunda clasificación / sub-nivel |
| activa | boolean | Estado activo/inactivo |
| pais_id | uuid | FK a paises |
| centro_costo_id | uuid | FK a centros_costos |
| created_at | timestamptz | Fecha de creación |

### Table: `cobros_cofersa`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| cuenta | varchar(30) | Referencia a cuenta del catálogo |
| descripcion_cobro | text | Descripción del cobro |
| anio | integer | Año del cobro |
| mes | integer | Mes del cobro |
| fecha_factura | date | Fecha de factura |
| monto_usd | numeric(18,4) | Monto en USD |
| tipo_cambio | numeric(10,4) | Tipo de cambio |
| monto_local | numeric(18,2) | Monto en colones |
| categoria | varchar(50) | Categoría del gasto |
| activa | boolean | Estado activo/inactivo |
| pais_id | uuid | FK a paises |
| centro_costo_id | uuid | FK a centros_costos |
| created_at | timestamptz | Fecha de creación |

### Table: `cuentas_ajustadas`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| cuenta_contable | varchar(30) | Código de cuenta |
| descripcion_ajuste | text | Descripción del ajuste |
| tipo_saldo | varchar(20) | Deudor/Acreedor |
| ajuste | numeric(18,2) | Monto de ajuste |
| fecha | date | Fecha |
| vista | varchar(50) | Vista de agrupación |
| categoria_padre | varchar(50) | Categoría padre |
| es_cuenta_padre | boolean | Es cuenta padre |
| activa | boolean | Estado activo/inactivo |
| pais_id | uuid | FK a paises |
| centro_costo_id | uuid | FK a centros_costos |
| created_at | timestamptz | Fecha de creación |

### Table: `cuentas_ajustadas_montos_mensuales`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| cuenta_ajustada_id | uuid | FK a cuentas_ajustadas |
| anio | integer | Año |
| mes | integer | Mes |
| monto | numeric(18,2) | Monto mensual |
| formula | text | Fórmula opcional |
| pais_id | uuid | FK a paises |
| centro_costo_id | uuid | FK a centros_costos |
| created_at | timestamptz | Fecha de creación |

### Table: `presupuestos_cargas`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| nombre | text | Nombre de la carga |
| descripcion | text | Descripción |
| fecha_carga | date | Fecha de carga |
| cantidad_registros | integer | Cantidad de registros |
| total_monto | numeric(18,2) | Total del monto |
| activa | boolean | Estado activo/inactivo |
| pais_id | uuid | FK a paises |
| centro_costo_id | uuid | FK a centros_costos |
| created_at | timestamptz | Fecha de creación |

### Table: `presupuestos_lineas`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| carga_id | uuid | FK a presupuestos_cargas |
| cuenta | text | Código de cuenta |
| anio | integer | Año |
| mes | integer | Mes |
| monto | numeric(18,2) | Monto |
| descripcion_gyp | text | Descripción del catálogo GYP |
| activa | boolean | Estado activo/inactivo |
| pais_id | uuid | FK a paises |
| centro_costo_id | uuid | FK a centros_costos |
| created_at | timestamptz | Fecha de creación |

### Table: `usuarios`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK (referencia a auth.users) |
| nombre | text | Nombre del usuario |
| email | text | Email del usuario |
| rol | varchar(20) | super_admin / admin / editor / viewer |
| pais_id | uuid | FK a paises (scope, nullable) |
| compania_id | uuid | FK a companias (scope, nullable) |
| organizacion_id | uuid | FK a organizaciones (scope, nullable) |
| created_at | timestamptz | Fecha de creación |

### Roles y Permisos
| Rol | Visibilidad | Permisos |
|-----|------------|----------|
| super_admin | Todo (sin filtro) | CRUD completo, gestión de usuarios |
| admin | Su país/compañía/org asignada | CRUD completo en su scope, acceso a Configuración |
| editor | Su scope asignado | Crear y editar, no eliminar |
| viewer | Su scope asignado | Solo lectura |

### Table: `cuentas_ajustadas_historico`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| cuenta_ajustada_id | uuid | FK a cuentas_ajustadas |
| cuenta_contable | varchar(30) | Código de cuenta |
| descripcion_ajuste | text | Descripción del ajuste |
| accion | varchar(20) | creacion / actualizacion / eliminacion |
| cambios | text | Detalle de campos modificados |
| resumen | text | Resumen legible del cambio |
| created_at | timestamptz | Fecha del cambio |

### Table: `catalogo_gyp_historico`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| catalogo_id | text | ID del registro en catalogo_gyp |
| cuenta | text | Código de cuenta |
| descripcion | text | Descripción de la cuenta |
| accion | varchar(20) | creacion / actualizacion / eliminacion |
| cambios | text | Detalle de campos modificados |
| resumen | text | Resumen legible del cambio |
| created_at | timestamptz | Fecha del cambio |

### Table: `cobros_cofersa_historico`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| cobro_id | text | ID del registro en cobros_cofersa |
| cuenta | text | Código de cuenta |
| descripcion_cobro | text | Descripción del cobro |
| anio | integer | Año |
| mes | integer | Mes |
| accion | varchar(20) | creacion / actualizacion / eliminacion |
| cambios | text | Detalle de campos modificados |
| resumen | text | Resumen legible del cambio |
| created_at | timestamptz | Fecha del cambio |

### Table: `cobros_cofersa_cuentas_historico`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK |
| cuenta_cobro_id | text | ID del registro en cobros_cofersa_cuentas |
| cuenta | text | Código de cuenta |
| descripcion_cobro | text | Descripción del cobro |
| accion | varchar(20) | creacion / actualizacion / eliminacion |
| cambios | text | Detalle de campos modificados |
| resumen | text | Resumen legible del cambio |
| created_at | timestamptz | Fecha del cambio |

## 5. Backend / Third-party Integration Plan
- **Supabase**: Autenticación, base de datos PostgreSQL, RLS policies
- **SheetJS/xlsx**: Importar archivos Excel en el frontend
- **Recharts**: Gráficos de barras comparativos

## 6. Development Phase Plan

### Phase 1: Configuración Base + Auth + Layout + Dashboard
- Goal: Estructura base de la app, autenticación mock, sidebar, layout principal, dashboard con mock data
- Deliverable: App navegable con login, sidebar, dashboard visual con cards y gráfico
- Status: Completado

### Phase 2: Catálogo GyP
- Goal: CRUD completo del catálogo de cuentas con tabla paginada, búsqueda, filtros, importar Excel
- Deliverable: Página /catalogo funcional con todas las operaciones
- Status: Completado

### Phase 3: Cobros Cofersa
- Goal: Registro de cobros con tabla, filtros, resumen por período, importar Excel
- Deliverable: Página /cobros-cofersa funcional con resumen y CRUD
- Status: Completado

### Phase 4: Cuentas Ajustadas
- Goal: Gestión de cuentas ajustadas con montos mensuales multi-año, fórmulas, vistas GYP/Gerencial
- Deliverable: Página /cuentas-ajustadas funcional
- Status: Completado

### Phase 5: Presupuestos
- Goal: Carga de presupuestos desde Excel, histórico, cruce con catálogo GYP, CRUD
- Deliverable: Página /presupuestos funcional
- Status: Completado

### Phase 6: Activación de Cuentas
- Goal: Toggles de activación, acciones masivas, filtros
- Deliverable: Página /activacion-cuentas funcional
- Status: Completado

### Phase 7: Integración Supabase
- Goal: Conectar Supabase real, migrar de mock data a datos reales, RLS, auth real
- Deliverable: App completamente funcional con datos reales
- Status: Completado

### Phase 8: Factores y Multi-País
- Goal: Módulo de factores (tasas de cambio), conversor de moneda, soporte multi-país y centros de costo
- Deliverable: Página /factores, integración con motor de fórmulas, columnas pais_id/centro_costo_id en todas las tablas
- Status: Completado

## 7. Mayoreo Adaptation (Phase 9 - Completed)
- Goal: Adaptar GestorGYP para soportar la operación de Mayoreo sobre la misma base multi-entidad
- Deliverables:
  - Nueva organización MAYOREO con países (CRC, VNZ, COL) y 6 empresas (Cofersa, Febeca, Beval, Sillaca, Prisma, Mundial de Partes)
  - Columnas `monto_local` y `monto_usd` en `presupuestos_lineas`
  - Módulo Asientos Extracontables renombrado desde Cuentas Ajustadas (incluye vistas GYP, GYP Gerencial y GYP Proyectada con ID de asiento automático ASI-XXX)
  - Filtros de Organización y Empresa en Presupuestos
  - Edge functions: `cargar-presupuesto-mayoreo-excel`, `cargar-asientos-mayoreo-excel`
  - Extensión de `formulaEngine.ts` con variables de premisas para vista proyectada (FASE EVALUACIÓN)
  - Usuarios Mayoreo: Andrea Ramírez y Richard Mezones (pendientes de invitación Supabase Auth)
- Status: Completado

### Phase 10: Premisas y Vista Proyectada GYP (Completed)
- Goal: Extender el modelo de ajustes con premisas de proyección para Mayoreo
- Deliverables:
  - Tablas `premisas_proyeccion`, `ventas_proyeccion`, `premisas_proyeccion_historico`
  - Vista SQL `gyp_proyectado_consumo` plana para Power BI
  - Tercera vista "GYP Proyectada" en `/cuentas-ajustadas` (junto a GYP y GYP Gerencial)
  - Motor de fórmula extendido con variables `[Venta Actual]`, `[Venta Proyectada]`, `[Semi Neto]`
  - Modal de premisas con cálculo en vivo (valor directo, calculado con % venta / % semi neto / fórmula)
  - Panel de administración de variables de venta (`ventas_proyeccion`) con carga Excel y manual
  - Botón "Recalcular Todo" para re-evaluar premisas contra variables de venta actualizadas
  - Edge function `cargar-premisas-mayoreo-excel`
  - Integración con Historial de Cambios (módulo `premisas-proyeccion`)
  - Todas las decisiones abiertas marcadas con `// CONFIRMAR:` para revisión
- Status: Completed