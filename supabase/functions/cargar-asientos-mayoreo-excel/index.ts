import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MAYOREO_ORG_ID = "212da5b6-1fb3-4e65-bb47-3869cf5257cf";

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let fileBuffer: ArrayBuffer;
    let fileName = "asientos_mayoreo.xlsx";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) throw new Error("No file provided");
      fileBuffer = await file.arrayBuffer();
      fileName = file.name;
    } else {
      const body = await req.json();
      if (body.fileUrl) {
        const response = await fetch(body.fileUrl);
        if (!response.ok) throw new Error(`Download failed: ${response.status}`);
        fileBuffer = await response.arrayBuffer();
      } else if (body.fileBase64) {
        const base64 = body.fileBase64.replace(/^data:[^;]+;base64,/, "");
        fileBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
      } else {
        throw new Error("No file provided");
      }
    }

    const XLSX = await import("https://esm.sh/xlsx@0.18.5");
    const workbook = XLSX.read(fileBuffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

    const getVal = (row: Record<string, unknown>, ...keys: string[]) => {
      for (const k of keys) { if (k in row && row[k] !== '' && row[k] !== null && row[k] !== undefined) return row[k]; }
      return '';
    };

    const rows = json.map((row) => ({
      asiento: String(getVal(row, "ASIENTO", "Asiento", "asiento") || ""),
      consecutivo: String(getVal(row, "CONSECUTIVO", "Consecutivo", "consecutivo") || ""),
      nit: String(getVal(row, "NIT", "Nit", "nit") || ""),
      centro_costo: String(getVal(row, "CENTRO_COSTO", "Centro_Costo", "centro_costo", "Centro Costo") || ""),
      cuenta_contable: String(getVal(row, "CUENTA_CONTABLE", "Cuenta_Contable", "cuenta_contable", "Cuenta Contable") || ""),
      fuente: String(getVal(row, "FUENTE", "Fuente", "fuente") || ""),
      referencia: String(getVal(row, "REFERENCIA", "Referencia", "referencia") || ""),
      debito_local: Number(getVal(row, "DEBITO_LOCAL", "Debito_Local", "debito_local", "Debito Local") || 0),
      credito_local: Number(getVal(row, "CREDITO_LOCAL", "Credito_Local", "credito_local", "Credito Local") || 0),
      debito_dolar: Number(getVal(row, "DEBITO_DOLAR", "Debito_Dolar", "debito_dolar", "Debito Dolar") || 0),
      credito_dolar: Number(getVal(row, "CREDITO_DOLAR", "Credito_Dolar", "credito_dolar", "Credito Dolar") || 0),
      fecha: getVal(row, "FECHA", "Fecha", "fecha") ? String(getVal(row, "FECHA", "Fecha", "fecha")).substring(0, 10) : null,
      empresa: String(getVal(row, "EMPRESA", "Empresa", "empresa") || ""),
      paquete: String(getVal(row, "PAQUETE", "Paquete", "paquete") || ""),
    })).filter((r) => r.cuenta_contable);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No valid rows" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const totDL = rows.reduce((s, r) => s + r.debito_local, 0);
    const totCL = rows.reduce((s, r) => s + r.credito_local, 0);
    const totDD = rows.reduce((s, r) => s + r.debito_dolar, 0);
    const totCD = rows.reduce((s, r) => s + r.credito_dolar, 0);

    const { data: carga, error: cargaErr } = await supabase
      .from("asientos_extracontables_cargas")
      .insert({
        nombre: fileName.replace(/\.[^/.]+$/, ""),
        descripcion: `Mayoreo. ${rows.length} registros.`,
        cantidad_registros: rows.length,
        total_debito_local: totDL, total_credito_local: totCL,
        total_debito_dolar: totDD, total_credito_dolar: totCD,
        organizacion_id: MAYOREO_ORG_ID,
      }).select("id").single();

    if (cargaErr || !carga) throw new Error(cargaErr?.message || "Error creating carga");

    const cargaId = carga.id;

    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, carga_id: cargaId, organizacion_id: MAYOREO_ORG_ID }));
      await supabase.from("asientos_extracontables_lineas").insert(batch);
    }

    await supabase.from("asientos_extracontables_historico").insert({
      carga_id: cargaId, nombre: fileName, accion: "creacion",
      resumen: `Carga Mayoreo: ${rows.length} registros`,
    });

    return new Response(JSON.stringify({ success: true, cargaId, totalRows: rows.length }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});