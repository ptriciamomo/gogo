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

-- ============================================
-- STATE MACHINE DEFINITION
-- ============================================
-- pending → notified (notified_runner_id set, notified_at set, notified_expires_at = now + 60s)
--   → timed_out (notified_expires_at <= NOW()) → reassigned (next runner) OR cancelled (queue exhausted)
--
-- INVARIANTS:
-- 1. notified_runner_id, notified_at, notified_expires_at: all NULL or all NOT NULL (atomic)
-- 2. current_queue_index: monotonic, 0-based (tracks last notified runner index)
-- 3. ranked_runner_ids: immutable once set (never modified after initial assignment)
-- 4. timeout_runner_ids: append-only (runners who timed out)

-- SQL Function: Process timed-out errands and commissions
-- Force replacement: Drop existing function to ensure clean deployment
DROP FUNCTION IF EXISTS process_timed_out_tasks();

CREATE FUNCTION process_timed_out_tasks()
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

-- Verify deployment: Check function definition contains required correctness features
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
  
  -- Verify required correctness features
  IF func_def !~* 'FOR UPDATE SKIP LOCKED' THEN
    RAISE EXCEPTION 'Function missing FOR UPDATE SKIP LOCKED';
  END IF;
  
  IF func_def !~* 'RETURNING \* INTO' THEN
    RAISE EXCEPTION 'Function missing UPDATE ... RETURNING * INTO';
  END IF;
  
  IF func_def !~* 'RAISE EXCEPTION.*UPDATE failed' THEN
    RAISE EXCEPTION 'Function missing RAISE EXCEPTION on zero rows';
  END IF;
  
  IF (SELECT COUNT(*) FROM regexp_matches(func_def, 'notified_expires_at <= NOW\(\)', 'g')) != 2 THEN
    RAISE EXCEPTION 'Function must have notified_expires_at <= NOW() exactly twice (once per FOR loop)';
  END IF;
  
  RAISE NOTICE '✅ Function deployment verified: All correctness features present';
END $$;

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

-- ============================================
-- CHECK constraint for atomic notification state
-- ============================================
-- This ensures notified_runner_id, notified_at, and notified_expires_at are set atomically
-- Prevents partial notification state that could cause timeout function to skip rows

-- For errand table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'errand_notification_atomic'
  ) THEN
    ALTER TABLE errand
    ADD CONSTRAINT errand_notification_atomic
    CHECK (
      -- Either all notification fields are NULL (no notification)
      (notified_runner_id IS NULL AND notified_at IS NULL AND notified_expires_at IS NULL) OR
      -- Or all notification fields are set (complete notification)
      (notified_runner_id IS NOT NULL AND notified_at IS NOT NULL AND notified_expires_at IS NOT NULL)
    );
    RAISE NOTICE 'Added errand_notification_atomic constraint';
  END IF;
END $$;

-- For commission table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'commission_notification_atomic'
  ) THEN
    ALTER TABLE commission
    ADD CONSTRAINT commission_notification_atomic
    CHECK (
      -- Either all notification fields are NULL (no notification)
      (notified_runner_id IS NULL AND notified_at IS NULL AND notified_expires_at IS NULL) OR
      -- Or all notification fields are set (complete notification)
      (notified_runner_id IS NOT NULL AND notified_at IS NOT NULL AND notified_expires_at IS NOT NULL)
    );
    RAISE NOTICE 'Added commission_notification_atomic constraint';
  END IF;
END $$;

-- ============================================
-- CORRECTNESS VERIFICATION
-- ============================================
-- Code path analysis confirms:
-- 1. FOR loop is ONLY place expiry is checked: `notified_expires_at <= NOW()` (lines 88, 263)
-- 2. Rows are locked with `FOR UPDATE SKIP LOCKED` (lines 91, 266)
-- 3. Every locked row MUST mutate: Three mutually exclusive paths (queue exhausted, next runner NULL, or reassign)
-- 4. Each path executes UPDATE ... RETURNING * INTO (lines 121-133, 163-175, 200-211, 295-307, 337-349, 374-385)
-- 5. If UPDATE affects 0 rows, `updated.id IS NULL` and RAISE EXCEPTION is executed (lines 135-137, 177-179, 213-215, 309-311, 351-353, 387-389)
-- 6. EXCEPTION handler (lines 237-240, 420-423) catches errors but does NOT allow silent skip - exception propagates or is logged
-- 7. No CONTINUE statements exist after row is locked
-- 8. No time caching - all uses NOW() directly (lines 203, 204, 230, 377, 378, 400)
--
-- CONCLUSION: A locked, expired row CANNOT exit without mutation or exception.

-- ============================================
-- TEST BLOCK: Verify timeout mutation works correctly
-- ============================================
-- This test:
-- 1. Forces an errand to be expired (notified_expires_at = NOW() - 1 minute)
-- 2. Runs process_timed_out_tasks()
-- 3. Verifies that the errand was either reassigned or cancelled
--
-- Usage: Replace 757 with your test errand ID
-- DO $$
-- DECLARE
--   test_errand_id BIGINT := 757;
--   before_state RECORD;
--   after_state RECORD;
--   function_result JSON;
-- BEGIN
--   -- Step 1: Capture initial state
--   SELECT 
--     id, status, runner_id, notified_runner_id, notified_at, notified_expires_at,
--     current_queue_index, ranked_runner_ids, timeout_runner_ids
--   INTO before_state
--   FROM errand
--   WHERE id = test_errand_id;
--   
--   IF before_state.id IS NULL THEN
--     RAISE EXCEPTION 'Test errand % does not exist', test_errand_id;
--   END IF;
--   
--   RAISE NOTICE '[TEST] Before: status=%, runner_id=%, notified_runner_id=%, expires_at=%, queue_index=%, queue_length=%',
--     before_state.status, before_state.runner_id, before_state.notified_runner_id,
--     before_state.notified_expires_at, before_state.current_queue_index,
--     COALESCE(array_length(before_state.ranked_runner_ids, 1), 0);
--   
--   -- Step 2: Force expiry (set notified_expires_at to 1 minute ago)
--   UPDATE errand
--   SET notified_expires_at = NOW() - INTERVAL '1 minute'
--   WHERE id = test_errand_id
--     AND status = 'pending'
--     AND runner_id IS NULL
--     AND notified_runner_id IS NOT NULL;
--   
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Test errand % is not in a state that can be expired (must be pending, runner_id NULL, notified_runner_id NOT NULL)',
--       test_errand_id;
--   END IF;
--   
--   RAISE NOTICE '[TEST] Forced expiry: notified_expires_at = NOW() - 1 minute';
--   
--   -- Step 3: Run timeout function
--   SELECT process_timed_out_tasks() INTO function_result;
--   
--   RAISE NOTICE '[TEST] Function result: %', function_result;
--   
--   -- Step 4: Capture final state
--   SELECT 
--     id, status, runner_id, notified_runner_id, notified_at, notified_expires_at,
--     current_queue_index, ranked_runner_ids, timeout_runner_ids
--   INTO after_state
--   FROM errand
--   WHERE id = test_errand_id;
--   
--   RAISE NOTICE '[TEST] After: status=%, runner_id=%, notified_runner_id=%, expires_at=%, queue_index=%, timeout_runner_ids=%',
--     after_state.status, after_state.runner_id, after_state.notified_runner_id,
--     after_state.notified_expires_at, after_state.current_queue_index,
--     after_state.timeout_runner_ids;
--   
--   -- Step 5: Verify mutation occurred
--   IF before_state.status = after_state.status 
--      AND before_state.notified_runner_id = after_state.notified_runner_id
--      AND before_state.current_queue_index = after_state.current_queue_index THEN
--     RAISE EXCEPTION 'TEST FAILED: Errand % was not mutated. Status, notified_runner_id, and current_queue_index unchanged.',
--       test_errand_id;
--   END IF;
--   
--   -- Step 6: Verify correct mutation type
--   IF after_state.status = 'cancelled' THEN
--     RAISE NOTICE '[TEST] ✅ PASS: Errand was cancelled (queue exhausted)';
--     IF after_state.notified_runner_id IS NOT NULL THEN
--       RAISE EXCEPTION 'TEST FAILED: Cancelled errand should have notified_runner_id = NULL';
--     END IF;
--     IF after_state.current_queue_index <= before_state.current_queue_index THEN
--       RAISE EXCEPTION 'TEST FAILED: Cancelled errand should have incremented current_queue_index';
--     END IF;
--   ELSIF after_state.status = 'pending' AND after_state.notified_runner_id IS NOT NULL THEN
--     RAISE NOTICE '[TEST] ✅ PASS: Errand was reassigned to runner %', after_state.notified_runner_id;
--     IF after_state.notified_runner_id = before_state.notified_runner_id THEN
--       RAISE EXCEPTION 'TEST FAILED: Reassigned errand should have different notified_runner_id';
--     END IF;
--     IF after_state.current_queue_index <= before_state.current_queue_index THEN
--       RAISE EXCEPTION 'TEST FAILED: Reassigned errand should have incremented current_queue_index';
--     END IF;
--     IF after_state.notified_expires_at <= NOW() THEN
--       RAISE EXCEPTION 'TEST FAILED: Reassigned errand should have notified_expires_at > NOW()';
--     END IF;
--     IF before_state.notified_runner_id IS NOT NULL 
--        AND NOT (before_state.notified_runner_id::TEXT = ANY(after_state.timeout_runner_ids::TEXT[])) THEN
--       RAISE EXCEPTION 'TEST FAILED: Previous notified_runner_id should be in timeout_runner_ids';
--     END IF;
--   ELSE
--     RAISE EXCEPTION 'TEST FAILED: Unexpected final state: status=%, notified_runner_id=%',
--       after_state.status, after_state.notified_runner_id;
--   END IF;
--   
--   RAISE NOTICE '[TEST] ✅ All validations passed';
-- END $$;
