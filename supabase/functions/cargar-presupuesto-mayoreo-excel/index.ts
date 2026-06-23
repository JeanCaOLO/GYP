import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAYOREO_ORG_ID = "212da5b6-1fb3-4e65-bb47-3869cf5257cf";

function parseExcelDate(val: unknown): { anio: number; mes: number } | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    const anio = val.getUTCFullYear();
    const mes = val.getUTCMonth() + 1;
    if (mes < 1 || mes > 12) return null;
    return { anio, mes };
  }
  const str = String(val).trim();
  const serial = Number(str);
  if (!isNaN(serial) && serial > 1000 && serial < 60000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    const anio = date.getUTCFullYear();
    const mes = date.getUTCMonth() + 1;
    if (mes < 1 || mes > 12) return null;
    return { anio, mes };
  }
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    if (isNaN(a) || isNaN(b) || isNaN(c)) return null;
    if (a > 31) {
      if (b < 1 || b > 12) return null;
      return { anio: a, mes: b };
    }
    const mm = a;
    let yy = c;
    if (mm < 1 || mm > 12) return null;
    if (yy < 50) yy += 2000; else if (yy < 100) yy += 1900;
    return { anio: yy, mes: mm };
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
  return null;
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let fileBuffer: ArrayBuffer;
    let fileName = "presupuesto_mayoreo.xlsx";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) throw new Error("No file provided in form-data");
      fileBuffer = await file.arrayBuffer();
      fileName = file.name;
    } else {
      const body = await req.json();
      if (body.fileUrl) {
        const response = await fetch(body.fileUrl);
        if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
        fileBuffer = await response.arrayBuffer();
        fileName = body.fileName || fileName;
      } else if (body.fileBase64) {
        const base64 = body.fileBase64.replace(/^data:[^;]+;base64,/, "");
        fileBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
        fileName = body.fileName || fileName;
      } else {
        throw new Error("No file provided. Send fileUrl, fileBase64, or multipart file.");
      }
    }

    const XLSX = await import("https://esm.sh/xlsx@0.18.5");
    const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

    // Pre-load lookup maps
    const [catRes, compRes, paisRes, ccRes] = await Promise.all([
      supabase.from("catalogo_gyp").select("cuenta, descripcion").eq("activa", true),
      supabase.from("companias").select("id, nombre"),
      supabase.from("paises").select("id, codigo, nombre"),
      supabase.from("centros_costos").select("id, nombre"),
    ]);

    const catalogoMap = new Map<string, string>();
    (catRes.data || []).forEach((c) => catalogoMap.set(c.cuenta, c.descripcion));

    const companiaMap = new Map<string, string>();
    (compRes.data || []).forEach((c) => { companiaMap.set(c.nombre.toUpperCase(), c.id); companiaMap.set(c.id.slice(0, 8), c.id); });

    const paisMap = new Map<string, string>();
    (paisRes.data || []).forEach((p) => { paisMap.set(p.codigo.toUpperCase(), p.id); paisMap.set(p.nombre.toUpperCase(), p.id); });

    const ccMap = new Map<string, string>();
    (ccRes.data || []).forEach((c) => { ccMap.set(c.nombre.toUpperCase(), c.id); });

    const map = new Map<string, {
      cuenta: string; anio: number; mes: number; monto: number;
      monto_local: number; monto_usd: number; descripcion_gyp: string;
      pais_id: string | null; compania_id: string | null; centro_costo_id: string | null;
    }>();
    let skipped = 0;
    let notInCatalogo = 0;

    for (const row of json) {
      const getVal = (...keys: string[]) => {
        for (const k of keys) { if (k in row && row[k] !== '' && row[k] !== null && row[k] !== undefined) return row[k]; }
        return '';
      };

      const cuenta = String(getVal("Cuenta", "cuenta", "CUENTA", "Cuenta contable", "CUENTA_CONTABLE") || "").trim();
      const fecha = getVal("Fecha", "fecha", "FECHA", "Periodo", "PERIODO");
      const montoLocalRaw = Number(getVal("Monto Local", "monto_local", "MONTO_LOCAL", "Presupuesto Local", "Monto", "MONTO", "monto") || 0);
      const montoUsdRaw = Number(getVal("Monto USD", "monto_usd", "MONTO_USD", "Presupuesto USD", "Monto Dolar", "MONTO_DOLAR") || 0);
      const empresa = String(getVal("Empresa", "empresa", "EMPRESA") || "").trim();
      const pais = String(getVal("Pais", "pais", "PAIS", "País", "PAÍS") || "").trim();
      const cc = String(getVal("Centro Costo", "centro_costo", "CENTRO_COSTO", "Centro de Costo", "CC") || "").trim();

      if (!cuenta || !fecha) { skipped++; continue; }
      const parsed = parseExcelDate(fecha);
      if (!parsed) { skipped++; continue; }

      const descGyp = catalogoMap.get(cuenta) || "";
      if (!descGyp) notInCatalogo++;

      const montoLocal = isNaN(montoLocalRaw) ? 0 : montoLocalRaw;
      const montoUsd = isNaN(montoUsdRaw) ? 0 : montoUsdRaw;

      const companiaId = companiaMap.get(empresa.toUpperCase()) || null;
      const paisId = paisMap.get(pais.toUpperCase()) || null;
      const ccId = ccMap.get(cc.toUpperCase()) || null;

      const key = `${cuenta}|${parsed.anio}|${parsed.mes}|${empresa}`;
      map.set(key, {
        cuenta, anio: parsed.anio, mes: parsed.mes,
        monto: montoLocal, monto_local: montoLocal, monto_usd: montoUsd,
        descripcion_gyp: descGyp,
        pais_id: paisId, compania_id: companiaId, centro_costo_id: ccId,
      });
    }

    const rows = Array.from(map.values());
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No valid rows" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const totalMonto = rows.reduce((s, r) => s + r.monto, 0);

    const { data: cargaData, error: cargaError } = await supabase
      .from("presupuestos_cargas")
      .insert({
        nombre: fileName.replace(/\.[^/.]+$/, ""),
        descripcion: `Mayoreo. ${rows.length} registros. ${notInCatalogo} cuentas no en catálogo.`,
        cantidad_registros: rows.length,
        total_monto: totalMonto,
        organizacion_id: MAYOREO_ORG_ID,
      })
      .select("id").single();

    if (cargaError || !cargaData) throw new Error(cargaError?.message || "Error creating carga");

    const cargaId = cargaData.id;
    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
        ...r, carga_id: cargaId, organizacion_id: MAYOREO_ORG_ID,
      }));
      const { error } = await supabase.from("presupuestos_lineas").insert(batch);
      if (error) console.error("Batch error:", error);
      else inserted += batch.length;
    }

    // Registrar en historial
    await supabase.from("presupuestos_cargas_historico").insert({
      carga_id: cargaId,
      nombre: fileName.replace(/\.[^/.]+$/, ""),
      accion: "IMPORTAR",
      resumen: `Carga Mayoreo desde Excel. ${rows.length} registros, ${inserted} insertados, ${skipped} omitidos, ${notInCatalogo} sin catálogo.`,
      cambios: `total_monto: ${totalMonto}`,
      organizacion_id: MAYOREO_ORG_ID,
    });

    return new Response(JSON.stringify({
      success: true, cargaId, totalRows: rows.length, inserted, skipped, notInCatalogo, totalMonto,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
