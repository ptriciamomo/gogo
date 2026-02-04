# Root Cause Analysis: Errand Timeout Not Advancing

## Investigation Summary

Based on codebase analysis, I've identified **multiple potential root causes** that need to be verified in production.

## 🔴 CRITICAL FINDING: Dual Timeout Processing Systems

**There are TWO separate timeout processing systems:**

1. **SQL Function**: `process_timed_out_tasks()` 
   - Called by cron job: `reassign-timed-out-tasks-cron`
   - Schedule: Every 10 seconds (`*/10 * * * * *`)
   - Command: `SELECT process_timed_out_tasks();`

2. **Edge Function**: `supabase/functions/reassign-timed-out-tasks/index.ts`
   - Also handles timeout reassignment
   - Uses different logic (TypeScript/JavaScript)
   - May still be scheduled via cron or called manually

**⚠️ CONFLICT RISK**: If both systems are active, they could:
- Race each other
- Overwrite each other's updates
- Cause idempotency guard failures

## 🔍 Investigation Checklist

### 1️⃣ Is `process_timed_out_tasks()` Actually Being Executed?

**Check in Supabase SQL Editor:**
```sql
-- Verify cron job exists and is active
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname = 'reassign-timed-out-tasks-cron';
```

**Expected Result:**
- `active = true`
- `schedule = '*/10 * * * * *'`
- `command = 'SELECT process_timed_out_tasks();'`

**Check execution logs:**
```sql
SELECT executed_at, errands_processed, errands_reassigned, errands_cancelled
FROM timeout_reassignment_log
ORDER BY executed_at DESC
LIMIT 20;
```

**Expected Result:**
- Recent rows (within last 1-2 minutes)
- `errands_processed > 0` if there are eligible errands

**If no recent logs:**
- ❌ **Root Cause**: Cron job not running OR function not being called
- **Fix**: Verify cron job is active, check Supabase cron extension is enabled

---

### 2️⃣ Confirm Function Version in Production

**Check function definition:**
```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'process_timed_out_tasks';
```

**Verify these strings exist in the definition:**
- ✅ `errand_check_index` (timeout skip loop variable)
- ✅ `WHILE errand_check_index < errand_queue_length` (timeout skip loop)
- ✅ `AND notified_runner_id = errand_rec.notified_runner_id` (idempotency guard)
- ❌ `commission_ranked_runner_ids[commission_check_index` (should NOT exist)

**If timeout skip loop is missing:**
- ❌ **Root Cause**: Wrong function version deployed
- **Fix**: Re-run migration `20260203000004_fix_errand_timeout_skip_timed_out_runners.sql`

---

### 3️⃣ Check If Errands Are Eligible for Selection

**For errands 798, 799, 800:**
```sql
SELECT 
  id,
  status,
  runner_id,
  notified_runner_id,
  notified_expires_at,
  CASE 
    WHEN status = 'pending' 
      AND runner_id IS NULL 
      AND notified_runner_id IS NOT NULL 
      AND notified_expires_at IS NOT NULL 
      AND notified_expires_at <= NOW() 
    THEN '✅ ELIGIBLE'
    ELSE '❌ NOT ELIGIBLE'
  END AS eligibility
FROM errand
WHERE id IN (798, 799, 800);
```

**If NOT ELIGIBLE:**
- ❌ **Root Cause**: WHERE clause conditions not met
- **Common causes:**
  - `status != 'pending'` (might be 'notified' or other)
  - `runner_id IS NOT NULL` (already accepted)
  - `notified_expires_at IS NULL` (never set)
  - `notified_expires_at > NOW()` (not expired yet)

---

### 4️⃣ Verify Nothing Is Resetting `notified_expires_at`

**Check if expires_at is being updated:**
```sql
SELECT 
  id,
  notified_expires_at,
  updated_at,
  NOW() - updated_at AS time_since_update
FROM errand
WHERE id IN (798, 799, 800)
  AND notified_expires_at > NOW();
```

**If expires_at is in the future:**
- ❌ **Root Cause**: External code resetting timeout
- **Check these files:**
  - `supabase/functions/assign-errand/index.ts` (only sets on initial assignment)
  - `supabase/functions/reassign-timed-out-tasks/index.ts` (should not run if SQL function is active)
  - Any frontend code polling/refreshing errands

---

### 5️⃣ Check for Transaction Blocking

**Check for long-running transactions:**
```sql
SELECT pid, state, query_start, NOW() - query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
  AND NOW() - query_start > INTERVAL '5 seconds';
```

**Check for locks on errand table:**
```sql
SELECT l.mode, l.granted, a.usename, a.query
FROM pg_locks l
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation = 'errand'::regclass::oid;
```

**If locks found:**
- ❌ **Root Cause**: Row locked by another transaction
- **Fix**: `FOR UPDATE SKIP LOCKED` should handle this, but verify it's working

---

### 6️⃣ Verify Commission Timeout Works (Proves Scheduler)

**Check commission processing:**
```sql
SELECT executed_at, commissions_processed, commissions_reassigned
FROM timeout_reassignment_log
WHERE commissions_processed > 0
ORDER BY executed_at DESC
LIMIT 10;
```

**If commissions are being processed:**
- ✅ **Proves**: Cron job IS running, function IS executing
- **Conclusion**: Issue is specific to errand WHERE clause or errand logic

**If commissions are NOT being processed:**
- ❌ **Root Cause**: Function not executing at all
- **Conclusion**: Cron job or function deployment issue

---

### 7️⃣ Check for Environment Mismatch

**Verify migration was applied:**
```sql
SELECT version, name, inserted_at
FROM supabase_migrations.schema_migrations
WHERE name LIKE '%timeout%' OR name LIKE '%reassignment%'
ORDER BY inserted_at DESC;
```

**Expected migrations:**
- `20260203000004_fix_errand_timeout_skip_timed_out_runners.sql` (most recent)
- `20260203000003_fix_errand_multi_runner_timeout.sql`
- `20260201030451_fix_timeout_reassignment_sql_function.sql`

**If migration is missing:**
- ❌ **Root Cause**: Migration not applied to production
- **Fix**: Run `supabase db push` or apply migration manually

---

## 🎯 Most Likely Root Causes (Prioritized)

### 1. **Cron Job Still Calling Edge Function Instead of SQL Function** (CRITICAL)
- **Evidence**: Migration history shows transition from Edge Function → SQL Function
- **Risk**: If `20260201030451_fix_timeout_reassignment_sql_function.sql` wasn't applied, cron still calls Edge Function
- **Fix**: Verify cron job command is `SELECT process_timed_out_tasks();` NOT `net.http_post(...)`
- **SQL Check**:
  ```sql
  SELECT command FROM cron.job WHERE jobname = 'reassign-timed-out-tasks-cron';
  ```
  - ✅ **Correct**: `SELECT process_timed_out_tasks();`
  - ❌ **Wrong**: `SELECT net.http_post(...)` (calling Edge Function)

### 2. **Function Not Executing** (Highest Priority)
- **Evidence**: No recent rows in `timeout_reassignment_log`
- **Fix**: Verify cron job is active, check Supabase cron extension

### 3. **Wrong Function Version Deployed** (High Priority)
- **Evidence**: Function definition missing timeout skip loop
- **Fix**: Re-run migration `20260203000004_fix_errand_timeout_skip_timed_out_runners.sql`

### 4. **Errands Not Eligible (WHERE Clause)** (High Priority)
- **Evidence**: Errands don't meet all WHERE conditions
- **Fix**: Check each condition individually (status, runner_id, notified_expires_at)

### 5. **Edge Function Conflict** (Medium Priority)
- **Evidence**: Both SQL function and Edge Function are active
- **Fix**: Disable Edge Function cron job, ensure only SQL function runs

### 6. **External Code Resetting Timeout** (Medium Priority)
- **Evidence**: `notified_expires_at` is in the future
- **Fix**: Find and disable code that updates `notified_expires_at`

### 7. **Transaction Locking** (Low Priority)
- **Evidence**: Long-running transactions or locks on errand table
- **Fix**: `FOR UPDATE SKIP LOCKED` should handle this, but verify

---

## 📋 Diagnostic SQL Script

I've created `DIAGNOSTIC_TIMEOUT_INVESTIGATION.sql` with all the queries above. Run it in Supabase SQL Editor to get a complete picture.

---

## ✅ Next Steps

1. **Run diagnostic queries** in Supabase SQL Editor
2. **Share results** for errands 798, 799, 800
3. **Check `timeout_reassignment_log`** for recent executions
4. **Verify cron job** is active and pointing to SQL function
5. **Confirm function version** includes timeout skip loop

Once we have the diagnostic results, we can pinpoint the exact root cause and apply a targeted fix.
