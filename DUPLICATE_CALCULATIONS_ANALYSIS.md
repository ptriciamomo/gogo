# Duplicate Calculations Analysis

## Summary

Yes, there are **extensive duplicate implementations** of the same calculation logic in the runner queueing process. The same scoring, filtering, and distance calculation code appears **4 times** in the file.

---

## Duplicate Code Locations

### Pattern: Initial Assignment vs Timeout Reassignment × Errands vs Commissions

The same logic is duplicated across **4 scenarios**:

1. **Initial Assignment - Errands** (Lines ~1415-1510)
2. **Timeout Reassignment - Errands** (Lines ~1645-1736)
3. **Initial Assignment - Commissions** (Lines ~2305-2392)
4. **Timeout Reassignment - Commissions** (Lines ~2550-2648)

---

## Specific Duplicate Calculations

### 1. Final Score Calculation (4 duplicates)

**Formula:** `(distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)`

**Locations:**
- Line 1472: Initial assignment - Errands
- Line 1697: Timeout reassignment - Errands
- Line 2355: Initial assignment - Commissions
- Line 2601: Timeout reassignment - Commissions

**Code (identical in all 4 places):**
```typescript
const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
```

---

### 2. Distance Score Calculation (4 duplicates)

**Formula:** `Math.max(0, 1 - (distanceMeters / 500))`

**Locations:**
- Line 1454: Initial assignment - Errands
- Line 1682: Timeout reassignment - Errands
- Line 2341: Initial assignment - Commissions
- Line 2587: Timeout reassignment - Commissions

**Code (identical in all 4 places):**
```typescript
const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
```

---

### 3. Rating Score Normalization (4 duplicates)

**Formula:** `(runner.average_rating || 0) / 5`

**Locations:**
- Line 1468: Initial assignment - Errands
- Line 1693: Timeout reassignment - Errands
- Line 2351: Initial assignment - Commissions
- Line 2597: Timeout reassignment - Commissions

**Code (identical in all 4 places):**
```typescript
const ratingScore = (runner.average_rating || 0) / 5;
```

---

### 4. Distance Filtering Loop (4 duplicates)

**Complete loop structure duplicated 4 times:**

**Locations:**
- Lines 1418-1485: Initial assignment - Errands
- Lines 1648-1709: Timeout reassignment - Errands
- Lines 2307-2367: Initial assignment - Commissions
- Lines 2553-2613: Timeout reassignment - Commissions

**Code pattern (identical structure):**
```typescript
const eligibleRunners: Array<{ id: string; firstName: string | null; lastName: string | null; distance: number; rating: number; finalScore: number; distanceScore: number; ratingScore: number; tfidfScore: number }> = [];
let runnersWithin500m = 0;
let runnersExcluded = 0;

for (const runner of availableRunners) {
    if (!runner.latitude || !runner.longitude) continue;
    
    const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
    const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
    
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;
    
    // Calculate distance
    const distanceKm = LocationService.calculateDistance(
        lat,
        lon,
        callerLocation.latitude,
        callerLocation.longitude
    );
    const distanceMeters = distanceKm * 1000;
    
    // Only consider runners within 500 meters
    if (distanceMeters > 500) {
        console.log(`Runner: ${runnerName} — ${distanceMeters.toFixed(2)}m ❌ excluded`);
        runnersExcluded++;
        continue;
    }
    
    // ... scoring calculations ...
}
```

**Only differences:**
- Errands use: `getRunnerErrandCategoryHistory()` and `[errandCategory.toLowerCase()]`
- Commissions use: `getRunnerCategoryHistory()` and `commissionTypes` (array)

---

### 5. Runner Sorting Logic (4 duplicates)

**Sort comparison function duplicated 4 times:**

**Locations:**
- Lines 1507-1510: Initial assignment - Errands
- Lines 1733-1736: Timeout reassignment - Errands
- Lines 2389-2392: Initial assignment - Commissions
- Lines 2645-2648: Timeout reassignment - Commissions

**Code (identical in all 4 places):**
```typescript
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance;
});
```

---

### 6. GPS Location Fetching Logic (Multiple duplicates)

**GPS retry logic with exponential backoff duplicated across multiple functions:**

**Locations:**
- Lines 1117-1152: `useAvailableErrands()` → `refetch()`
- Lines 1991-2056: `useAvailableCommissions()` → `refetch()`
- Lines 3307-3327: (Other function - need to verify)
- Lines 3778+: (Other function - need to verify)
- Lines 4843+: (Other function - need to verify)
- Lines 5378+: (Other function - need to verify)

**Code pattern (identical structure):**
```typescript
const maxRetries = 3;
let retryCount = 0;

while (retryCount < maxRetries) {
    try {
        if (retryCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 500 * retryCount));
        }
        
        locationResult = await LocationService.getCurrentLocation();
        
        if (locationResult.success && locationResult.location) {
            const accuracy = locationResult.location.accuracy || 0;
            if (accuracy > 500 && retryCount + 1 < maxRetries) {
                retryCount++;
                continue;
            }
            runnerLat = locationResult.location.latitude;
            runnerLon = locationResult.location.longitude;
            locationSource = 'gps';
            break;
        } else {
            retryCount++;
        }
    } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) break;
    }
}
```

---

### 7. Availability/Presence Filtering Queries (2 duplicates)

**Supabase query for available runners duplicated between errands and commissions:**

**Errands version:**
- Lines 1372-1388: Initial assignment
- Lines 1602-1618: Timeout reassignment

**Commissions version:**
- Lines 2257-2278: Initial assignment
- Lines 2494-2515: Timeout reassignment

**Query structure (nearly identical):**
```typescript
let query = supabase
    .from("users")
    .select("id, first_name, last_name, latitude, longitude, average_rating, location_updated_at")
    .eq("role", "BuddyRunner")
    .eq("is_available", true)
    .gte("last_seen_at", seventyFiveSecondsAgo.toISOString())
    .or(`location_updated_at.gte.${seventyFiveSecondsAgo.toISOString()},location_updated_at.is.null`);
```

**Only differences:**
- Errands exclude `timeout_runner_ids` and previous `notified_runner_id`
- Commissions exclude `timeout_runner_ids`, `declined_runner_id`, and previous `notified_runner_id`

---

### 8. Score Logging Loop (4 duplicates)

**Logging loop for displaying runner scores duplicated 4 times:**

**Locations:**
- Lines 1494-1503: Initial assignment - Errands
- Lines 1722-1730: Timeout reassignment - Errands
- Lines 2377-2386: Initial assignment - Commissions
- Lines 2634-2642: Timeout reassignment - Commissions

**Code (identical in all 4 places):**
```typescript
console.log(`[QUEUE] STEP 4 — Score calculation`);
for (const runner of eligibleRunners) {
    const runnerName = formatRunnerName(runner.firstName, runner.lastName, runner.id);
    console.log(`Runner: ${runnerName}`);
    console.log(`  distance = ${runner.distance.toFixed(2)}m → distanceScore = ${runner.distanceScore.toFixed(4)}`);
    console.log(`  rating = ${runner.rating.toFixed(2)} → ratingScore = ${runner.ratingScore.toFixed(4)}`);
    console.log(`  tfidfScore = ${runner.tfidfScore.toFixed(4)}`);
    console.log(`  FinalScore = ${runner.finalScore.toFixed(4)}`);
}
```

---

### 9. Runner Ranking Display Loop (4 duplicates)

**Loop for displaying ranked runners duplicated 4 times:**

**Locations:**
- Lines 1513-1524: Initial assignment - Errands
- Lines 1740-1750: Timeout reassignment - Errands
- Lines 2396-2406: Initial assignment - Commissions
- Lines 2652-2662: Timeout reassignment - Commissions

**Code (identical in all 4 places):**
```typescript
console.log(`[QUEUE] STEP 5 — Runner ranking`);
eligibleRunners.forEach((runner, index) => {
    const runnerName = formatRunnerName(runner.firstName, runner.lastName, runner.id);
    const runnerShortId = runner.id.substring(0, 8);
    const rank = index + 1;
    console.log("");
    console.log(`Runner ${rank}: ${runnerName} (${runnerShortId})`);
    console.log(`distanceScore = ${runner.distanceScore.toFixed(2)}`);
    console.log(`ratingScore   = ${runner.ratingScore.toFixed(2)}`);
    console.log(`tfidfScore    = ${runner.tfidfScore.toFixed(2)}`);
    console.log(`FinalScore    = ${runner.finalScore.toFixed(2)}`);
});
```

---

## Shared vs Duplicated

### ✅ Shared (No Duplication)

1. **TF-IDF Calculation Functions:**
   - `calculateTFIDFCosineSimilarity()` - Single implementation, reused
   - `calculateTF()` - Single implementation, reused
   - `calculateTFWithTaskCount()` - Single implementation, reused
   - `calculateIDFAdjusted()` - Single implementation, reused
   - `cosineSimilarity()` - Single implementation, reused

2. **Distance Calculation:**
   - `LocationService.calculateDistance()` - Single implementation, reused

3. **Runner History Fetching:**
   - `getRunnerErrandCategoryHistory()` - Single implementation for errands
   - `getRunnerCategoryHistory()` - Single implementation for commissions

### ❌ Duplicated (Should Be Refactored)

1. **Final score calculation** (4×)
2. **Distance score calculation** (4×)
3. **Rating score normalization** (4×)
4. **Distance filtering loop** (4× - ~70 lines each)
5. **Runner sorting logic** (4×)
6. **Score logging loop** (4×)
7. **Ranking display loop** (4×)
8. **GPS location fetching** (6+ times across file)
9. **Availability/presence queries** (4×)

---

## Impact Analysis

### Code Volume

- **Distance filtering + scoring loop:** ~70 lines × 4 = **~280 duplicate lines**
- **GPS fetching logic:** ~35 lines × 6 = **~210 duplicate lines**
- **Final score calculation:** 1 line × 4 = **4 duplicate lines**
- **Total estimated duplicates:** **~500+ lines of duplicated code**

### Maintenance Risk

1. **Bug Fixes:** Must update same logic in 4 different places
2. **Formula Changes:** Weight adjustments require 4 edits
3. **Threshold Changes:** 500m distance limit appears in multiple places
4. **Inconsistency Risk:** Easy to miss one location when updating

### Performance Impact

- **Minimal:** Same calculations performed, just duplicated
- **Code size:** Larger bundle size due to duplication

---

## Refactoring Recommendations

### 1. Extract Scoring Functions

```typescript
// Helper function to calculate scores for a single runner
function calculateRunnerScore(
    runner: Runner,
    callerLocation: Location,
    taskCategories: string[],
    getRunnerHistory: (id: string) => Promise<History>
): Promise<RunnerScore> {
    // Distance calculation
    const distanceKm = LocationService.calculateDistance(...);
    const distanceMeters = distanceKm * 1000;
    if (distanceMeters > 500) return null; // Filter out
    
    const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
    
    // Rating normalization
    const ratingScore = (runner.average_rating || 0) / 5;
    
    // TF-IDF calculation
    const runnerHistory = await getRunnerHistory(runner.id);
    const tfidfScore = calculateTFIDFCosineSimilarity(...);
    
    // Final score
    const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
    
    return { distanceScore, ratingScore, tfidfScore, finalScore, distanceMeters };
}
```

### 2. Extract Filtering and Ranking Function

```typescript
async function filterAndRankRunners(
    availableRunners: Runner[],
    callerLocation: Location,
    taskCategories: string[],
    getRunnerHistory: (id: string) => Promise<History>
): Promise<RunnerScore[]> {
    const eligibleRunners: RunnerScore[] = [];
    
    for (const runner of availableRunners) {
        const score = await calculateRunnerScore(...);
        if (score) eligibleRunners.push(score);
    }
    
    // Sort by final score (desc), then distance (asc)
    eligibleRunners.sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        return a.distance - b.distance;
    });
    
    return eligibleRunners;
}
```

### 3. Extract GPS Location Fetching

```typescript
async function fetchRunnerLocationWithRetry(
    databaseLocation?: { latitude: number; longitude: number }
): Promise<{ latitude: number; longitude: number; source: 'gps' | 'database' }> {
    const maxRetries = 3;
    let retryCount = 0;
    
    // ... existing retry logic ...
    
    // Fallback to database if GPS fails
    if (databaseLocation) {
        return { ...databaseLocation, source: 'database' };
    }
    
    throw new Error('No location available');
}
```

---

## Conclusion

Yes, there are **significant duplicate calculations** in the runner queueing process. The same logic appears **4 times** (initial assignment vs timeout reassignment × errands vs commissions), resulting in approximately **500+ lines of duplicated code**.

**Benefits of refactoring:**
- Single source of truth for scoring formulas
- Easier maintenance and bug fixes
- Reduced code size
- Lower risk of inconsistencies

**Recommended approach:**
- Extract shared calculation logic into helper functions
- Keep task-specific differences (errand vs commission history fetching) as parameters
- Maintain the same execution flow and performance characteristics
