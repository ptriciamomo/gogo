# Complete Task Queueing and Runner Ranking Logic Flow

## Table of Contents
1. [Entry Point: Commission Loading](#entry-point-commission-loading)
2. [Rule-Based Filtering](#rule-based-filtering)
3. [Distance Filtering](#distance-filtering)
4. [Ranking System](#ranking-system)
5. [TF-IDF and Cosine Similarity](#tf-idf-and-cosine-similarity)
6. [Historical Task Count](#historical-task-count)
7. [Rating Calculation](#rating-calculation)
8. [Timeout Handling](#timeout-handling)
9. [Assignment Logic](#assignment-logic)

---

## Entry Point: Commission Loading

**Location:** `app/buddyrunner/home.tsx`, lines 960-1160

**Function:** `useAvailableCommissions()` → `refetch()`

**Purpose:** Main entry point that loads all pending commissions and applies filtering/ranking.

```typescript
// Line 960-1160: Main refetch function
const refetch = React.useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id ?? null;
    
    // Rule-based check happens here (see Section 2)
    // Distance filtering happens here (see Section 3)
    // Ranking happens here (see Section 4)
}, []);
```

---

## Rule-Based Filtering

**Location:** `app/buddyrunner/home.tsx`, lines 974-996

**Purpose:** Pre-filter runners based on availability and authentication.

### Step 1: Check User Authentication
```typescript
// Lines 967-972
if (!uid) {
    setRows([]);
    setLoading(false);
    return;
}
```

### Step 2: Check Runner Availability (Online Status)
```typescript
// Lines 974-996
// first rule based rules, Check if runner is available (online) and get location
const { data: runnerData, error: runnerError } = await supabase
    .from("users")
    .select("is_available, latitude, longitude")
    .eq("id", uid)
    .single();

if (runnerError) {
    console.error("Error checking runner availability:", runnerError);
    setRows([]);
    setLoading(false);
    return;
}

// Only show commissions if runner is available (online)
if (!runnerData?.is_available) {
    console.log('❌ Runner is not available (offline), not showing commissions');
    setRows([]);
    setLoading(false);
    return;
}
```

**Rule Applied:**
- ✅ Runner must be authenticated (`uid` exists)
- ✅ Runner must be online (`is_available = true`)
- ❌ If offline → No commissions shown

---

## Distance Filtering

**Location:** `app/buddyrunner/home.tsx`, lines 1000-1220

**Purpose:** Filter commissions based on runner's distance from caller (500m limit).

### Step 1: Get Runner Location
```typescript
// Lines 1011-1058: Get GPS location with retries
let runnerLat: number = 0;
let runnerLon: number = 0;
let locationSource: 'gps' | 'database' = 'gps';

// Try GPS first (lines 1020-1058)
locationResult = await LocationService.getCurrentLocation();
if (locationResult.success && locationResult.location) {
    runnerLat = locationResult.location.latitude;
    runnerLon = locationResult.location.longitude;
    locationSource = 'gps';
}
```

### Step 2: Fetch Pending Commissions
```typescript
// Lines 1159-1160: Fetch all pending commissions
const { data: cData, error } = await supabase
    .from("commission")
    .select("id, title, commission_type, created_at, buddycaller_id, status, runner_id, declined_runner_id, notified_runner_id, notified_at, timeout_runner_ids")
    .eq("status", "pending")
    .is("runner_id", null);
```

### Step 3: Get Caller Locations
```typescript
// Lines 1162-1205: Get caller locations for distance calculation
const callerIds = Array.from(new Set(cData.map(c => c.buddycaller_id).filter((v): v is string => !!v)));
// Fetch caller locations from users table
```

### Step 4: Filter by Distance (500m)
```typescript
// Lines 1207-1226: Distance filtering
const filteredRaw: CommissionRowDB[] = [];
for (const commission of cData) {
    const callerLocation = callerLocations[commission.buddycaller_id || ""];
    if (!callerLocation) continue;
    
    const distanceKm = LocationService.calculateDistance(
        runnerLat,
        runnerLon,
        callerLocation.latitude,
        callerLocation.longitude
    );
    const distanceMeters = distanceKm * 1000;
    
    // Only consider commissions within 500m
    if (distanceMeters <= effectiveDistanceLimit) { // effectiveDistanceLimit = 500
        filteredRaw.push(commission);
    }
}
```

**Rule Applied:**
- ✅ Commission must be within 500 meters of runner
- ❌ If beyond 500m → Commission excluded

---

## Ranking System

**Location:** `app/buddyrunner/home.tsx`, lines 1352-1684

**Function:** `shouldShowCommission(commission: CommissionRowDB)`

**Purpose:** Determines if current runner should see a commission based on ranking algorithm.

### Step 1: Parse Commission Types
```typescript
// Lines 1356-1364
const commissionTypes = commission.commission_type 
    ? commission.commission_type.split(',').map(t => t.trim()).filter(t => t.length > 0)
    : [];

if (commissionTypes.length === 0) {
    // If no commission type, show to all eligible runners (no ranking)
    return true;
}
```

### Step 2: Check Commission State
```typescript
// Lines 1368-1379: Check timeout status
const now = new Date();
const notifiedAt = commission.notified_at ? new Date(commission.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Timeout has passed, need to find next runner
}
```

**Two Scenarios:**
- **Scenario A:** `notified_runner_id = NULL` → Initial assignment (lines 1382-1512)
- **Scenario B:** `notified_at < 60 seconds ago` → Timeout reassignment (lines 1515-1672)

---

## Scenario A: Initial Assignment

**Location:** `app/buddyrunner/home.tsx`, lines 1382-1512

### Step 1: Fetch Available Runners
```typescript
// Lines 1393-1411: Get all available runners with exclusions
let query = supabase
    .from("users")
    .select("id, latitude, longitude, average_rating")
    .eq("role", "BuddyRunner")
    .eq("is_available", true);

// Exclude declined runner if exists
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

### Step 2: Filter by Distance and Calculate Scores
```typescript
// Lines 1428-1476: For each eligible runner
for (const runner of availableRunners) {
    // Calculate distance (lines 1439-1446)
    const distanceKm = LocationService.calculateDistance(
        lat, lon,
        callerLocation.latitude, callerLocation.longitude
    );
    const distanceMeters = distanceKm * 1000;
    
    // Only consider runners within 500m (line 1449)
    if (distanceMeters > effectiveDistanceLimit) continue;
    
    // Get historical task count (line 1452) - See Section 6
    const count = await getRunnerCompletedCount(runner.id, commissionTypes);
    
    // Get runner category history for TF-IDF (line 1455) - See Section 5
    const runnerHistory = await getRunnerCategoryHistory(runner.id);
    
    // Calculate TF-IDF + Cosine Similarity score (line 1458) - See Section 5
    const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory);
    
    // Get runner's rating (normalize 0-5 to 0-1 scale) (line 1461) - See Section 7
    const rating = (runner.average_rating || 0) / 5;
    
    // Calculate final score: weighted combination (line 1465)
    // Formula: FinalScore = (Category Task Count * 0.5) + (TF-IDF Score * 0.2) + (Rating * 0.3)
    const finalScore = (count * 0.5) + (tfidfScore * 0.2) + (rating * 0.3);
    
    eligibleRunners.push({
        id: runner.id,
        count: count,
        distance: distanceMeters,
        rating: runner.average_rating || 0,
        finalScore: finalScore
    });
}
```

### Step 3: Sort and Assign Top Runner
```typescript
// Lines 1483-1512: Sort by final score and assign
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance; // Tiebreaker: closer distance
});

const topRunner = eligibleRunners[0];

// Assign to top-ranked runner (lines 1493-1503)
const { error: updateError } = await supabase.rpc('update_commission_notification', {
    p_commission_id: commission.id,
    p_notified_runner_id: topRunner.id,
    p_notified_at: new Date().toISOString()
});

// Only show if current runner is the top-ranked runner (lines 1506-1512)
if (topRunner.id === uid) {
    return true;
} else {
    return false;
}
```

---

## Scenario B: Timeout Reassignment

**Location:** `app/buddyrunner/home.tsx`, lines 1515-1672

### Step 1: Check Timeout and Fetch Next Runners
```typescript
// Lines 1516-1546: Check if 60 seconds passed
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Get all available runners except current notified runner
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
}
```

### Step 2: Re-rank Remaining Runners
```typescript
// Lines 1572-1620: Same ranking process as Scenario A
// Filter by distance, calculate scores, sort
// (Same code as lines 1428-1476)
```

### Step 3: Assign Next Runner and Update Timeout List
```typescript
// Lines 1646-1664: Assign next runner
const previousNotifiedRunnerId = commission.notified_runner_id;

const { error: updateError } = await supabase.rpc('update_commission_notification', {
    p_commission_id: commission.id,
    p_notified_runner_id: nextRunner.id,
    p_notified_at: new Date().toISOString(),
    p_previous_notified_runner_id: previousNotifiedRunnerId // Adds to timeout_runner_ids
});
```

**Key Difference:** Previous runner is added to `timeout_runner_ids` array to prevent re-notification.

---

## TF-IDF and Cosine Similarity

**Location:** `app/buddyrunner/home.tsx`, lines 750-876

### Step 1: Term Frequency (TF) Calculation
```typescript
// Lines 754-758
function calculateTF(term: string, document: string[]): number {
    if (document.length === 0) return 0;
    const termCount = document.filter(word => word === term).length;
    return termCount / document.length; // TF = term frequency / total terms
}
```

### Step 2: Inverse Document Frequency (IDF) Calculation
```typescript
// Lines 773-785: Adjusted IDF (handles small corpus)
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
    const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
    if (documentsContainingTerm === 0) return 0;
    
    // If term appears in all documents, use small positive value instead of 0
    if (documentsContainingTerm === allDocuments.length) {
        return 0.1; // Small epsilon to avoid zero IDF
    }
    
    return Math.log(allDocuments.length / documentsContainingTerm);
}
```

### Step 3: TF-IDF Vector Calculation
```typescript
// Lines 790-800
function calculateTFIDFVectorAdjusted(document: string[], allDocuments: string[][]): Map<string, number> {
    const uniqueTerms = Array.from(new Set(document));
    const tfidfMap = new Map<string, number>();
    
    uniqueTerms.forEach(term => {
        const tf = calculateTF(term, document);
        const idf = calculateIDFAdjusted(term, allDocuments);
        tfidfMap.set(term, tf * idf); // TF-IDF = TF × IDF
    });
    
    return tfidfMap;
}
```

### Step 4: Cosine Similarity Calculation
```typescript
// Lines 822-841
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
    
    return dotProduct / denominator; // Cosine Similarity = (A·B) / (||A|| × ||B||)
}
```

### Step 5: Combined TF-IDF + Cosine Similarity
```typescript
// Lines 846-876: Main function called during ranking
function calculateTFIDFCosineSimilarity(commissionCategories: string[], runnerHistory: string[]): number {
    if (commissionCategories.length === 0 || runnerHistory.length === 0) {
        return 0;
    }
    
    // Convert to lowercase documents
    const queryDoc = commissionCategories.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    const runnerDoc = runnerHistory.map(cat => cat.toLowerCase().trim()).filter(cat => cat.length > 0);
    
    const allDocuments = [queryDoc, runnerDoc];
    
    // Create TF-IDF vectors
    const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
    const runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
    
    // Calculate cosine similarity
    const similarity = cosineSimilarity(queryVector, runnerVector);
    
    return isNaN(similarity) ? 0 : similarity; // Returns 0.0 to 1.0
}
```

**Usage in Ranking:** Line 1458
```typescript
const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory);
// This score is multiplied by 0.2 in final score calculation (line 1465)
```

---

## Historical Task Count

**Location:** `app/buddyrunner/home.tsx`, lines 1282-1316

**Function:** `getRunnerCompletedCount(runnerId: string, commissionTypes: string[])`

**Purpose:** Counts how many completed commissions the runner has in the same category.

```typescript
// Lines 1282-1316
const getRunnerCompletedCount = async (runnerId: string, commissionTypes: string[]): Promise<number> => {
    if (!commissionTypes || commissionTypes.length === 0) return 0;
    
    try {
        // Get all completed commissions for this runner
        const { data, error } = await supabase
            .from("commission")
            .select("id, commission_type")
            .eq("runner_id", runnerId)
            .eq("status", "completed");
        
        if (error || !data || data.length === 0) return 0;
        
        // Count how many completed commissions match the types
        let count = 0;
        data.forEach((completedCommission: any) => {
            if (!completedCommission.commission_type) return;
            
            // commission_type is stored as comma-separated string (e.g., "logos,posters")
            const completedTypes = completedCommission.commission_type.split(',').map((t: string) => t.trim());
            
            // Check if any of the commission types overlap with completed types
            const hasMatch = commissionTypes.some(type => completedTypes.includes(type));
            if (hasMatch) count++;
        });
        
        return count; // Returns integer count (0, 1, 2, 3...)
    } catch (error) {
        console.error(`Error calculating completed count for runner ${runnerId}:`, error);
        return 0;
    }
};
```

**Usage in Ranking:** Line 1452
```typescript
const count = await getRunnerCompletedCount(runner.id, commissionTypes);
// This count is multiplied by 0.5 in final score calculation (line 1465)
```

**Helper Function for TF-IDF:** Lines 1319-1349
```typescript
// getRunnerCategoryHistory: Gets all categories from runner's completed commissions
// Used to build runner history document for TF-IDF calculation
const getRunnerCategoryHistory = async (runnerId: string): Promise<string[]> => {
    // Returns array of all category strings from completed commissions
    // Example: ["logos", "logos", "posters", "posters", "flyers"]
};
```

---

## Rating Calculation

**Location:** `app/buddyrunner/home.tsx`, lines 1460-1461

**Purpose:** Normalizes runner's average rating from 0-5 scale to 0-1 scale.

```typescript
// Lines 1460-1461: Normalize rating
// Get runner's rating (normalize 0-5 to 0-1 scale)
const rating = (runner.average_rating || 0) / 5;
```

**Usage in Ranking:** Line 1465
```typescript
const finalScore = (count * 0.5) + (tfidfScore * 0.2) + (rating * 0.3);
// Rating contributes 30% to final score
```

**Rating Source:** Line 1396
```typescript
// Runner's average_rating is fetched from users table
.select("id, latitude, longitude, average_rating")
```

---

## Timeout Handling

**Location:** Multiple locations in `app/buddyrunner/home.tsx`

### Step 1: Timeout Detection
```typescript
// Lines 1368-1378: Check if 60 seconds passed
const now = new Date();
const notifiedAt = commission.notified_at ? new Date(commission.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    console.log(`⏰ [RANKING] Commission ${commission.id}: 60 seconds passed since notification`);
    // Triggers reassignment logic (Scenario B)
}
```

### Step 2: Timeout Runner Exclusion
```typescript
// Lines 1405-1411: Exclude timeout runners from initial assignment
if (commission.timeout_runner_ids && commission.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of commission.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}

// Lines 1541-1546: Exclude timeout runners from reassignment
if (commission.timeout_runner_ids && commission.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of commission.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}
```

### Step 3: Add Runner to Timeout List
```typescript
// Lines 1646-1655: When reassigning, add previous runner to timeout list
const previousNotifiedRunnerId = commission.notified_runner_id;

const { error: updateError } = await supabase.rpc('update_commission_notification', {
    p_commission_id: commission.id,
    p_notified_runner_id: nextRunner.id,
    p_notified_at: new Date().toISOString(),
    p_previous_notified_runner_id: previousNotifiedRunnerId // This adds to timeout_runner_ids
});
```

**SQL Function:** `update_commission_notification` (defined in `fix_timeout_runner_ids_null_handling.sql`)
- Adds `previous_notified_runner_id` to `timeout_runner_ids` array
- Prevents re-notification of timed-out runners

### Step 4: Clear Notification When No Runners Left
```typescript
// Lines 1557-1567: If no eligible runners remain
if (!availableRunners || availableRunners.length === 0) {
    const { error: clearError } = await supabase.rpc('clear_commission_notification', {
        p_commission_id: commission.id
    });
    // Clears notified_runner_id and notified_at
    // Also adds current notified_runner_id to timeout_runner_ids before clearing
}
```

---

## Assignment Logic

**Location:** `app/buddyrunner/home.tsx`, lines 1483-1512 (Initial) and 1637-1672 (Reassignment)

### Final Score Calculation Formula
```typescript
// Line 1465 (Initial) and Line 1609 (Reassignment)
const finalScore = (count * 0.5) + (tfidfScore * 0.2) + (rating * 0.3);
```

**Components:**
- `count` = Historical task count (50% weight)
- `tfidfScore` = TF-IDF + Cosine Similarity (20% weight)
- `rating` = Normalized rating 0-1 (30% weight)

### Sorting Logic
```typescript
// Lines 1483-1487 (Initial) and 1637-1641 (Reassignment)
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore; // Primary: Higher score first
    return a.distance - b.distance; // Tiebreaker: Closer distance first
});
```

### Assignment Decision
```typescript
// Lines 1506-1512 (Initial) and 1665-1672 (Reassignment)
if (topRunner.id === uid) {
    // Current runner is top-ranked → Show commission
    return true;
} else {
    // Current runner is not top-ranked → Hide commission
    return false;
}
```

### Current Runner Check (Within 60 seconds)
```typescript
// Lines 1675-1679: If runner is currently notified (within timeout window)
if (commission.notified_runner_id === uid) {
    console.log(`✅ [RANKING] Commission ${commission.id}: Showing to notified runner ${uid}`);
    return true;
}
```

---

## Complete Flow Summary

### Entry Point
1. **Function:** `useAvailableCommissions()` → `refetch()` (Line 960)
2. **Rule-Based Filter:** Check runner online status (Lines 974-996)
3. **Location Fetch:** Get runner GPS location (Lines 1000-1220)
4. **Commission Fetch:** Load pending commissions (Lines 1159-1160)
5. **Distance Filter:** Filter commissions within 500m (Lines 1207-1226)

### Ranking Process
6. **For Each Commission:** Call `shouldShowCommission()` (Line 1689)
7. **Check State:** Determine if initial assignment or timeout reassignment (Lines 1368-1379)
8. **Fetch Runners:** Get eligible runners with exclusions (Lines 1393-1411 or 1528-1546)
9. **Calculate Scores:**
   - Historical count (Line 1452/1596) → `getRunnerCompletedCount()`
   - TF-IDF similarity (Line 1458/1602) → `calculateTFIDFCosineSimilarity()`
   - Rating (Line 1461/1605) → Normalize `average_rating / 5`
10. **Final Score:** `(count × 0.5) + (tfidfScore × 0.2) + (rating × 0.3)` (Line 1465/1609)
11. **Sort:** By final score descending, distance ascending (Lines 1483-1487 or 1637-1641)
12. **Assign:** Update `notified_runner_id` and `notified_at` (Lines 1493-1503 or 1649-1664)
13. **Show/Hide:** Return true only if current runner is top-ranked (Lines 1506-1512 or 1665-1672)

### Timeout Handling
14. **Check Timeout:** If `notified_at < 60 seconds ago` (Lines 1368-1378)
15. **Reassign:** Find next runner, exclude previous (Lines 1515-1672)
16. **Update Timeout List:** Add previous runner to `timeout_runner_ids` (Line 1654)
17. **Clear if Exhausted:** If no runners left, clear notification (Lines 1557-1567)

---

## Code Verification Checklist

✅ **Rule-Based Filtering:**
- Lines 974-996: Runner availability check
- Lines 1393-1411: Runner exclusions (declined, timeout)

✅ **Distance Filtering:**
- Lines 1000-1220: GPS location fetching
- Lines 1207-1226: 500m distance filter
- Lines 1440-1449: Distance calculation in ranking

✅ **TF-IDF Calculation:**
- Lines 754-758: Term Frequency (TF)
- Lines 773-785: Inverse Document Frequency (IDF)
- Lines 790-800: TF-IDF Vector
- Lines 846-876: Combined TF-IDF + Cosine Similarity

✅ **Cosine Similarity:**
- Lines 822-841: Cosine similarity calculation
- Line 873: Called within TF-IDF function

✅ **Historical Task Count:**
- Lines 1282-1316: `getRunnerCompletedCount()` function
- Lines 1319-1349: `getRunnerCategoryHistory()` helper

✅ **Rating:**
- Line 1461/1605: Rating normalization
- Line 1396/1531: Rating fetched from database

✅ **Timeout Handling:**
- Lines 1368-1378: Timeout detection
- Lines 1405-1411: Timeout exclusion in initial assignment
- Lines 1541-1546: Timeout exclusion in reassignment
- Lines 1646-1655: Adding to timeout list
- Lines 1557-1567: Clearing when exhausted

✅ **Final Score Calculation:**
- Line 1465: Initial assignment formula
- Line 1609: Reassignment formula
- Lines 1483-1487: Sorting logic
- Lines 1506-1512: Assignment decision

---

## Database Fields Used

- `commission.notified_runner_id` - Currently notified runner
- `commission.notified_at` - Timestamp of notification
- `commission.timeout_runner_ids` - Array of timed-out runners
- `commission.declined_runner_id` - Runner declined by caller
- `commission.commission_type` - Comma-separated categories
- `users.is_available` - Runner online status
- `users.average_rating` - Runner rating (0-5 scale)
- `users.latitude`, `users.longitude` - Runner location

---

## SQL Functions Used

1. **`update_commission_notification`** (defined in `fix_timeout_runner_ids_null_handling.sql`)
   - Updates `notified_runner_id` and `notified_at`
   - Adds previous runner to `timeout_runner_ids` array

2. **`clear_commission_notification`** (defined in `add_clear_commission_notification_function.sql`)
   - Clears `notified_runner_id` and `notified_at`
   - Adds current runner to `timeout_runner_ids` before clearing

