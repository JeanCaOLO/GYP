import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAYOREO_ID = "212da5b6-1fb3-4e65-bb47-3869cf5257cf";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // Create Supabase admin client with service_role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const users = [
      { email: "aramirez@mayoreo.biz", nombre: "Andrea Ramírez", rol: "editor" },
      { email: "rmezones@mayoreo.biz", nombre: "Richard Mezones", rol: "editor" },
    ];

    const results = [];

    for (const u of users) {
      // First check if auth user already exists
      const { data: existingAuth } = await supabaseAdmin.auth.admin.listUsers();
      const found = existingAuth?.users?.find(
        (au: { email?: string }) => au.email === u.email
      );

      let authId: string;

      if (found) {
        authId = found.id;
        // Update usuarios record if it exists, create if not
        const { data: existingProfile } = await supabaseAdmin
          .from("usuarios")
          .select("id")
          .eq("id", authId)
          .maybeSingle();

        if (existingProfile) {
          await supabaseAdmin
            .from("usuarios")
            .update({ rol: u.rol, organizacion_id: MAYOREO_ID, nombre: u.nombre })
            .eq("id", authId);
        } else {
          await supabaseAdmin
            .from("usuarios")
            .insert({ id: authId, email: u.email, nombre: u.nombre, rol: u.rol, organizacion_id: MAYOREO_ID });
        }
        results.push({ email: u.email, status: "updated", authId });
      } else {
        // Create auth user with temp password
        const tempPassword = crypto.randomUUID().slice(0, 16);
        const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email: u.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { nombre: u.nombre },
        });

        if (createErr) {
          results.push({ email: u.email, status: "error", error: createErr.message });
          continue;
        }

        authId = newUser.user.id;

        // Create usuarios profile
        await supabaseAdmin
          .from("usuarios")
          .insert({ id: authId, email: u.email, nombre: u.nombre, rol: u.rol, organizacion_id: MAYOREO_ID });

        // Send password reset so they can set their own password
        await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: u.email,
        });

        results.push({ email: u.email, status: "created", authId, tempPassword });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});