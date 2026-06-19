import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const sql = `
      DROP INDEX IF EXISTS idx_cuentas_ajustadas_cuenta_vista;
      CREATE UNIQUE INDEX idx_cuentas_ajustadas_cuenta_vista 
        ON public.cuentas_ajustadas USING btree (cuenta_contable, vista) 
        WHERE ((vista IS NOT NULL) AND (vista <> ''::text) AND (vista <> 'GYP Gerencial'));
    `;
    
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    
    return new Response(
      JSON.stringify({ ok: true, status: res.status }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});