// Supabase Edge Function: Timeout Requeue
// Purpose: Clear timed-out notifications to unstall the queue
// The client-side logic will detect cleared notifications via realtime and requeue automatically

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TaskResult {
  taskId: number;
  taskType: "errand" | "commission";
  cleared: boolean;
  error?: string;
}

interface FunctionResult {
  success: boolean;
  processed: {
    errands: { total: number; cleared: number; errors: number };
    commissions: { total: number; cleared: number; errors: number };
  };
  errors: Array<{ taskId: number; taskType: string; error: string }>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const result: FunctionResult = {
      success: true,
      processed: {
        errands: { total: 0, cleared: 0, errors: 0 },
        commissions: { total: 0, cleared: 0, errors: 0 },
      },
      errors: [],
    };

    // Calculate timeout threshold: 60 seconds ago
    const timeoutThreshold = new Date(Date.now() - 60 * 1000).toISOString();

    // ============================================
    // Process Errands
    // ============================================
    console.log(`[Timeout Requeue] Checking errands with notified_at < ${timeoutThreshold}`);

    const { data: timedOutErrands, error: errandsQueryError } = await supabase
      .from("errand")
      .select("id, notified_runner_id, notified_at, timeout_runner_ids, status")
      .eq("status", "pending")
      .not("notified_runner_id", "is", null)
      .lt("notified_at", timeoutThreshold)
      .order("notified_at", { ascending: true })
      .limit(50); // Limit to prevent function timeout

    if (errandsQueryError) {
      console.error("[Timeout Requeue] Error querying errands:", errandsQueryError);
      result.errors.push({
        taskId: 0,
        taskType: "errand",
        error: `Query error: ${errandsQueryError.message}`,
      });
    } else {
      result.processed.errands.total = timedOutErrands?.length || 0;
      console.log(`[Timeout Requeue] Found ${result.processed.errands.total} timed-out errands`);

      // Process each timed-out errand
      for (const errand of timedOutErrands || []) {
        try {
          // Idempotency check: Verify task is still in the same state
          // (notified_runner_id hasn't changed, status is still pending)
          const { data: currentErrand, error: verifyError } = await supabase
            .from("errand")
            .select("notified_runner_id, status")
            .eq("id", errand.id)
            .single();

          if (verifyError) {
            throw new Error(`Verification failed: ${verifyError.message}`);
          }

          // Skip if already processed (notified_runner_id changed or status changed)
          if (
            currentErrand?.notified_runner_id !== errand.notified_runner_id ||
            currentErrand?.status !== "pending"
          ) {
            console.log(
              `[Timeout Requeue] Errand ${errand.id} already processed, skipping`
            );
            continue;
          }

          // Clear notification using existing RPC function
          // This will:
          // 1. Add notified_runner_id to timeout_runner_ids
          // 2. Set notified_runner_id = NULL
          // 3. Set notified_at = NULL
          const { error: clearError } = await supabase.rpc(
            "clear_errand_notification",
            {
              p_errand_id: errand.id,
            }
          );

          if (clearError) {
            throw new Error(`Clear failed: ${clearError.message}`);
          }

          result.processed.errands.cleared++;
          console.log(
            `[Timeout Requeue] ✅ Cleared notification for errand ${errand.id}`
          );
        } catch (error) {
          result.processed.errands.errors++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          result.errors.push({
            taskId: errand.id,
            taskType: "errand",
            error: errorMessage,
          });
          console.error(
            `[Timeout Requeue] ❌ Error processing errand ${errand.id}:`,
            errorMessage
          );
        }
      }
    }

    // ============================================
    // Process Commissions
    // ============================================
    console.log(
      `[Timeout Requeue] Checking commissions with notified_at < ${timeoutThreshold}`
    );

    const {
      data: timedOutCommissions,
      error: commissionsQueryError,
    } = await supabase
      .from("commission")
      .select(
        "id, notified_runner_id, notified_at, timeout_runner_ids, status"
      )
      .eq("status", "pending")
      .not("notified_runner_id", "is", null)
      .lt("notified_at", timeoutThreshold)
      .order("notified_at", { ascending: true })
      .limit(50); // Limit to prevent function timeout

    if (commissionsQueryError) {
      console.error(
        "[Timeout Requeue] Error querying commissions:",
        commissionsQueryError
      );
      result.errors.push({
        taskId: 0,
        taskType: "commission",
        error: `Query error: ${commissionsQueryError.message}`,
      });
    } else {
      result.processed.commissions.total =
        timedOutCommissions?.length || 0;
      console.log(
        `[Timeout Requeue] Found ${result.processed.commissions.total} timed-out commissions`
      );

      // Process each timed-out commission
      for (const commission of timedOutCommissions || []) {
        try {
          // Idempotency check: Verify task is still in the same state
          const { data: currentCommission, error: verifyError } = await supabase
            .from("commission")
            .select("notified_runner_id, status")
            .eq("id", commission.id)
            .single();

          if (verifyError) {
            throw new Error(`Verification failed: ${verifyError.message}`);
          }

          // Skip if already processed
          if (
            currentCommission?.notified_runner_id !==
              commission.notified_runner_id ||
            currentCommission?.status !== "pending"
          ) {
            console.log(
              `[Timeout Requeue] Commission ${commission.id} already processed, skipping`
            );
            continue;
          }

          // Clear notification using existing RPC function
          const { error: clearError } = await supabase.rpc(
            "clear_commission_notification",
            {
              p_commission_id: commission.id,
            }
          );

          if (clearError) {
            throw new Error(`Clear failed: ${clearError.message}`);
          }

          result.processed.commissions.cleared++;
          console.log(
            `[Timeout Requeue] ✅ Cleared notification for commission ${commission.id}`
          );
        } catch (error) {
          result.processed.commissions.errors++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          result.errors.push({
            taskId: commission.id,
            taskType: "commission",
            error: errorMessage,
          });
          console.error(
            `[Timeout Requeue] ❌ Error processing commission ${commission.id}:`,
            errorMessage
          );
        }
      }
    }

    // Return results
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("[Timeout Requeue] Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
