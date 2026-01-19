import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !anonKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // ❗ ONLY ALLOW GET (temporary isolation)
    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { 
          status: 405, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    // Use anon key (respects RLS policies)
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const result = await supabase
      .from("errand_categories")
      .select("code, name")
      .eq("is_active", true)
      .order("order");

    // ✅ SAFE ERROR HANDLING (NO .error access on undefined)
    if (!result || result.error) {
      return new Response(
        JSON.stringify({
          error: "Database query failed",
          details: result?.error?.message ?? "Unknown error",
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({ categories: result.data ?? [] }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "Unhandled exception",
        details: e instanceof Error ? e.message : String(e),
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
