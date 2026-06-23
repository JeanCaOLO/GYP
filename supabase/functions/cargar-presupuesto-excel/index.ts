import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EXCEL_URL = "https://storage.readdy-site.link/project_files/bd8e6ef3-ad62-4f45-9069-921b2cd07414/b3c77601-c764-49d7-a81f-21a5a8d408f3_Presupuesto-GyP.xlsx?v=fe4ce40b453843263c2584f06bda138d";

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
  if (!isNaN(d.getTime())) {
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
  }
  return null;
}

serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const response = await fetch(EXCEL_URL);
    if (!response.ok) {
      throw new Error(`Failed to download Excel: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();

    const XLSX = await import("https://esm.sh/xlsx@0.18.5");
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

    const { data: catData } = await supabase
      .from("catalogo_gyp")
      .select("cuenta, descripcion")
      .eq("activa", true);

    const catalogoMap = new Map<string, string>();
    (catData || []).forEach((c) => catalogoMap.set(c.cuenta, c.descripcion));

    const map = new Map<string, { cuenta: string; anio: number; mes: number; monto: number; descripcion_gyp: string }>();
    let skipped = 0;
    let notInCatalogo = 0;

    for (const row of json) {
      const cuenta = String(row["Cuenta"] || row["cuenta"] || row["CUENTA"] || "").trim();
      const fecha = row["Fecha"] || row["fecha"] || row["FECHA"] || "";
      const montoRaw = row["Monto"] || row["monto"] || row["MONTO"] || 0;
      const monto = Number(montoRaw);
      if (!cuenta || !fecha) { skipped++; continue; }
      const parsed = parseExcelDate(fecha);
      if (!parsed) { skipped++; continue; }
      const descGyp = catalogoMap.get(cuenta) || "";
      if (!descGyp) notInCatalogo++;
      const key = `${cuenta}|${parsed.anio}|${parsed.mes}`;
      map.set(key, {
        cuenta,
        anio: parsed.anio,
        mes: parsed.mes,
        monto: isNaN(monto) ? 0 : monto,
        descripcion_gyp: descGyp,
      });
    }

    const rows = Array.from(map.values());
    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows found. Verify column names: Cuenta, Fecha, Monto" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const totalMonto = rows.reduce((s, r) => s + r.monto, 0);

    const { data: cargaData, error: cargaError } = await supabase
      .from("presupuestos_cargas")
      .insert({
        nombre: "Presupuesto GyP.xlsx",
        descripcion: `Importado desde Excel adjunto. ${rows.length} registros. ${notInCatalogo} cuentas no encontradas en catálogo GYP.`,
        cantidad_registros: rows.length,
        total_monto: totalMonto,
      })
      .select("id")
      .single();

    if (cargaError || !cargaData) {
      throw new Error(cargaError?.message || "Error creating carga");
    }

    const cargaId = cargaData.id;

    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, carga_id: cargaId }));
      const { error } = await supabase.from("presupuestos_lineas").insert(batch);
      if (error) {
        console.error("Batch error:", error);
      } else {
        inserted += batch.length;
      }
    }

    // Registrar en historial
    await supabase.from("presupuestos_cargas_historico").insert({
      carga_id: cargaId,
      nombre: "Presupuesto GyP.xlsx",
      accion: "IMPORTAR",
      resumen: `Carga automática desde Excel. ${rows.length} registros, ${inserted} insertados, ${skipped} omitidos, ${notInCatalogo} sin catálogo.`,
      cambios: `total_monto: ${totalMonto}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        cargaId,
        totalRows: rows.length,
        inserted,
        skipped,
        notInCatalogo,
        totalMonto,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
