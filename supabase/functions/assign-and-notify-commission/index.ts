import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rankRunners, RunnerForRanking, calculateDistanceKm } from "../_shared/runner-ranking.ts";

serve(async (req) => {
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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!user || error) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  try {
    // Parse request body
    const body = await req.json();
    const { commission_id } = body;

    // Basic validation
    if (!commission_id) {
      return new Response(
        JSON.stringify({ error: "Missing commission_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
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
        return new Response(
          JSON.stringify({ error: "Commission not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Failed to fetch commission" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if commission is already assigned
    if (commission.notified_runner_id !== null) {
      return new Response(
        JSON.stringify({ status: "already_assigned" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
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

    if (runnersError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch eligible runners" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!runners || runners.length === 0) {
      return new Response(
        JSON.stringify({ status: "no_eligible_runners" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch caller location for distance calculation
    const { data: callerData, error: callerError } = await supabase
      .from("users")
      .select("latitude, longitude")
      .eq("id", commission.buddycaller_id)
      .single();

    if (callerError || !callerData || !callerData.latitude || !callerData.longitude) {
      return new Response(
        JSON.stringify({ status: "no_runners_within_distance" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const callerLat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude || ''));
    const callerLon = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude || ''));

    if (!callerLat || !callerLon || isNaN(callerLat) || isNaN(callerLon)) {
      return new Response(
        JSON.stringify({ status: "no_runners_within_distance" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
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
      return new Response(
        JSON.stringify({ status: "no_runners_within_distance" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
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
      return new Response(
        JSON.stringify({ status: "no_runner_to_assign" }),
        { headers: { "Content-Type": "application/json" } }
      );
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
      return new Response(
        JSON.stringify({ error: "assignment_failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!updateData || updateData.length === 0) {
      return new Response(
        JSON.stringify({ status: "already_assigned" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
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

    return new Response(
      JSON.stringify({
        status: "assigned",
        commission_id: commission.id,
        assigned_runner_id: topRunner.id,
        final_score: topRunner.finalScore,
        assigned_at: assignedAt,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Invalid request body",
        details: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
