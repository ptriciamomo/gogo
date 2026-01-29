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

    // A5: Haversine distance calculation function (audit-aligned)
    function calculateDistanceKm(
      lat1: number,
      lon1: number,
      lat2: number,
      lon2: number
    ): number {
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

    // A6: TF-IDF & Cosine Similarity Utilities (exact replication)
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
      
      // IDF smoothing: return 0.1 when term appears in all documents (prevents zero IDF)
      if (documentsContainingTerm === allDocuments.length) {
        return 0.1;
      }
      
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
      
      // Build document corpus: exactly 2 documents (query and runner)
      const allDocuments = [queryDoc, runnerDoc];
      
      // Construct TF-IDF vectors
      const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
      let runnerVector: Map<string, number>;
      
      if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
        // Use task-based TF calculation (preferred)
        runnerVector = calculateTFIDFVectorWithTaskCount(runnerTaskCategories, runnerTotalTasks, allDocuments);
      } else {
        // Fallback to token-based TF calculation
        runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
      }
      
      // Calculate cosine similarity
      const similarity = cosineSimilarity(queryVector, runnerVector);
      const finalScore = isNaN(similarity) ? 0 : similarity;
      
      return finalScore;
    }

    // A6: Normalize errand categories for TF-IDF query (empty array allowed)
    const errandCategories =
      errand.category && errand.category.trim().length > 0
        ? [errand.category.trim().toLowerCase()]
        : [];

    // A6: Compute per-runner scores (sequential execution)
    const rankedRunners: Array<{
      id: string;
      distance: number;
      distanceScore: number;
      ratingScore: number;
      tfidfScore: number;
      finalScore: number;
    }> = [];

    for (const runner of filteredRunners) {
      // Calculate distance in meters (already filtered, but need for score)
      const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
      const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
      const distanceKm = calculateDistanceKm(callerLat, callerLon, lat, lon);
      const distanceMeters = distanceKm * 1000;

      // 1️⃣ Distance score
      const distanceScore = Math.max(0, 1 - (distanceMeters / 500));

      // 2️⃣ Rating score
      const ratingScore = (runner.average_rating || 0) / 5;

      // 3️⃣ TF-IDF score
      // Fetch runner category history (sequential, per runner)
      const { data: historyData, error: historyError } = await supabase
        .from("errand")
        .select("category")
        .eq("runner_id", runner.id)
        .eq("status", "completed");

      let tfidfScore = 0;
      
      if (!historyError && historyData && historyData.length > 0) {
        const totalTasks = historyData.length;
        const taskCategories: string[][] = [];
        
        historyData.forEach((completedErrand: any) => {
          if (!completedErrand.category) return;
          taskCategories.push([completedErrand.category.trim().toLowerCase()]);
        });
        
        const runnerHistory = taskCategories.flat();
        
        tfidfScore = calculateTFIDFCosineSimilarity(
          errandCategories,
          runnerHistory,
          taskCategories,
          totalTasks
        );
      }

      // Calculate final weighted score
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

    // A6: Sort and rank runners
    rankedRunners.sort((a, b) => {
      // Primary: finalScore descending
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      // Tie-breaker: distance ascending
      return a.distance - b.distance;
    });

    // A7.1: Dry-Run Assignment (NO DB WRITES)
    // Determine which runner WOULD be assigned without modifying the database
    if (rankedRunners.length === 0) {
      return corsResponse(
        JSON.stringify({
          status: "no_runner_to_assign",
        }),
        200
      );
    }

    // Get top runner (would be assigned)
    const topRunner = rankedRunners[0];

    // A7.2: Real Assignment
    // Persists the top-ranked runner to the errand record.
    // This converts the A7.1 dry-run result into an actual assignment.

    // Generate assignment timestamp
    const assignedAt = new Date().toISOString();

    // Prepare timeout_runner_ids update (append topRunner.id if not already present)
    let updatedTimeoutRunnerIds: string[];
    if (errand.timeout_runner_ids && Array.isArray(errand.timeout_runner_ids)) {
      // Append only if not already present
      if (!errand.timeout_runner_ids.includes(topRunner.id)) {
        updatedTimeoutRunnerIds = [...errand.timeout_runner_ids, topRunner.id];
      } else {
        updatedTimeoutRunnerIds = errand.timeout_runner_ids;
      }
    } else {
      // Initialize as array with topRunner.id
      updatedTimeoutRunnerIds = [topRunner.id];
    }

    // Perform DB update (only if errand is still unassigned and pending)
    const { data: updateData, error: updateError } = await supabase
      .from("errand")
      .update({
        notified_runner_id: topRunner.id,
        notified_at: assignedAt,
        timeout_runner_ids: updatedTimeoutRunnerIds,
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
