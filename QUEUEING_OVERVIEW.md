# Overall Queueing Process in the System

## Complete Flow: From Commission Creation to Runner Assignment

---

## Phase 1: Commission Creation & Entry into Queue

**Location:** `app/buddycaller/commission_form.tsx` (lines 40-71) and `commission_form_web.tsx` (lines 49-80)

### Step 1.1: BuddyCaller Creates Commission
```typescript
// Commission is created with:
{
    status: 'pending',                    // Initial state
    buddycaller_id: caller.id,            // Who created it
    commission_type: "logos,posters",     // Categories (comma-separated)
    notified_runner_id: NULL,              // No runner assigned yet
    notified_at: NULL,                    // No notification timestamp
    timeout_runner_ids: [],               // Empty array initially
    declined_runner_id: NULL,             // No declined runner yet
    runner_id: NULL                        // No accepted runner yet
}
```

**Result:** Commission enters the queue in `pending` status, waiting for runner assignment.

---

## Phase 2: Runner Views Available Commissions

**Location:** `app/buddyrunner/home.tsx`, lines 960-1160

**Function:** `useAvailableCommissions()` → `refetch()`

### Step 2.1: Entry Point
When a BuddyRunner opens their home screen, the system triggers `refetch()` to load available commissions.

### Step 2.2: Rule-Based Pre-Filtering
**Location:** Lines 974-996

**Checks Applied:**
1. ✅ **Authentication Check** (Lines 967-972)
   - Runner must be logged in (`uid` exists)
   - If not authenticated → No commissions shown

2. ✅ **Online Status Check** (Lines 974-996)
   - Runner must have `is_available = true`
   - If offline → No commissions shown
   - This is the **first rule-based filter**

**Code:**
```typescript
// Only show commissions if runner is available (online)
if (!runnerData?.is_available) {
    console.log('❌ Runner is not available (offline), not showing commissions');
    setRows([]);
    setLoading(false);
    return;
}
```

### Step 2.3: Location Fetching
**Location:** Lines 1000-1220

**Process:**
1. Attempts to get GPS location (with 3 retries)
2. Falls back to database location if GPS fails
3. Validates location accuracy

### Step 2.4: Fetch Pending Commissions
**Location:** Lines 1159-1160

**Query:**
```typescript
const { data: cData, error } = await supabase
    .from("commission")
    .select("id, title, commission_type, created_at, buddycaller_id, status, runner_id, declined_runner_id, notified_runner_id, notified_at, timeout_runner_ids")
    .eq("status", "pending")
    .is("runner_id", null);
```

**Fetches:** All pending commissions that haven't been accepted yet.

---

## Phase 3: Distance Filtering

**Location:** `app/buddyrunner/home.tsx`, lines 1207-1226

### Step 3.1: Get Caller Locations
- Fetches location for each commission's caller
- Required for distance calculation

### Step 3.2: Filter by 500m Distance
**Rule Applied:** Only commissions within 500 meters of runner are considered.

```typescript
const distanceKm = LocationService.calculateDistance(
    runnerLat, runnerLon,
    callerLocation.latitude, callerLocation.longitude
);
const distanceMeters = distanceKm * 1000;

if (distanceMeters <= effectiveDistanceLimit) { // 500m
    filteredRaw.push(commission);
}
```

**Result:** Commissions beyond 500m are excluded from ranking.

---

## Phase 4: Ranking & Assignment Decision

**Location:** `app/buddyrunner/home.tsx`, lines 1352-1684

**Function:** `shouldShowCommission(commission: CommissionRowDB)`

### Step 4.1: Check Commission State
**Location:** Lines 1368-1379

**Two Scenarios:**
- **Scenario A:** `notified_runner_id = NULL` → Initial assignment needed
- **Scenario B:** `notified_at < 60 seconds ago` → Timeout, need next runner

---

## Phase 5: Scenario A - Initial Assignment

**Location:** Lines 1382-1512

### Step 5.1: Fetch Eligible Runners
**Location:** Lines 1393-1411

**Rule-Based Exclusions:**
```typescript
let query = supabase
    .from("users")
    .select("id, latitude, longitude, average_rating")
    .eq("role", "BuddyRunner")
    .eq("is_available", true);  // ✅ Must be online

// Exclude declined runner
if (commission.declined_runner_id) {
    query = query.neq("id", commission.declined_runner_id);
}

// Exclude all timeout runners
if (commission.timeout_runner_ids && commission.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of commission.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}
```

**Rules Applied:**
- ✅ Role = "BuddyRunner"
- ✅ `is_available = true` (online)
- ❌ Exclude `declined_runner_id`
- ❌ Exclude all runners in `timeout_runner_ids`

### Step 5.2: Distance Filtering (500m)
**Location:** Lines 1439-1449

For each runner:
```typescript
const distanceMeters = distanceKm * 1000;
if (distanceMeters > effectiveDistanceLimit) continue; // Skip if > 500m
```

### Step 5.3: Calculate Ranking Scores
**Location:** Lines 1451-1465

For each eligible runner, three scores are calculated:

#### 5.3.1: Historical Task Count (50% weight)
**Location:** Lines 1282-1316, called at line 1452

```typescript
const count = await getRunnerCompletedCount(runner.id, commissionTypes);
// Returns: Number of completed commissions in same category
// Example: Runner has 8 completed "logos" commissions → count = 8
```

**Function:** `getRunnerCompletedCount()`
- Fetches all completed commissions for runner
- Counts how many match the commission's categories
- Returns integer count (0, 1, 2, 3...)

#### 5.3.2: TF-IDF + Cosine Similarity (20% weight)
**Location:** Lines 750-876, called at line 1458

```typescript
const runnerHistory = await getRunnerCategoryHistory(runner.id);
const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory);
// Returns: Similarity score 0.0 to 1.0
```

**Process:**
1. **Term Frequency (TF):** How often categories appear in runner's history
2. **Inverse Document Frequency (IDF):** How unique/rare each category is
3. **TF-IDF Vectors:** Create weighted vectors for commission and runner history
4. **Cosine Similarity:** Measure angle between vectors (0.0 to 1.0)

**Example:**
- Commission needs: `["logos", "posters"]`
- Runner history: `["logos", "logos", "posters", "flyers"]`
- TF-IDF calculates semantic similarity → `0.85`

#### 5.3.3: Rating (30% weight)
**Location:** Lines 1460-1461

```typescript
const rating = (runner.average_rating || 0) / 5;
// Normalizes 0-5 scale to 0-1 scale
// Example: 4.5 rating → 0.9
```

### Step 5.4: Calculate Final Score
**Location:** Line 1465

```typescript
const finalScore = (count * 0.5) + (tfidfScore * 0.2) + (rating * 0.3);
```

**Formula Breakdown:**
- `count * 0.5` = Historical experience (50%)
- `tfidfScore * 0.2` = Category match quality (20%)
- `rating * 0.3` = Runner quality (30%)

**Example Calculation:**
- Runner A: count=10, tfidf=0.8, rating=4.5 → `(10×0.5) + (0.8×0.2) + (0.9×0.3) = 5.0 + 0.16 + 0.27 = 5.43`
- Runner B: count=5, tfidf=0.9, rating=5.0 → `(5×0.5) + (0.9×0.2) + (1.0×0.3) = 2.5 + 0.18 + 0.3 = 2.98`
- **Winner:** Runner A (higher final score)

### Step 5.5: Sort and Assign Top Runner
**Location:** Lines 1483-1512

```typescript
// Sort by final score (descending), distance as tiebreaker
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance; // Closer distance wins tie
});

const topRunner = eligibleRunners[0];

// Assign to top-ranked runner
await supabase.rpc('update_commission_notification', {
    p_commission_id: commission.id,
    p_notified_runner_id: topRunner.id,
    p_notified_at: new Date().toISOString()
});
```

**Database Updates:**
- `notified_runner_id` = top runner's ID
- `notified_at` = current timestamp

**Visibility:**
- Only the top-ranked runner sees the commission
- All other runners see nothing

---

## Phase 6: 60-Second Timeout Window

**Location:** Lines 1368-1378 (detection), Lines 1675-1679 (current runner check)

### Step 6.1: Timeout Detection
```typescript
const now = new Date();
const notifiedAt = commission.notified_at ? new Date(commission.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // 60 seconds passed → Trigger reassignment
}
```

### Step 6.2: Runner Actions
**Two Possible Outcomes:**

#### Outcome A: Runner Accepts
**Location:** `app/buddyrunner/view_commission.tsx` (lines 294-359) or `view_commission_web.tsx` (lines 308-373)

```typescript
await supabase
    .from("commission")
    .update({
        status: "in_progress",
        runner_id: user.id,
        accepted_at: new Date().toISOString()
    })
    .eq("id", commission.id);
```

**Result:** 
- ✅ Commission moves to `in_progress`
- ✅ `runner_id` assigned
- ✅ Queueing process ends for this commission

#### Outcome B: Runner Ignores/Timeouts
**Result:**
- ⏰ 60 seconds pass without acceptance
- ⏰ Triggers **Phase 7: Timeout Reassignment**

---

## Phase 7: Scenario B - Timeout Reassignment

**Location:** Lines 1515-1672

### Step 7.1: Check Timeout Status
**Location:** Lines 1516-1546

```typescript
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Fetch next runners, excluding:
    // - Current notified_runner_id
    // - All timeout_runner_ids
    // - declined_runner_id
}
```

### Step 7.2: Fetch Next Eligible Runners
**Location:** Lines 1528-1546

**Exclusions Applied:**
```typescript
let query = supabase
    .from("users")
    .select("id, latitude, longitude, average_rating")
    .eq("role", "BuddyRunner")
    .eq("is_available", true)
    .neq("id", commission.notified_runner_id); // Exclude current notified runner

// Exclude declined runner
if (commission.declined_runner_id) {
    query = query.neq("id", commission.declined_runner_id);
}

// Exclude all timeout runners
if (commission.timeout_runner_ids && commission.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of commission.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}
```

### Step 7.3: Re-rank Remaining Runners
**Location:** Lines 1572-1620

**Same Process as Phase 5:**
1. Filter by distance (500m)
2. Calculate historical count (50%)
3. Calculate TF-IDF similarity (20%)
4. Get rating (30%)
5. Calculate final score
6. Sort by score

### Step 7.4: Assign Next Runner & Update Timeout List
**Location:** Lines 1646-1664

```typescript
const previousNotifiedRunnerId = commission.notified_runner_id;

await supabase.rpc('update_commission_notification', {
    p_commission_id: commission.id,
    p_notified_runner_id: nextRunner.id,
    p_notified_at: new Date().toISOString(),
    p_previous_notified_runner_id: previousNotifiedRunnerId // Adds to timeout_runner_ids
});
```

**Database Updates:**
- `notified_runner_id` = next runner's ID
- `notified_at` = new timestamp
- `timeout_runner_ids` = previous runner added to array

**Result:**
- Previous runner added to exclusion list
- Next runner gets 60-second window
- Process repeats if they also timeout

---

## Phase 8: Queue Progression & Edge Cases

### Case 1: No Eligible Runners Left
**Location:** Lines 1555-1567

```typescript
if (!availableRunners || availableRunners.length === 0) {
    // Clear notification, wait for new runners
    await supabase.rpc('clear_commission_notification', {
        p_commission_id: commission.id
    });
}
```

**Result:**
- `notified_runner_id` = NULL
- `notified_at` = NULL
- Commission waits in queue for new runners to become available

### Case 2: Caller Declines Runner
**Location:** `app/buddycaller/ChatScreenCaller.tsx` (lines 2281-2304)

```typescript
await supabase
    .from('commission')
    .update({
        status: 'pending',
        runner_id: null,
        declined_runner_id: currentCommission?.runner_id || null
    })
    .eq('id', updatedInvoice.commission_id);
```

**Result:**
- Commission resets to `pending`
- Declined runner excluded from future assignments
- Queue restarts with remaining runners

### Case 3: All Runners Timed Out
**Location:** `app/buddycaller/home.tsx` (lines 602-754)

After 60+ seconds since commission creation, if all eligible runners have timed out:
- System detects all runners exhausted
- Shows modal to caller
- Commission remains in queue waiting for new runners

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Commission Creation                                │
│ - Status: 'pending'                                          │
│ - notified_runner_id: NULL                                   │
│ - timeout_runner_ids: []                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Runner Views Commissions                           │
│ ✅ Rule-Based Filter: Is runner online?                     │
│    - NO → Don't show commissions                            │
│    - YES → Continue                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Distance Filtering                                  │
│ ✅ Filter: Within 500m?                                     │
│    - NO → Exclude commission                                │
│    - YES → Continue to ranking                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 4: Check Commission State                             │
│                                                              │
│ ┌────────────────────┐         ┌──────────────────────┐  │
│ │ Scenario A:         │         │ Scenario B:          │  │
│ │ notified_runner_id │         │ notified_at < 60s    │  │
│ │ = NULL              │         │ ago                   │  │
│ └─────────┬──────────┘         └──────────┬───────────┘  │
│           │                                 │               │
│           ▼                                 ▼               │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ PHASE 5: Initial Assignment                            │ │
│ │ 1. Fetch eligible runners (exclude declined/timeout)  │ │
│ │ 2. Filter by distance (500m)                           │ │
│ │ 3. Calculate scores:                                   │ │
│ │    - Historical count (50%)                            │ │
│ │    - TF-IDF similarity (20%)                           │ │
│ │    - Rating (30%)                                      │ │
│ │ 4. Sort by final score                                 │ │
│ │ 5. Assign top runner                                   │ │
│ │    → Set notified_runner_id + notified_at             │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ PHASE 7: Timeout Reassignment                           │ │
│ │ 1. Exclude previous notified runner                    │ │
│ │ 2. Exclude all timeout runners                          │ │
│ │ 3. Re-rank remaining runners (same as Phase 5)         │ │
│ │ 4. Assign next runner                                  │ │
│ │    → Add previous to timeout_runner_ids                │ │
│ └────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ PHASE 6: 60-Second Timeout Window                           │
│                                                              │
│ ┌────────────────────┐         ┌──────────────────────┐  │
│ │ Outcome A:          │         │ Outcome B:           │  │
│ │ Runner Accepts      │         │ Runner Timeouts      │  │
│ │                     │         │                      │  │
│ │ → status:          │         │ → 60s passed         │  │
│ │   'in_progress'     │         │ → Trigger Phase 7    │  │
│ │ → runner_id set     │         │   (Reassignment)    │  │
│ │ → Queue ends ✅     │         │                      │  │
│ └────────────────────┘         └──────────┬───────────┘  │
│                                            │               │
│                                            ▼               │
│                                 Loop back to Phase 7       │
│                                 (until accepted or         │
│                                  all runners exhausted)    │
└────────────────────────────────────────────────────────────┘
```

---

## Key Components Summary

### Rule-Based Filtering
- ✅ **Online Status:** Runner must be `is_available = true` (Lines 974-996)
- ✅ **Role Check:** Must be "BuddyRunner" (Lines 1397, 1532)
- ✅ **Exclusions:** Declined runners, timeout runners (Lines 1400-1411, 1536-1546)

### Distance Filtering
- ✅ **500m Limit:** Only commissions within 500m considered (Lines 1207-1226, 1449, 1593)
- ✅ **GPS Location:** Uses device GPS with database fallback (Lines 1000-1220)

### Task Matching Algorithm
- ✅ **Historical Count (50%):** `getRunnerCompletedCount()` (Lines 1282-1316)
- ✅ **TF-IDF Similarity (20%):** `calculateTFIDFCosineSimilarity()` (Lines 846-876)
- ✅ **Rating (30%):** Normalized `average_rating / 5` (Lines 1461, 1605)

### Timeout Handling
- ✅ **Detection:** Checks if `notified_at < 60 seconds ago` (Lines 1368-1378)
- ✅ **Exclusion:** Adds timed-out runners to `timeout_runner_ids` (Line 1654)
- ✅ **Reassignment:** Finds next runner, excludes previous (Lines 1515-1672)

### Final Score Formula
```typescript
finalScore = (historicalCount × 0.5) + (tfidfScore × 0.2) + (rating × 0.3)
```

**Applied at:**
- Line 1465: Initial assignment
- Line 1609: Timeout reassignment

---

## Database Fields Used

| Field | Purpose | Updated When |
|-------|---------|--------------|
| `notified_runner_id` | Currently notified runner | Initial assignment, timeout reassignment |
| `notified_at` | Timestamp of notification | Initial assignment, timeout reassignment |
| `timeout_runner_ids` | Array of timed-out runners | After each timeout |
| `declined_runner_id` | Runner declined by caller | When caller declines invoice |
| `runner_id` | Runner who accepted | When runner accepts commission |
| `status` | Commission status | Changes to 'in_progress' on acceptance |

---

## SQL Functions

1. **`update_commission_notification`**
   - Updates `notified_runner_id` and `notified_at`
   - Adds previous runner to `timeout_runner_ids` array
   - Defined in: `fix_timeout_runner_ids_null_handling.sql`

2. **`clear_commission_notification`**
   - Clears `notified_runner_id` and `notified_at`
   - Adds current runner to `timeout_runner_ids` before clearing
   - Defined in: `add_clear_commission_notification_function.sql`

---

## Summary

The queueing system ensures:
1. **Fair Distribution:** Only one runner sees commission at a time
2. **Optimal Matching:** Ranks runners by experience, category fit, and rating
3. **Efficient Progression:** 60-second windows prevent delays
4. **No Re-notification:** Timeout list prevents loops
5. **Continuous Flow:** Automatically moves to next runner if current times out

The system combines **rule-based filtering** (online status, distance, exclusions) with **intelligent ranking** (historical count, TF-IDF similarity, rating) to create an efficient, fair queueing mechanism.

