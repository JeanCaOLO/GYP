import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { fileUrl, fileBase64, organizacion_id, pais_id, compania_id } = await req.json();

    let fileData: Uint8Array;
    if (fileBase64) {
      fileData = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    } else if (fileUrl) {
      const resp = await fetch(fileUrl);
      fileData = new Uint8Array(await resp.arrayBuffer());
    } else {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dynamic import for xlsx
    const XLSX = await import("https://esm.sh/xlsx@0.18.5");
    const workbook = XLSX.read(fileData, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

    const getVal = (row: Record<string, unknown>, ...keys: string[]) => {
      for (const key of keys) {
        if (key in row && row[key] !== "" && row[key] !== null && row[key] !== undefined) return row[key];
      }
      return "";
    };

    const rows = json.map((row) => {
      const cuenta = String(getVal(row, "Cuenta", "cuenta", "CUENTA_CONTABLE", "cuenta_contable") || "").trim();
      const anio = Number(getVal(row, "Año", "Anio", "anio", "ANO", "Periodo") || new Date().getFullYear());
      const mes = Number(getVal(row, "Mes", "mes", "MES") || 1);
      const metodoVal = String(getVal(row, "Metodo", "metodo", "METODO", "Tipo") || "valor_directo").trim().toLowerCase();
      const valorDolar = parseFloat(String(getVal(row, "Valor USD", "valor_dolar", "Valor", "VALOR") || ""));
      const pctVenta = parseFloat(String(getVal(row, "% Venta", "pct_venta", "Porcentaje", "PCT_VENTA") || ""));
      const baseVenta = String(getVal(row, "Base Venta", "base_venta", "BASE", "Base") || "actual").trim().toLowerCase();
      const pctSemiNeto = parseFloat(String(getVal(row, "% Semi Neto", "pct_semineto", "PCT_SEMI_NETO", "SN") || ""));
      const formula = String(getVal(row, "Formula", "formula", "FORMULA") || "").trim();

      if (!cuenta || isNaN(anio) || isNaN(mes)) return null;

      return {
        cuenta_contable: cuenta,
        anio,
        mes,
        organizacion_id: organizacion_id || null,
        pais_id: pais_id || null,
        compania_id: compania_id || null,
        metodo: metodoVal === "calculado" ? "calculado" : "valor_directo",
        valor_dolar: isNaN(valorDolar) ? null : valorDolar,
        pct_venta: isNaN(pctVenta) ? null : pctVenta,
        base_venta: baseVenta === "proyectada" ? "proyectada" : null,
        pct_semineto: isNaN(pctSemiNeto) ? null : pctSemiNeto,
        formula: formula || null,
        valor_proyectado: isNaN(valorDolar) ? 0 : valorDolar,
        activa: true,
      };
    }).filter(Boolean);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "No valid records found" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await supabaseClient.from("premisas_proyeccion").insert(rows);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});