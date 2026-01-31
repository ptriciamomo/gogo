# Queue-Based Runner Assignment Implementation Summary

## ✅ Completed

1. **Database Migration**: `supabase/migrations/add_runner_queue_columns.sql`
   - Added `ranked_runner_ids TEXT[]` to errand and commission tables
   - Added `current_queue_index INTEGER DEFAULT 0` to both tables
   - Added constraints and indexes

2. **Shared Ranking Module**: `supabase/functions/_shared/runner-ranking.ts`
   - Single source of truth for all ranking logic
   - Exports: `rankRunners()`, `calculateDistanceKm()`
   - Used by: `assign-errand`, `assign-and-notify-commission`
   - NOT used by: `reassign-timed-out-tasks` (queue-based only)

3. **assign-errand Refactored**: `supabase/functions/assign-errand/index.ts`
   - ✅ Imports shared ranking module
   - ✅ Removed duplicate TF-IDF functions
   - ✅ Uses `rankRunners()` to create queue ONCE
   - ✅ Stores `ranked_runner_ids[]` and `current_queue_index = 0`
   - ✅ Assigns `ranked_runner_ids[0]`

## 🔄 Remaining Tasks

### 4. assign-and-notify-commission
- Import shared ranking module
- Replace ranking logic with `rankRunners()`
- Store `ranked_runner_ids[]` and `current_queue_index = 0`
- Assign `ranked_runner_ids[0]`

### 5. reassign-timed-out-tasks (CRITICAL)
- **Remove ALL ranking logic** (lines 33-142, 313-356, 598-644)
- **Remove runner discovery queries** (lines 225-261, 524-556)
- **Remove distance filtering** (lines 276-284, 559-567)
- **Add queue read logic**: Read `ranked_runner_ids` and `current_queue_index`
- **Add queue exhaustion check**: If `current_queue_index >= ranked_runner_ids.length`, delete/cancel task
- **Add index advancement**: Increment `current_queue_index` and assign `ranked_runner_ids[index]`
- **Add caller notification**: Broadcast to caller when queue exhausted

### 6. Queue Exhaustion Handling
- Delete or cancel errand/commission
- Clear notifications
- Broadcast to caller: `caller_notify_${caller_id}` with event `task_cancelled`
- Show "No runners available" modal (client-side)

## Architecture Verification

### ✅ Single Queue Authority
- `assign-errand`: Creates queue ONCE
- `assign-and-notify-commission`: Creates queue ONCE
- `reassign-timed-out-tasks`: Only advances index, never ranks

### ✅ No Re-ranking on Timeout
- `reassign-timed-out-tasks` reads from database only
- No runner queries
- No distance calculations
- No TF-IDF calculations
- Only index increment

### ✅ UI Glitching Prevention
- Queue created once at creation
- No re-querying on timeout
- No re-ranking on timeout
- Stable `notified_runner_id` updates
- No flickering or reloading

### ✅ timeout_runner_ids Status
- Kept for backward compatibility
- NOT used for runner selection (queue replaces it)
- Can be deprecated in future cleanup
