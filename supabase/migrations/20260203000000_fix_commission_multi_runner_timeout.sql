-- ============================================================================
-- Migration: Fix Commission Multi-Runner Timeout Bug
-- ============================================================================
-- 
-- Purpose: Fix queue advancement bug in process_timed_out_tasks() that prevents
--          multi-runner commissions from advancing to the next runner on timeout
-- 
-- Bug: The commission reassignment UPDATE WHERE clause was missing an
--      idempotency guard, causing 0-row updates when notified_runner_id changed
--      between SELECT and UPDATE (race condition or concurrent processing)
-- 
-- Fix: Add `AND notified_runner_id = commission_rec.notified_runner_id` to
--      the WHERE clause in the commission reassignment UPDATE
-- 
-- Scope: Commission reassignment logic ONLY
--        Errand logic unchanged
--        Timeout duration unchanged (60 seconds)
--        Queue logic unchanged
-- ============================================================================

-- Recreate the function with the fix
CREATE OR REPLACE FUNCTION process_timed_out_tasks()
RETURNS JSON AS $$
DECLARE
  result JSON;
  errands_processed INTEGER := 0;
  errands_reassigned INTEGER := 0;
  errands_cancelled INTEGER := 0;
  commissions_processed INTEGER := 0;
  commissions_reassigned INTEGER := 0;
  commissions_cancelled INTEGER := 0;
  errors TEXT[] := ARRAY[]::TEXT[];
  
  -- Errand processing variables
  errand_rec RECORD;
  errand_updated RECORD;
  errand_ranked_runner_ids TEXT[];
  errand_current_index INTEGER;
  errand_next_index INTEGER;
  errand_next_runner_id TEXT;
  errand_timeout_runner_ids uuid[];
  errand_updated_timeout_ids uuid[];
  errand_queue_length INTEGER;
  
  -- Commission processing variables
  commission_rec RECORD;
  commission_updated RECORD;
  commission_ranked_runner_ids TEXT[];
  commission_current_index INTEGER;
  commission_next_index INTEGER;
  commission_next_runner_id TEXT;
  commission_timeout_runner_ids uuid[];
  commission_updated_timeout_ids uuid[];
  commission_queue_length INTEGER;
BEGIN
  -- ============================================
  -- Process Errands
  -- ============================================
  FOR errand_rec IN
    SELECT 
      id,
      title,
      buddycaller_id,
      notified_runner_id,
      ranked_runner_ids,
      current_queue_index,
      timeout_runner_ids,
      status,
      runner_id,
      notified_expires_at
    FROM errand
    WHERE status = 'pending'
      AND runner_id IS NULL
      AND notified_runner_id IS NOT NULL
      AND notified_expires_at IS NOT NULL
      AND notified_expires_at <= NOW()  -- ONLY place expiry is checked
    ORDER BY notified_expires_at ASC
    LIMIT 50
    FOR UPDATE SKIP LOCKED  -- Lock row to prevent concurrent modification
  LOOP
    BEGIN
      errands_processed := errands_processed + 1;
      
      RAISE NOTICE '[TIMEOUT] LOCKED errand %, status=%, runner_id=%, expires_at=%',
        errand_rec.id, errand_rec.status, errand_rec.runner_id, errand_rec.notified_expires_at;
      
      -- Read locked row values
      errand_ranked_runner_ids := errand_rec.ranked_runner_ids;
      errand_current_index := COALESCE(errand_rec.current_queue_index, 0);
      errand_timeout_runner_ids := COALESCE(errand_rec.timeout_runner_ids, ARRAY[]::uuid[]);
      errand_queue_length := COALESCE(array_length(errand_ranked_runner_ids, 1), 0);
      
      -- Append current notified_runner_id to timeout_runner_ids (idempotent)
      errand_updated_timeout_ids := errand_timeout_runner_ids;
      IF errand_rec.notified_runner_id IS NOT NULL THEN
        IF NOT (errand_rec.notified_runner_id::uuid = ANY(errand_updated_timeout_ids)) THEN
          errand_updated_timeout_ids := array_append(errand_updated_timeout_ids, errand_rec.notified_runner_id::uuid);
          RAISE NOTICE '[TIMEOUT] Appended runner % to errand % timeout list. New list: %', 
            errand_rec.notified_runner_id, errand_rec.id, errand_updated_timeout_ids;
        ELSE
          RAISE NOTICE '[TIMEOUT] Runner % already in errand % timeout list (idempotent skip)', 
            errand_rec.notified_runner_id, errand_rec.id;
        END IF;
      ELSE
        RAISE WARNING '[TIMEOUT] Errand % has NULL notified_runner_id, cannot append to timeout list', errand_rec.id;
      END IF;
      
      RAISE NOTICE '[TIMEOUT] Errand % final timeout_runner_ids before UPDATE: %', 
        errand_rec.id, errand_updated_timeout_ids;
      
      -- Advance queue index (0-based: current_index=0 means array[1] was notified)
      errand_next_index := errand_current_index + 1;
      
      -- Determine if queue is exhausted
      -- Queue exhausted when: no queue OR next_index >= queue_length
      -- (next_index is 0-based, queue_length is count of 1-based array elements)
      IF errand_queue_length = 0 OR errand_next_index >= errand_queue_length THEN
        -- CANCEL: Queue exhausted
        UPDATE errand
        SET 
          status = 'cancelled',
          notified_runner_id = NULL,
          notified_at = NULL,
          notified_expires_at = NULL,
          is_notified = FALSE,
          current_queue_index = errand_next_index,
          timeout_runner_ids = errand_updated_timeout_ids
        WHERE id = errand_rec.id
          AND status = 'pending'
          AND runner_id IS NULL
        RETURNING * INTO errand_updated;
        
        IF errand_updated.id IS NULL THEN
          RAISE EXCEPTION 'UPDATE failed for errand %: row locked but WHERE clause did not match (status=%, runner_id=%)',
            errand_rec.id, errand_rec.status, errand_rec.runner_id;
        END IF;
        
        RAISE NOTICE '[TIMEOUT] MUTATION errand % CANCELLED (rows_updated=1)', errand_rec.id;
        errands_cancelled := errands_cancelled + 1;
        
        PERFORM pg_notify(
          'caller_notify_' || errand_rec.buddycaller_id,
          json_build_object(
            'type', 'broadcast',
            'event', 'task_cancelled',
            'payload', json_build_object(
              'task_id', errand_rec.id,
              'task_type', 'errand',
              'task_title', errand_rec.title,
              'reason', 'no_runners_available'
            )
          )::text
        );
      ELSE
        -- REASSIGN: Get next runner from queue
        -- Array is 1-based: next_index=1 means array[2] = ranked_runner_ids[next_index + 1]
        errand_next_runner_id := errand_ranked_runner_ids[errand_next_index + 1];
        
        IF errand_next_runner_id IS NULL THEN
          -- Next runner is NULL: cancel instead
          UPDATE errand
          SET 
            status = 'cancelled',
            notified_runner_id = NULL,
            notified_at = NULL,
            notified_expires_at = NULL,
            is_notified = FALSE,
            current_queue_index = errand_next_index,
            timeout_runner_ids = errand_updated_timeout_ids
          WHERE id = errand_rec.id
            AND status = 'pending'
            AND runner_id IS NULL
          RETURNING * INTO errand_updated;
          
          IF errand_updated.id IS NULL THEN
            RAISE EXCEPTION 'UPDATE failed for errand %: next runner NULL, cancel failed',
              errand_rec.id;
          END IF;
          
          RAISE NOTICE '[TIMEOUT] MUTATION errand % CANCELLED (next runner NULL, rows_updated=1)', errand_rec.id;
          errands_cancelled := errands_cancelled + 1;
          
          PERFORM pg_notify(
            'caller_notify_' || errand_rec.buddycaller_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'task_cancelled',
              'payload', json_build_object(
                'task_id', errand_rec.id,
                'task_type', 'errand',
                'task_title', errand_rec.title,
                'reason', 'no_runners_available'
              )
            )::text
          );
        ELSE
          -- REASSIGN: Notify next runner
          UPDATE errand
          SET 
            notified_runner_id = errand_next_runner_id,
            notified_at = NOW(),
            notified_expires_at = NOW() + INTERVAL '60 seconds',
            current_queue_index = errand_next_index,
            timeout_runner_ids = errand_updated_timeout_ids,
            is_notified = TRUE
          WHERE id = errand_rec.id
            AND status = 'pending'
            AND runner_id IS NULL
          RETURNING * INTO errand_updated;
          
          IF errand_updated.id IS NULL THEN
            RAISE EXCEPTION 'UPDATE failed for errand %: row locked but WHERE clause did not match (status=%, runner_id=%)',
              errand_rec.id, errand_rec.status, errand_rec.runner_id;
          END IF;
          
          RAISE NOTICE '[TIMEOUT] MUTATION errand % REASSIGNED to runner % (rows_updated=1)', 
            errand_rec.id, errand_next_runner_id;
          errands_reassigned := errands_reassigned + 1;
          
          PERFORM pg_notify(
            'errand_notify_' || errand_next_runner_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'errand_notification',
              'payload', json_build_object(
                'errand_id', errand_rec.id,
                'errand_title', errand_rec.title,
                'assigned_at', NOW()
              )
            )::text
          );
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      errors := errors || ARRAY['Error processing errand ' || errand_rec.id::text || ': ' || SQLERRM];
      RAISE WARNING '[TIMEOUT] Error processing errand %: %', errand_rec.id, SQLERRM;
    END;
  END LOOP;
  
  -- ============================================
  -- Process Commissions
  -- ============================================
  FOR commission_rec IN
    SELECT 
      id,
      title,
      buddycaller_id,
      notified_runner_id,
      ranked_runner_ids,
      current_queue_index,
      timeout_runner_ids,
      status,
      runner_id,
      notified_expires_at
    FROM commission
    WHERE status = 'pending'
      AND runner_id IS NULL
      AND notified_runner_id IS NOT NULL
      AND notified_expires_at IS NOT NULL
      AND notified_expires_at <= NOW()  -- ONLY place expiry is checked
    ORDER BY notified_expires_at ASC
    LIMIT 50
    FOR UPDATE SKIP LOCKED  -- Lock row to prevent concurrent modification
  LOOP
    BEGIN
      commissions_processed := commissions_processed + 1;
      
      RAISE NOTICE '[TIMEOUT] LOCKED commission %, status=%, runner_id=%, expires_at=%',
        commission_rec.id, commission_rec.status, commission_rec.runner_id, commission_rec.notified_expires_at;
      
      -- Read locked row values
      commission_ranked_runner_ids := commission_rec.ranked_runner_ids;
      commission_current_index := COALESCE(commission_rec.current_queue_index, 0);
      commission_timeout_runner_ids := COALESCE(commission_rec.timeout_runner_ids, ARRAY[]::uuid[]);
      commission_queue_length := COALESCE(array_length(commission_ranked_runner_ids, 1), 0);
      
      -- Append current notified_runner_id to timeout_runner_ids (idempotent)
      commission_updated_timeout_ids := commission_timeout_runner_ids;
      IF commission_rec.notified_runner_id IS NOT NULL THEN
        IF NOT (commission_rec.notified_runner_id::uuid = ANY(commission_updated_timeout_ids)) THEN
          commission_updated_timeout_ids := array_append(commission_updated_timeout_ids, commission_rec.notified_runner_id::uuid);
          RAISE NOTICE '[TIMEOUT] Appended runner % to commission % timeout list. New list: %', 
            commission_rec.notified_runner_id, commission_rec.id, commission_updated_timeout_ids;
        ELSE
          RAISE NOTICE '[TIMEOUT] Runner % already in commission % timeout list (idempotent skip)', 
            commission_rec.notified_runner_id, commission_rec.id;
        END IF;
      ELSE
        RAISE WARNING '[TIMEOUT] Commission % has NULL notified_runner_id, cannot append to timeout list', commission_rec.id;
      END IF;
      
      RAISE NOTICE '[TIMEOUT] Commission % final timeout_runner_ids before UPDATE: %', 
        commission_rec.id, commission_updated_timeout_ids;
      
      -- Advance queue index (0-based: current_index=0 means array[1] was notified)
      commission_next_index := commission_current_index + 1;
      
      -- Determine if queue is exhausted
      -- Queue exhausted when: no queue OR next_index >= queue_length
      IF commission_queue_length = 0 OR commission_next_index >= commission_queue_length THEN
        -- CANCEL: Queue exhausted
        UPDATE commission
        SET 
          status = 'cancelled',
          notified_runner_id = NULL,
          notified_at = NULL,
          notified_expires_at = NULL,
          is_notified = FALSE,
          current_queue_index = commission_next_index,
          timeout_runner_ids = commission_updated_timeout_ids
        WHERE id = commission_rec.id
          AND status = 'pending'
          AND runner_id IS NULL
        RETURNING * INTO commission_updated;
        
        IF commission_updated.id IS NULL THEN
          RAISE EXCEPTION 'UPDATE failed for commission %: row locked but WHERE clause did not match (status=%, runner_id=%)',
            commission_rec.id, commission_rec.status, commission_rec.runner_id;
        END IF;
        
        RAISE NOTICE '[TIMEOUT] MUTATION commission % CANCELLED (rows_updated=1)', commission_rec.id;
        commissions_cancelled := commissions_cancelled + 1;
        
        PERFORM pg_notify(
          'caller_notify_' || commission_rec.buddycaller_id,
          json_build_object(
            'type', 'broadcast',
            'event', 'task_cancelled',
            'payload', json_build_object(
              'task_id', commission_rec.id,
              'task_type', 'commission',
              'task_title', commission_rec.title,
              'reason', 'no_runners_available'
            )
          )::text
        );
      ELSE
        -- REASSIGN: Get next runner from queue
        -- Array is 1-based: next_index=1 means array[2] = ranked_runner_ids[next_index + 1]
        commission_next_runner_id := commission_ranked_runner_ids[commission_next_index + 1];
        
        IF commission_next_runner_id IS NULL THEN
          -- Next runner is NULL: cancel instead
          UPDATE commission
          SET 
            status = 'cancelled',
            notified_runner_id = NULL,
            notified_at = NULL,
            notified_expires_at = NULL,
            is_notified = FALSE,
            current_queue_index = commission_next_index,
            timeout_runner_ids = commission_updated_timeout_ids
          WHERE id = commission_rec.id
            AND status = 'pending'
            AND runner_id IS NULL
          RETURNING * INTO commission_updated;
          
          IF commission_updated.id IS NULL THEN
            RAISE EXCEPTION 'UPDATE failed for commission %: next runner NULL, cancel failed',
              commission_rec.id;
          END IF;
          
          RAISE NOTICE '[TIMEOUT] MUTATION commission % CANCELLED (next runner NULL, rows_updated=1)', commission_rec.id;
          commissions_cancelled := commissions_cancelled + 1;
          
          PERFORM pg_notify(
            'caller_notify_' || commission_rec.buddycaller_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'task_cancelled',
              'payload', json_build_object(
                'task_id', commission_rec.id,
                'task_type', 'commission',
                'task_title', commission_rec.title,
                'reason', 'no_runners_available'
              )
            )::text
          );
        ELSE
          -- REASSIGN: Notify next runner
          -- FIX: Added idempotency guard to WHERE clause to prevent 0-row updates
          --      when notified_runner_id changes between SELECT and UPDATE
          UPDATE commission
          SET 
            notified_runner_id = commission_next_runner_id,
            notified_at = NOW(),
            notified_expires_at = NOW() + INTERVAL '60 seconds',
            current_queue_index = commission_next_index,
            timeout_runner_ids = commission_updated_timeout_ids,
            is_notified = TRUE
          WHERE id = commission_rec.id
            AND status = 'pending'
            AND runner_id IS NULL
            AND notified_runner_id = commission_rec.notified_runner_id
          RETURNING * INTO commission_updated;
          
          IF commission_updated.id IS NULL THEN
            RAISE EXCEPTION 'UPDATE failed for commission %: row locked but WHERE clause did not match (status=%, runner_id=%)',
              commission_rec.id, commission_rec.status, commission_rec.runner_id;
          END IF;
          
          RAISE NOTICE '[TIMEOUT] MUTATION commission % REASSIGNED to runner % (rows_updated=1)', 
            commission_rec.id, commission_next_runner_id;
          commissions_reassigned := commissions_reassigned + 1;
          
          PERFORM pg_notify(
            'commission_notify_' || commission_next_runner_id,
            json_build_object(
              'type', 'broadcast',
              'event', 'commission_notification',
              'payload', json_build_object(
                'commission_id', commission_rec.id,
                'commission_title', commission_rec.title,
                'assigned_at', NOW()
              )
            )::text
          );
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      errors := errors || ARRAY['Error processing commission ' || commission_rec.id::text || ': ' || SQLERRM];
      RAISE WARNING '[TIMEOUT] Error processing commission %: %', commission_rec.id, SQLERRM;
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
    'executed_at', NOW()
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
    NOW(),
    errands_processed,
    errands_reassigned,
    errands_cancelled,
    commissions_processed,
    commissions_reassigned,
    commissions_cancelled,
    errors
  );
  
  RAISE NOTICE '[TIMEOUT] Completed: Errands: % processed, % reassigned, % cancelled. Commissions: % processed, % reassigned, % cancelled',
    errands_processed, errands_reassigned, errands_cancelled,
    commissions_processed, commissions_reassigned, commissions_cancelled;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Verify the function was created successfully
DO $$
DECLARE
  func_def TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO func_def
  FROM pg_proc
  WHERE proname = 'process_timed_out_tasks';
  
  IF func_def IS NULL THEN
    RAISE EXCEPTION 'Function process_timed_out_tasks() not found after creation';
  END IF;
  
  -- Verify the fix is present: commission reassignment UPDATE has idempotency guard
  IF func_def !~* 'AND notified_runner_id = commission_rec\.notified_runner_id' THEN
    RAISE EXCEPTION 'Fix verification failed: Commission reassignment UPDATE missing idempotency guard';
  END IF;
  
  RAISE NOTICE '✅ Migration applied successfully: Commission multi-runner timeout fix verified';
END $$;
