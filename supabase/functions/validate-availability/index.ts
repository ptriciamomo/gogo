// Deno Edge Function.
// VS Code TypeScript errors about URL imports and Deno globals are expected.
// DO NOT refactor to Node style.
//
// 📊 LOGS LOCATION:
// View Edge Function logs in: Supabase Dashboard → Functions → validate-availability → Logs
//
// 🧪 TEST SNIPPET (for local testing only):
// const { data, error } = await supabase.functions.invoke(
//   "validate-availability",
//   {
//     body: {
//       runner_id: "TEST_RUNNER_ID",
//       latitude: 7.0901,
//       longitude: 125.6063,
//     },
//   }
// );
// console.log("FUNCTION DATA:", data);
// console.log("FUNCTION ERROR:", error);
//
// EXPECTED BEHAVIOR:
// - Inside UM Matina:  HTTP 200, { allowed: true }
// - Outside UM Matina: HTTP 200, { allowed: false, reason: "..." }
// - Missing lat/lon:   HTTP 400, { error: "...", details: "..." }
// - Invalid numbers:   HTTP 400, { error: "...", details: "..." }
// Note: Geofence rejection (allowed: false) returns HTTP 200, NOT an error.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { canRunnerBeAvailable } from "../_shared/geofence.logic.ts";

// 🧪 TEMPORARY TESTING FLAG - Set to false to restore geofence validation
const DISABLE_GEOFENCING_FOR_TESTING = true;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 📥 Debug: Log function invocation
  console.log("📥 validate-availability invoked");

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        { status: 405, headers: corsHeaders }
      );
    }

    // Parse request body
    const body = await req.json();
    const { runner_id, latitude, longitude } = body;

    // 📦 Debug: Log request body
    console.log("📦 Request body:", body);

    // Validate required fields
    if (!runner_id) {
      return new Response(
        JSON.stringify({ error: "runner_id is required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid GPS coordinates",
          details: "latitude and longitude are required and cannot be null or undefined"
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate latitude and longitude are numbers
    const lat = typeof latitude === 'number' ? latitude : parseFloat(String(latitude));
    const lon = typeof longitude === 'number' ? longitude : parseFloat(String(longitude));

    if (isNaN(lat) || isNaN(lon)) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid GPS coordinates",
          details: "latitude and longitude must be valid numbers"
        }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 📍 Debug: Log coordinates before validation
    console.log("📍 Coordinates received:", { lat, lon });

    // 🧪 TEMPORARY TESTING: Bypass geofence validation if flag is enabled
    if (DISABLE_GEOFENCING_FOR_TESTING) {
      console.log("⚠️ GEOFENCING BYPASSED FOR TESTING - Returning allowed: true");
      return new Response(
        JSON.stringify({
          allowed: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate geofence using polygon check (authoritative)
    // IMPORTANT: Geofence validation is a BUSINESS DECISION, not an error
    // Both allowed=true and allowed=false MUST return HTTP 200
    const validation = canRunnerBeAvailable(lat, lon, true);

    // ✅ Debug: Log validation result before returning
    console.log("✅ Validation result:", validation);

    // ALWAYS return HTTP 200 for geofence validation results
    // This ensures the client can read { allowed: false } without FunctionsHttpError
    if (validation.allowed) {
      // Runner is inside UM Matina - allowed to go online
      return new Response(
        JSON.stringify({
          allowed: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } else {
      // Runner is outside UM Matina - NOT an error, just a business rule
      // Return HTTP 200 so client can read allowed: false
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: validation.reason || "You must be inside UM Matina campus to go online.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "Unhandled exception",
        details: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
