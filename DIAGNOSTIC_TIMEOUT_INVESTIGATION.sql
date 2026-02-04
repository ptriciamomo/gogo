-- ============================================================================
-- DIAGNOSTIC: Errand Timeout Investigation
-- ============================================================================
-- Run these queries in Supabase SQL Editor to diagnose why timeout is not working
-- ============================================================================

-- ============================================================================
-- 1️⃣ CHECK IF process_timed_out_tasks() IS BEING EXECUTED
-- ============================================================================

-- Check if cron job exists and is active
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command,
  nodename,
  nodeport,
  database
FROM cron.job
WHERE jobname = 'reassign-timed-out-tasks-cron';

-- Check recent executions in timeout_reassignment_log
SELECT 
  id,
  executed_at,
  errands_processed,
  errands_reassigned,
  errands_cancelled,
  commissions_processed,
  commissions_reassigned,
  commissions_cancelled,
  errors,
  NOW() - executed_at AS age
FROM timeout_reassignment_log
ORDER BY executed_at DESC
LIMIT 20;

-- Check if function exists and get its definition
SELECT 
  proname,
  prosrc,
  pg_get_functiondef(oid) AS full_definition
FROM pg_proc
WHERE proname = 'process_timed_out_tasks';

-- ============================================================================
-- 2️⃣ VERIFY FUNCTION VERSION IN PRODUCTION
-- ============================================================================

-- Check if errand timeout skip loop exists
SELECT 
  CASE 
    WHEN pg_get_functiondef(oid) ~* 'errand_check_index' THEN '✅ Errand timeout skip loop EXISTS'
    ELSE '❌ Errand timeout skip loop MISSING'
  END AS errand_skip_loop_check,
  CASE 
    WHEN pg_get_functiondef(oid) ~* 'AND notified_runner_id = errand_rec\.notified_runner_id' THEN '✅ Errand idempotency guard EXISTS'
    ELSE '❌ Errand idempotency guard MISSING'
  END AS errand_idempotency_check,
  CASE 
    WHEN pg_get_functiondef(oid) ~* 'commission_ranked_runner_ids\[commission_check_index' THEN '❌ Commission logic was modified (should be unchanged)'
    ELSE '✅ Commission logic unchanged'
  END AS commission_unchanged_check
FROM pg_proc
WHERE proname = 'process_timed_out_tasks';

-- ============================================================================
-- 3️⃣ CHECK IF ERRANDS ARE ELIGIBLE FOR TIMEOUT PROCESSING
-- ============================================================================

-- Check errands 798, 799, 800 specifically
SELECT 
  id,
  status,
  runner_id,
  notified_runner_id,
  notified_at,
  notified_expires_at,
  current_queue_index,
  timeout_runner_ids,
  ranked_runner_ids,
  array_length(ranked_runner_ids, 1) AS queue_length,
  NOW() - notified_expires_at AS time_since_expiry,
  -- Check each WHERE clause condition
  CASE WHEN status = 'pending' THEN '✅' ELSE '❌' END AS status_check,
  CASE WHEN runner_id IS NULL THEN '✅' ELSE '❌' END AS runner_id_check,
  CASE WHEN notified_runner_id IS NOT NULL THEN '✅' ELSE '❌' END AS notified_runner_id_check,
  CASE WHEN notified_expires_at IS NOT NULL THEN '✅' ELSE '❌' END AS expires_at_check,
  CASE WHEN notified_expires_at <= NOW() THEN '✅' ELSE '❌' END AS expiry_time_check,
  -- Overall eligibility
  CASE 
    WHEN status = 'pending' 
      AND runner_id IS NULL 
      AND notified_runner_id IS NOT NULL 
      AND notified_expires_at IS NOT NULL 
      AND notified_expires_at <= NOW() 
    THEN '✅ ELIGIBLE'
    ELSE '❌ NOT ELIGIBLE'
  END AS overall_eligibility
FROM errand
WHERE id IN (798, 799, 800)
ORDER BY id;

-- Check ALL pending errands with expired notifications
SELECT 
  id,
  status,
  runner_id,
  notified_runner_id,
  notified_at,
  notified_expires_at,
  NOW() - notified_expires_at AS time_since_expiry,
  current_queue_index,
  array_length(ranked_runner_ids, 1) AS queue_length,
  -- Eligibility breakdown
  CASE WHEN status = 'pending' THEN '✅' ELSE '❌' END AS status_check,
  CASE WHEN runner_id IS NULL THEN '✅' ELSE '❌' END AS runner_id_check,
  CASE WHEN notified_runner_id IS NOT NULL THEN '✅' ELSE '❌' END AS notified_runner_id_check,
  CASE WHEN notified_expires_at IS NOT NULL THEN '✅' ELSE '❌' END AS expires_at_check,
  CASE WHEN notified_expires_at <= NOW() THEN '✅' ELSE '❌' END AS expiry_time_check
FROM errand
WHERE status = 'pending'
  AND runner_id IS NULL
  AND notified_runner_id IS NOT NULL
  AND notified_expires_at IS NOT NULL
  AND notified_expires_at <= NOW()
ORDER BY notified_expires_at ASC
LIMIT 20;

-- ============================================================================
-- 4️⃣ CHECK FOR EXTERNAL CODE RESETTING TIMEOUT FIELDS
-- ============================================================================

-- Check if notified_expires_at is being updated after initial assignment
-- This query shows errands where expires_at is in the future but should have expired
SELECT 
  id,
  status,
  notified_runner_id,
  notified_at,
  notified_expires_at,
  NOW() - notified_expires_at AS time_until_expiry,
  -- Check if expires_at was recently updated (within last 5 minutes)
  updated_at,
  NOW() - updated_at AS time_since_update
FROM errand
WHERE id IN (798, 799, 800)
  AND notified_expires_at > NOW()
ORDER BY id;

-- ============================================================================
-- 5️⃣ CHECK FOR TRANSACTION BLOCKING OR LOCKING
-- ============================================================================

-- Check for long-running transactions that might be holding locks
SELECT 
  pid,
  usename,
  application_name,
  state,
  query_start,
  NOW() - query_start AS query_duration,
  wait_event_type,
  wait_event,
  LEFT(query, 100) AS query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
  AND NOW() - query_start > INTERVAL '5 seconds'
ORDER BY query_start;

-- Check for locks on errand table
SELECT 
  l.locktype,
  l.database,
  l.relation::regclass,
  l.page,
  l.tuple,
  l.virtualxid,
  l.transactionid,
  l.mode,
  l.granted,
  a.usename,
  a.query,
  a.query_start,
  age(now(), a.query_start) AS age
FROM pg_locks l
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation = 'errand'::regclass::oid
ORDER BY a.query_start;

-- ============================================================================
-- 6️⃣ VERIFY COMMISSION TIMEOUT WORKS (PROVES SCHEDULER IS FUNCTIONING)
-- ============================================================================

-- Check if commissions are being processed (proves cron is running)
SELECT 
  executed_at,
  commissions_processed,
  commissions_reassigned,
  commissions_cancelled,
  NOW() - executed_at AS age
FROM timeout_reassignment_log
WHERE commissions_processed > 0
ORDER BY executed_at DESC
LIMIT 10;

-- Check pending commissions with expired notifications
SELECT 
  id,
  status,
  runner_id,
  notified_runner_id,
  notified_at,
  notified_expires_at,
  NOW() - notified_expires_at AS time_since_expiry,
  current_queue_index,
  array_length(ranked_runner_ids, 1) AS queue_length
FROM commission
WHERE status = 'pending'
  AND runner_id IS NULL
  AND notified_runner_id IS NOT NULL
  AND notified_expires_at IS NOT NULL
  AND notified_expires_at <= NOW()
ORDER BY notified_expires_at ASC
LIMIT 10;

-- ============================================================================
-- 7️⃣ CHECK FOR ENVIRONMENT MISMATCH
-- ============================================================================

-- Verify migration history
SELECT 
  version,
  name,
  inserted_at
FROM supabase_migrations.schema_migrations
WHERE name LIKE '%timeout%' OR name LIKE '%reassignment%'
ORDER BY inserted_at DESC;

-- Check if there are multiple versions of the function (should not happen)
SELECT 
  oid,
  proname,
  pronargs,
  prorettype::regtype,
  prosrc
FROM pg_proc
WHERE proname = 'process_timed_out_tasks';

-- ============================================================================
-- 8️⃣ MANUAL TEST: TRY TO SELECT ERRAND 798 WITH FUNCTION'S WHERE CLAUSE
-- ============================================================================

-- This simulates what the function's SELECT query would return
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
WHERE id = 798
  AND status = 'pending'
  AND runner_id IS NULL
  AND notified_runner_id IS NOT NULL
  AND notified_expires_at IS NOT NULL
  AND notified_expires_at <= NOW()
FOR UPDATE SKIP LOCKED;

-- ============================================================================
-- 9️⃣ CHECK FOR EDGE FUNCTION CONFLICT (CRITICAL)
-- ============================================================================

-- Check if there's a cron job calling the Edge Function instead of SQL function
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command,
  -- Verify command type
  CASE 
    WHEN command LIKE '%process_timed_out_tasks()%' THEN '✅ CORRECT: Calling SQL function'
    WHEN command LIKE '%net.http_post%' OR command LIKE '%reassign-timed-out-tasks%' THEN '❌ WRONG: Calling Edge Function'
    ELSE '⚠️ UNKNOWN: Check manually'
  END AS command_type_check
FROM cron.job
WHERE jobname LIKE '%timeout%' OR jobname LIKE '%reassign%';

-- Check for multiple cron jobs (should only be one)
SELECT COUNT(*) AS cron_job_count
FROM cron.job
WHERE jobname LIKE '%timeout%' OR jobname LIKE '%reassign%';
