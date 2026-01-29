import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Haversine distance calculation function
    function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371; // Earth radius in km
      const toRad = (deg: number) => (deg * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
          Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // Apply distance hard filter (≤ 500m)
    const filteredRunners = runners.filter((runner) => {
      if (!runner.latitude || !runner.longitude) return false;
      const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
      const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
      if (!lat || !lon || isNaN(lat) || isNaN(lon)) return false;
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

    // Parse commission types
    const commissionTypes = commission.commission_type 
      ? commission.commission_type.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];

    // TF-IDF & Cosine Similarity Utilities
    function calculateTF(term: string, document: string[]): number {
      if (document.length === 0) return 0;
      const termCount = document.filter(word => word === term).length;
      return termCount / document.length;
    }

    function calculateTFWithTaskCount(term: string, taskCategories: string[][], totalTasks: number): number {
      if (totalTasks === 0) return 0;
      const tasksWithCategory = taskCategories.filter(taskCats => 
        taskCats.some(cat => cat === term.toLowerCase())
      ).length;
      return tasksWithCategory / totalTasks;
    }

    function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
      const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
      if (documentsContainingTerm === 0) return 0;
      if (documentsContainingTerm === allDocuments.length) return 0.1;
      return Math.log(allDocuments.length / documentsContainingTerm);
    }

    function calculateTFIDFVectorAdjusted(document: string[], allDocuments: string[][]): Map<string, number> {
      const uniqueTerms = Array.from(new Set(document));
      const tfidfMap = new Map<string, number>();
      uniqueTerms.forEach(term => {
        const tf = calculateTF(term, document);
        const idf = calculateIDFAdjusted(term, allDocuments);
        tfidfMap.set(term, tf * idf);
      });
      return tfidfMap;
    }

    function calculateTFIDFVectorWithTaskCount(taskCategories: string[][], totalTasks: number, allDocuments: string[][]): Map<string, number> {
      const allTerms = new Set<string>();
      taskCategories.forEach(taskCats => {
        taskCats.forEach(cat => allTerms.add(cat.toLowerCase()));
      });
      const tfidfMap = new Map<string, number>();
      allTerms.forEach(term => {
        const tf = calculateTFWithTaskCount(term, taskCategories, totalTasks);
        const idf = calculateIDFAdjusted(term, allDocuments);
        tfidfMap.set(term, tf * idf);
      });
      return tfidfMap;
    }

    function cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number {
      const allTerms = Array.from(new Set([...vector1.keys(), ...vector2.keys()]));
      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;
      allTerms.forEach(term => {
        const val1 = vector1.get(term) || 0;
        const val2 = vector2.get(term) || 0;
        dotProduct += val1 * val2;
        magnitude1 += val1 * val1;
        magnitude2 += val2 * val2;
      });
      const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
      if (denominator === 0) return 0;
      return dotProduct / denominator;
    }

    function calculateTFIDFCosineSimilarity(
      commissionCategories: string[],
      runnerHistory: string[],
      runnerTaskCategories: string[][] = [],
      runnerTotalTasks: number = 0
    ): number {
      if (commissionCategories.length === 0 || runnerHistory.length === 0) {
        return 0;
      }
      const queryDoc = commissionCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
      const runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
      if (queryDoc.length === 0 || runnerDoc.length === 0) {
        return 0;
      }
      const allDocuments = [queryDoc, runnerDoc];
      const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
      let runnerVector: Map<string, number>;
      if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
        runnerVector = calculateTFIDFVectorWithTaskCount(runnerTaskCategories, runnerTotalTasks, allDocuments);
      } else {
        runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
      }
      const similarity = cosineSimilarity(queryVector, runnerVector);
      return isNaN(similarity) ? 0 : similarity;
    }

    // Normalize commission types for TF-IDF query
    const normalizedCommissionTypes = commissionTypes.length > 0
      ? commissionTypes.map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
      : [];

    // Compute per-runner scores
    const rankedRunners: Array<{
      id: string;
      distance: number;
      distanceScore: number;
      ratingScore: number;
      tfidfScore: number;
      finalScore: number;
    }> = [];

    for (const runner of filteredRunners) {
      const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
      const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
      const distanceKm = calculateDistanceKm(callerLat, callerLon, lat, lon);
      const distanceMeters = distanceKm * 1000;

      // Distance score
      const distanceScore = Math.max(0, 1 - (distanceMeters / 500));

      // Rating score
      const ratingScore = (runner.average_rating || 0) / 5;

      // TF-IDF score
      let tfidfScore = 0;
      if (normalizedCommissionTypes.length > 0) {
        const { data: historyData } = await supabase
          .from("commission")
          .select("commission_type")
          .eq("runner_id", runner.id)
          .eq("status", "completed");

        if (historyData && historyData.length > 0) {
          const totalTasks = historyData.length;
          const taskCategories: string[][] = [];
          historyData.forEach((c: any) => {
            if (!c.commission_type) return;
            const types = c.commission_type.split(',').map((t: string) => t.trim().toLowerCase());
            taskCategories.push(types);
          });
          const runnerHistory = taskCategories.flat();
          tfidfScore = calculateTFIDFCosineSimilarity(
            normalizedCommissionTypes,
            runnerHistory,
            taskCategories,
            totalTasks
          );
        }
      }

      // Final weighted score
      const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);

      rankedRunners.push({
        id: runner.id,
        distance: distanceMeters,
        distanceScore: distanceScore,
        ratingScore: ratingScore,
        tfidfScore: tfidfScore,
        finalScore: finalScore,
      });
    }

    // Sort and rank runners
    rankedRunners.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return a.distance - b.distance;
    });

    if (rankedRunners.length === 0) {
      return new Response(
        JSON.stringify({ status: "no_runner_to_assign" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const topRunner = rankedRunners[0];
    const assignedAt = new Date().toISOString();

    // Prepare timeout_runner_ids update
    let updatedTimeoutRunnerIds: string[];
    if (commission.timeout_runner_ids && Array.isArray(commission.timeout_runner_ids)) {
      if (!commission.timeout_runner_ids.includes(topRunner.id)) {
        updatedTimeoutRunnerIds = [...commission.timeout_runner_ids, topRunner.id];
      } else {
        updatedTimeoutRunnerIds = commission.timeout_runner_ids;
      }
    } else {
      updatedTimeoutRunnerIds = [topRunner.id];
    }

    // Perform DB update (atomic: only if still unassigned and pending)
    const { data: updateData, error: updateError } = await supabase
      .from("commission")
      .update({
        notified_runner_id: topRunner.id,
        notified_at: assignedAt,
        timeout_runner_ids: updatedTimeoutRunnerIds,
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
