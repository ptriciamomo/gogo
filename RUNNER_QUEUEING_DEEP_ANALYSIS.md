# Deep Code-Level Analysis: Runner Assignment & Queueing Algorithms

## Executive Summary

The runner queueing system uses **client-side ranking** with a **60-second timeout mechanism**. Ranking occurs when runners fetch available tasks, not when tasks are posted. The system uses a weighted scoring algorithm combining category experience, TF-IDF similarity, and ratings.

---

## File Inventory & Responsibilities

### Core Queueing Files

#### 1. `app/buddyrunner/home.tsx` (Lines 777-2173)
**Responsibility:** Main queueing logic for both Errands and Commissions

**Key Functions:**
- `useAvailableErrands()` (777-1425): Fetches and ranks available errands
- `useAvailableCommissions()` (1428-2173): Fetches and ranks available commissions
- `shouldShowErrand()` (1069-1350): Determines if current runner should see errand (ranking logic)
- `shouldShowCommission()` (1721-2053): Determines if current runner should see commission (ranking logic)
- `calculateTFIDFCosineSimilarity()` (747-774): TF-IDF + Cosine Similarity calculation
- `calculateTF()` (655-659): Term Frequency calculation
- `calculateIDFAdjusted()` (674-686): Adjusted Inverse Document Frequency
- `cosineSimilarity()` (723-742): Cosine similarity between vectors

**Exact Code Location:**
```typescript
// Ranking formula (line 1165-1166)
const finalScore = (count * 0.5) + (tfidfScore * 0.2) + (rating * 0.3);

// Distance calculation (lines 899-904)
let effectiveDistanceLimit = 500;
if (gpsAccuracy > 500) {
    const accuracyBuffer = Math.min(gpsAccuracy / 2, 2000);
    effectiveDistanceLimit = Math.min(500 + accuracyBuffer, 3000);
}

// Timeout check (line 1085)
const sixtySecondsAgo = new Date(now.getTime() - 60000);
```

#### 2. `components/LocationService.ts` (Lines 276-291)
**Responsibility:** Distance calculation using Haversine formula

**Exact Code:**
```typescript
public calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Returns distance in kilometers
}
```

#### 3. `add_errand_notification_functions.sql`
**Responsibility:** Database RPC functions for atomic notification updates

**Functions:**
- `update_errand_notification()`: Updates `notified_runner_id`, `notified_at`, and `timeout_runner_ids`
- `clear_errand_notification()`: Clears notification fields and adds current runner to timeout list

**Exact SQL Logic:**
```sql
-- Add previous runner to timeout list (lines 25-28)
IF p_previous_notified_runner_id IS NOT NULL THEN
    IF NOT (p_previous_notified_runner_id = ANY(v_current_timeout_ids)) THEN
        v_current_timeout_ids := array_append(v_current_timeout_ids, p_previous_notified_runner_id);
    END IF;
END IF;
```

#### 4. `app/buddycaller/home.tsx` (Lines 983-1286)
**Responsibility:** Timeout monitoring and "no runners available" detection

**Functions:**
- `checkIfAllRunnersTimedOut()` (983-1135): Checks if all eligible runners timed out for commission
- `checkIfAllRunnersTimedOutForErrand()` (1144-1286): Checks if all eligible runners timed out for errand

#### 5. `app/buddyrunner/view_errand.tsx` & `app/buddyrunner/view_commission.tsx`
**Responsibility:** Accept action handlers

**Exact Code (view_errand.tsx, lines 424-431):**
```typescript
const { error } = await supabase
    .from("errand")
    .update({
        status: "in_progress",
        runner_id: user.id,
        accepted_at: new Date().toISOString(),
    })
    .eq("id", errand.id);
```

---

## Runner Ranking Formula - Detailed Breakdown

### Formula Components

**Final Score Formula (Line 1166 for Errands, Line 1833 for Commissions):**
```
FinalScore = (count × 0.5) + (tfidfScore × 0.2) + (rating × 0.3)
```

### Variable Definitions

#### 1. `count` (50% weight)
**Definition:** Number of completed tasks in the same category/type

**For Errands (lines 958-989):**
```typescript
const getRunnerCompletedErrandsCount = async (runnerId: string, errandCategory: string | null): Promise<number> => {
    // Query: SELECT id, category FROM errand 
    //        WHERE runner_id = runnerId AND status = 'completed'
    // Count exact matches: category.trim().toLowerCase() === errandCategory.trim().toLowerCase()
    return count; // Integer count
}
```

**For Commissions (lines 1651-1685):**
```typescript
const getRunnerCompletedCount = async (runnerId: string, commissionTypes: string[]): Promise<number> => {
    // Query: SELECT id, commission_type FROM commission 
    //        WHERE runner_id = runnerId AND status = 'completed'
    // Count if ANY commission type overlaps with completed types
    // commission_type is comma-separated: "logos,posters"
    return count; // Integer count
}
```

**Weight:** 0.5 (50% of final score)

#### 2. `tfidfScore` (20% weight)
**Definition:** TF-IDF + Cosine Similarity score between task categories and runner's category history

**Calculation Steps:**

**Step 1: Term Frequency (TF) - Lines 655-659**
```typescript
function calculateTF(term: string, document: string[]): number {
    if (document.length === 0) return 0;
    const termCount = document.filter(word => word === term).length;
    return termCount / document.length; // Frequency of term in document
}
```

**Step 2: Adjusted Inverse Document Frequency (IDF) - Lines 674-686**
```typescript
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
    const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
    if (documentsContainingTerm === 0) return 0;
    
    // Special case: if term appears in all documents, use 0.1 instead of 0
    if (documentsContainingTerm === allDocuments.length) {
        return 0.1; // Small epsilon to avoid zero IDF
    }
    
    return Math.log(allDocuments.length / documentsContainingTerm);
}
```

**Step 3: TF-IDF Vector - Lines 691-701**
```typescript
function calculateTFIDFVectorAdjusted(document: string[], allDocuments: string[][]): Map<string, number> {
    const uniqueTerms = Array.from(new Set(document));
    const tfidfMap = new Map<string, number>();
    
    uniqueTerms.forEach(term => {
        const tf = calculateTF(term, document);
        const idf = calculateIDFAdjusted(term, allDocuments);
        tfidfMap.set(term, tf * idf); // TF-IDF value for each term
    });
    
    return tfidfMap;
}
```

**Step 4: Cosine Similarity - Lines 723-742**
```typescript
function cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number {
    const allTerms = Array.from(new Set([...vector1.keys(), ...vector2.keys()]));
    
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    allTerms.forEach(term => {
        const val1 = vector1.get(term) || 0;
        const val2 = vector2.get(term) || 0;
        dotProduct += val1 * val2;
        magnitude1 += val1 * val1;
        magnitude2 += val2 * val2;
    });
    
    const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);
    if (denominator === 0) return 0;
    
    return dotProduct / denominator; // Returns value between 0 and 1
}
```

**Step 5: Final TF-IDF Score - Lines 747-774**
```typescript
function calculateTFIDFCosineSimilarity(commissionCategories: string[], runnerHistory: string[]): number {
    // Convert to lowercase arrays
    const queryDoc = commissionCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    const runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    
    const allDocuments = [queryDoc, runnerDoc];
    const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
    const runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
    
    const similarity = cosineSimilarity(queryVector, runnerVector);
    return isNaN(similarity) ? 0 : similarity; // Returns 0-1
}
```

**Weight:** 0.2 (20% of final score)

#### 3. `rating` (30% weight)
**Definition:** Runner's average rating normalized to 0-1 scale

**Calculation (Line 1162 for Errands, Line 1829 for Commissions):**
```typescript
const rating = (runner.average_rating || 0) / 5; // Normalize 0-5 scale to 0-1
```

**Weight:** 0.3 (30% of final score)

### Sorting & Tie-Breaking

**Primary Sort (Lines 1185-1188):**
```typescript
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore; // Descending by score
    return a.distance - b.distance; // Ascending by distance (tiebreaker)
});
```

**Tie-Breaking Logic:**
1. **Primary:** Final Score (descending) - Higher score wins
2. **Secondary:** Distance (ascending) - Closer runner wins if scores are equal

---

## Distance Calculation - Detailed Analysis

### Haversine Formula Implementation

**File:** `components/LocationService.ts` (Lines 276-291)

**Formula:**
```
Distance = R × c
where:
  R = 6371 km (Earth's radius)
  a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlon/2)
  c = 2 × atan2(√a, √(1-a))
```

**Units:** Returns **kilometers**, converted to **meters** in ranking code:
```typescript
const distanceKm = LocationService.calculateDistance(lat1, lon1, lat2, lon2);
const distanceMeters = distanceKm * 1000; // Convert to meters
```

### GPS Accuracy Handling

**File:** `app/buddyrunner/home.tsx` (Lines 899-904)

**Exact Code:**
```typescript
// Base distance limit (500m) with accuracy buffer
let effectiveDistanceLimit = 500; // Hard-coded base limit

if (gpsAccuracy > 500) {
    const accuracyBuffer = Math.min(gpsAccuracy / 2, 2000); // Half of accuracy, max 2000m
    effectiveDistanceLimit = Math.min(500 + accuracyBuffer, 3000); // Max 3000m total
}
```

**Logic:**
1. **Base limit:** 500 meters (hard-coded)
2. **If GPS accuracy > 500m:**
   - Calculate buffer: `min(gpsAccuracy / 2, 2000)`
   - Effective limit: `min(500 + buffer, 3000)`
3. **Maximum effective limit:** 3000 meters (hard-coded)

**Example Calculations:**
- GPS accuracy = 100m → Effective limit = 500m (no buffer)
- GPS accuracy = 1000m → Buffer = 500m → Effective limit = 1000m
- GPS accuracy = 5000m → Buffer = 2000m (capped) → Effective limit = 2500m
- GPS accuracy = 10000m → Buffer = 2000m (capped) → Effective limit = 2500m (capped at 3000m)

### Distance Filtering

**Applied at two stages:**
1. **Initial filtering (Lines 937-955):** Filters errands/commissions before ranking
2. **During ranking (Line 1149):** Filters runners during score calculation

**Exact Code (Line 1149):**
```typescript
if (distanceMeters > effectiveDistanceLimit) continue; // Skip runner if too far
```

---

## Timeout Logic - Step-by-Step

### Timeout Definition

**Hard-coded value:** 60 seconds (60000 milliseconds)

**Location:** `app/buddyrunner/home.tsx` (Line 1085)
```typescript
const sixtySecondsAgo = new Date(now.getTime() - 60000);
```

### Timeout Detection

**Trigger:** On-demand when any runner fetches available tasks

**Detection Logic (Lines 1082-1085, 1210-1211):**
```typescript
const now = new Date();
const notifiedAt = errand.notified_at ? new Date(errand.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

// Check if timeout occurred
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Timeout detected - find next runner
}
```

**Important:** Timeout is **NOT** detected by a background job. It's only checked when:
1. A runner calls `useAvailableErrands()` or `useAvailableCommissions()`
2. The `shouldShowErrand()` or `shouldShowCommission()` function executes

### Timeout Runner Tracking

**Database Field:** `timeout_runner_ids` (UUID array)

**Update Logic (SQL, lines 25-28):**
```sql
-- Add previous runner to timeout list
IF p_previous_notified_runner_id IS NOT NULL THEN
    IF NOT (p_previous_notified_runner_id = ANY(v_current_timeout_ids)) THEN
        v_current_timeout_ids := array_append(v_current_timeout_ids, p_previous_notified_runner_id);
    END IF;
END IF;
```

**Exclusion Logic (Lines 1107-1112):**
```typescript
// Exclude all timeout runners from query
if (errand.timeout_runner_ids && errand.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of errand.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}
```

### Next Runner Selection After Timeout

**Process (Lines 1210-1338):**
1. Detect timeout: `notifiedAt < sixtySecondsAgo`
2. Query available runners excluding:
   - Current `notified_runner_id`
   - All runners in `timeout_runner_ids`
3. Re-apply distance filter (500m with GPS buffer)
4. Re-apply ranking algorithm (same formula)
5. Select top runner
6. Call `updateErrandNotification()` with previous runner ID

**Exact Code (Lines 1320-1329):**
```typescript
const previousNotifiedRunnerId = errand.notified_runner_id;

await updateErrandNotification(
    errand.id,
    nextRunner.id,
    new Date().toISOString(),
    previousNotifiedRunnerId // This adds previous runner to timeout_runner_ids
);
```

---

## Complete Queue Lifecycle Algorithm

### Phase 1: Posting (Caller Side)

**Step 1:** Caller creates errand/commission
```sql
INSERT INTO errand (status, buddycaller_id, category, ...)
VALUES ('pending', caller_id, 'Shopping', ...);
```

**Database State:**
- `status = 'pending'`
- `runner_id = NULL`
- `notified_runner_id = NULL`
- `notified_at = NULL`
- `timeout_runner_ids = NULL`

### Phase 2: Initial Assignment (Runner Side - On-Demand)

**Trigger:** Runner calls `useAvailableErrands()` or `useAvailableCommissions()`

**Step 1:** Fetch pending tasks (Lines 906-914)
```typescript
const { data: eData } = await supabase
    .from("errand")
    .select("id, title, category, status, created_at, buddycaller_id, runner_id, notified_runner_id, notified_at, timeout_runner_ids")
    .eq("status", "pending")
    .is("runner_id", null)
    .order("created_at", { ascending: false });
```

**Step 2:** Get runner location (Lines 815-897)
- Try GPS first (with retries)
- Fallback to database location
- Calculate GPS accuracy

**Step 3:** Calculate effective distance limit (Lines 899-904)
```typescript
let effectiveDistanceLimit = 500;
if (gpsAccuracy > 500) {
    const accuracyBuffer = Math.min(gpsAccuracy / 2, 2000);
    effectiveDistanceLimit = Math.min(500 + accuracyBuffer, 3000);
}
```

**Step 4:** Filter by distance (Lines 937-955)
```typescript
const filteredErrands = errands.filter((errand) => {
    const callerLocation = callerLocations[errand.buddycaller_id || ""];
    if (!callerLocation) return false;
    
    const distanceKm = LocationService.calculateDistance(
        runnerLat, runnerLon,
        callerLocation.latitude, callerLocation.longitude
    );
    const distanceMeters = distanceKm * 1000;
    
    return distanceMeters <= effectiveDistanceLimit;
});
```

**Step 5:** Check if assignment needed (Line 1088)
```typescript
if (!errand.notified_runner_id) {
    // No runner assigned yet - perform ranking
}
```

**Step 6:** Query available runners (Lines 1100-1114)
```typescript
let query = supabase
    .from("users")
    .select("id, latitude, longitude, average_rating")
    .eq("role", "BuddyRunner")
    .eq("is_available", true);

// Exclude timeout runners
if (errand.timeout_runner_ids && errand.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of errand.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}
```

**Step 7:** Rank runners (Lines 1128-1177)
```typescript
const eligibleRunners = [];

for (const runner of availableRunners) {
    // 1. Calculate distance
    const distanceKm = LocationService.calculateDistance(...);
    const distanceMeters = distanceKm * 1000;
    if (distanceMeters > effectiveDistanceLimit) continue;
    
    // 2. Get category count
    const count = await getRunnerCompletedErrandsCount(runner.id, errandCategory);
    
    // 3. Get category history
    const runnerHistory = await getRunnerErrandCategoryHistory(runner.id);
    
    // 4. Calculate TF-IDF score
    const tfidfScore = calculateTFIDFCosineSimilarity([errandCategory], runnerHistory);
    
    // 5. Normalize rating
    const rating = (runner.average_rating || 0) / 5;
    
    // 6. Calculate final score
    const finalScore = (count * 0.5) + (tfidfScore * 0.2) + (rating * 0.3);
    
    eligibleRunners.push({ id, count, distance, rating, finalScore });
}
```

**Step 8:** Sort and select top runner (Lines 1184-1190)
```typescript
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance;
});

const topRunner = eligibleRunners[0];
```

**Step 9:** Assign to top runner (Lines 1194-1198)
```typescript
await updateErrandNotification(
    errand.id,
    topRunner.id,
    new Date().toISOString()
);
```

**Database State After Assignment:**
- `notified_runner_id = topRunner.id`
- `notified_at = current_timestamp`
- `timeout_runner_ids = []` (empty array)

**Step 10:** Visibility check (Lines 1201-1207)
```typescript
if (topRunner.id === uid) {
    return true; // Show to this runner
} else {
    return false; // Hide from other runners
}
```

### Phase 3: Acceptance (Runner Side)

**Trigger:** Runner clicks "Accept" button

**Action (view_errand.tsx, lines 424-431):**
```typescript
await supabase
    .from("errand")
    .update({
        status: "in_progress",
        runner_id: user.id,
        accepted_at: new Date().toISOString(),
    })
    .eq("id", errand.id);
```

**Database State After Acceptance:**
- `status = 'in_progress'`
- `runner_id = user.id`
- `notified_runner_id` remains (not cleared)
- Task removed from available list (filtered by `runner_id IS NULL`)

### Phase 4: Timeout (Runner Side - On-Demand)

**Trigger:** Any runner fetches available tasks AND timeout has occurred

**Step 1:** Detect timeout (Lines 1210-1214)
```typescript
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Timeout occurred
}
```

**Step 2:** Query next available runners (Lines 1224-1236)
```typescript
let query = supabase
    .from("users")
    .select("id, latitude, longitude, average_rating")
    .eq("role", "BuddyRunner")
    .eq("is_available", true)
    .neq("id", errand.notified_runner_id || ""); // Exclude current notified runner

// Exclude timeout runners
if (errand.timeout_runner_ids && errand.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of errand.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}
```

**Step 3:** Re-rank remaining runners (Lines 1254-1302)
- Same ranking algorithm as Phase 2
- Excludes previous notified runner and all timeout runners

**Step 4:** Assign to next runner (Lines 1320-1329)
```typescript
const previousNotifiedRunnerId = errand.notified_runner_id;

await updateErrandNotification(
    errand.id,
    nextRunner.id,
    new Date().toISOString(),
    previousNotifiedRunnerId // Adds previous runner to timeout_runner_ids
);
```

**Database State After Reassignment:**
- `notified_runner_id = nextRunner.id`
- `notified_at = current_timestamp`
- `timeout_runner_ids = [previousRunnerId, ...existingTimeouts]`

**Step 5:** Repeat Phase 3 or Phase 4
- If next runner accepts → Phase 3
- If next runner times out → Phase 4 (repeat)

### Phase 5: Failure - No Runners Left (Runner Side - On-Demand)

**Trigger:** No eligible runners found after timeout

**Detection (Lines 1245-1249):**
```typescript
if (!availableRunners || availableRunners.length === 0) {
    // No eligible runners left
    await clearErrandNotification(errand.id);
    return false;
}
```

**Action (SQL, lines 42-73):**
```sql
-- clear_errand_notification function
-- 1. Add current notified_runner_id to timeout_runner_ids
-- 2. Set notified_runner_id = NULL
-- 3. Set notified_at = NULL
```

**Database State After Clear:**
- `notified_runner_id = NULL`
- `notified_at = NULL`
- `timeout_runner_ids = [allTimedOutRunners]`
- `status = 'pending'` (unchanged)

**Result:**
- Task becomes invisible to all runners
- Caller sees "No runners available" modal (triggered by `checkIfAllRunnersTimedOutForErrand()`)
- Task remains in database, can be assigned if new runner comes online

---

## Client vs Server Execution

### Client-Side (Frontend)

**All ranking logic runs on client:**
1. `useAvailableErrands()` - React hook in browser/app
2. `useAvailableCommissions()` - React hook in browser/app
3. `shouldShowErrand()` - Client-side function
4. `shouldShowCommission()` - Client-side function
5. Distance calculation - `LocationService.calculateDistance()`
6. TF-IDF calculation - All utility functions
7. Final score calculation - Line 1166
8. Sorting - Line 1185
9. Timeout detection - Line 1085

**Why client-side:**
- Ranking happens when runners fetch tasks
- Each runner's device calculates rankings independently
- No server-side queueing service

### Server-Side (Database)

**Database operations:**
1. `update_errand_notification()` RPC - SQL function (SECURITY DEFINER)
2. `clear_errand_notification()` RPC - SQL function
3. `update_commission_notification()` RPC - SQL function (assumed, similar to errands)
4. `clear_commission_notification()` RPC - SQL function (assumed)

**Why server-side:**
- Bypasses Row Level Security (RLS)
- Atomic updates to `notified_runner_id`, `notified_at`, `timeout_runner_ids`
- Prevents race conditions in database updates

### Dependency on Runner Activity

**Critical dependency:** Timeout detection requires runner activity

**Problem:** If no runners are online or fetching tasks, timeouts are never detected

**Example Scenario:**
1. Errand assigned to Runner A at 10:00:00
2. Runner A goes offline
3. No other runners fetch tasks
4. At 10:01:00 (60 seconds later), timeout should occur
5. **But timeout is never detected** because no runner calls `useAvailableErrands()`
6. Errand remains assigned to Runner A indefinitely

**Solution in code:** None - this is a limitation of the current design

---

## Differences: Errands vs Commissions

### 1. Category Handling

**Errands:**
- Single category string: `errand.category = "Shopping"`
- Category matching: Exact string match (case-insensitive)
- Code: `errandCategory.trim().toLowerCase() === completedErrand.category.trim().toLowerCase()`

**Commissions:**
- Multiple categories (comma-separated): `commission.commission_type = "logos,posters"`
- Category matching: Any overlap between arrays
- Code: `commissionTypes.some(type => completedTypes.includes(type))`

### 2. Declined Runner Handling

**Errands:**
- No `declined_runner_id` field
- Caller cannot decline runner

**Commissions:**
- Has `declined_runner_id` field
- Caller can decline runner via invoice decline
- Declined runner excluded from future assignments (Line 1769-1771)

### 3. Database RPC Functions

**Errands:**
- `update_errand_notification()`
- `clear_errand_notification()`

**Commissions:**
- `update_commission_notification()` (assumed, not in provided SQL file)
- `clear_commission_notification()` (assumed)

### 4. Additional Constraints (Commissions Only)

**Lines 303-329 in view_commission.tsx:**
```typescript
// Rule: Runner cannot have multiple active commissions
const { data: activeRows } = await supabase
    .from("commission")
    .select("id")
    .in("status", ["in_progress", "accepted"])
    .eq("runner_id", user.id)
    .limit(1);

// Rule: Runner cannot have multiple commissions from same caller
const { data: callerActiveRows } = await supabase
    .from("commission")
    .select("id")
    .in("status", ["in_progress", "accepted"])
    .eq("buddycaller_id", commission.buddycaller_id)
    .eq("runner_id", user.id)
    .limit(1);
```

**Errands:** No such constraints

### 5. Ranking Formula

**Identical formula for both:**
```
FinalScore = (count × 0.5) + (tfidfScore × 0.2) + (rating × 0.3)
```

**Only difference:** How `count` is calculated (single category vs multiple categories)

---

## Hard-Coded Values

### Distance Values

1. **Base distance limit:** `500` meters (Line 900)
2. **Maximum accuracy buffer:** `2000` meters (Line 902)
3. **Maximum effective distance limit:** `3000` meters (Line 903)
4. **GPS accuracy threshold:** `500` meters (Line 901)
5. **GPS retry threshold:** `500` meters (Line 859)

### Time Values

1. **Timeout duration:** `60000` milliseconds = 60 seconds (Line 1085)
2. **GPS timeout (web):** `30000` milliseconds = 30 seconds (LocationService.ts, line 106)
3. **GPS timeout (native):** `20000` milliseconds = 20 seconds (LocationService.ts, line 164)
4. **GPS time interval (native):** `15000` milliseconds = 15 seconds (LocationService.ts, line 191)

### Scoring Weights

1. **Category count weight:** `0.5` (50%) (Line 1166)
2. **TF-IDF weight:** `0.2` (20%) (Line 1166)
3. **Rating weight:** `0.3` (30%) (Line 1166)

### TF-IDF Constants

1. **Earth's radius:** `6371` kilometers (LocationService.ts, line 282)
2. **IDF epsilon (when term in all docs):** `0.1` (Line 682)

---

## Duplicated Logic

### 1. Ranking Algorithm

**Duplicated between:**
- `shouldShowErrand()` (Lines 1069-1350)
- `shouldShowCommission()` (Lines 1721-2053)

**Similarity:** ~90% identical code

**Differences:**
- Category parsing (single vs comma-separated)
- RPC function names
- `declined_runner_id` handling (commissions only)

**Refactoring opportunity:** Extract to shared function

### 2. Category Count Functions

**Duplicated:**
- `getRunnerCompletedErrandsCount()` (Lines 958-989)
- `getRunnerCompletedCount()` (Lines 1651-1685)

**Similarity:** ~80% identical

**Differences:**
- Table name (`errand` vs `commission`)
- Field name (`category` vs `commission_type`)
- Matching logic (exact vs overlap)

### 3. Category History Functions

**Duplicated:**
- `getRunnerErrandCategoryHistory()` (Lines 992-1019)
- `getRunnerCategoryHistory()` (Lines 1688-1718)

**Similarity:** ~85% identical

**Differences:**
- Table name
- Field name
- Parsing logic (single vs comma-separated)

### 4. Timeout Check Functions

**Duplicated:**
- `checkIfAllRunnersTimedOut()` (Lines 983-1135)
- `checkIfAllRunnersTimedOutForErrand()` (Lines 1144-1286)

**Similarity:** ~95% identical

**Differences:**
- Table name
- Field names (`commission_type` vs `category`)
- `declined_runner_id` handling

---

## Race Conditions & Inconsistencies

### 1. Concurrent Assignment Race Condition

**Scenario:**
- Runner A and Runner B both fetch available errands simultaneously
- Both see `notified_runner_id = NULL`
- Both calculate rankings
- Both call `updateErrandNotification()` with different runners

**Code Location:** Lines 1088-1198

**Mitigation:** Database RPC uses `SECURITY DEFINER` for atomic updates, but no locking mechanism

**Risk:** Medium - Could result in last-write-wins scenario

### 2. Timeout Detection Race Condition

**Scenario:**
- Runner A times out at 10:01:00
- Runner B fetches at 10:01:05 and detects timeout
- Runner B assigns to Runner C
- Runner A's device still shows errand (cached)
- Runner A accepts at 10:01:10

**Code Location:** Lines 1210-1338

**Mitigation:** Accept action checks `runner_id` before updating (view_errand.tsx, line 424)

**Risk:** Low - Accept action has race guard

### 3. Stale Ranking Data

**Scenario:**
- Runner A fetches errands at 10:00:00
- Runner B completes errand in category "Shopping" at 10:00:05
- Runner A's ranking still uses old count for Runner B
- Runner A assigns to Runner B based on stale data

**Code Location:** Lines 1152-1155

**Mitigation:** None - Rankings use current database state at fetch time

**Risk:** Low - Rankings are recalculated on each fetch

### 4. GPS Accuracy Inconsistency

**Scenario:**
- Runner A has GPS accuracy = 100m → Effective limit = 500m
- Runner B has GPS accuracy = 2000m → Effective limit = 2500m
- Same errand shown to Runner B but not Runner A (if errand is 600m away)

**Code Location:** Lines 899-904

**Mitigation:** None - Each runner uses their own GPS accuracy

**Risk:** Medium - Could cause unfair visibility

### 5. Timeout Detection Dependency

**Scenario:**
- Errand assigned to Runner A
- Runner A goes offline
- No other runners fetch tasks
- Timeout never detected

**Code Location:** Lines 1085, 1210

**Mitigation:** None - This is a design limitation

**Risk:** High - Errands can remain assigned indefinitely

---

## Plain-English Algorithm Explanation

### How It Works

1. **Caller posts task** → Task saved with `status = 'pending'`, no runner assigned

2. **Runner opens app** → App fetches available tasks

3. **For each pending task:**
   - Check if task already assigned to a runner
   - If not assigned:
     - Get all available runners (online, within distance)
     - Calculate score for each runner:
       - 50% weight: How many similar tasks they've completed
       - 20% weight: How similar their past work is (TF-IDF)
       - 30% weight: Their rating
     - Sort by score (highest first), then by distance (closest first)
     - Assign to top runner
   - If assigned:
     - Check if 60 seconds have passed
     - If yes: Find next runner (excluding previous runner)
     - If no: Only show to assigned runner

4. **Runner sees task** → Only the assigned runner sees it in their list

5. **Runner accepts** → Task status changes to "in_progress", removed from available list

6. **Runner ignores** → After 60 seconds, system automatically finds next runner

7. **Repeat** → Process continues until someone accepts or no runners left

### Key Characteristics

- **Not first-come-first-served:** Uses scoring algorithm
- **Client-side ranking:** Each runner's device calculates rankings
- **60-second timeout:** Automatic reassignment if runner doesn't accept
- **Distance-based:** Only shows tasks within 500m (or up to 3000m with poor GPS)
- **Experience-weighted:** Favors runners with more completed tasks in same category

---

## Algorithm Flow Diagram (Text)

```
┌─────────────────────────────────────────────────────────────┐
│                    CALLER POSTS TASK                         │
│  status='pending', runner_id=NULL, notified_runner_id=NULL  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              RUNNER FETCHES AVAILABLE TASKS                 │
│         (useAvailableErrands/useAvailableCommissions)        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Filter Tasks │
                    │  - status='pending'│
                    │  - runner_id=NULL │
                    │  - Within distance│
                    └───────┬───────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Check Assignment Status │
              └───────┬─────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐          ┌───────────────┐
│ NOT ASSIGNED  │          │   ASSIGNED    │
│ (notified_    │          │ (notified_    │
│  runner_id    │          │  runner_id    │
│  = NULL)      │          │  != NULL)     │
└───────┬───────┘          └───────┬───────┘
        │                           │
        ▼                           ▼
┌───────────────┐          ┌───────────────┐
│ RANK RUNNERS  │          │ CHECK TIMEOUT │
│ - Get all     │          │ notified_at < │
│   available   │          │ now - 60s?    │
│ - Calculate   │          └───────┬───────┘
│   scores      │                  │
│ - Sort        │          ┌───────┴───────┐
└───────┬───────┘          │               │
        │                  ▼               ▼
        │          ┌───────────┐   ┌───────────┐
        │          │ TIMEOUT   │   │ NO TIMEOUT│
        │          │ DETECTED  │   │ (within   │
        │          └─────┬─────┘   │  60s)     │
        │                │         └─────┬─────┘
        │                │               │
        │                ▼               ▼
        │        ┌───────────────┐ ┌───────────────┐
        │        │ FIND NEXT     │ │ SHOW TO       │
        │        │ RUNNER        │ │ ASSIGNED      │
        │        │ (exclude      │ │ RUNNER ONLY   │
        │        │  previous +   │ └───────────────┘
        │        │  timeouts)    │
        │        └───────┬───────┘
        │                │
        └────────────────┘
                │
                ▼
        ┌───────────────┐
        │ ASSIGN TO TOP │
        │ RUNNER        │
        │ update_       │
        │ errand_       │
        │ notification()│
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │ CHECK IF      │
        │ CURRENT       │
        │ RUNNER = TOP  │
        └───────┬───────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
┌───────────┐   ┌───────────┐
│ YES - SHOW│   │ NO - HIDE │
│ TO RUNNER │   │ FROM      │
│           │   │ RUNNER    │
└─────┬─────┘   └───────────┘
      │
      ▼
┌───────────────┐
│ RUNNER SEES   │
│ TASK IN LIST  │
└───────┬───────┘
        │
        │
┌───────┴───────┐
│               │
▼               ▼
┌───────────┐   ┌───────────┐
│ ACCEPT    │   │ IGNORE    │
│ (within   │   │ (wait 60s)│
│  60s)     │   └─────┬─────┘
└─────┬─────┘         │
      │               │
      ▼               ▼
┌───────────┐   ┌───────────┐
│ status =  │   │ TIMEOUT   │
│ 'in_      │   │ TRIGGERED │
│ progress' │   │ → FIND    │
│ runner_id │   │ NEXT      │
│ = user.id │   │ RUNNER    │
└───────────┘   └─────┬─────┘
                      │
                      └───► (Loop back to "FIND NEXT RUNNER")
```

---

## Algorithm Assumptions

### 1. Runner Activity Assumption
**Assumption:** At least one runner will fetch available tasks within 60 seconds of timeout

**Reality:** If no runners are active, timeouts are never detected

**Impact:** High - Tasks can remain assigned indefinitely

### 2. GPS Accuracy Assumption
**Assumption:** GPS accuracy is reliable and consistent across runners

**Reality:** GPS accuracy varies significantly (10m to 1000m+)

**Impact:** Medium - Different runners see different task lists

### 3. Category Matching Assumption
**Assumption:** Category strings are consistent (e.g., "Shopping" vs "shopping" vs "SHOPPING")

**Reality:** Code normalizes to lowercase, but typos still cause mismatches

**Impact:** Low - Normalization handles most cases

### 4. Runner Availability Assumption
**Assumption:** `is_available = true` accurately reflects runner's willingness to accept tasks

**Reality:** Runners may forget to toggle availability

**Impact:** Medium - Tasks shown to unavailable runners

### 5. Distance Calculation Assumption
**Assumption:** Haversine formula is accurate for short distances (< 1km)

**Reality:** Accurate for distances up to ~100km

**Impact:** Low - System only uses < 3km

### 6. TF-IDF Assumption
**Assumption:** Runner's category history is representative of their expertise

**Reality:** History may be sparse for new runners

**Impact:** Medium - New runners always score low on TF-IDF

### 7. Rating Assumption
**Assumption:** `average_rating` is up-to-date and accurate

**Reality:** Ratings may be stale or biased

**Impact:** Low - Only 30% weight

### 8. Concurrent Access Assumption
**Assumption:** Database RPC functions handle concurrent updates correctly

**Reality:** No explicit locking, relies on PostgreSQL's default isolation

**Impact:** Medium - Potential for race conditions

### 9. Timeout Precision Assumption
**Assumption:** 60-second timeout is sufficient for runners to decide

**Reality:** May be too short for complex tasks, too long for simple tasks

**Impact:** Low - Configurable but hard-coded

### 10. Client-Side Ranking Assumption
**Assumption:** All runners calculate identical rankings for same task

**Reality:** Rankings depend on when runner fetches (data may change between fetches)

**Impact:** Medium - Inconsistent rankings across runners

---

## Conclusion

The runner queueing system uses a **sophisticated client-side ranking algorithm** with **weighted scoring** based on experience, similarity, and ratings. The system relies on **on-demand timeout detection** rather than background jobs, which creates a dependency on runner activity. The algorithm is **fairly complex** with multiple components (TF-IDF, distance calculation, GPS accuracy handling) but has **significant code duplication** between Errands and Commissions that could be refactored.

**Key Strengths:**
- Intelligent ranking based on multiple factors
- Automatic timeout and reassignment
- Distance-based filtering with GPS accuracy handling

**Key Weaknesses:**
- Client-side ranking creates race conditions
- Timeout detection requires runner activity
- Significant code duplication
- No explicit ignore/decline action for runners

**Recommendation:** Move ranking logic to server-side (Supabase Edge Function) with background timeout jobs for improved reliability and consistency.
