import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as xlsx from "npm:xlsx@0.18.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MontoMensual {
  cuenta_ajustada_id: string;
  anio: number;
  mes: number;
  monto: number;
  formula: null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const formData = await req.formData();
    const file = formData.get("file");
    const anioParam = formData.get("anio");
    const anio = anioParam ? Number(anioParam) : null;

    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: "No se encontró archivo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(new Uint8Array(buffer), { type: "array" });

    const { data: cuentas, error: cuentasError } = await supabase
      .from("cuentas_ajustadas")
      .select("id, cuenta_contable")
      .eq("vista", "GYP Gerencial");

    if (cuentasError) throw cuentasError;
    const cuentaMap = new Map<string, string>();
    cuentas?.forEach((c: { cuenta_contable: string; id: string }) => cuentaMap.set(c.cuenta_contable, c.id));

    const meses = [
      "Ene", "Feb", "Mar", "Abr", "May", "Jun",
      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
    ];

    let targetYear = anio;
    if (!targetYear) {
      const match = file.name.match(/\b20(\d{2})\b/);
      if (match) {
        targetYear = 2000 + Number(match[1]);
      } else {
        for (const name of workbook.SheetNames) {
          const sheetMatch = name.match(/\b(20\d{2})\b/);
          if (sheetMatch) {
            targetYear = Number(sheetMatch[1]);
            break;
          }
        }
      }
    }

    if (!targetYear) {
      return new Response(
        JSON.stringify({ error: "No se pudo determinar el año. Pasá el parámetro 'anio'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sheetNames = workbook.SheetNames;
    const possibleNames = [
      `resumen ${targetYear}`,
      `cobro a Cofersa ${targetYear}`,
      `Cofersa ${targetYear}`,
      `Hoja2`,
    ];
    let targetSheet = sheetNames.find((n) =>
      possibleNames.some((pn) => n.toLowerCase().includes(pn.toLowerCase()) || pn.toLowerCase().includes(n.toLowerCase()))
    );
    if (!targetSheet) {
      targetSheet = sheetNames[0];
    }

    const sheet = workbook.Sheets[targetSheet];
    const json = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const toInsert: MontoMensual[] = [];
    const notFound: string[] = [];
    const found: string[] = [];
    let rowsProcessed = 0;

    for (const row of json as Record<string, unknown>[]) {
      const cuentaCode = String(row["Cuenta"] || row["cuenta"] || row["Cuenta Contable"] || row["cta"] || "").trim();
      if (!cuentaCode || !/^\d+(\.\d+)*$/.test(cuentaCode)) continue;

      const cuentaId = cuentaMap.get(cuentaCode);
      if (!cuentaId) {
        notFound.push(cuentaCode);
        continue;
      }

      found.push(cuentaCode);
      rowsProcessed++;

      for (let mes = 1; mes <= 12; mes++) {
        const mesLabel = meses[mes - 1];
        const possibleKeys = [
          `${mesLabel}-${String(targetYear).slice(-2)}`,
          `${mesLabel}-${String(targetYear).slice(-2)}`,
          mesLabel,
          `${mesLabel} ${targetYear}`,
        ];

        let monto = 0;
        for (const key of possibleKeys) {
          const val = row[key];
          if (val !== "" && val !== null && val !== undefined) {
            const num = typeof val === "number" ? val : Number(String(val).replace(/,/g, ""));
            if (!isNaN(num)) {
              monto = num;
              break;
            }
          }
        }

        if (monto !== 0) {
          toInsert.push({
            cuenta_ajustada_id: cuentaId,
            anio: targetYear,
            mes,
            monto,
            formula: null,
          });
        }
      }
    }

    const BATCH = 200;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error } = await supabase
        .from("cuentas_ajustadas_montos_mensuales")
        .upsert(batch, { onConflict: "cuenta_ajustada_id,anio,mes" });
      if (error) {
        console.error("Error batch:", error);
      } else {
        inserted += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        year: targetYear,
        sheet: targetSheet,
        rowsProcessed,
        inserted,
        found: [...new Set(found)],
        notFound: [...new Set(notFound)],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});