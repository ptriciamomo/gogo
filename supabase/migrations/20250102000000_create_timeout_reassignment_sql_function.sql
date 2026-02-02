-- Migration: Create SQL function for timeout reassignment
-- Purpose: Handle 60-second timeout reassignment for errands and commissions using pure SQL
-- Replaces Edge Function approach with direct Postgres function

-- Ensure required extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a simple log table for debugging (optional, can be removed if not needed)
CREATE TABLE IF NOT EXISTS timeout_reassignment_log (
  id BIGSERIAL PRIMARY KEY,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  errands_processed INTEGER DEFAULT 0,
  errands_reassigned INTEGER DEFAULT 0,
  errands_cancelled INTEGER DEFAULT 0,
  commissions_processed INTEGER DEFAULT 0,
  commissions_reassigned INTEGER DEFAULT 0,
  commissions_cancelled INTEGER DEFAULT 0,
  errors TEXT[]
);

-- SQL Function: Process timed-out errands and commissions
CREATE OR REPLACE FUNCTION process_timed_out_tasks()
RETURNS JSON AS $$
DECLARE
  now_ts TIMESTAMPTZ;
  result JSON;
  errands_processed INTEGER := 0;
  errands_reassigned INTEGER := 0;
  errands_cancelled INTEGER := 0;
  commissions_processed INTEGER := 0;
  commissions_reassigned INTEGER := 0;
  commissions_cancelled INTEGER := 0;
  errors TEXT[] := ARRAY[]::TEXT[];
  
  -- Errand processing variables
  timed_out_errand RECORD;
  errand_ranked_runner_ids TEXT[];
  errand_current_index INTEGER;
  errand_next_index INTEGER;
  errand_next_runner_id TEXT;
  errand_timeout_runner_ids TEXT[];
  errand_updated_timeout_ids TEXT[];
  errand_previous_runner_id TEXT;
  errand_current_notified_runner_id TEXT;  -- For idempotency check
  errand_update_count INTEGER;
  
  -- Commission processing variables
  timed_out_commission RECORD;
  commission_ranked_runner_ids TEXT[];
  commission_current_index INTEGER;
  commission_next_index INTEGER;
  commission_next_runner_id TEXT;
  commission_timeout_runner_ids TEXT[];
  commission_updated_timeout_ids TEXT[];
  commission_previous_runner_id TEXT;
  commission_current_notified_runner_id TEXT;  -- For idempotency check
  commission_update_count INTEGER;
BEGIN
  now_ts := NOW();
  
  RAISE NOTICE '[TIMEOUT SQL] Starting timeout reassignment at %', now_ts;
  
  -- ============================================
  -- Process Errands
  -- ============================================
  FOR timed_out_errand IN
    SELECT 
      id,
      title,
      buddycaller_id,
      notified_runner_id,
      ranked_runner_ids,
      current_queue_index,
      timeout_runner_ids,
      status,
      runner_id
    FROM errand
    WHERE status = 'pending'
      AND runner_id IS NULL
      AND notified_runner_id IS NOT NULL
      AND notified_expires_at IS NOT NULL
      AND notified_expires_at <= now_ts
    ORDER BY notified_expires_at ASC
    LIMIT 50
  LOOP
    BEGIN
      errands_processed := errands_processed + 1;
      errand_previous_runner_id := timed_out_errand.notified_runner_id;
      
      -- DEBUG: Log initial state
      RAISE NOTICE '[TIMEOUT SQL] Processing errand %: notified_runner_id=%, notified_expires_at=%, NOW()=%', 
        timed_out_errand.id, 
        timed_out_errand.notified_runner_id, 
        timed_out_errand.notified_expires_at,
        now_ts;
      
      -- Idempotency check: Re-fetch to verify state hasn't changed
      -- Use separate variable to store current DB value (don't overwrite errand_previous_runner_id)
      SELECT 
        notified_runner_id,
        status,
        runner_id,
        ranked_runner_ids,
        current_queue_index,
        timeout_runner_ids
      INTO
        errand_current_notified_runner_id,
        timed_out_errand.status,
        timed_out_errand.runner_id,
        errand_ranked_runner_ids,
        errand_current_index,
        errand_timeout_runner_ids
      FROM errand
      WHERE id = timed_out_errand.id
        AND status = 'pending'
        AND runner_id IS NULL
        AND notified_runner_id = errand_previous_runner_id;
      
      -- Skip if idempotency check failed (already processed)
      IF NOT FOUND THEN
        RAISE NOTICE '[TIMEOUT SQL] Errand % already processed (idempotency check failed), skipping. Expected notified_runner_id=%, but row not found', 
          timed_out_errand.id, errand_previous_runner_id;
        CONTINUE;
      END IF;
      
      -- Verify the fetched value matches (sanity check)
      IF errand_current_notified_runner_id IS DISTINCT FROM errand_previous_runner_id THEN
        RAISE WARNING '[TIMEOUT SQL] Errand % notified_runner_id mismatch: expected %, got %, skipping', 
          timed_out_errand.id, errand_previous_runner_id, errand_current_notified_runner_id;
        CONTINUE;
      END IF;
      
      -- DEBUG: Log idempotency check passed
      RAISE NOTICE '[TIMEOUT SQL] Idempotency check passed for errand %: notified_runner_id matches (%)', 
        timed_out_errand.id, errand_previous_runner_id;
      
      -- Default current_queue_index to 0 if NULL
      errand_current_index := COALESCE(errand_current_index, 0);
      
      -- Prepare timeout_runner_ids: append previous runner if not already present
      errand_updated_timeout_ids := COALESCE(errand_timeout_runner_ids, ARRAY[]::TEXT[]);
      IF errand_previous_runner_id IS NOT NULL AND NOT (errand_previous_runner_id = ANY(errand_updated_timeout_ids)) THEN
        errand_updated_timeout_ids := errand_updated_timeout_ids || ARRAY[errand_previous_runner_id];
      END IF;
      
      -- Skip if no queue exists (backward compatibility)
      IF errand_ranked_runner_ids IS NULL OR array_length(errand_ranked_runner_ids, 1) IS NULL OR array_length(errand_ranked_runner_ids, 1) = 0 THEN
        RAISE NOTICE '[TIMEOUT SQL] Errand % has no queue, skipping', timed_out_errand.id;
        CONTINUE;
      END IF;
      
      -- Check if queue will be exhausted
      errand_next_index := errand_current_index + 1;
      
      -- DEBUG: Log queue state
      RAISE NOTICE '[TIMEOUT SQL] Errand % queue state: current_index=%, next_index=%, queue_length=%, timeout_runner_ids before=%', 
        timed_out_errand.id, 
        errand_current_index, 
        errand_next_index, 
        array_length(errand_ranked_runner_ids, 1),
        errand_updated_timeout_ids;
      
      IF errand_next_index >= array_length(errand_ranked_runner_ids, 1) THEN
        -- Queue exhausted: Cancel errand
        RAISE NOTICE '[TIMEOUT SQL] Queue exhausted for errand % (index % -> %, length %), cancelling', 
          timed_out_errand.id, errand_current_index, errand_next_index, array_length(errand_ranked_runner_ids, 1);
        
        -- DEBUG: Log UPDATE attempt
        RAISE NOTICE '[TIMEOUT SQL] Attempting CANCEL UPDATE for errand %: WHERE id=% AND status=pending AND notified_runner_id=%', 
          timed_out_errand.id, timed_out_errand.id, errand_previous_runner_id;
        
        UPDATE errand
        SET 
          status = 'cancelled',
          notified_runner_id = NULL,
          notified_at = NULL,
          notified_expires_at = NULL,
          is_notified = FALSE,
          current_queue_index = errand_next_index,
          timeout_runner_ids = errand_updated_timeout_ids
        WHERE id = timed_out_errand.id
          AND status = 'pending'
          AND notified_runner_id = errand_previous_runner_id;
        
        GET DIAGNOSTICS errand_update_count = ROW_COUNT;
        
        -- DEBUG: Log UPDATE result
        RAISE NOTICE '[TIMEOUT SQL] CANCEL UPDATE result for errand %: rows_updated=%', 
          timed_out_errand.id, errand_update_count;
        
        IF errand_update_count > 0 THEN
          errands_cancelled := errands_cancelled + 1;
          
          -- Notify caller via pg_notify (can be picked up by Supabase Realtime)
          PERFORM pg_notify(
            'caller_notify_' || timed_out_errand.buddycaller_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'task_cancelled',
              'payload', json_build_object(
                'task_id', timed_out_errand.id,
                'task_type', 'errand',
                'task_title', timed_out_errand.title,
                'reason', 'no_runners_available'
              )
            )::text
          );
          
          RAISE NOTICE '[TIMEOUT SQL] ✅ Cancelled errand %', timed_out_errand.id;
        ELSE
          errors := errors || ARRAY['Failed to cancel errand ' || timed_out_errand.id::text];
          RAISE WARNING '[TIMEOUT SQL] ❌ Failed to cancel errand % (UPDATE matched 0 rows)', timed_out_errand.id;
        END IF;
      ELSE
        -- Queue not exhausted: Reassign to next runner
        errand_next_runner_id := errand_ranked_runner_ids[errand_next_index + 1]; -- PostgreSQL arrays are 1-indexed
        
        RAISE NOTICE '[TIMEOUT SQL] Reassigning errand % to runner % (index % -> %)', 
          timed_out_errand.id, errand_next_runner_id, errand_current_index, errand_next_index;
        
        -- DEBUG: Log UPDATE attempt
        RAISE NOTICE '[TIMEOUT SQL] Attempting REASSIGN UPDATE for errand %: WHERE id=% AND status=pending AND runner_id IS NULL AND notified_runner_id=%', 
          timed_out_errand.id, timed_out_errand.id, errand_previous_runner_id;
        
        UPDATE errand
        SET 
          notified_runner_id = errand_next_runner_id,
          notified_at = now_ts,
          notified_expires_at = now_ts + INTERVAL '60 seconds',
          current_queue_index = errand_next_index,
          timeout_runner_ids = errand_updated_timeout_ids,
          is_notified = TRUE
        WHERE id = timed_out_errand.id
          AND status = 'pending'
          AND runner_id IS NULL
          AND notified_runner_id = errand_previous_runner_id;
        
        GET DIAGNOSTICS errand_update_count = ROW_COUNT;
        
        -- DEBUG: Log UPDATE result
        RAISE NOTICE '[TIMEOUT SQL] REASSIGN UPDATE result for errand %: rows_updated=%', 
          timed_out_errand.id, errand_update_count;
        
        IF errand_update_count > 0 THEN
          errands_reassigned := errands_reassigned + 1;
          
          -- Notify new runner via pg_notify
          PERFORM pg_notify(
            'errand_notify_' || errand_next_runner_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'errand_notification',
              'payload', json_build_object(
                'errand_id', timed_out_errand.id,
                'errand_title', timed_out_errand.title,
                'assigned_at', now_ts
              )
            )::text
          );
          
          RAISE NOTICE '[TIMEOUT SQL] ✅ Reassigned errand % to runner %', timed_out_errand.id, errand_next_runner_id;
        ELSE
          errors := errors || ARRAY['Failed to reassign errand ' || timed_out_errand.id::text];
          RAISE WARNING '[TIMEOUT SQL] ❌ Failed to reassign errand % (UPDATE matched 0 rows)', timed_out_errand.id;
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      errors := errors || ARRAY['Error processing errand ' || timed_out_errand.id::text || ': ' || SQLERRM];
      RAISE WARNING '[TIMEOUT SQL] ❌ Error processing errand %: %', timed_out_errand.id, SQLERRM;
    END;
  END LOOP;
  
  -- ============================================
  -- Process Commissions
  -- ============================================
  FOR timed_out_commission IN
    SELECT 
      id,
      title,
      buddycaller_id,
      notified_runner_id,
      ranked_runner_ids,
      current_queue_index,
      timeout_runner_ids,
      status,
      runner_id
    FROM commission
    WHERE status = 'pending'
      AND runner_id IS NULL
      AND notified_runner_id IS NOT NULL
      AND notified_expires_at IS NOT NULL
      AND notified_expires_at <= now_ts
    ORDER BY notified_expires_at ASC
    LIMIT 50
  LOOP
    BEGIN
      commissions_processed := commissions_processed + 1;
      commission_previous_runner_id := timed_out_commission.notified_runner_id;
      
      -- DEBUG: Log initial state
      RAISE NOTICE '[TIMEOUT SQL] Processing commission %: notified_runner_id=%, notified_expires_at=%, NOW()=%', 
        timed_out_commission.id, 
        timed_out_commission.notified_runner_id, 
        timed_out_commission.notified_expires_at,
        now_ts;
      
      -- Idempotency check: Re-fetch to verify state hasn't changed
      -- Use separate variable to store current DB value (don't overwrite commission_previous_runner_id)
      SELECT 
        notified_runner_id,
        status,
        runner_id,
        ranked_runner_ids,
        current_queue_index,
        timeout_runner_ids
      INTO
        commission_current_notified_runner_id,
        timed_out_commission.status,
        timed_out_commission.runner_id,
        commission_ranked_runner_ids,
        commission_current_index,
        commission_timeout_runner_ids
      FROM commission
      WHERE id = timed_out_commission.id
        AND status = 'pending'
        AND runner_id IS NULL
        AND notified_runner_id = commission_previous_runner_id;
      
      -- Skip if idempotency check failed (already processed)
      IF NOT FOUND THEN
        RAISE NOTICE '[TIMEOUT SQL] Commission % already processed (idempotency check failed), skipping. Expected notified_runner_id=%, but row not found', 
          timed_out_commission.id, commission_previous_runner_id;
        CONTINUE;
      END IF;
      
      -- Verify the fetched value matches (sanity check)
      IF commission_current_notified_runner_id IS DISTINCT FROM commission_previous_runner_id THEN
        RAISE WARNING '[TIMEOUT SQL] Commission % notified_runner_id mismatch: expected %, got %, skipping', 
          timed_out_commission.id, commission_previous_runner_id, commission_current_notified_runner_id;
        CONTINUE;
      END IF;
      
      -- DEBUG: Log idempotency check passed
      RAISE NOTICE '[TIMEOUT SQL] Idempotency check passed for commission %: notified_runner_id matches (%)', 
        timed_out_commission.id, commission_previous_runner_id;
      
      -- Default current_queue_index to 0 if NULL
      commission_current_index := COALESCE(commission_current_index, 0);
      
      -- Prepare timeout_runner_ids: append previous runner if not already present
      commission_updated_timeout_ids := COALESCE(commission_timeout_runner_ids, ARRAY[]::TEXT[]);
      IF commission_previous_runner_id IS NOT NULL AND NOT (commission_previous_runner_id = ANY(commission_updated_timeout_ids)) THEN
        commission_updated_timeout_ids := commission_updated_timeout_ids || ARRAY[commission_previous_runner_id];
      END IF;
      
      -- Skip if no queue exists (backward compatibility)
      IF commission_ranked_runner_ids IS NULL OR array_length(commission_ranked_runner_ids, 1) IS NULL OR array_length(commission_ranked_runner_ids, 1) = 0 THEN
        RAISE NOTICE '[TIMEOUT SQL] Commission % has no queue, skipping', timed_out_commission.id;
        CONTINUE;
      END IF;
      
      -- Check if queue will be exhausted
      commission_next_index := commission_current_index + 1;
      
      -- DEBUG: Log queue state
      RAISE NOTICE '[TIMEOUT SQL] Commission % queue state: current_index=%, next_index=%, queue_length=%, timeout_runner_ids before=%', 
        timed_out_commission.id, 
        commission_current_index, 
        commission_next_index, 
        array_length(commission_ranked_runner_ids, 1),
        commission_updated_timeout_ids;
      
      IF commission_next_index >= array_length(commission_ranked_runner_ids, 1) THEN
        -- Queue exhausted: Cancel commission
        RAISE NOTICE '[TIMEOUT SQL] Queue exhausted for commission % (index % -> %, length %), cancelling', 
          timed_out_commission.id, commission_current_index, commission_next_index, array_length(commission_ranked_runner_ids, 1);
        
        -- DEBUG: Log UPDATE attempt
        RAISE NOTICE '[TIMEOUT SQL] Attempting CANCEL UPDATE for commission %: WHERE id=% AND status=pending AND notified_runner_id=%', 
          timed_out_commission.id, timed_out_commission.id, commission_previous_runner_id;
        
        UPDATE commission
        SET 
          status = 'cancelled',
          notified_runner_id = NULL,
          notified_at = NULL,
          notified_expires_at = NULL,
          is_notified = FALSE,
          current_queue_index = commission_next_index,
          timeout_runner_ids = commission_updated_timeout_ids
        WHERE id = timed_out_commission.id
          AND status = 'pending'
          AND notified_runner_id = commission_previous_runner_id;
        
        GET DIAGNOSTICS commission_update_count = ROW_COUNT;
        
        -- DEBUG: Log UPDATE result
        RAISE NOTICE '[TIMEOUT SQL] CANCEL UPDATE result for commission %: rows_updated=%', 
          timed_out_commission.id, commission_update_count;
        
        IF commission_update_count > 0 THEN
          commissions_cancelled := commissions_cancelled + 1;
          
          -- Notify caller via pg_notify
          PERFORM pg_notify(
            'caller_notify_' || timed_out_commission.buddycaller_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'task_cancelled',
              'payload', json_build_object(
                'task_id', timed_out_commission.id,
                'task_type', 'commission',
                'task_title', timed_out_commission.title,
                'reason', 'no_runners_available'
              )
            )::text
          );
          
          RAISE NOTICE '[TIMEOUT SQL] ✅ Cancelled commission %', timed_out_commission.id;
        ELSE
          errors := errors || ARRAY['Failed to cancel commission ' || timed_out_commission.id::text];
          RAISE WARNING '[TIMEOUT SQL] ❌ Failed to cancel commission % (UPDATE matched 0 rows)', timed_out_commission.id;
        END IF;
      ELSE
        -- Queue not exhausted: Reassign to next runner
        commission_next_runner_id := commission_ranked_runner_ids[commission_next_index + 1]; -- PostgreSQL arrays are 1-indexed
        
        RAISE NOTICE '[TIMEOUT SQL] Reassigning commission % to runner % (index % -> %)', 
          timed_out_commission.id, commission_next_runner_id, commission_current_index, commission_next_index;
        
        -- DEBUG: Log UPDATE attempt
        RAISE NOTICE '[TIMEOUT SQL] Attempting REASSIGN UPDATE for commission %: WHERE id=% AND status=pending AND runner_id IS NULL AND notified_runner_id=%', 
          timed_out_commission.id, timed_out_commission.id, commission_previous_runner_id;
        
        UPDATE commission
        SET 
          notified_runner_id = commission_next_runner_id,
          notified_at = now_ts,
          notified_expires_at = now_ts + INTERVAL '60 seconds',
          current_queue_index = commission_next_index,
          timeout_runner_ids = commission_updated_timeout_ids,
          is_notified = TRUE
        WHERE id = timed_out_commission.id
          AND status = 'pending'
          AND runner_id IS NULL
          AND notified_runner_id = commission_previous_runner_id;
        
        GET DIAGNOSTICS commission_update_count = ROW_COUNT;
        
        -- DEBUG: Log UPDATE result
        RAISE NOTICE '[TIMEOUT SQL] REASSIGN UPDATE result for commission %: rows_updated=%', 
          timed_out_commission.id, commission_update_count;
        
        IF commission_update_count > 0 THEN
          commissions_reassigned := commissions_reassigned + 1;
          
          -- Notify new runner via pg_notify
          PERFORM pg_notify(
            'commission_notify_' || commission_next_runner_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'commission_notification',
              'payload', json_build_object(
                'commission_id', timed_out_commission.id,
                'commission_title', timed_out_commission.title,
                'assigned_at', now_ts
              )
            )::text
          );
          
          RAISE NOTICE '[TIMEOUT SQL] ✅ Reassigned commission % to runner %', timed_out_commission.id, commission_next_runner_id;
        ELSE
          errors := errors || ARRAY['Failed to reassign commission ' || timed_out_commission.id::text];
          RAISE WARNING '[TIMEOUT SQL] ❌ Failed to reassign commission % (UPDATE matched 0 rows)', timed_out_commission.id;
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      errors := errors || ARRAY['Error processing commission ' || timed_out_commission.id::text || ': ' || SQLERRM];
      RAISE WARNING '[TIMEOUT SQL] ❌ Error processing commission %: %', timed_out_commission.id, SQLERRM;
    END;
  END LOOP;
  
  -- Build result JSON
  result := json_build_object(
    'success', TRUE,
    'processed', json_build_object(
      'errands', json_build_object(
        'total', errands_processed,
        'reassigned', errands_reassigned,
        'cancelled', errands_cancelled
      ),
      'commissions', json_build_object(
        'total', commissions_processed,
        'reassigned', commissions_reassigned,
        'cancelled', commissions_cancelled
      )
    ),
    'errors', errors,
    'executed_at', now_ts
  );
  
  -- Log to debug table
  INSERT INTO timeout_reassignment_log (
    executed_at,
    errands_processed,
    errands_reassigned,
    errands_cancelled,
    commissions_processed,
    commissions_reassigned,
    commissions_cancelled,
    errors
  ) VALUES (
    now_ts,
    errands_processed,
    errands_reassigned,
    errands_cancelled,
    commissions_processed,
    commissions_reassigned,
    commissions_cancelled,
    errors
  );
  
  RAISE NOTICE '[TIMEOUT SQL] Completed: Errands: % processed, % reassigned, % cancelled. Commissions: % processed, % reassigned, % cancelled',
    errands_processed, errands_reassigned, errands_cancelled,
    commissions_processed, commissions_reassigned, commissions_cancelled;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update cron job to call SQL function instead of Edge Function
DO $$
BEGIN
  -- Drop existing cron job if it exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reassign-timed-out-tasks-cron') THEN
    PERFORM cron.unschedule('reassign-timed-out-tasks-cron');
  END IF;
END $$;

-- Create new cron job to call SQL function every 10 seconds
SELECT cron.schedule(
  'reassign-timed-out-tasks-cron',
  '*/10 * * * * *',  -- Every 10 seconds
  $$SELECT process_timed_out_tasks();$$
);

-- Verify the cron job was created
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname = 'reassign-timed-out-tasks-cron';
