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
 */
export function evaluarFormula(formula: string | null, ctx: FormulaContext): number | null {
  if (!formula || !formula.trim()) return null;

  let expr = formula.trim();

  // Paso 1: Sustituir referencias de categoría [Nombre Categoría] por su total
  const categoriasReferenciadas = new Set<string>();
  let catMatch: RegExpExecArray | null;
  const catRegex = new RegExp(CATEGORIA_PATTERN.source, 'g');
  while ((catMatch = catRegex.exec(expr)) !== null) {
    categoriasReferenciadas.add(catMatch[1].trim());
  }

  // Primero intentar resolver como factor, luego como categoría
  for (const nombre of categoriasReferenciadas) {
    const factorValor = ctx.factores?.get(nombre);
    if (factorValor !== undefined) {
      const escaped = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expr = expr.replace(new RegExp('\\[' + escaped + '\\]', 'g'), String(factorValor));
    } else {
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
    // Expresión puramente numérica como "100 * 2 + 50"
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
 * Evalúa una expresión aritmética simple de forma segura.
 * Solo permite números, operadores básicos, paréntesis y espacios.
 */
function safeEval(expr: string): number {
  // Sanitizar: solo permitir caracteres seguros
  const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, '');
  if (!sanitized.trim()) return 0;

  // Usar Function en vez de eval para aislar el scope
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