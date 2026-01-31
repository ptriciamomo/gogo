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
      .select("id, title, category, buddycaller_id, notified_runner_id, notified_at, timeout_runner_ids, ranked_runner_ids, current_queue_index, status, runner_id")
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
            .select("notified_runner_id, status, runner_id, ranked_runner_ids, current_queue_index, timeout_runner_ids")
            .eq("id", errand.id)
            .single();

          if (verifyError || 
              currentErrand?.notified_runner_id !== previousRunnerId ||
              currentErrand?.status !== "pending" ||
              currentErrand?.runner_id !== null) {
            console.log(`[Reassign Timeout] Errand ${errand.id} already processed, skipping`);
            continue;
          }

          // QUEUE-BASED REASSIGNMENT: Read queue from database, advance index
          // NO re-querying, NO re-ranking, NO distance filtering
          const rankedRunnerIds = currentErrand?.ranked_runner_ids;
          const currentQueueIndex = currentErrand?.current_queue_index ?? 0;
          
          // Prepare timeout_runner_ids: append previousRunnerId if not already present
          // This is for audit/history only (not used for selection)
          let updatedTimeoutRunnerIds: string[] = [];
          if (currentErrand?.timeout_runner_ids && Array.isArray(currentErrand.timeout_runner_ids)) {
            updatedTimeoutRunnerIds = [...currentErrand.timeout_runner_ids];
          }
          if (previousRunnerId && !updatedTimeoutRunnerIds.includes(previousRunnerId)) {
            updatedTimeoutRunnerIds.push(previousRunnerId);
          }

          // Backward compatibility: If no queue exists, fallback to old logic (skip for now)
          if (!rankedRunnerIds || !Array.isArray(rankedRunnerIds) || rankedRunnerIds.length === 0) {
            console.log(`[Reassign Timeout] Errand ${errand.id} has no queue (old errand), skipping queue-based reassignment`);
            continue;
          }

          // Check if queue will be exhausted after incrementing index
          // This handles both single-runner queues (index 0 -> 1, length 1) and multi-runner queues
          const nextQueueIndex = currentQueueIndex + 1;
          if (nextQueueIndex >= rankedRunnerIds.length) {
            console.log(`[Reassign Timeout] Queue exhausted for errand ${errand.id} (index ${currentQueueIndex} -> ${nextQueueIndex}, queue length ${rankedRunnerIds.length}), cancelling task`);
            
            // Cancel errand, clear notified_runner_id, and notify caller
            const { error: cancelError } = await supabase
              .from("errand")
              .update({ 
                status: 'cancelled',
                notified_runner_id: null,
                notified_at: null,
                is_notified: false,
                current_queue_index: nextQueueIndex, // Update index even if exhausted
                timeout_runner_ids: updatedTimeoutRunnerIds, // Append previousRunnerId for audit
              })
              .eq("id", errand.id)
              .eq("status", "pending");

            if (!cancelError) {
              // Notify caller that no runners are available
              const callerChannel = `caller_notify_${errand.buddycaller_id}`;
              const broadcastChannel = supabase.channel(callerChannel);
              await broadcastChannel.send({
                type: 'broadcast',
                event: 'task_cancelled',
                payload: {
                  task_id: errand.id,
                  task_type: 'errand',
                  task_title: errand.title,
                  reason: 'no_runners_available',
                },
              });

              result.processed.errands.cleared++;
              console.log(`[Reassign Timeout] ✅ Cancelled errand ${errand.id} (queue exhausted), cleared notified_runner_id`);
            } else {
              result.errors.push({
                taskId: errand.id,
                taskType: "errand",
                error: `Failed to cancel errand after queue exhaustion: ${cancelError.message}`,
              });
              console.error(`[Reassign Timeout] ❌ Failed to cancel errand ${errand.id} after queue exhaustion:`, cancelError);
            }
            continue;
          }

          // Advance to next runner in queue (queue is not exhausted)
          const nextRunnerId = rankedRunnerIds[nextQueueIndex];
          const newQueueIndex = nextQueueIndex;
          const assignedAt = new Date().toISOString();

          // Atomic update: only if still assigned to previous runner
          // Update timeout_runner_ids atomically with queue index (for audit/history)
          const { data: updateData, error: updateError } = await supabase
            .from("errand")
            .update({
              notified_runner_id: nextRunnerId,
              notified_at: assignedAt,
              current_queue_index: newQueueIndex,
              timeout_runner_ids: updatedTimeoutRunnerIds, // Append previousRunnerId for audit
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
          const channelName = `errand_notify_${nextRunnerId}`;
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
          console.log(`[Reassign Timeout] ✅ Reassigned errand ${errand.id} to runner ${nextRunnerId} (queue index ${currentQueueIndex})`);

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
      .select("id, title, commission_type, buddycaller_id, notified_runner_id, notified_at, timeout_runner_ids, ranked_runner_ids, current_queue_index, declined_runner_id, status, runner_id")
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

          // Verify task is still in timeout state (idempotency check)
          const { data: currentCommission, error: verifyError } = await supabase
            .from("commission")
            .select("notified_runner_id, status, runner_id, ranked_runner_ids, current_queue_index, timeout_runner_ids")
            .eq("id", commission.id)
            .single();

          if (verifyError || 
              currentCommission?.notified_runner_id !== previousRunnerId ||
              currentCommission?.status !== "pending" ||
              currentCommission?.runner_id !== null) {
            console.log(`[Reassign Timeout] Commission ${commission.id} already processed, skipping`);
            continue;
          }

          // QUEUE-BASED REASSIGNMENT: Read queue from database, advance index
          // NO re-querying, NO re-ranking, NO distance filtering
          const rankedRunnerIds = currentCommission?.ranked_runner_ids;
          const currentQueueIndex = currentCommission?.current_queue_index ?? 0;
          
          // Prepare timeout_runner_ids: append previousRunnerId if not already present
          // This is for audit/history only (not used for selection)
          let updatedTimeoutRunnerIds: string[] = [];
          if (currentCommission?.timeout_runner_ids && Array.isArray(currentCommission.timeout_runner_ids)) {
            updatedTimeoutRunnerIds = [...currentCommission.timeout_runner_ids];
          }
          if (previousRunnerId && !updatedTimeoutRunnerIds.includes(previousRunnerId)) {
            updatedTimeoutRunnerIds.push(previousRunnerId);
          }

          // Backward compatibility: If no queue exists, fallback to old logic (skip for now)
          if (!rankedRunnerIds || !Array.isArray(rankedRunnerIds) || rankedRunnerIds.length === 0) {
            console.log(`[Reassign Timeout] Commission ${commission.id} has no queue (old commission), skipping queue-based reassignment`);
            continue;
          }

          // Check if queue will be exhausted after incrementing index
          // This handles both single-runner queues (index 0 -> 1, length 1) and multi-runner queues
          const nextQueueIndex = currentQueueIndex + 1;
          if (nextQueueIndex >= rankedRunnerIds.length) {
            console.log(`[Reassign Timeout] Queue exhausted for commission ${commission.id} (index ${currentQueueIndex} -> ${nextQueueIndex}, queue length ${rankedRunnerIds.length}), cancelling task`);
            
            // Cancel commission, clear notified_runner_id, and notify caller
            const { error: cancelError } = await supabase
              .from("commission")
              .update({ 
                status: 'cancelled',
                notified_runner_id: null,
                notified_at: null,
                is_notified: false,
                current_queue_index: nextQueueIndex, // Update index even if exhausted
                timeout_runner_ids: updatedTimeoutRunnerIds, // Append previousRunnerId for audit
              })
              .eq("id", commission.id)
              .eq("status", "pending");

            if (!cancelError) {
              // Notify caller that no runners are available
              const callerChannel = `caller_notify_${commission.buddycaller_id}`;
              const broadcastChannel = supabase.channel(callerChannel);
              await broadcastChannel.send({
                type: 'broadcast',
                event: 'task_cancelled',
                payload: {
                  task_id: commission.id,
                  task_type: 'commission',
                  task_title: commission.title,
                  reason: 'no_runners_available',
                },
              });

              result.processed.commissions.cleared++;
              console.log(`[Reassign Timeout] ✅ Cancelled commission ${commission.id} (queue exhausted), cleared notified_runner_id`);
            } else {
              result.errors.push({
                taskId: commission.id,
                taskType: "commission",
                error: `Failed to cancel commission after queue exhaustion: ${cancelError.message}`,
              });
              console.error(`[Reassign Timeout] ❌ Failed to cancel commission ${commission.id} after queue exhaustion:`, cancelError);
            }
            continue;
          }

          // Advance to next runner in queue (queue is not exhausted)
          const nextRunnerId = rankedRunnerIds[nextQueueIndex];
          const newQueueIndex = nextQueueIndex;
          const assignedAt = new Date().toISOString();

          // Atomic update: only if still assigned to previous runner
          // Update timeout_runner_ids atomically with queue index (for audit/history)
          const { data: updateData, error: updateError } = await supabase
            .from("commission")
            .update({
              notified_runner_id: nextRunnerId,
              notified_at: assignedAt,
              current_queue_index: newQueueIndex,
              timeout_runner_ids: updatedTimeoutRunnerIds, // Append previousRunnerId for audit
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
          const channelName = `commission_notify_${nextRunnerId}`;
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
          console.log(`[Reassign Timeout] ✅ Reassigned commission ${commission.id} to runner ${nextRunnerId} (queue index ${currentQueueIndex})`);

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
