import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rankRunners, calculateDistanceKm, type RunnerForRanking } from "../_shared/runner-ranking";

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
  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return corsResponse("", 200);
  }

  // Initialize Supabase client with service role key
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // NOTE: Test Mode Bypass (Development/Testing Only)
  // The x-test-mode header allows manual testing in Supabase Dashboard or other testing tools
  // without requiring a valid JWT token. This bypass is for manual testing only.
  // IMPORTANT: Test mode is automatically disabled in production environments.
  // When ENVIRONMENT=production, x-test-mode is ignored and JWT authentication is always required.
  // This prevents abuse or security issues in production.
  // Production app requests MUST include a valid Authorization: Bearer <JWT> header.

  // Check for explicit test mode header (only allowed in non-production environments)
  const isTestMode =
    req.headers.get("x-test-mode") === "true" &&
    Deno.env.get("ENVIRONMENT") !== "production";

  // Extract and validate Authorization header (skip for test mode)
  if (!isTestMode) {
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return corsResponse(JSON.stringify({ error: "Unauthorized" }), 401);
    }

    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!user || error) {
      return corsResponse(JSON.stringify({ error: "Unauthorized" }), 401);
    }
  }

  try {
    // Parse request body
    const body = await req.json();
    const { errand_id } = body;

    // Basic validation
    if (!errand_id) {
      return corsResponse(JSON.stringify({ error: "Missing errand_id" }), 400);
    }

    // Fetch the errand (READ-ONLY)
    const { data: errand, error } = await supabase
      .from("errand")
      .select("*")
      .eq("id", errand_id)
      .single();

    // Handle database error
    if (error) {
      // Check if errand not found
      if (error.code === "PGRST116") {
        return corsResponse(JSON.stringify({ error: "Errand not found" }), 404);
      }
      // Other database errors
      return corsResponse(JSON.stringify({ error: "Failed to fetch errand" }), 500);
    }

    // Check if errand is already assigned
    if (errand.notified_runner_id !== null) {
      return corsResponse(JSON.stringify({ status: "already_assigned" }), 200);
    }

    // Fetch eligible runners (READ-ONLY)
    // Eligibility: role = BuddyRunner AND is_available = true
    // NOTE: Presence timestamp filtering relaxed for errands - runners with is_available=true and valid location are eligible
    let runnersQuery = supabase
      .from("users")
      .select("id, latitude, longitude, last_seen_at, location_updated_at, is_available, average_rating")
      .eq("role", "BuddyRunner")
      .eq("is_available", true);

    // Exclude timeout runners if present (READ-ONLY filtering)
    if (errand.timeout_runner_ids && Array.isArray(errand.timeout_runner_ids) && errand.timeout_runner_ids.length > 0) {
      for (const timeoutRunnerId of errand.timeout_runner_ids) {
        runnersQuery = runnersQuery.neq("id", timeoutRunnerId);
      }
    }

    const { data: runners, error: runnersError } = await runnersQuery;

    // Handle runner fetch errors
    if (runnersError) {
      return corsResponse(JSON.stringify({ error: "Failed to fetch eligible runners" }), 500);
    }

    // Check if no runners found
    if (!runners || runners.length === 0) {
      // DEBUG: Return diagnostic info when no eligible runners found
      return corsResponse(
        JSON.stringify({
          status: "no_eligible_runners",
          debug: {
            errand_id: errand.id,
            buddycaller_id: errand.buddycaller_id,
            timeout_runner_ids: errand.timeout_runner_ids || [],
            note: "No runners matched: role=BuddyRunner, is_available=true (presence timestamp filtering relaxed for errands)",
          },
        }),
        200
      );
    }

    // A5: Fetch caller location for distance calculation
    const { data: callerData, error: callerError } = await supabase
      .from("users")
      .select("latitude, longitude")
      .eq("id", errand.buddycaller_id)
      .single();

    // Handle caller location error or missing location
    if (callerError || !callerData || !callerData.latitude || !callerData.longitude) {
      return corsResponse(JSON.stringify({ status: "no_runners_within_distance" }), 200);
    }

    // Validate caller coordinates
    const callerLat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude || ''));
    const callerLon = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude || ''));

    if (!callerLat || !callerLon || isNaN(callerLat) || isNaN(callerLon)) {
      return corsResponse(JSON.stringify({ status: "no_runners_within_distance" }), 200);
    }

    // Distance calculation now uses shared module (calculateDistanceKm imported)

    // A5: Apply distance hard filter (≤ 500m)
    const filteredRunners = runners.filter((runner) => {
      // Exclude runners with null/undefined/NaN coordinates
      if (!runner.latitude || !runner.longitude) {
        return false;
      }

      const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
      const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));

      if (!lat || !lon || isNaN(lat) || isNaN(lon)) {
        return false;
      }

      // Calculate distance in meters
      const distanceKm = calculateDistanceKm(callerLat, callerLon, lat, lon);
      const distanceMeters = distanceKm * 1000;

      // Hard filter: exclude if distance > 500m (strict > comparison, 500m is included)
      return distanceMeters <= 500;
    });

    // Handle empty result after distance filtering
    if (!filteredRunners || filteredRunners.length === 0) {
      // DEBUG: Return diagnostic info when no runners within distance
      const debugRunnerCoords = runners.map((r: any) => ({
        id: r.id,
        lat: r.latitude,
        lng: r.longitude,
        distance_km: r.latitude && r.longitude
          ? calculateDistanceKm(callerLat, callerLon, 
              typeof r.latitude === 'number' ? r.latitude : parseFloat(String(r.latitude || '')),
              typeof r.longitude === 'number' ? r.longitude : parseFloat(String(r.longitude || '')))
          : null,
      }));
      return corsResponse(
        JSON.stringify({
          status: "no_runners_within_distance",
          debug: {
            caller_coords: { lat: callerLat, lng: callerLon },
            distance_threshold_km: 0.5,
            eligible_runners_count: runners.length,
            runner_coords: debugRunnerCoords,
          },
        }),
        200
      );
    }

    // Normalize errand categories for ranking (empty array allowed)
    const errandCategories =
      errand.category && errand.category.trim().length > 0
        ? [errand.category.trim().toLowerCase()]
        : [];

    // QUEUE-BASED RANKING: Rank runners ONCE and store queue
    // This prevents re-ranking on timeout, eliminating UI glitching
    const rankedRunners = await rankRunners(
      filteredRunners as RunnerForRanking[],
      errandCategories,
      callerLat,
      callerLon,
      async (runnerId: string) => {
        // Fetch runner category history for TF-IDF
        const { data: historyData } = await supabase
          .from("errand")
          .select("category")
          .eq("runner_id", runnerId)
          .eq("status", "completed");
        return historyData || [];
      }
    );

    // Check if no runners to assign
    if (rankedRunners.length === 0) {
      return corsResponse(
        JSON.stringify({
          status: "no_runner_to_assign",
        }),
        200
      );
    }

    // Extract runner IDs in ranked order for queue storage
    const rankedRunnerIds = rankedRunners.map(r => r.id);

    // Get top runner (index 0)
    const topRunner = rankedRunners[0];

    // A7.2: Real Assignment
    // Persists the top-ranked runner to the errand record.
    // This converts the A7.1 dry-run result into an actual assignment.

    // Generate assignment timestamp and expiration (60 seconds from now)
    const assignedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

    // QUEUE-BASED ASSIGNMENT: Store queue and assign index 0
    // Prepare timeout_runner_ids (kept for backward compatibility, not used for selection)
    let updatedTimeoutRunnerIds: string[] = [];
    if (errand.timeout_runner_ids && Array.isArray(errand.timeout_runner_ids)) {
      updatedTimeoutRunnerIds = errand.timeout_runner_ids;
    }

    // Perform DB update (only if errand is still unassigned and pending)
    // Store ranked_runner_ids queue and set current_queue_index = 0
    const { data: updateData, error: updateError } = await supabase
      .from("errand")
      .update({
        notified_runner_id: topRunner.id,
        notified_at: assignedAt,
        notified_expires_at: expiresAt,  // Set expiration 60 seconds from now
        ranked_runner_ids: rankedRunnerIds,  // Store complete queue
        current_queue_index: 0,  // Start at index 0
        timeout_runner_ids: updatedTimeoutRunnerIds,  // Backward compatibility only
        is_notified: true,
      })
      .eq("id", errand.id)
      .is("notified_runner_id", null)
      .eq("status", "pending")
      .select();

    // Handle update error
    if (updateError) {
      return corsResponse(JSON.stringify({ error: "assignment_failed" }), 500);
    }

    // Check if errand was already assigned during the process (no rows updated)
    if (!updateData || updateData.length === 0) {
      return corsResponse(JSON.stringify({ status: "already_assigned" }), 200);
    }

    // Broadcast notification to assigned runner's private channel
    const channelName = `errand_notify_${topRunner.id}`;
    console.log(`🔔 [EDGE FUNCTION] Broadcasting to channel: ${channelName}`);
    console.log(`🔔 [EDGE FUNCTION] Event name: errand_notification`);
    console.log(`🔔 [EDGE FUNCTION] Runner ID: ${topRunner.id}`);
    console.log(`🔔 [EDGE FUNCTION] Errand ID: ${errand.id}`);
    
    const broadcastChannel = supabase.channel(channelName);
    
    await broadcastChannel.send({
      type: 'broadcast',
      event: 'errand_notification',
      payload: {
        errand_id: errand.id,
        errand_title: errand.title,
        errand_category: errand.category,
        caller_id: errand.buddycaller_id,
        assigned_at: assignedAt,
      },
    });
    
    console.log(`🔔 [EDGE FUNCTION] Broadcast sent to channel: ${channelName}`);

    // Return successful assignment response
    return corsResponse(
      JSON.stringify({
        status: "assigned",
        errand_id: errand.id,
        assigned_runner_id: topRunner.id,
        final_score: topRunner.finalScore,
        assigned_at: assignedAt,
      }),
      200
    );
  } catch (error) {
    return corsResponse(
      JSON.stringify({
        error: "Invalid request body",
        details: String(error),
      }),
      500
    );
  }
});
