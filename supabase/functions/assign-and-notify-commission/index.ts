import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rankRunners, RunnerForRanking, calculateDistanceKm } from "../_shared/runner-ranking.ts";

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
  console.log("[ASSIGN-COMMISSION] ========== FUNCTION ENTERED ==========");
  console.log("[ASSIGN-COMMISSION] Timestamp:", new Date().toISOString());
  console.log("[ASSIGN-COMMISSION] Method:", req.method);
  console.log("[ASSIGN-COMMISSION] URL:", req.url);
  
  // Handle OPTIONS preflight request
  if (req.method === "OPTIONS") {
    return corsResponse("", 200);
  }
  
  // Initialize Supabase client with service role key
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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
    const { commission_id } = body;

    // Basic validation
    if (!commission_id) {
      return corsResponse(JSON.stringify({ error: "Missing commission_id" }), 400);
    }

    // Fetch the commission (READ-ONLY)
    const { data: commission, error } = await supabase
      .from("commission")
      .select("*")
      .eq("id", commission_id)
      .single();

    // Handle database error
    if (error) {
      if (error.code === "PGRST116") {
        return corsResponse(JSON.stringify({ error: "Commission not found" }), 404);
      }
      return corsResponse(JSON.stringify({ error: "Failed to fetch commission" }), 500);
    }

    // Check if commission is already assigned
    if (commission.notified_runner_id !== null) {
      return corsResponse(JSON.stringify({ status: "already_assigned" }), 200);
    }

    // Define presence thresholds (must match runner-side logic exactly)
    const seventyFiveSecondsAgo = new Date(Date.now() - 75 * 1000).toISOString();

    // Fetch eligible runners (READ-ONLY)
    let runnersQuery = supabase
      .from("users")
      .select("id, latitude, longitude, last_seen_at, location_updated_at, is_available, average_rating")
      .eq("role", "BuddyRunner")
      .eq("is_available", true)
      .gte("last_seen_at", seventyFiveSecondsAgo)
      .or(`location_updated_at.gte.${seventyFiveSecondsAgo},location_updated_at.is.null`);

    // Exclude declined runner if exists
    if (commission.declined_runner_id) {
      runnersQuery = runnersQuery.neq("id", commission.declined_runner_id);
    }

    // Exclude timeout runners if present
    if (commission.timeout_runner_ids && Array.isArray(commission.timeout_runner_ids) && commission.timeout_runner_ids.length > 0) {
      for (const timeoutRunnerId of commission.timeout_runner_ids) {
        runnersQuery = runnersQuery.neq("id", timeoutRunnerId);
      }
    }

    const { data: runners, error: runnersError } = await runnersQuery;

    // DEBUG: Log eligibility query results
    console.log('[DEBUG][COMMISSION] Commission ID:', commission.id);
    console.log('[DEBUG][COMMISSION] Eligibility threshold (75s ago):', seventyFiveSecondsAgo);
    console.log('[DEBUG][COMMISSION] Raw runners result:', runners);
    console.log('[DEBUG][COMMISSION] Runner count:', runners?.length ?? 0);
    console.log('[DEBUG][COMMISSION] Commission exclusion state:', {
      declined_runner_id: commission.declined_runner_id,
      timeout_runner_ids: commission.timeout_runner_ids,
      status: commission.status,
    });

    if (runnersError) {
      return corsResponse(JSON.stringify({ error: "Failed to fetch eligible runners" }), 500);
    }

    if (!runners || runners.length === 0) {
      console.warn('[DEBUG][COMMISSION] No eligible runners returned by DB query');
      console.warn(`[ASSIGN-COMMISSION] No eligible runners found for commission ${commission.id} - cancelling immediately`);
      
      // Immediately cancel the commission since no runners are available
      console.log(`[ASSIGN-COMMISSION] ========== PATH 1: NO ELIGIBLE RUNNERS ==========`);
      console.log(`[ASSIGN-COMMISSION] PRE-UPDATE: About to cancel commission ${commission.id} (no eligible runners)`);
      console.log(`[ASSIGN-COMMISSION] Current commission state:`, {
        id: commission.id,
        status: commission.status,
        notified_runner_id: commission.notified_runner_id,
        runner_id: commission.runner_id
      });
      
      console.log("[ASSIGN-COMMISSION] Status before cancel attempt:", commission.status);
      
      const { error: cancelError, data: cancelData } = await supabase
        .from("commission")
        .update({
          status: 'cancelled',
          ranked_runner_ids: [],
          current_queue_index: 0,
          timeout_runner_ids: [],
          notified_runner_id: null,
          notified_at: null,
          notified_expires_at: null,
          is_notified: false
        })
        .eq("id", commission.id)
        .select();
      
      console.log(`[ASSIGN-COMMISSION] POST-UPDATE: Cancellation result for commission ${commission.id}:`, {
        error: cancelError,
        error_message: cancelError?.message,
        error_code: cancelError?.code,
        error_details: cancelError?.details,
        error_hint: cancelError?.hint,
        rows_updated: cancelData?.length || 0,
        updated_data: cancelData,
        update_succeeded: !cancelError && cancelData && cancelData.length > 0
      });
      
      if (cancelError) {
        console.error(`[ASSIGN-COMMISSION] Failed to cancel commission ${commission.id}:`, cancelError);
        return corsResponse(JSON.stringify({ error: "cancellation_failed", details: cancelError.message }), 500);
      }
      
      return corsResponse(JSON.stringify({ status: "no_eligible_runners", cancelled: true }), 200);
    }

    // Fetch caller location for distance calculation
    const { data: callerData, error: callerError } = await supabase
      .from("users")
      .select("latitude, longitude")
      .eq("id", commission.buddycaller_id)
      .single();

    if (callerError || !callerData || !callerData.latitude || !callerData.longitude) {
      return corsResponse(JSON.stringify({ status: "no_runners_within_distance" }), 200);
    }

    const callerLat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude || ''));
    const callerLon = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude || ''));

    if (!callerLat || !callerLon || isNaN(callerLat) || isNaN(callerLon)) {
      return corsResponse(JSON.stringify({ status: "no_runners_within_distance" }), 200);
    }

    // Apply distance hard filter (≤ 500m) - filter before ranking
    const filteredRunners = runners.filter((runner) => {
      if (!runner.latitude || !runner.longitude) return false;
      const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
      const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) return false;
      
      // Use shared distance calculation
      const distanceKm = calculateDistanceKm(callerLat, callerLon, lat, lon);
      const distanceMeters = distanceKm * 1000;
      return distanceMeters <= 500;
    });

    if (!filteredRunners || filteredRunners.length === 0) {
      console.warn(`[ASSIGN-COMMISSION] No runners within 500m for commission ${commission.id} - cancelling immediately`);
      
      // Immediately cancel the commission since no runners are within distance
      console.log(`[ASSIGN-COMMISSION] ========== PATH 2: NO RUNNERS WITHIN DISTANCE ==========`);
      console.log(`[ASSIGN-COMMISSION] PRE-UPDATE: About to cancel commission ${commission.id} (no runners within 500m)`);
      console.log(`[ASSIGN-COMMISSION] Current commission state:`, {
        id: commission.id,
        status: commission.status,
        notified_runner_id: commission.notified_runner_id,
        runner_id: commission.runner_id
      });
      
      console.log("[ASSIGN-COMMISSION] Status before cancel attempt:", commission.status);
      
      const { error: cancelError, data: cancelData } = await supabase
        .from("commission")
        .update({
          status: 'cancelled',
          ranked_runner_ids: [],
          current_queue_index: 0,
          timeout_runner_ids: [],
          notified_runner_id: null,
          notified_at: null,
          notified_expires_at: null,
          is_notified: false
        })
        .eq("id", commission.id)
        .select();
      
      console.log(`[ASSIGN-COMMISSION] POST-UPDATE: Cancellation result for commission ${commission.id}:`, {
        error: cancelError,
        error_message: cancelError?.message,
        error_code: cancelError?.code,
        error_details: cancelError?.details,
        error_hint: cancelError?.hint,
        rows_updated: cancelData?.length || 0,
        updated_data: cancelData,
        update_succeeded: !cancelError && cancelData && cancelData.length > 0
      });
      
      if (cancelError) {
        console.error(`[ASSIGN-COMMISSION] Failed to cancel commission ${commission.id}:`, cancelError);
        return corsResponse(JSON.stringify({ error: "cancellation_failed", details: cancelError.message }), 500);
      }
      
      return corsResponse(JSON.stringify({ status: "no_runners_within_distance", cancelled: true }), 200);
    }

    // Parse commission types for ranking
    const commissionTypes = commission.commission_type 
      ? commission.commission_type.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];
    
    // Normalize commission types for ranking (empty array allowed)
    const normalizedCommissionTypes = commissionTypes.length > 0
      ? commissionTypes.map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
      : [];

    // QUEUE-BASED RANKING: Rank runners ONCE and store queue
    // This prevents re-ranking on timeout, eliminating UI glitching
    const rankedRunners = await rankRunners(
      filteredRunners as RunnerForRanking[],
      normalizedCommissionTypes,
      callerLat,
      callerLon,
      async (runnerId: string) => {
        // Fetch runner commission history for TF-IDF
        // Transform commission_type (comma-separated) to category format for shared module
        const { data: historyData } = await supabase
          .from("commission")
          .select("commission_type")
          .eq("runner_id", runnerId)
          .eq("status", "completed");
        
        // Transform commission_type to category format expected by shared module
        // Each commission_type becomes a category entry
        if (historyData && historyData.length > 0) {
          return historyData.map((c: any) => {
            // Use first commission type as category, or join all types
            if (c.commission_type) {
              const types = c.commission_type.split(',').map((t: string) => t.trim().toLowerCase());
              return { category: types[0] || null }; // Use first type as primary category
            }
            return { category: null };
          });
        }
        return [];
      }
    );

    // Check if no runners to assign
    if (rankedRunners.length === 0) {
      console.warn(`[ASSIGN-COMMISSION] Ranking returned 0 runners for commission ${commission.id} - cancelling immediately`);
      
      // Immediately cancel the commission since no runners are available
      console.log(`[ASSIGN-COMMISSION] ========== PATH 3: RANKING RETURNED 0 RUNNERS ==========`);
      console.log(`[ASSIGN-COMMISSION] PRE-UPDATE: About to cancel commission ${commission.id} (ranking returned 0 runners)`);
      console.log(`[ASSIGN-COMMISSION] Current commission state:`, {
        id: commission.id,
        status: commission.status,
        notified_runner_id: commission.notified_runner_id,
        runner_id: commission.runner_id
      });
      
      console.log("[ASSIGN-COMMISSION] Status before cancel attempt:", commission.status);
      
      const { error: cancelError, data: cancelData } = await supabase
        .from("commission")
        .update({
          status: 'cancelled',
          ranked_runner_ids: [],
          current_queue_index: 0,
          timeout_runner_ids: [],
          notified_runner_id: null,
          notified_at: null,
          notified_expires_at: null,
          is_notified: false
        })
        .eq("id", commission.id)
        .select();
      
      console.log(`[ASSIGN-COMMISSION] POST-UPDATE: Cancellation result for commission ${commission.id}:`, {
        error: cancelError,
        error_message: cancelError?.message,
        error_code: cancelError?.code,
        error_details: cancelError?.details,
        error_hint: cancelError?.hint,
        rows_updated: cancelData?.length || 0,
        updated_data: cancelData,
        update_succeeded: !cancelError && cancelData && cancelData.length > 0
      });
      
      if (cancelError) {
        console.error(`[ASSIGN-COMMISSION] Failed to cancel commission ${commission.id}:`, cancelError);
        return corsResponse(JSON.stringify({ error: "cancellation_failed", details: cancelError.message }), 500);
      }
      
      return corsResponse(JSON.stringify({
          status: "no_runner_to_assign",
          cancelled: true
      }), 200);
    }

    // Extract runner IDs in ranked order for queue storage
    const rankedRunnerIds = rankedRunners.map(r => r.id);

    // Get top runner (index 0)
    const topRunner = rankedRunners[0];
    const assignedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();

    // QUEUE-BASED ASSIGNMENT: Store queue and assign index 0
    // Prepare timeout_runner_ids (kept for backward compatibility, not used for selection)
    let updatedTimeoutRunnerIds: string[] = [];
    if (commission.timeout_runner_ids && Array.isArray(commission.timeout_runner_ids)) {
      updatedTimeoutRunnerIds = commission.timeout_runner_ids;
    }

    // Perform DB update (only if commission is still unassigned and pending)
    // Store ranked_runner_ids queue and set current_queue_index = 0
    const { data: updateData, error: updateError } = await supabase
      .from("commission")
      .update({
        notified_runner_id: topRunner.id,
        notified_at: assignedAt,
        notified_expires_at: expiresAt,  // Set expiration 60 seconds from now
        ranked_runner_ids: rankedRunnerIds,  // Store complete queue
        current_queue_index: 0,  // Start at index 0
        timeout_runner_ids: updatedTimeoutRunnerIds,  // Backward compatibility only
        is_notified: true,
      })
      .eq("id", commission.id)
      .is("notified_runner_id", null)
      .eq("status", "pending")
      .select();

    if (updateError) {
      return corsResponse(JSON.stringify({ error: "assignment_failed" }), 500);
    }

    if (!updateData || updateData.length === 0) {
      // Re-fetch commission to verify actual state
      const { data: currentCommission, error: fetchError } = await supabase
        .from("commission")
        .select("id, status, notified_runner_id, runner_id")
        .eq("id", commission.id)
        .single();

      if (fetchError) {
        console.error(`[ASSIGN-COMMISSION] Failed to re-fetch commission ${commission.id} after 0 rows updated:`, fetchError);
        return corsResponse(JSON.stringify({ error: "assignment_failed", details: "Could not verify assignment state" }), 500);
      }

      // If runner is actually assigned, return already_assigned
      if (currentCommission?.notified_runner_id !== null) {
        console.log(`[ASSIGN-COMMISSION] Commission ${commission.id} already assigned to runner ${currentCommission.notified_runner_id}`);
        return corsResponse(JSON.stringify({ status: "already_assigned" }), 200);
      }

      // If notified_runner_id is still NULL, treat as assignment failure
      // This can happen if status changed or concurrent modification occurred
      console.warn(`[ASSIGN-COMMISSION] UPDATE affected 0 rows for commission ${commission.id}, but notified_runner_id is still NULL. Treating as assignment failure.`);
      console.warn(`[ASSIGN-COMMISSION] Current commission state:`, {
        id: currentCommission?.id,
        status: currentCommission?.status,
        notified_runner_id: currentCommission?.notified_runner_id,
        runner_id: currentCommission?.runner_id
      });

      // Return assignment_failed so frontend can handle retry
      return corsResponse(JSON.stringify({ 
        error: "assignment_failed", 
        details: "UPDATE affected 0 rows and notified_runner_id is NULL. Assignment may have failed due to concurrent modification." 
      }), 500);
    }

    // Broadcast notification to assigned runner's private channel
    const channelName = `commission_notify_${topRunner.id}`;
    console.log(`🔔 [EDGE FUNCTION] Broadcasting to channel: ${channelName}`);
    console.log(`🔔 [EDGE FUNCTION] Event name: commission_notification`);
    console.log(`🔔 [EDGE FUNCTION] Runner ID: ${topRunner.id}`);
    console.log(`🔔 [EDGE FUNCTION] Commission ID: ${commission.id}`);
    
    const broadcastChannel = supabase.channel(channelName);
    
    await broadcastChannel.send({
      type: 'broadcast',
      event: 'commission_notification',
      payload: {
        commission_id: commission.id,
        commission_title: commission.title,
        commission_type: commission.commission_type,
        caller_id: commission.buddycaller_id,
        assigned_at: assignedAt,
      },
    });
    
    console.log(`🔔 [EDGE FUNCTION] Broadcast sent to channel: ${channelName}`);

    return corsResponse(JSON.stringify({
        status: "assigned",
        commission_id: commission.id,
        assigned_runner_id: topRunner.id,
        final_score: topRunner.finalScore,
        assigned_at: assignedAt,
    }), 200);
  } catch (error) {
    return corsResponse(JSON.stringify({
        error: "Invalid request body",
        details: String(error),
    }), 500);
  }
});
