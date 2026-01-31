# Queue-Based Runner Assignment: Architectural Analysis

## 1. Current Files with Runner Eligibility, Ranking, or Queueing Logic

### Server-Side (Edge Functions) - ACTIVE RANKING LOGIC

#### A. Initial Assignment Functions
1. **`supabase/functions/assign-errand/index.ts`**
   - **Function**: `serve()` handler
   - **Lines**: 100-529
   - **Ranking Logic**: 
     - Eligibility filtering (lines 100-113)
     - Distance filtering (lines 182-201)
     - TF-IDF calculation (lines 230-345)
     - Score computation (lines 354-416)
     - Sorting (lines 419-424)
     - Selection: `rankedRunners[0]` (line 438)
   - **Purpose**: Initial errand assignment on creation

2. **`supabase/functions/assign-and-notify-commission/index.ts`**
   - **Function**: `serve()` handler
   - **Lines**: 85-439
   - **Ranking Logic**:
     - Eligibility filtering (lines 85-103)
     - Distance filtering (lines 162-170)
     - TF-IDF calculation (lines 184-272)
     - Score computation (lines 289-339)
     - Sorting (lines 342-345)
     - Selection: `rankedRunners[0]` (line 354)
   - **Purpose**: Initial commission assignment on creation

#### B. Timeout Reassignment Function
3. **`supabase/functions/reassign-timed-out-tasks/index.ts`**
   - **Function**: `serve()` handler
   - **Lines**: 144-748
   - **Ranking Logic** (DUPLICATED):
     - **Errands** (lines 223-427):
       - Eligibility filtering (lines 225-261)
       - Distance filtering (lines 276-284)
       - TF-IDF calculation (lines 33-142, reused)
       - Score computation (lines 313-356)
       - Sorting (lines 359-362)
       - Selection: `rankedRunners[0]` (line 376)
     - **Commissions** (lines 523-708):
       - Eligibility filtering (lines 524-556)
       - Distance filtering (lines 559-567)
       - TF-IDF calculation (lines 33-142, reused)
       - Score computation (lines 598-644)
       - Sorting (lines 647-650)
       - Selection: `rankedRunners[0]` (line 663)
   - **Purpose**: 60-second timeout reassignment (cron)

### Client-Side - READ-ONLY VISIBILITY CHECKS (NO RANKING)

4. **`app/buddyrunner/home.tsx`**
   - **Functions**: 
     - `shouldShowErrand()` (lines 1208-1221) - READ-ONLY
     - `shouldShowCommission()` (lines 1603-1616) - READ-ONLY
   - **Logic**: Only checks `notified_runner_id === currentUserId`
   - **Purpose**: Visibility filtering (no assignment logic)
   - **Status**: ✅ Already read-only, no changes needed

### Documentation Files (No Code Impact)
- `RUNNER_QUEUEING_PROCESS.md`
- `RUNNER_QUEUEING_DEEP_REVIEW.md`
- `TF_IDF_COSINE_SIMILARITY_EXPLANATION.md`
- Various other documentation files

---

## 2. Single Source of Truth Identification

### Current State: THREE DUPLICATE RANKING IMPLEMENTATIONS

**Problem**: Ranking logic is duplicated across:
1. `assign-errand/index.ts` (initial assignment)
2. `assign-and-notify-commission/index.ts` (initial assignment)
3. `reassign-timed-out-tasks/index.ts` (timeout reassignment)

**Shared Components** (duplicated in each file):
- `calculateDistanceKm()` - Haversine formula
- `calculateTF()`, `calculateIDFAdjusted()`, `calculateTFIDFVectorAdjusted()`
- `calculateTFIDFCosineSimilarity()` - Full TF-IDF + cosine similarity
- `cosineSimilarity()` - Vector similarity calculation
- Scoring formula: `(distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)`
- Sorting: `finalScore DESC, distance ASC`

### Proposed Single Source of Truth

**Option A: Shared Utility Module** (Recommended)
- **File**: `supabase/functions/_shared/runner-ranking.ts`
- **Exports**:
  - `rankRunners(eligibleRunners, taskCategories, callerLocation)`
  - `calculateDistanceKm()`
  - `calculateTFIDFCosineSimilarity()`
  - All helper functions
- **Usage**: All three Edge Functions import from this module

**Option B: Database Function** (Alternative)
- PostgreSQL function: `rank_runners_for_task()`
- Pros: Single source, no code duplication
- Cons: Complex TF-IDF in SQL, harder to maintain

**Recommendation**: Option A (Shared TypeScript module)

---

## 3. Current Usage of `timeout_runner_ids`

### A. Filtering Eligible Runners (EXCLUSION)

**Location**: All three Edge Functions

1. **`assign-errand/index.ts`** (lines 107-111):
   ```typescript
   if (errand.timeout_runner_ids && Array.isArray(errand.timeout_runner_ids)) {
     for (const timeoutRunnerId of errand.timeout_runner_ids) {
       runnersQuery = runnersQuery.neq("id", timeoutRunnerId);
     }
   }
   ```
   - **Purpose**: Exclude timed-out runners from eligibility query
   - **Effect**: Prevents re-notifying runners who already timed out

2. **`assign-and-notify-commission/index.ts`** (lines 99-103):
   - Same pattern as above

3. **`reassign-timed-out-tasks/index.ts`**:
   - **Errands** (lines 233-237): Excludes timeout runners
   - **Commissions** (lines 539-543): Excludes timeout runners
   - **Fallback** (lines 246-261): If all excluded, retries without exclusion

### B. Ranking Decisions

**Answer**: ❌ **NOT USED**
- `timeout_runner_ids` does NOT affect scoring, weighting, or ranking order
- It only affects **eligibility** (who is considered)
- Once eligible, ranking is based solely on: distance (40%), rating (35%), TF-IDF (25%)

### C. Reassignment Logic

**Location**: `reassign-timed-out-tasks/index.ts`

1. **Appending Previous Runner** (lines 379-389 for errands, 666-676 for commissions):
   ```typescript
   if (!errand.timeout_runner_ids.includes(previousRunnerId)) {
     updatedTimeoutRunnerIds = [...errand.timeout_runner_ids, previousRunnerId];
   }
   ```
   - **Purpose**: Track who has timed out (for exclusion in future reassignments)
   - **Effect**: Prevents infinite loops by excluding previous runner

2. **Atomic Update Guard** (line 403 for errands, line 690 for commissions):
   ```typescript
   .eq("notified_runner_id", previousRunnerId)
   ```
   - **Purpose**: Only reassign if still assigned to previous runner (prevents race conditions)

---

## 4. Proposed Queue-Based Design Analysis

### Design Requirements

1. **Runner discovery + ranking happens ONCE at creation**
2. **Ordered queue (`ranked_runner_ids`) is persisted**
3. **Timeout handling only advances `current_queue_index`**
4. **No re-querying or re-ranking on timeout**

### Current Architecture vs. Proposed Architecture

#### Current (Re-ranking on Timeout)
```
Errand Created
  → assign-errand: Query runners → Rank → Select top → Assign
  → Timeout (60s)
  → reassign-timed-out-tasks: Query runners → Rank → Select top → Reassign
  → Timeout (60s)
  → reassign-timed-out-tasks: Query runners → Rank → Select top → Reassign
  ...
```

#### Proposed (Queue-Based)
```
Errand Created
  → assign-errand: Query runners → Rank → Store queue → Assign index 0
  → Timeout (60s)
  → reassign-timed-out-tasks: Advance index → Assign index 1
  → Timeout (60s)
  → reassign-timed-out-tasks: Advance index → Assign index 2
  ...
```

---

## 5. Minimal Changes Required

### A. Database Schema Changes

**Add to `errand` table:**
```sql
ALTER TABLE errand ADD COLUMN ranked_runner_ids TEXT[];  -- Array of runner IDs in ranked order
ALTER TABLE errand ADD COLUMN current_queue_index INTEGER DEFAULT 0;  -- Current position in queue
```

**Add to `commission` table:**
```sql
ALTER TABLE commission ADD COLUMN ranked_runner_ids TEXT[];
ALTER TABLE commission ADD COLUMN current_queue_index INTEGER DEFAULT 0;
```

**Migration Strategy:**
- New errands/commissions: Populate both fields
- Existing: `ranked_runner_ids = NULL` → fallback to current logic (backward compatible)

### B. Code Changes

#### 1. Create Shared Ranking Module
**File**: `supabase/functions/_shared/runner-ranking.ts`
- Extract all ranking logic from three Edge Functions
- Single implementation of TF-IDF, distance, rating calculations
- Export: `rankRunners(eligibleRunners, taskCategories, callerLocation)`

#### 2. Modify `assign-errand/index.ts`
**Changes**:
- **Keep**: Runner discovery, eligibility filtering, distance filtering
- **Keep**: Call to shared ranking module
- **Add**: Store `ranked_runner_ids` array in database
- **Add**: Set `current_queue_index = 0`
- **Change**: Instead of `rankedRunners[0]`, use `ranked_runner_ids[0]`
- **Remove**: Duplicate ranking calculation code

**Lines to Modify**:
- Lines 354-424: Replace with shared module call
- Line 438: Change to `ranked_runner_ids[0]`
- Lines 462-473: Add `ranked_runner_ids` and `current_queue_index` to update

#### 3. Modify `assign-and-notify-commission/index.ts`
**Changes**: Same as `assign-errand/index.ts`
- Lines 280-345: Replace with shared module call
- Line 354: Change to `ranked_runner_ids[0]`
- Lines 370-381: Add queue fields to update

#### 4. Modify `reassign-timed-out-tasks/index.ts`
**Changes**:
- **Remove**: All ranking logic (lines 33-142, 313-356, 598-644)
- **Remove**: Runner discovery queries (lines 225-261, 524-556)
- **Remove**: Distance filtering (lines 276-284, 559-567)
- **Add**: Read `ranked_runner_ids` and `current_queue_index` from database
- **Add**: Increment `current_queue_index`
- **Add**: Check if queue exhausted (`current_queue_index >= ranked_runner_ids.length`)
- **Add**: If exhausted, delete errand/commission and notify caller

**New Logic**:
```typescript
// Read queue from database
const { ranked_runner_ids, current_queue_index } = errand;

// Check if queue exhausted
if (current_queue_index >= ranked_runner_ids.length) {
  // Delete errand and notify caller
  await deleteErrandAndNotifyCaller(errand.id);
  continue;
}

// Advance to next runner
const nextRunnerId = ranked_runner_ids[current_queue_index];
const newIndex = current_queue_index + 1;

// Update database
await supabase
  .from("errand")
  .update({
    notified_runner_id: nextRunnerId,
    notified_at: new Date().toISOString(),
    current_queue_index: newIndex,
  })
  .eq("id", errand.id)
  .eq("notified_runner_id", previousRunnerId);
```

#### 5. Backward Compatibility
**Strategy**: Support both old and new errands/commissions
```typescript
if (errand.ranked_runner_ids && errand.ranked_runner_ids.length > 0) {
  // New queue-based logic
  const nextRunnerId = errand.ranked_runner_ids[errand.current_queue_index];
} else {
  // Fallback to current re-ranking logic (for old errands)
  // ... existing ranking code ...
}
```

---

## 6. Logic to Remove or Bypass

### A. Remove Completely

1. **`reassign-timed-out-tasks/index.ts`**:
   - Lines 33-142: TF-IDF utility functions (move to shared module)
   - Lines 225-261: Runner discovery query (not needed)
   - Lines 276-284: Distance filtering (already in queue)
   - Lines 313-356: Ranking computation (not needed)
   - Lines 598-644: Commission ranking computation (not needed)

2. **`assign-errand/index.ts`**:
   - Lines 230-345: TF-IDF functions (move to shared module)
   - Lines 354-424: Ranking computation (replace with shared module call)

3. **`assign-and-notify-commission/index.ts`**:
   - Lines 184-272: TF-IDF functions (move to shared module)
   - Lines 289-345: Ranking computation (replace with shared module call)

### B. Bypass (Keep for Backward Compatibility)

- Keep current ranking logic as fallback for errands/commissions without `ranked_runner_ids`
- Gradually migrate: All new tasks use queue, old tasks use fallback until completed

### C. Keep (Still Needed)

- **Eligibility filtering** (role, availability, presence) - Still needed for initial queue creation
- **Distance filtering** - Still needed for initial queue creation
- **Atomic update guards** - Still needed to prevent race conditions
- **Broadcast notifications** - Still needed for runner notifications

---

## 7. Ensuring Single Queue Controller

### Architecture Pattern: Queue Authority

```
┌─────────────────────────────────────────┐
│  assign-errand (Initial Assignment)     │
│  - Discovers eligible runners          │
│  - Calls shared ranking module          │
│  - Stores ranked_runner_ids[]           │
│  - Sets current_queue_index = 0         │
│  - Assigns ranked_runner_ids[0]         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  reassign-timed-out-tasks (Timeout)      │
│  - Reads ranked_runner_ids[]             │
│  - Increments current_queue_index       │
│  - Assigns ranked_runner_ids[index]     │
│  - NO re-ranking, NO re-querying        │
└─────────────────────────────────────────┘
```

### Enforcement Mechanisms

1. **Database Constraints**:
   ```sql
   -- Ensure queue is valid
   CHECK (current_queue_index >= 0)
   CHECK (current_queue_index < array_length(ranked_runner_ids, 1) OR ranked_runner_ids IS NULL)
   ```

2. **Code Guards**:
   - `assign-errand`: Only writes `ranked_runner_ids` if `NULL` (idempotent)
   - `reassign-timed-out-tasks`: Only reads `ranked_runner_ids`, never writes it
   - Shared module: Read-only ranking function (no side effects)

3. **Validation**:
   - On timeout: Verify `ranked_runner_ids` exists before using queue
   - On exhaustion: Verify `current_queue_index >= ranked_runner_ids.length` before deletion

---

## 8. Queue Exhaustion Handling

### When Queue is Exhausted

**Condition**: `current_queue_index >= ranked_runner_ids.length`

**Actions**:
1. **Delete errand/commission** (or mark as `status = 'cancelled'`)
2. **Notify caller** via broadcast:
   ```typescript
   const callerChannel = `caller_notify_${errand.buddycaller_id}`;
   await supabase.channel(callerChannel).send({
     type: 'broadcast',
     event: 'task_cancelled',
     payload: {
       task_id: errand.id,
       task_type: 'errand',
       reason: 'no_runners_available',
     },
   });
   ```

**Implementation Location**: `reassign-timed-out-tasks/index.ts`

**Code**:
```typescript
if (current_queue_index >= ranked_runner_ids.length) {
  // Queue exhausted
  await supabase
    .from("errand")
    .update({ status: 'cancelled' })
    .eq("id", errand.id);
  
  // Notify caller
  await notifyCallerTaskCancelled(errand.buddycaller_id, errand.id, 'errand');
  
  result.processed.errands.exhausted++;
  continue;
}
```

---

## 9. Verification Checklist

### After Refactor, Verify:

- [ ] **Exactly ONE queue controller**: `assign-errand` creates queue, `reassign-timed-out-tasks` only advances index
- [ ] **No duplicate ranking logic**: All ranking in shared module
- [ ] **All assignments read from queue**: `ranked_runner_ids[current_queue_index]`
- [ ] **No re-querying on timeout**: `reassign-timed-out-tasks` reads from database only
- [ ] **No re-ranking on timeout**: `reassign-timed-out-tasks` has no ranking code
- [ ] **Queue exhaustion handled**: Deletes task and notifies caller
- [ ] **Backward compatibility**: Old tasks without queue still work (fallback)
- [ ] **Atomic updates**: All queue index updates use `.eq('notified_runner_id', previousRunnerId)`
- [ ] **No client-side ranking**: `home.tsx` remains read-only

---

## 10. Migration Strategy

### Phase 1: Add Shared Module (No Breaking Changes)
1. Create `supabase/functions/_shared/runner-ranking.ts`
2. Extract ranking logic from all three functions
3. Update functions to use shared module
4. **No database changes yet** - backward compatible

### Phase 2: Add Queue Fields (Backward Compatible)
1. Add `ranked_runner_ids` and `current_queue_index` columns
2. Modify `assign-errand` to populate queue
3. Keep `reassign-timed-out-tasks` using current logic (fallback)
4. **Both old and new tasks work**

### Phase 3: Enable Queue-Based Reassignment
1. Modify `reassign-timed-out-tasks` to use queue
2. Remove ranking logic from timeout handler
3. Add queue exhaustion handling
4. **New tasks use queue, old tasks use fallback**

### Phase 4: Cleanup (Optional)
1. Remove fallback logic after all old tasks complete
2. Remove `timeout_runner_ids` (replaced by queue index)
3. **Full queue-based system**

---

## Summary

**Current State**: 3 duplicate ranking implementations, re-ranking on every timeout
**Proposed State**: 1 shared ranking module, queue persisted once, index-only advancement
**Minimal Changes**: Add 2 database columns, create shared module, modify 3 Edge Functions
**Safety**: Backward compatible, atomic updates, single source of truth
