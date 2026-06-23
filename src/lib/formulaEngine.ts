/**
 * Motor de evaluación de fórmulas para montos mensuales de GYP Gerencial.
 * Las fórmulas son expresiones matemáticas donde los códigos de cuenta
 * (ej: 7.1.1.01.1.005) se sustituyen por el monto de esa cuenta en el
 * mismo (anio, mes).
 *
 * También soporta referencias a categorías usando corchetes:
 *   [Gastos varios] → total de la categoría "Gastos varios" en ese (anio, mes)
 *
 * Ejemplo de fórmula:
 *   7.1.1.01.1.005 * 0.5 + [Gastos varios] - 1500
 *
 * === EXTENSIÓN PREMISAS - VISTA PROYECTADA ===
 * Variables nuevas disponibles en el contexto de fórmula:
 *   [Venta Actual]       → total de ventas del período actual
 *   [Venta Proyectada]    → total de ventas proyectadas del período
 *   [Semi Neto]           → semi neto del período
 *
 * Orden de resolución de un [Nombre]:
 *   1. Variables (venta_actual, venta_proyectada, semi_neto)
 *   2. Factores (ej: [Tasa Acumulada])
 *   3. CategoriaTotales (ej: [Gastos varios])
 *
 * Las premisas se administran por: País, Empresa, Cuenta contable, Periodo
 * y Centro de costo (opcional). Tipos: valor en USD, % de venta, % del semi neto.
 */

const CUENTA_PATTERN = /\b(\d+(?:\.\d+)+)\b/g;
const CATEGORIA_PATTERN = /\[([^\]]+)\]/g;

export interface FormulaContext {
  anio: number;
  mes: number;
  /** Mapa: cuenta_contable -> monto para el (anio, mes) dado */
  saldos: Map<string, number>;
  /** Mapa: nombre_categoria -> total de esa categoría para el (anio, mes) dado */
  categoriaTotales: Map<string, number>;
  /** Mapa: nombre_factor -> valor del factor (ej: "Tasa Acumulada" -> 530.25) */
  factores?: Map<string, number>;
  // === EXTENSIÓN PREMISAS - VISTA PROYECTADA ===
  /** Variables genéricas disponibles para fórmulas (venta_actual, venta_proyectada, semi_neto, etc.) */
  variables?: Map<string, number>;
}

/**
 * Evalúa una fórmula y devuelve el monto calculado.
 * Si la fórmula es nula, vacía, o no contiene referencias a cuentas,
 * devuelve null indicando que es un monto manual.
 *
 * Soporta:
 * - Referencias a cuentas: 7.1.1.01.1.005 * 0.5
 * - Referencias a categorías: [Gastos varios] * 0.3
 * - Referencias a factores: [Tasa Acumulada] * 100
 * - Variables de premisas: [Venta Actual], [Venta Proyectada], [Semi Neto]
 */
export function evaluarFormula(formula: string | null, ctx: FormulaContext): number | null {
  if (!formula || !formula.trim()) return null;

  let expr = formula.trim();

  // Paso 1: Sustituir referencias de categoría [Nombre Categoría] por su valor
  // Orden de resolución: variables → factores → categorias
  const categoriasReferenciadas = new Set<string>();
  let catMatch: RegExpExecArray | null;
  const catRegex = new RegExp(CATEGORIA_PATTERN.source, 'g');
  while ((catMatch = catRegex.exec(expr)) !== null) {
    categoriasReferenciadas.add(catMatch[1].trim());
  }

  for (const nombre of categoriasReferenciadas) {
    let resolved = false;

    // 1. Intentar como variable de premisa
    if (ctx.variables) {
      const varVal = ctx.variables.get(nombre);
      if (varVal !== undefined) {
        const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expr = expr.replace(new RegExp('\\[' + escaped + '\\]', 'g'), String(varVal));
        resolved = true;
      }
    }

    // 2. Intentar como factor
    if (!resolved) {
      const factorValor = ctx.factores?.get(nombre);
      if (factorValor !== undefined) {
        const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expr = expr.replace(new RegExp('\\[' + escaped + '\\]', 'g'), String(factorValor));
        resolved = true;
      }
    }

    // 3. Intentar como categoría
    if (!resolved) {
      const total = ctx.categoriaTotales.get(nombre) ?? 0;
      const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expr = expr.replace(new RegExp('\\[' + escaped + '\\]', 'g'), String(total));
    }
  }

  // Paso 2: Sustituir referencias de cuentas contables por sus montos
  const cuentasReferenciadas = new Set<string>();
  let match: RegExpExecArray | null;
  const cuentaRegex = new RegExp(CUENTA_PATTERN.source, 'g');
  while ((match = cuentaRegex.exec(expr)) !== null) {
    cuentasReferenciadas.add(match[1]);
  }

  if (categoriasReferenciadas.size === 0 && cuentasReferenciadas.size === 0) {
    try {
      return safeEval(expr);
    } catch {
      return null;
    }
  }

  for (const cuenta of cuentasReferenciadas) {
    const monto = ctx.saldos.get(cuenta) ?? 0;
    const escaped = cuenta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expr = expr.replace(new RegExp(escaped, 'g'), String(monto));
  }

  try {
    return safeEval(expr);
  } catch {
    return null;
  }
}

/**
 * Calcula el valor_proyectado de una premisa según su método y variables de venta.
 * Expone la lógica de cálculo para que pueda reutilizarse en UI (preview en vivo) y al guardar.
 */
export function calcularValorProyectado(params: {
  metodo: 'valor_directo' | 'calculado';
  valor_dolar: number | null;
  pct_venta: number | null;
  base_venta: 'actual' | 'proyectada' | null;
  pct_semineto: number | null;
  formula: string | null;
  venta_actual: number;
  venta_proyectada: number;
  semi_neto: number;
  ctx?: FormulaContext;
}): number {
  const { metodo, valor_dolar, pct_venta, base_venta, pct_semineto, formula, venta_actual, venta_proyectada, semi_neto, ctx } = params;

  // Si hay fórmula, tiene prioridad — el motor la evalúa
  if (formula && formula.trim() && ctx) {
    const result = evaluarFormula(formula, ctx);
    if (result !== null) return result;
  }

  if (metodo === 'valor_directo') {
    return valor_dolar ?? 0;
  }

  // calculado
  const base = base_venta === 'proyectada' ? venta_proyectada : venta_actual;

  let result = (valor_dolar ?? 0);
  if (pct_venta && pct_venta !== 0) {
    result += base * pct_venta;
  }
  if (pct_semineto && pct_semineto !== 0) {
    result += semi_neto * pct_semineto;
  }

  return result;
}

/**
 * Evalúa una expresión aritmética simple de forma segura.
 * Solo permite números, operadores básicos, paréntesis y espacios.
 */
function safeEval(expr: string): number {
  const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
  if (!sanitized.trim()) return 0;

  const fn = new Function(`return (${sanitized})`);
  const result = fn();

  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Resultado inválido');
  }

  return result;
}

/** Extrae los nombres de categoría referenciados en una fórmula (formato [Nombre Categoría]) */
export function extraerCategoriasReferenciadas(formula: string | null): string[] {
  if (!formula) return [];
  const categorias = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(CATEGORIA_PATTERN.source, 'g');
  while ((match = regex.exec(formula)) !== null) {
    categorias.add(match[1].trim());
  }
  return Array.from(categorias);
}

/** Extrae los códigos de cuenta referenciados en una fórmula */
export function extraerCuentasReferenciadas(formula: string | null): string[] {
  if (!formula || !formula.trim()) return [];
  const cuentas = new Set<string>();
  let match: RegExpExecArray | null;
  const cuentaRegex = new RegExp(CUENTA_PATTERN.source, 'g');
  while ((match = cuentaRegex.exec(formula.trim())) !== null) {
    cuentas.add(match[1]);
  }
  return Array.from(cuentas);
}