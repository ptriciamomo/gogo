// Supabase Edge Function: Reassign Timed-Out Tasks
// Purpose: Handle 60-second timeout reassignment for errands and commissions
// Runs on a scheduled cron (every 10-15 seconds)
// Reuses exact same ranking logic as initial assignment

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Initialize Supabase client with service role key (bypasses RLS)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const result = {
      success: true,
      processed: {
        errands: { total: 0, reassigned: 0, cleared: 0, errors: 0 },
        commissions: { total: 0, reassigned: 0, cleared: 0, errors: 0 },
      },
      errors: [] as Array<{ taskId: number; taskType: string; error: string }>,
    };

    // Calculate timeout threshold: 60 seconds ago
    const timeoutThreshold = new Date(Date.now() - 60 * 1000).toISOString();

    // ============================================
    // Shared Utilities (reused from assign-* functions)
    // ============================================

    // Haversine distance calculation
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

    // TF-IDF & Cosine Similarity Utilities (exact replication from assign-* functions)
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
      taskCategories: string[],
      runnerHistory: string[],
      runnerTaskCategories: string[][] = [],
      runnerTotalTasks: number = 0
    ): number {
      if (taskCategories.length === 0 || runnerHistory.length === 0) {
        return 0;
      }
      const queryDoc = taskCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
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

    // ============================================
    // Process Errands
    // ============================================
    console.log(`[Reassign Timeout] Checking errands with notified_at < ${timeoutThreshold}`);

    const { data: timedOutErrands, error: errandsQueryError } = await supabase
      .from("errand")
      .select("id, title, category, buddycaller_id, notified_runner_id, notified_at, timeout_runner_ids, status, runner_id")
      .eq("status", "pending")
      .is("runner_id", null)
      .not("notified_runner_id", "is", null)
      .not("notified_at", "is", null)
      .lt("notified_at", timeoutThreshold)
      .order("notified_at", { ascending: true })
      .limit(50); // Limit to prevent function timeout

    if (errandsQueryError) {
      console.error("[Reassign Timeout] Error querying errands:", errandsQueryError);
      result.errors.push({
        taskId: 0,
        taskType: "errand",
        error: `Query error: ${errandsQueryError.message}`,
      });
    } else {
      result.processed.errands.total = timedOutErrands?.length || 0;
      console.log(`[Reassign Timeout] Found ${result.processed.errands.total} timed-out errands`);

      for (const errand of timedOutErrands || []) {
        try {
          const previousRunnerId = errand.notified_runner_id;

          // Verify task is still in timeout state (idempotency check)
          const { data: currentErrand, error: verifyError } = await supabase
            .from("errand")
            .select("notified_runner_id, status, runner_id")
            .eq("id", errand.id)
            .single();

          if (verifyError || 
              currentErrand?.notified_runner_id !== previousRunnerId ||
              currentErrand?.status !== "pending" ||
              currentErrand?.runner_id !== null) {
            console.log(`[Reassign Timeout] Errand ${errand.id} already processed, skipping`);
            continue;
          }

          // Fetch caller location
          const { data: callerData, error: callerError } = await supabase
            .from("users")
            .select("latitude, longitude")
            .eq("id", errand.buddycaller_id)
            .single();

          if (callerError || !callerData || !callerData.latitude || !callerData.longitude) {
            // No caller location, clear notification
            const { error: clearError } = await supabase.rpc('clear_errand_notification', {
              p_errand_id: errand.id
            });
            if (!clearError) {
              result.processed.errands.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared errand ${errand.id} (no caller location)`);
            }
            continue;
          }

          const callerLat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude || ''));
          const callerLon = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude || ''));

          if (!callerLat || !callerLon || isNaN(callerLat) || isNaN(callerLon)) {
            const { error: clearError } = await supabase.rpc('clear_errand_notification', {
              p_errand_id: errand.id
            });
            if (!clearError) {
              result.processed.errands.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared errand ${errand.id} (invalid caller location)`);
            }
            continue;
          }

          // Fetch eligible runners (exclude previous runner and timeout runners)
          // NOTE: Presence filtering relaxed for errands (same as initial assignment)
          let runnersQuery = supabase
            .from("users")
            .select("id, latitude, longitude, last_seen_at, location_updated_at, is_available, average_rating")
            .eq("role", "BuddyRunner")
            .eq("is_available", true)
            .neq("id", previousRunnerId);

          // Exclude timeout runners
          if (errand.timeout_runner_ids && Array.isArray(errand.timeout_runner_ids) && errand.timeout_runner_ids.length > 0) {
            for (const timeoutRunnerId of errand.timeout_runner_ids) {
              runnersQuery = runnersQuery.neq("id", timeoutRunnerId);
            }
          }

          const { data: runners, error: runnersError } = await runnersQuery;

          if (runnersError || !runners || runners.length === 0) {
            // No eligible runners, clear notification
            const { error: clearError } = await supabase.rpc('clear_errand_notification', {
              p_errand_id: errand.id
            });
            if (!clearError) {
              result.processed.errands.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared errand ${errand.id} (no eligible runners)`);
            }
            continue;
          }

          // Apply distance filter (≤ 500m)
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
            // No runners within distance, clear notification
            const { error: clearError } = await supabase.rpc('clear_errand_notification', {
              p_errand_id: errand.id
            });
            if (!clearError) {
              result.processed.errands.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared errand ${errand.id} (no runners within 500m)`);
            }
            continue;
          }

          // Normalize errand categories for TF-IDF
          const errandCategories = errand.category && errand.category.trim().length > 0
            ? [errand.category.trim().toLowerCase()]
            : [];

          // Rank runners (same logic as initial assignment)
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

            const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
            const ratingScore = (runner.average_rating || 0) / 5;

            // Fetch runner category history for TF-IDF
            let tfidfScore = 0;
            const { data: historyData } = await supabase
              .from("errand")
              .select("category")
              .eq("runner_id", runner.id)
              .eq("status", "completed");

            if (historyData && historyData.length > 0) {
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

          // Sort by final score (descending), then distance (ascending)
          rankedRunners.sort((a, b) => {
            if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
            return a.distance - b.distance;
          });

          if (rankedRunners.length === 0) {
            // No ranked runners, clear notification
            const { error: clearError } = await supabase.rpc('clear_errand_notification', {
              p_errand_id: errand.id
            });
            if (!clearError) {
              result.processed.errands.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared errand ${errand.id} (no ranked runners)`);
            }
            continue;
          }

          const nextRunner = rankedRunners[0];
          const assignedAt = new Date().toISOString();

          // Prepare timeout_runner_ids (append previous runner ID)
          let updatedTimeoutRunnerIds: string[];
          if (errand.timeout_runner_ids && Array.isArray(errand.timeout_runner_ids)) {
            if (!errand.timeout_runner_ids.includes(previousRunnerId)) {
              updatedTimeoutRunnerIds = [...errand.timeout_runner_ids, previousRunnerId];
            } else {
              updatedTimeoutRunnerIds = errand.timeout_runner_ids;
            }
          } else {
            updatedTimeoutRunnerIds = [previousRunnerId];
          }

          // Atomic update: only if still assigned to previous runner
          const { data: updateData, error: updateError } = await supabase
            .from("errand")
            .update({
              notified_runner_id: nextRunner.id,
              notified_at: assignedAt,
              timeout_runner_ids: updatedTimeoutRunnerIds,
              is_notified: true,
            })
            .eq("id", errand.id)
            .eq("status", "pending")
            .is("runner_id", null)
            .eq("notified_runner_id", previousRunnerId)
            .select();

          if (updateError || !updateData || updateData.length === 0) {
            console.log(`[Reassign Timeout] Errand ${errand.id} already reassigned or accepted, skipping`);
            continue;
          }

          // Broadcast notification to new runner
          const channelName = `errand_notify_${nextRunner.id}`;
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

          result.processed.errands.reassigned++;
          console.log(`[Reassign Timeout] ✅ Reassigned errand ${errand.id} to runner ${nextRunner.id}`);

        } catch (error) {
          result.processed.errands.errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({
            taskId: errand.id,
            taskType: "errand",
            error: errorMessage,
          });
          console.error(`[Reassign Timeout] ❌ Error processing errand ${errand.id}:`, errorMessage);
        }
      }
    }

    // ============================================
    // Process Commissions
    // ============================================
    console.log(`[Reassign Timeout] Checking commissions with notified_at < ${timeoutThreshold}`);

    const { data: timedOutCommissions, error: commissionsQueryError } = await supabase
      .from("commission")
      .select("id, title, commission_type, buddycaller_id, notified_runner_id, notified_at, timeout_runner_ids, declined_runner_id, status, runner_id")
      .eq("status", "pending")
      .is("runner_id", null)
      .not("notified_runner_id", "is", null)
      .not("notified_at", "is", null)
      .lt("notified_at", timeoutThreshold)
      .order("notified_at", { ascending: true })
      .limit(50);

    if (commissionsQueryError) {
      console.error("[Reassign Timeout] Error querying commissions:", commissionsQueryError);
      result.errors.push({
        taskId: 0,
        taskType: "commission",
        error: `Query error: ${commissionsQueryError.message}`,
      });
    } else {
      result.processed.commissions.total = timedOutCommissions?.length || 0;
      console.log(`[Reassign Timeout] Found ${result.processed.commissions.total} timed-out commissions`);

      for (const commission of timedOutCommissions || []) {
        try {
          const previousRunnerId = commission.notified_runner_id;

          // Verify task is still in timeout state
          const { data: currentCommission, error: verifyError } = await supabase
            .from("commission")
            .select("notified_runner_id, status, runner_id")
            .eq("id", commission.id)
            .single();

          if (verifyError || 
              currentCommission?.notified_runner_id !== previousRunnerId ||
              currentCommission?.status !== "pending" ||
              currentCommission?.runner_id !== null) {
            console.log(`[Reassign Timeout] Commission ${commission.id} already processed, skipping`);
            continue;
          }

          // Fetch caller location
          const { data: callerData, error: callerError } = await supabase
            .from("users")
            .select("latitude, longitude")
            .eq("id", commission.buddycaller_id)
            .single();

          if (callerError || !callerData || !callerData.latitude || !callerData.longitude) {
            const { error: clearError } = await supabase.rpc('clear_commission_notification', {
              p_commission_id: commission.id
            });
            if (!clearError) {
              result.processed.commissions.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared commission ${commission.id} (no caller location)`);
            }
            continue;
          }

          const callerLat = typeof callerData.latitude === 'number' ? callerData.latitude : parseFloat(String(callerData.latitude || ''));
          const callerLon = typeof callerData.longitude === 'number' ? callerData.longitude : parseFloat(String(callerData.longitude || ''));

          if (!callerLat || !callerLon || isNaN(callerLat) || isNaN(callerLon)) {
            const { error: clearError } = await supabase.rpc('clear_commission_notification', {
              p_commission_id: commission.id
            });
            if (!clearError) {
              result.processed.commissions.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared commission ${commission.id} (invalid caller location)`);
            }
            continue;
          }

          // Define presence thresholds (75 seconds, same as initial assignment)
          const seventyFiveSecondsAgo = new Date(Date.now() - 75 * 1000).toISOString();

          // Fetch eligible runners (exclude previous runner, declined runner, and timeout runners)
          let runnersQuery = supabase
            .from("users")
            .select("id, latitude, longitude, last_seen_at, location_updated_at, is_available, average_rating")
            .eq("role", "BuddyRunner")
            .eq("is_available", true)
            .neq("id", previousRunnerId)
            .gte("last_seen_at", seventyFiveSecondsAgo)
            .or(`location_updated_at.gte.${seventyFiveSecondsAgo},location_updated_at.is.null`);

          // Exclude declined runner
          if (commission.declined_runner_id) {
            runnersQuery = runnersQuery.neq("id", commission.declined_runner_id);
          }

          // Exclude timeout runners
          if (commission.timeout_runner_ids && Array.isArray(commission.timeout_runner_ids) && commission.timeout_runner_ids.length > 0) {
            for (const timeoutRunnerId of commission.timeout_runner_ids) {
              runnersQuery = runnersQuery.neq("id", timeoutRunnerId);
            }
          }

          const { data: runners, error: runnersError } = await runnersQuery;

          if (runnersError || !runners || runners.length === 0) {
            const { error: clearError } = await supabase.rpc('clear_commission_notification', {
              p_commission_id: commission.id
            });
            if (!clearError) {
              result.processed.commissions.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared commission ${commission.id} (no eligible runners)`);
            }
            continue;
          }

          // Apply distance filter (≤ 500m)
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
            const { error: clearError } = await supabase.rpc('clear_commission_notification', {
              p_commission_id: commission.id
            });
            if (!clearError) {
              result.processed.commissions.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared commission ${commission.id} (no runners within 500m)`);
            }
            continue;
          }

          // Parse commission types
          const commissionTypes = commission.commission_type 
            ? commission.commission_type.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [];
          const normalizedCommissionTypes = commissionTypes.length > 0
            ? commissionTypes.map(t => t.trim().toLowerCase()).filter(t => t.length > 0)
            : [];

          // Rank runners (same logic as initial assignment)
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

            const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
            const ratingScore = (runner.average_rating || 0) / 5;

            // Fetch runner category history for TF-IDF
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

          // Sort by final score (descending), then distance (ascending)
          rankedRunners.sort((a, b) => {
            if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
            return a.distance - b.distance;
          });

          if (rankedRunners.length === 0) {
            const { error: clearError } = await supabase.rpc('clear_commission_notification', {
              p_commission_id: commission.id
            });
            if (!clearError) {
              result.processed.commissions.cleared++;
              console.log(`[Reassign Timeout] ✅ Cleared commission ${commission.id} (no ranked runners)`);
            }
            continue;
          }

          const nextRunner = rankedRunners[0];
          const assignedAt = new Date().toISOString();

          // Prepare timeout_runner_ids (append previous runner ID)
          let updatedTimeoutRunnerIds: string[];
          if (commission.timeout_runner_ids && Array.isArray(commission.timeout_runner_ids)) {
            if (!commission.timeout_runner_ids.includes(previousRunnerId)) {
              updatedTimeoutRunnerIds = [...commission.timeout_runner_ids, previousRunnerId];
            } else {
              updatedTimeoutRunnerIds = commission.timeout_runner_ids;
            }
          } else {
            updatedTimeoutRunnerIds = [previousRunnerId];
          }

          // Atomic update: only if still assigned to previous runner
          const { data: updateData, error: updateError } = await supabase
            .from("commission")
            .update({
              notified_runner_id: nextRunner.id,
              notified_at: assignedAt,
              timeout_runner_ids: updatedTimeoutRunnerIds,
              is_notified: true,
            })
            .eq("id", commission.id)
            .eq("status", "pending")
            .is("runner_id", null)
            .eq("notified_runner_id", previousRunnerId)
            .select();

          if (updateError || !updateData || updateData.length === 0) {
            console.log(`[Reassign Timeout] Commission ${commission.id} already reassigned or accepted, skipping`);
            continue;
          }

          // Broadcast notification to new runner
          const channelName = `commission_notify_${nextRunner.id}`;
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

          result.processed.commissions.reassigned++;
          console.log(`[Reassign Timeout] ✅ Reassigned commission ${commission.id} to runner ${nextRunner.id}`);

        } catch (error) {
          result.processed.commissions.errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({
            taskId: commission.id,
            taskType: "commission",
            error: errorMessage,
          });
          console.error(`[Reassign Timeout] ❌ Error processing commission ${commission.id}:`, errorMessage);
        }
      }
    }

    // Return results
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[Reassign Timeout] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
