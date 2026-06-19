import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async () => {
  try {
    const EXCEL_URL = "https://storage.readdy-site.link/project_files/bd8e6ef3-ad62-4f45-9069-921b2cd07414/b3c77601-c764-49d7-a81f-21a5a8d408f3_Presupuesto-GyP.xlsx?v=fe4ce40b453843263c2584f06bda138d";
    const response = await fetch(EXCEL_URL);
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Download failed: ${response.status}` }), { status: 500 });
    }
    const buffer = await response.arrayBuffer();
    return new Response(JSON.stringify({ size: buffer.byteLength }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});