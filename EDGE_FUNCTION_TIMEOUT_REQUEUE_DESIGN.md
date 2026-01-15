# Edge Function Design: Automatic Timeout Detection and Requeue

## Overview

This document designs a Supabase Edge Function that proactively detects timeouts and automatically requeues errands and commissions without requiring runner or caller UI activity.

**Function Name:** `timeout-requeue`  
**Trigger:** Cron schedule (every 30 seconds) + manual invocation  
**Scope:** Errands and Commissions (both mobile and web)

---

## 1. Edge Function Architecture

### 1.1 Function Structure

```
supabase/functions/timeout-requeue/
├── index.ts          # Main Edge Function code
├── utils/
│   ├── distance.ts   # Haversine distance calculation
│   ├── tfidf.ts      # TF-IDF + Cosine Similarity calculation
│   └── ranking.ts    # Runner ranking algorithm
└── README.md         # Documentation
```

### 1.2 Entry Point

**File:** `supabase/functions/timeout-requeue/index.ts`

**Function Signature:**
```typescript
Deno.serve(async (req: Request) => {
  // Main handler
});
```

**Trigger Methods:**
1. **Cron Schedule:** Configured in Supabase Dashboard or `supabase/config.toml`
   - Schedule: `*/30 * * * * *` (every 30 seconds)
2. **Manual Invocation:** `supabase.functions.invoke('timeout-requeue')`
3. **HTTP Request:** `POST /functions/v1/timeout-requeue`

---

## 2. Flow Design

### 2.1 High-Level Flow

```
┌─────────────────────────────────────┐
│  Edge Function Triggered            │
│  (Cron or Manual)                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  1. Query Timed-Out Tasks           │
│     - Errands: status='pending'     │
│       notified_runner_id IS NOT NULL│
│       notified_at < NOW() - 60s     │
│     - Commissions: same criteria    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. For Each Timed-Out Task:       │
│     a. Idempotency Check            │
│     b. Get Caller Location          │
│     c. Query Eligible Runners       │
│     d. Filter & Rank Runners        │
│     e. Assign or Clear              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  3. Return Results                  │
│     - Count processed               │
│     - Count assigned                │
│     - Count cleared                 │
│     - Errors (if any)               │
└─────────────────────────────────────┘
```

### 2.2 Detailed Process Flow

#### Step 1: Query Timed-Out Tasks

**SQL Query for Errands:**
```sql
SELECT 
  id,
  buddycaller_id,
  category,
  notified_runner_id,
  notified_at,
  timeout_runner_ids,
  status
FROM errand
WHERE status = 'pending'
  AND notified_runner_id IS NOT NULL
  AND notified_at < NOW() - INTERVAL '60 seconds'
ORDER BY notified_at ASC;
```

**SQL Query for Commissions:**
```sql
SELECT 
  id,
  buddycaller_id,
  commission_type,
  notified_runner_id,
  notified_at,
  timeout_runner_ids,
  declined_runner_id,
  status
FROM commission
WHERE status = 'pending'
  AND notified_runner_id IS NOT NULL
  AND notified_at < NOW() - INTERVAL '60 seconds'
ORDER BY notified_at ASC;
```

**Safety:** Limit to 50 tasks per run to prevent timeout

#### Step 2: Idempotency Check (Per Task)

**Purpose:** Prevent duplicate processing if function runs twice

**Method 1: Optimistic Locking (Recommended)**
```typescript
// Read notified_at timestamp
const originalNotifiedAt = task.notified_at;

// Process requeue...

// Before update, verify notified_at hasn't changed
const { data: currentTask } = await supabase
  .from('errand') // or 'commission'
  .select('notified_at')
  .eq('id', task.id)
  .single();

if (currentTask.notified_at !== originalNotifiedAt) {
  // Another process already handled this - skip
  return { skipped: true, reason: 'already_processed' };
}
```

**Method 2: Processing Flag (Alternative)**
- Add `timeout_processing_at` timestamp field
- Set before processing, clear after
- Check if already processing before starting

**Recommendation:** Use Method 1 (optimistic locking) - simpler, no schema changes

#### Step 3: Get Caller Location

**Query:**
```sql
SELECT latitude, longitude
FROM users
WHERE id = $caller_id;
```

**Validation:**
- If no location → skip task (cannot calculate distance)
- Log warning but don't fail entire function

#### Step 4: Query Eligible Runners

**Filters Applied:**
1. `role = 'BuddyRunner'`
2. `is_available = true`
3. `location_updated_at >= NOW() - INTERVAL '90 seconds'` (presence filter)
4. Exclude `notified_runner_id` (current runner)
5. Exclude all runners in `timeout_runner_ids` array
6. Exclude `declined_runner_id` (commissions only)

**Query:**
```sql
SELECT 
  id,
  first_name,
  last_name,
  latitude,
  longitude,
  average_rating,
  location_updated_at
FROM users
WHERE role = 'BuddyRunner'
  AND is_available = true
  AND location_updated_at >= NOW() - INTERVAL '90 seconds'
  AND id != $notified_runner_id
  AND (id != ALL($timeout_runner_ids) OR $timeout_runner_ids IS NULL)
  AND (id != $declined_runner_id OR $declined_runner_id IS NULL) -- commissions only
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;
```

#### Step 5: Filter & Rank Runners

**For Each Runner:**

1. **Distance Filter:**
   - Calculate distance using Haversine formula
   - Filter: `distance <= 500 meters`
   - Calculate distance score: `max(0, 1 - (distance / 500))`

2. **TF-IDF Calculation:**
   - **Errands:** Query completed errands for this runner
     ```sql
     SELECT category
     FROM errand
     WHERE runner_id = $runner_id
       AND status = 'completed';
     ```
   - **Commissions:** Query completed commissions
     ```sql
     SELECT commission_type
     FROM commission
     WHERE runner_id = $runner_id
       AND status = 'completed';
     ```
   - Calculate TF-IDF + Cosine Similarity (same algorithm as client)

3. **Rating Score:**
   - Normalize: `(average_rating || 0) / 5`

4. **Final Score:**
   - Formula: `(DistanceScore * 0.40) + (RatingScore * 0.35) + (TF-IDF Score * 0.25)`

5. **Sort:**
   - Primary: Final Score (descending)
   - Tiebreaker: Distance (ascending)

#### Step 6: Assign or Clear

**If Eligible Runners Found:**
- Select top-ranked runner
- Call `update_errand_notification()` or `update_commission_notification()` RPC
- Pass previous `notified_runner_id` to add to `timeout_runner_ids`

**If No Eligible Runners:**
- Call `clear_errand_notification()` or `clear_commission_notification()` RPC
- Adds current `notified_runner_id` to `timeout_runner_ids`
- Sets `notified_runner_id = NULL`, `notified_at = NULL`

---

## 3. Safety Checks & Idempotency

### 3.1 Idempotency Mechanisms

**1. Optimistic Locking (Primary)**
- Read `notified_at` before processing
- Verify unchanged before update
- Skip if changed (already processed)

**2. Task Status Verification**
- Double-check `status = 'pending'` before processing
- Skip if status changed (e.g., accepted, cancelled)

**3. Runner Acceptance Check**
- Before assigning, verify runner hasn't already accepted
- Check `runner_id IS NULL` (not yet accepted)

**4. Rate Limiting**
- Process max 50 tasks per run
- Prevents function timeout
- Remaining tasks processed in next run

### 3.2 Error Handling

**Per-Task Errors:**
- Log error but continue processing other tasks
- Don't fail entire function for single task error
- Return error summary in response

**Common Errors:**
- Caller has no location → skip task, log warning
- Database query fails → log error, skip task
- RPC call fails → log error, skip task
- No eligible runners → clear notification (expected)

**Response Format:**
```typescript
{
  success: true,
  processed: {
    errands: { total: 5, assigned: 3, cleared: 2, errors: 0 },
    commissions: { total: 2, assigned: 1, cleared: 1, errors: 0 }
  },
  errors: [] // Array of error objects
}
```

---

## 4. Integration with Existing Queue Logic

### 4.1 Uses Existing RPC Functions

**Errands:**
- `update_errand_notification(p_errand_id, p_notified_runner_id, p_notified_at, p_previous_notified_runner_id)`
- `clear_errand_notification(p_errand_id)`

**Commissions:**
- `update_commission_notification(p_commission_id, p_notified_runner_id, p_notified_at, p_previous_notified_runner_id)`
- `clear_commission_notification(p_commission_id)`

**Benefits:**
- No code duplication
- Consistent behavior with UI-based requeue
- Atomic database updates
- Bypasses RLS (SECURITY DEFINER)

### 4.2 Reuses Existing Algorithms

**Distance Calculation:**
- Same Haversine formula as `LocationService.calculateDistance()`
- Same 500m limit
- Same distance score calculation

**TF-IDF Calculation:**
- Same algorithm as `calculateTFIDFCosineSimilarity()`
- Same task-based counting for commissions
- Same token-based counting for errands

**Ranking Formula:**
- Same weights: Distance (40%), Rating (35%), TF-IDF (25%)
- Same sorting: Final score descending, distance ascending tiebreaker

**Presence Filter:**
- Same 90-second threshold
- Same `location_updated_at` check

### 4.3 Realtime Integration

**Automatic Propagation:**
- When Edge Function updates database via RPC, Supabase realtime fires
- All subscribed runners receive update
- Runners' apps automatically refetch (existing realtime subscriptions)
- Next runner sees task immediately (if app is open)

**No Changes Needed:**
- Existing realtime subscriptions in `app/buddyrunner/home.tsx` continue to work
- No UI code changes required for realtime integration

---

## 5. Phase 1 Safe Mode: UI-Based Timeout Checks

### 5.1 What Remains Active

**UI-Based Timeout Detection:**
- **Location:** `app/buddyrunner/home.tsx:1448` (errands), `2273` (commissions)
- **Function:** `shouldShowErrand()`, `shouldShowCommission()`
- **Trigger:** When runner fetches available tasks

**Why Keep It:**
1. **Immediate Feedback:** If runner is actively using app, UI check provides instant requeue
2. **Backup Safety:** If Edge Function fails or is delayed, UI check still works
3. **No Breaking Changes:** Existing behavior preserved
4. **Redundancy:** Two independent systems = higher reliability

### 5.2 How They Coexist

**Scenario 1: Edge Function Runs First**
- Edge Function detects timeout at T+60s
- Reassigns to next runner
- Database updated
- Realtime fires → runner's app refetches
- UI check sees `notified_runner_id` changed → no action needed (idempotent)

**Scenario 2: UI Check Runs First**
- Runner fetches tasks at T+61s
- UI check detects timeout
- Reassigns to next runner
- Database updated
- Edge Function runs at T+90s
- Sees `notified_at` changed → skips (idempotent check)

**Scenario 3: Both Run Simultaneously**
- Optimistic locking prevents duplicate assignment
- First to update wins
- Second sees change and skips

**Result:** Both systems work together safely with no conflicts

### 5.3 What Can Be Removed Later (Phase 2)

**Future Optimization (Not Phase 1):**
- Remove UI-based timeout checks (lines 1448, 2273)
- Rely solely on Edge Function
- Reduces client-side computation

**Why Not Phase 1:**
- Keep redundancy during initial deployment
- Monitor Edge Function reliability
- Gradual migration after confidence established

---

## 6. Implementation Details

### 6.1 Distance Calculation (Haversine)

**File:** `supabase/functions/timeout-requeue/utils/distance.ts`

```typescript
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Returns kilometers
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}
```

### 6.2 TF-IDF Calculation

**File:** `supabase/functions/timeout-requeue/utils/tfidf.ts`

**Note:** This is complex - consider creating a SQL function instead for performance.

**Approach Options:**

**Option A: Implement in TypeScript (Current)**
- Port `calculateTFIDFCosineSimilarity()` to Edge Function
- Same algorithm, same results
- More maintainable (single source of truth in client)

**Option B: Create SQL Function (Future Optimization)**
- Move TF-IDF calculation to database
- Faster execution
- More complex to maintain

**Recommendation:** Start with Option A, optimize to Option B later if needed.

### 6.3 Ranking Algorithm

**File:** `supabase/functions/timeout-requeue/utils/ranking.ts`

**Exact Formula:**
```typescript
const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
const ratingScore = (runner.average_rating || 0) / 5;
const tfidfScore = calculateTFIDFCosineSimilarity(...);
const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
```

**Sorting:**
```typescript
eligibleRunners.sort((a, b) => {
  if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
  return a.distance - b.distance;
});
```

---

## 7. Deployment & Configuration

### 7.1 Cron Schedule

**Recommended:** Every 30 seconds

**Rationale:**
- Catches timeouts quickly (within 30-90 seconds of actual timeout)
- Not too frequent (avoids unnecessary load)
- Balances responsiveness vs. resource usage

**Configuration:**
```toml
# supabase/config.toml
[functions.timeout-requeue]
schedule = "*/30 * * * * *"
```

**Alternative:** Every 15 seconds for faster response (higher load)

### 7.2 Environment Variables

**Automatically Provided by Supabase:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (use this, not anon key - bypasses RLS)

**No Additional Variables Needed**

### 7.3 Permissions

**Edge Function Uses:**
- Service role key (full database access)
- Bypasses RLS automatically
- Can call RPC functions
- Can query all tables

**No Permission Changes Needed**

---

## 8. Monitoring & Logging

### 8.1 Logging Strategy

**Per-Task Logging:**
- Task ID, type (errand/commission)
- Timeout detected
- Eligible runners found
- Top runner selected
- Assignment result

**Summary Logging:**
- Total tasks processed
- Total assigned
- Total cleared
- Errors encountered

**Error Logging:**
- Task ID
- Error message
- Stack trace (if applicable)

### 8.2 Metrics to Track

**Performance:**
- Function execution time
- Tasks processed per second
- Database query time

**Business:**
- Timeouts detected per hour
- Reassignments per hour
- Tasks cleared (no runners) per hour

**Reliability:**
- Function success rate
- Error rate
- Idempotency skips (indicates concurrent runs)

---

## 9. Testing Strategy

### 9.1 Unit Tests

**Test Components:**
- Distance calculation
- TF-IDF calculation
- Ranking algorithm
- Idempotency checks

### 9.2 Integration Tests

**Test Scenarios:**
1. Single timeout detected and reassigned
2. Multiple timeouts processed in one run
3. No eligible runners → notification cleared
4. Idempotency: function runs twice, second skips
5. Concurrent UI check + Edge Function (no conflicts)
6. Caller has no location → task skipped
7. All runners timed out → notification cleared

### 9.3 Manual Testing

**Test Cases:**
1. Create errand, wait 60+ seconds, verify reassignment
2. Create commission, wait 60+ seconds, verify reassignment
3. Verify next runner receives notification via realtime
4. Verify timeout_runner_ids updated correctly
5. Verify no duplicate assignments

---

## 10. Rollout Plan

### Phase 1: Deploy with UI Checks Active (Safe Mode)

**Week 1:**
1. Deploy Edge Function
2. Monitor logs for errors
3. Verify reassignments working
4. Compare Edge Function vs. UI check results

**Week 2:**
1. Monitor performance metrics
2. Verify idempotency working
3. Check for any edge cases

**Week 3:**
1. Continue monitoring
2. Gather user feedback
3. Document any issues

### Phase 2: Optimize (Future)

**After Confidence Established:**
1. Remove UI-based timeout checks (optional)
2. Optimize TF-IDF to SQL function (if needed)
3. Adjust cron schedule based on metrics

---

## 11. Summary

### Key Features

✅ **Proactive Detection:** Runs on schedule, doesn't require runner activity  
✅ **Idempotent:** Safe to run multiple times  
✅ **Uses Existing Logic:** Same algorithms, same RPC functions  
✅ **Safe Integration:** Coexists with UI checks (Phase 1)  
✅ **Works Offline:** Functions even if no runners online  
✅ **No Breaking Changes:** All existing functionality preserved  

### Deliverables

1. ✅ Edge Function design (this document)
2. ⏳ Edge Function implementation (`index.ts` + utils)
3. ⏳ Cron schedule configuration
4. ⏳ Testing plan execution
5. ⏳ Deployment documentation

### Next Steps

1. Implement Edge Function code
2. Set up cron schedule
3. Deploy to staging
4. Test thoroughly
5. Deploy to production
6. Monitor and iterate

---

## Appendix: Code Structure Preview

```
supabase/functions/timeout-requeue/
├── index.ts
│   ├── Main handler
│   ├── Query timed-out tasks
│   ├── Process each task
│   └── Return results
├── utils/
│   ├── distance.ts
│   │   └── calculateDistance()
│   ├── tfidf.ts
│   │   ├── calculateTFIDFCosineSimilarity()
│   │   ├── calculateTF()
│   │   ├── calculateIDF()
│   │   └── cosineSimilarity()
│   └── ranking.ts
│       ├── getEligibleRunners()
│       ├── calculateRunnerScore()
│       └── rankRunners()
└── README.md
```

**Estimated Implementation Time:** 2-3 days  
**Estimated Lines of Code:** ~800-1000 lines  
**Complexity:** Medium (TF-IDF is complex, rest is straightforward)
