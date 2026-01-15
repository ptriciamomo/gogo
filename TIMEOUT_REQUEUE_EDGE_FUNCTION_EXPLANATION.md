# Edge Function: Timeout Requeue - Safe Coexistence Explanation

## Overview

The `timeout-requeue` Edge Function proactively clears timed-out notifications without doing ranking or assignment. It works alongside existing UI-based timeout checks, with both systems safely coexisting through idempotency and optimistic locking.

---

## How It Works

### Edge Function Flow

1. **Runs on schedule** (every 15-30 seconds via cron)
2. **Queries timed-out tasks:**
   ```sql
   SELECT * FROM errand
   WHERE status = 'pending'
     AND notified_runner_id IS NOT NULL
     AND notified_at < NOW() - INTERVAL '60 seconds'
   ```
3. **For each task:**
   - Verifies task is still in same state (idempotency check)
   - Calls `clear_errand_notification()` or `clear_commission_notification()` RPC
   - This clears `notified_runner_id` and `notified_at`
   - This adds previous runner to `timeout_runner_ids`

### Client-Side Flow (Existing, Unchanged)

1. **Realtime subscription fires** when database is updated
2. **Client refetches** errands/commissions
3. **`shouldShowErrand()` or `shouldShowCommission()` runs**
4. **Checks:** `if (!errand.notified_runner_id)` (line 1237 for errands, 2048 for commissions)
5. **If NULL:** Runs full queueing logic (distance, TF-IDF, ranking, assignment)
6. **Assigns** to top-ranked runner

---

## Safe Coexistence Mechanisms

### 1. Idempotency Through Optimistic Locking

**Edge Function Implementation:**
```typescript
// Read current state
const { data: currentErrand } = await supabase
  .from("errand")
  .select("notified_runner_id, status")
  .eq("id", errand.id)
  .single();

// Skip if already processed
if (
  currentErrand?.notified_runner_id !== errand.notified_runner_id ||
  currentErrand?.status !== "pending"
) {
  console.log("Already processed, skipping");
  continue;
}

// Process...
```

**How It Prevents Conflicts:**
- If UI check already cleared notification → `notified_runner_id` changed → Edge Function skips
- If Edge Function already cleared → `notified_runner_id` is NULL → UI check runs queueing (expected)
- If task was accepted → `status` changed → both skip

### 2. RPC Function Safety

**Existing RPC Functions Are Idempotent:**
- `clear_errand_notification()` checks if runner is already in `timeout_runner_ids` before adding
- Safe to call multiple times
- Atomic database operations

### 3. Status Verification

**Both Systems Check:**
- `status = 'pending'` before processing
- Skip if status changed (accepted, cancelled, etc.)

---

## Coexistence Scenarios

### Scenario 1: Edge Function Runs First

**Timeline:**
- T+0s: Errand assigned to Runner A
- T+60s: Edge Function detects timeout
- T+60.1s: Edge Function clears notification
- T+60.2s: Database updated → Realtime fires
- T+60.3s: Runner B's app receives update → refetches
- T+60.4s: `shouldShowErrand()` runs → sees `notified_runner_id` is NULL
- T+60.5s: Client-side queueing logic runs → assigns to Runner B

**Result:** ✅ Works correctly, no conflicts

### Scenario 2: UI Check Runs First

**Timeline:**
- T+0s: Errand assigned to Runner A
- T+61s: Runner B fetches tasks → UI check detects timeout
- T+61.1s: UI check clears notification (or reassigns)
- T+90s: Edge Function runs → sees `notified_runner_id` changed
- T+90.1s: Edge Function skips (idempotency check)

**Result:** ✅ No conflict, Edge Function correctly skips

### Scenario 3: Both Run Simultaneously

**Timeline:**
- T+0s: Errand assigned to Runner A
- T+60s: Edge Function starts processing
- T+60.1s: Runner B's UI check starts processing (same task)
- T+60.2s: Edge Function verifies state → reads `notified_runner_id = Runner A`
- T+60.3s: UI check verifies state → reads `notified_runner_id = Runner A`
- T+60.4s: Edge Function clears notification → updates database
- T+60.5s: UI check tries to clear → sees `notified_runner_id` is now NULL → skips

**Result:** ✅ First to update wins, second correctly skips

### Scenario 4: Task Accepted Before Timeout

**Timeline:**
- T+0s: Errand assigned to Runner A
- T+30s: Runner A accepts → `status = 'in_progress'`
- T+60s: Edge Function runs → sees `status != 'pending'` → skips
- T+61s: UI check runs → sees `status != 'pending'` → skips

**Result:** ✅ Both correctly skip, no conflicts

---

## What Remains Active (UI-Based Checks)

### Existing Code Locations

**Errands:**
- **File:** `app/buddyrunner/home.tsx`
- **Line:** 1448
- **Function:** `shouldShowErrand()`
- **Code:**
  ```typescript
  if (notifiedAt && notifiedAt < sixtySecondsAgo) {
      // STEP 7: Timeout detected
      // ... requeue logic ...
  }
  ```

**Commissions:**
- **File:** `app/buddyrunner/home.tsx`
- **Line:** 2273
- **Function:** `shouldShowCommission()`
- **Code:**
  ```typescript
  if (notifiedAt && notifiedAt < sixtySecondsAgo) {
      // STEP 7: Timeout detected
      // ... requeue logic ...
  }
  ```

### Why They Remain Active

1. **Immediate Feedback:** If runner is actively using app, UI check provides instant requeue (no wait for cron)
2. **Backup Safety:** If Edge Function fails or is delayed, UI check still works
3. **Redundancy:** Two independent systems = higher reliability
4. **No Breaking Changes:** All existing behavior preserved

### How They Work Together

**Complementary, Not Redundant:**
- **Edge Function:** Proactive, runs on schedule, works even if no runners online
- **UI Check:** Reactive, runs when runner fetches, provides immediate feedback

**Both Systems:**
- Use same RPC functions (`clear_errand_notification()`, etc.)
- Use same idempotency checks
- Produce same results
- No conflicts due to optimistic locking

---

## Benefits of This Approach

### 1. Unstalls Queue Immediately

**Before:**
- Timeout detected only when runner fetches
- If no runners online → timeout never detected
- Queue stalls indefinitely

**After:**
- Edge Function detects timeout within 15-30 seconds
- Works even if no runners online
- Queue unstalls automatically

### 2. No Code Duplication

**Edge Function:**
- Does NOT duplicate ranking logic
- Does NOT duplicate distance calculation
- Does NOT duplicate TF-IDF calculation
- Only clears notifications

**Client-Side:**
- Keeps all existing logic
- No changes needed
- Continues to work as before

### 3. Safe Deployment

**Phase 1 (Current):**
- Edge Function + UI checks both active
- Redundancy for safety
- Gradual confidence building

**Phase 2 (Future, Optional):**
- Can remove UI checks if desired
- Or keep both for maximum reliability

### 4. Works Offline

**Edge Function:**
- Runs on schedule regardless of runner activity
- Works even if all runners offline
- Unstalls queue when runners come back online

---

## Edge Cases Handled

### 1. Multiple Timeouts in Sequence

**Scenario:** Runner 1 times out → Runner 2 assigned → Runner 2 times out → Runner 3 assigned

**Handling:**
- Each timeout adds runner to `timeout_runner_ids`
- Edge Function processes each timeout independently
- Client-side logic excludes all timed-out runners
- ✅ Works correctly

### 2. No Eligible Runners

**Scenario:** All runners within 500m have timed out

**Handling:**
- Edge Function clears notification
- Client-side logic detects no eligible runners
- Calls `clear_errand_notification()` (idempotent, safe to call twice)
- Caller sees "No runners available" modal
- ✅ Works correctly

### 3. Function Runs Twice

**Scenario:** Cron triggers function twice in quick succession

**Handling:**
- Optimistic locking prevents duplicate processing
- First run clears notification
- Second run sees `notified_runner_id` changed → skips
- ✅ Idempotent

### 4. Task Accepted During Processing

**Scenario:** Edge Function starts processing, runner accepts task

**Handling:**
- Edge Function verifies `status = 'pending'` before clearing
- If status changed → skips
- ✅ No conflict

---

## Monitoring & Debugging

### What to Monitor

1. **Function Execution:**
   - Runs every 15-30 seconds
   - Processes timed-out tasks
   - Returns success/error counts

2. **Idempotency Skips:**
   - High skip rate = indicates UI checks are working
   - Low skip rate = indicates Edge Function is primary handler

3. **Error Rate:**
   - Should be near zero
   - Errors logged per task, don't stop processing

### Debugging

**If tasks not being cleared:**
1. Check function logs for errors
2. Verify `notified_at` is actually > 60 seconds old
3. Verify `status = 'pending'`
4. Verify `notified_runner_id` is not NULL

**If client not requeuing:**
1. Verify realtime subscription is active
2. Check client-side logic at line 1237 (errands) or 2048 (commissions)
3. Verify `notified_runner_id` is actually NULL in database
4. Check browser/device console for errors

---

## Summary

The Edge Function safely coexists with UI-based timeout checks through:

1. ✅ **Idempotency:** Optimistic locking prevents duplicate processing
2. ✅ **Status Verification:** Both systems check task state before processing
3. ✅ **RPC Safety:** Existing RPC functions are idempotent
4. ✅ **Complementary Roles:** Edge Function (proactive) + UI checks (reactive)
5. ✅ **No Conflicts:** First to update wins, second correctly skips

**Result:** Queue unstalls automatically within 15-30 seconds of timeout, while maintaining all existing functionality and safety mechanisms.
