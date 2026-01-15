# Timeout Requeue Edge Function

## Overview

This Edge Function proactively clears timed-out notifications for errands and commissions, unstalling the queue so that existing client-side logic can requeue tasks automatically via realtime updates.

**Key Principle:** This function does NOT do ranking or assignment. It only clears timeouts, letting the existing client-side queueing logic handle requeue naturally.

## What It Does

1. **Runs on schedule** (every 15-30 seconds via cron)
2. **Finds timed-out tasks:**
   - `status = 'pending'`
   - `notified_runner_id IS NOT NULL`
   - `notified_at < NOW() - 60 seconds`
3. **For each timed-out task:**
   - Calls `clear_errand_notification()` or `clear_commission_notification()` RPC
   - This appends `notified_runner_id` to `timeout_runner_ids`
   - This sets `notified_runner_id = NULL` and `notified_at = NULL`
4. **Returns results** (counts of processed/cleared/errors)

## What It Does NOT Do

- ❌ Calculate distance
- ❌ Calculate TF-IDF
- ❌ Rank runners
- ❌ Assign new runners
- ❌ Change any existing client logic

## How It Works with Client-Side Logic

### Flow Diagram

```
┌─────────────────────────────────────┐
│  Edge Function Runs (Cron)           │
│  - Finds timed-out tasks             │
│  - Clears notifications              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Database Updated                   │
│  - notified_runner_id = NULL        │
│  - notified_at = NULL                │
│  - timeout_runner_ids updated       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Supabase Realtime Fires            │
│  - All subscribed clients receive   │
│    update event                     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Client-Side Logic (Existing)       │
│  - Realtime subscription triggers   │
│    refetch()                        │
│  - shouldShowErrand() runs          │
│  - Checks: notified_runner_id NULL? │
│  - YES → Runs full queueing logic   │
│    (distance, TF-IDF, ranking)       │
│  - Assigns to top runner            │
└─────────────────────────────────────┘
```

### Client-Side Detection

When `notified_runner_id` is cleared, the existing client-side logic at `app/buddyrunner/home.tsx:1237` detects it:

```typescript
// If no runner has been notified yet, find and assign top-ranked runner
if (!errand.notified_runner_id) {
    // STEP 1: Task detected
    // ... runs full queueing logic ...
    // - Distance filtering
    // - TF-IDF calculation
    // - Ranking
    // - Assignment
}
```

This check happens automatically when:
1. Realtime subscription fires (database update)
2. Runner manually refreshes
3. Runner opens app

## Idempotency

The function is idempotent through:

1. **Optimistic Locking:**
   - Reads `notified_runner_id` before processing
   - Verifies it hasn't changed before clearing
   - Skips if already processed

2. **Status Verification:**
   - Checks `status = 'pending'` before processing
   - Skips if status changed (e.g., accepted, cancelled)

3. **RPC Function Safety:**
   - `clear_errand_notification()` and `clear_commission_notification()` are idempotent
   - They check if runner is already in `timeout_runner_ids` before adding

## Safety with UI-Based Timeout Checks

### Coexistence

The Edge Function safely coexists with existing UI-based timeout checks:

**Scenario 1: Edge Function Runs First**
- Edge Function clears notification at T+60s
- Database updated → realtime fires
- UI check runs → sees `notified_runner_id` is NULL → runs queueing logic
- ✅ Works correctly

**Scenario 2: UI Check Runs First**
- Runner fetches at T+61s → UI check detects timeout
- UI check clears notification (or reassigns)
- Edge Function runs at T+90s → sees `notified_runner_id` changed → skips (idempotent)
- ✅ No conflict

**Scenario 3: Both Run Simultaneously**
- Optimistic locking prevents duplicate processing
- First to update wins
- Second sees change and skips
- ✅ No conflicts

### What Remains Active

**UI-Based Timeout Checks:**
- **Location:** `app/buddyrunner/home.tsx:1448` (errands), `2273` (commissions)
- **Function:** `shouldShowErrand()`, `shouldShowCommission()`
- **Status:** ✅ **REMAINS ACTIVE** (not removed)

**Why Keep Them:**
1. Immediate feedback when runner is actively using app
2. Backup safety if Edge Function fails
3. Redundancy for higher reliability
4. No breaking changes

## Deployment

### 1. Deploy Function

```bash
supabase functions deploy timeout-requeue
```

### 2. Configure Cron Schedule

**Option A: Supabase Dashboard**
- Go to Database → Cron Jobs
- Create new cron job
- Schedule: `*/30 * * * * *` (every 30 seconds)
- Function: `timeout-requeue`

**Option B: SQL (pg_cron extension)**
```sql
SELECT cron.schedule(
  'timeout-requeue',
  '*/30 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT.supabase.co/functions/v1/timeout-requeue',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### 3. Manual Invocation (Testing)

```typescript
const { data, error } = await supabase.functions.invoke('timeout-requeue');
```

## Response Format

```json
{
  "success": true,
  "processed": {
    "errands": {
      "total": 5,
      "cleared": 4,
      "errors": 1
    },
    "commissions": {
      "total": 2,
      "cleared": 2,
      "errors": 0
    }
  },
  "errors": [
    {
      "taskId": 123,
      "taskType": "errand",
      "error": "Clear failed: ..."
    }
  ]
}
```

## Monitoring

### Logs

The function logs:
- Number of timed-out tasks found
- Each task processed (success/error)
- Summary counts

### Metrics to Track

- Tasks processed per run
- Success rate
- Error rate
- Idempotency skips (indicates concurrent processing)

## Error Handling

- **Per-task errors:** Logged but don't stop processing of other tasks
- **Query errors:** Logged and included in response
- **Fatal errors:** Return 500 status with error message

## Limits

- **Max tasks per run:** 50 (errands) + 50 (commissions)
- **Rationale:** Prevents function timeout
- **Remaining tasks:** Processed in next run

## Testing

### Manual Test

1. Create errand/commission
2. Assign to runner (set `notified_runner_id`, `notified_at`)
3. Wait 60+ seconds
4. Manually invoke function or wait for cron
5. Verify:
   - `notified_runner_id` is NULL
   - `notified_runner_id` added to `timeout_runner_ids`
   - Realtime fires
   - Client-side logic requeues task

### Automated Test

```typescript
// Test idempotency
await supabase.functions.invoke('timeout-requeue');
await supabase.functions.invoke('timeout-requeue'); // Should skip already processed
```

## Troubleshooting

### Function Not Running

- Check cron schedule configuration
- Verify function is deployed
- Check Supabase logs

### Tasks Not Being Cleared

- Verify `notified_at` is older than 60 seconds
- Check `status = 'pending'`
- Verify `notified_runner_id` is not NULL
- Check function logs for errors

### Client Not Requeuing

- Verify realtime subscription is active
- Check client-side logic at `app/buddyrunner/home.tsx:1237`
- Verify `notified_runner_id` is actually NULL in database
