import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for browser compatibility
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper function to create response with CORS headers
function corsResponse(body: string, status: number = 200, additionalHeaders: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...additionalHeaders,
    },
  });
}

serve(async (req) => {
  console.log("[TIMEOUT-REQUEUE] Function invoked", new Date().toISOString());

  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return corsResponse("", 200);
  }

  try {
    // Initialize Supabase client with service role key (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Call the SQL function to process timed out tasks
    const { data, error } = await supabase.rpc("process_timed_out_tasks");

    if (error) {
      console.error("[TIMEOUT-REQUEUE] Error calling process_timed_out_tasks:", error);
      return corsResponse(
        JSON.stringify({ success: false, error: error.message }),
        500
      );
    }

    console.log("[TIMEOUT-REQUEUE] Successfully processed timed out tasks:", data);
    return corsResponse(JSON.stringify({ success: true }), 200);
  } catch (error: any) {
    console.error("[TIMEOUT-REQUEUE] Unexpected error:", error);
    return corsResponse(
      JSON.stringify({ success: false, error: error?.message || "Unknown error" }),
      500
    );
  }
});
