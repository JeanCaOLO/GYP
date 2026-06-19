
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async () => {
  try {
    // Drop old index
    const { error: dropError } = await supabase.rpc("exec_sql", {
      sql: "DROP INDEX IF EXISTS idx_cuentas_ajustadas_cuenta_desc;"
    });
    if (dropError) console.error("Drop error:", dropError);

    // Create new index
    const { error: createError } = await supabase.rpc("exec_sql", {
      sql: "CREATE UNIQUE INDEX IF NOT EXISTS idx_cuentas_ajustadas_cuenta_vista ON public.cuentas_ajustadas (cuenta_contable, vista) WHERE vista IS NOT NULL AND vista != '';"
    });
    if (createError) console.error("Create error:", createError);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
