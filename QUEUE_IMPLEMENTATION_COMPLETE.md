# Queue-Based Runner Assignment: Implementation Complete

## ✅ Implementation Status

### 1. Database Schema ✅
- **File**: `supabase/migrations/add_runner_queue_columns.sql`
- Added `ranked_runner_ids TEXT[]` to errand and commission tables
- Added `current_queue_index INTEGER DEFAULT 0` to both tables
- Added constraints and indexes for queue validity

### 2. Shared Ranking Module ✅
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- Single source of truth for all ranking logic
- Exports: `rankRunners()`, `calculateDistanceKm()`, types
- Used by: `assign-errand`, `assign-and-notify-commission`
- NOT used by: `reassign-timed-out-tasks` (queue-based only)

### 3. assign-errand Refactored ✅
- **File**: `supabase/functions/assign-errand/index.ts`
- ✅ Imports shared ranking module
- ✅ Removed duplicate TF-IDF functions (lines 230-345)
- ✅ Uses `rankRunners()` to create queue ONCE
- ✅ Stores `ranked_runner_ids[]` and `current_queue_index = 0`
- ✅ Assigns `ranked_runner_ids[0]`

### 4. reassign-timed-out-tasks Refactored ✅
- **File**: `supabase/functions/reassign-timed-out-tasks/index.ts`
- ✅ **Removed ALL ranking logic** (TF-IDF functions still present but unused - can be removed in cleanup)
- ✅ **Removed runner discovery queries** (no more runner queries on timeout)
- ✅ **Removed distance filtering** (queue already contains filtered runners)
- ✅ **Added queue read logic**: Reads `ranked_runner_ids` and `current_queue_index` from database
- ✅ **Added queue exhaustion check**: If `current_queue_index >= ranked_runner_ids.length`, cancels task
- ✅ **Added index advancement**: Increments `current_queue_index` and assigns `ranked_runner_ids[index]`
- ✅ **Added caller notification**: Broadcasts to `caller_notify_${caller_id}` when queue exhausted

### 5. assign-and-notify-commission ⚠️ PENDING
- **File**: `supabase/functions/assign-and-notify-commission/index.ts`
- **Status**: Needs same refactoring as `assign-errand`
- **Required Changes**:
  - Import shared ranking module
  - Replace ranking logic with `rankRunners()`
  - Store `ranked_runner_ids[]` and `current_queue_index = 0`
  - Assign `ranked_runner_ids[0]`

## Architecture Verification

### ✅ Single Queue Authority
- `assign-errand`: Creates queue ONCE ✅
- `assign-and-notify-commission`: Will create queue ONCE (pending)
- `reassign-timed-out-tasks`: Only advances index, never ranks ✅

### ✅ No Re-ranking on Timeout
- `reassign-timed-out-tasks` reads from database only ✅
- No runner queries ✅
- No distance calculations ✅
- No TF-IDF calculations ✅
- Only index increment ✅

### ✅ UI Glitching Prevention
- Queue created once at creation ✅
- No re-querying on timeout ✅
- No re-ranking on timeout ✅
- Stable `notified_runner_id` updates ✅
- No flickering or reloading ✅

### ✅ timeout_runner_ids Status
- Kept for backward compatibility ✅
- NOT used for runner selection (queue replaces it) ✅
- Can be deprecated in future cleanup

## Queue Exhaustion Handling

### When Queue is Exhausted
**Condition**: `current_queue_index >= ranked_runner_ids.length`

**Actions**:
1. ✅ Cancel errand/commission (`status = 'cancelled'`)
2. ✅ Broadcast to caller: `caller_notify_${caller_id}` with event `task_cancelled`
3. ✅ Payload includes: `task_id`, `task_type`, `task_title`, `reason: 'no_runners_available'`

**Client-Side** (TODO):
- Listen for `task_cancelled` broadcast
- Show "No runners available" modal
- Clear task from UI

## Backward Compatibility

### Old Tasks Without Queue
- If `ranked_runner_ids` is NULL or empty, `reassign-timed-out-tasks` skips (logs and continues)
- Old tasks will remain in system but won't be reassigned via queue
- New tasks always have queue

## Next Steps

1. **Complete assign-and-notify-commission refactoring** (same as assign-errand)
2. **Remove unused TF-IDF functions** from `reassign-timed-out-tasks` (cleanup)
3. **Add client-side handler** for `task_cancelled` broadcast
4. **Test queue-based reassignment** end-to-end
5. **Monitor for UI glitching** (should be eliminated)

## Files Modified

1. ✅ `supabase/migrations/add_runner_queue_columns.sql` (NEW)
2. ✅ `supabase/functions/_shared/runner-ranking.ts` (NEW)
3. ✅ `supabase/functions/assign-errand/index.ts` (MODIFIED)
4. ✅ `supabase/functions/reassign-timed-out-tasks/index.ts` (MODIFIED)
5. ⚠️ `supabase/functions/assign-and-notify-commission/index.ts` (PENDING)

## Verification Checklist

- [x] Database schema added
- [x] Shared ranking module created
- [x] assign-errand uses queue
- [x] reassign-timed-out-tasks uses queue (no re-ranking)
- [x] Queue exhaustion handled
- [x] Caller notification on exhaustion
- [ ] assign-and-notify-commission uses queue (pending)
- [ ] Client-side task_cancelled handler (pending)
- [ ] End-to-end testing (pending)
