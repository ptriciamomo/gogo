# Runner Queueing Process Documentation

Complete technical walkthrough of the runner queueing and assignment system in GoBuddy.

## Overview

The queueing system assigns pending errands and commissions to eligible runners using a multi-step process:
1. **Rule-based filtering** (availability, distance, presence)
2. **Task-matching logic** (TF-IDF scoring, ranking)
3. **Queue advancement logic** (timeouts, reassignment, already-assigned checks)

**Shared vs Task-Specific:**
- **Shared logic**: Distance calculation, availability checks, presence filtering, TF-IDF scoring algorithm, final score calculation
- **Errand-specific**: Single category per errand, `errand` table queries, `update_errand_notification` RPC
- **Commission-specific**: Multiple categories per commission (comma-separated), `commission` table queries, `update_commission_notification` RPC, `declined_runner_id` handling

---

## Important: Two Separate Step Numbering Systems

This document uses **two distinct step numbering systems** to avoid confusion:

1. **QUEUE STEPS** (Runner Queueing Process): Steps for fetching, filtering, ranking, and assigning runners to tasks
   - Labeled as: `QUEUE STEP X` or `Phase A/B Step X`
   - These are the main queueing workflow steps

2. **TF-IDF STEPS** (TF-IDF & Cosine Similarity Process): Internal steps within the TF-IDF calculation
   - Labeled as: `TF-IDF STEP X`
   - These are the mathematical calculation steps that happen inside `calculateTFIDFCosineSimilarity()`
   - See detailed explanation in `TF_IDF_COSINE_SIMILARITY_EXPLANATION.md`

**When TF-IDF steps are called:** TF-IDF steps are executed during **QUEUE STEP 6D** (Distance Filtering and Scoring) when calculating the `tfidfScore` for each runner.

---

---

## Important: Two Separate Step Numbering Systems

This document uses **two distinct step numbering systems** to avoid confusion:

1. **QUEUE STEPS** (Runner Queueing Process): Steps for fetching, filtering, ranking, and assigning runners to tasks
   - Labeled as: `QUEUE STEP X` or `Phase A/B Step X`
   - These are the main queueing workflow steps

2. **TF-IDF STEPS** (TF-IDF & Cosine Similarity Process): Internal steps within the TF-IDF calculation
   - Labeled as: `TF-IDF STEP X`
   - These are the mathematical calculation steps that happen inside `calculateTFIDFCosineSimilarity()`
   - See detailed explanation in `TF_IDF_COSINE_SIMILARITY_EXPLANATION.md`

**When TF-IDF steps are called:** TF-IDF steps are executed during **QUEUE STEP 6D** (Distance Filtering and Scoring) when calculating the `tfidfScore` for each runner.

**Document Structure:**
- **Phase A — Initial fetch & gating (not queueing yet)**: loads data and decides whether to proceed
- **Phase B — Queueing & assignment (this is the real runner queueing process)**: assigns `notified_runner_id` / advances the queue
- **TF-IDF & Cosine Similarity Steps**: Listed separately below with exact step numbers

---

## Phase A — Initial fetch & gating (NOT the queueing step)

### P0 — Runner Auth + Availability Gate + Location Resolution (before queueing)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableErrands()` → `refetch()` (Errands) / `useAvailableCommissions()` → `refetch()` (Commissions)  
**Lines (Errands):** 1004-1170  
**Lines (Commissions):** 1928-2056  

**Description:** This is the **initial fetch gate**. It ensures we have an authenticated runner, that they’re “online” (`users.is_available = true`), and that we can resolve a runner location (GPS, with DB fallback).  
It does **not** assign any task or advance the queue; it only determines whether the app should proceed to loading and filtering tasks.

**Code:**

```typescript
// P0: Check runner authentication and availability
const { data: auth } = await supabase.auth.getUser();
const uid = auth?.user?.id ?? null;

if (!uid) {
    setRows([]);
    setLoading(false);
    return; // EXIT: No authenticated user
}

// STEP 0B: Check runner is available (online)
const { data: runnerData, error: runnerError } = await supabase
    .from("users")
    .select("is_available, latitude, longitude")
    .eq("id", uid)
    .single();

if (!runnerData?.is_available) {
    setRows([]);
    setLoading(false);
    return; // EXIT: Runner offline
}

// STEP 0C: Resolve runner location (GPS with database fallback)
// Attempts GPS location up to 3 times with exponential backoff
// Falls back to database location if GPS fails
let runnerLat: number | null = null;
let runnerLon: number | null = null;
```

**Exit Conditions:**
- No authenticated user → Returns empty array
- Runner not available (`is_available = false`) → Returns empty array
- No runner location (GPS + database both fail) → Returns empty array

---

---

## Phase A (Errands) — Initial data fetch (still NOT queueing)

### P1(E) — Fetch Pending Errands (data fetch only)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableErrands()` → `refetch()`  
**Lines:** 1172-1184  

**Description:** Queries all pending errands that haven't been assigned.

**Code:**

```typescript
// P1:Icheck ang mga pending errands
const { data: eData, error } = await supabase
    .from("errand")
    .select("id, title, category, status, created_at, buddycaller_id, runner_id, notified_runner_id, notified_at, timeout_runner_ids")
    .eq("status", "pending")
    .is("runner_id", null)
    .order("created_at", { ascending: false })
    .neq(uid ? "buddycaller_id" : "id", uid ?? -1);
```

**Filters Applied:**
- `status = "pending"` - Only uncompleted errands
- `runner_id IS NULL` - Only unassigned errands
- `buddycaller_id != current_user` - Exclude runner's own errands

---

### A2(E) — Fetch Caller Locations (data fetch only)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableErrands()` → `refetch()`  
**Lines:** 1186-1206  

**Description:** Retrieves caller names and locations for distance calculations.

**Code:**

```typescript
//  P2 — Fetch caller names and locations
const callerIds = Array.from(
    new Set(errands.map((r) => r.buddycaller_id).filter((v): v is string => !!v))
);

let namesById: Record<string, string> = {};
let callerLocations: Record<string, { latitude: number; longitude: number }> = {};

if (callerIds.length) {
    const { data: users } = await supabase
        .from("users")
        .select("id, first_name, last_name, latitude, longitude")
        .in("id", callerIds);
    
    (users || []).forEach((u: UserRow & { latitude?: number; longitude?: number }) => {
        const full = `${titleCase(u.first_name || "")} ${titleCase(u.last_name || "")}`.trim();
        namesById[u.id] = full || "BuddyCaller";
        if (typeof u.latitude === "number" && typeof u.longitude === "number") {
            callerLocations[u.id] = { latitude: u.latitude, longitude: u.longitude };
        }
    });
}
```

---

### A3(E) — Pre-Ranking Distance Filter (data filter only)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableErrands()` → `refetch()`  
**Lines:** 1208-1227  

**Description:** Filters errands to only those within 500 meters of runner before ranking.

**Code:**

```typescript
// P3: Pre-ranking distance filtering
const filteredErrands = errands.filter((errand) => {
    const callerLocation = callerLocations[errand.buddycaller_id || ""];
    if (!callerLocation) return false; // EXIT: Caller has no location

    const distanceKm = LocationService.calculateDistance(
        runnerLat as number,
        runnerLon as number,
        callerLocation.latitude,
        callerLocation.longitude
    );
    const distanceMeters = distanceKm * 1000;

    if (distanceMeters > 500) {
        return false; // EXIT: Beyond 500m limit
    }

    return true;
});
```

**Distance Calculation Details:**
- **File:** `components/LocationService.ts`  
- **Function:** `calculateDistance()`  
- **Lines:** 290-305  
- **Formula:** Haversine formula
  ```typescript
  const R = 6371; // Earth's radius in kilometers
  const dLat = this.deg2rad(lat2 - lat1);
  const dLon = this.deg2rad(lon2 - lon1);
  const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
  ```

**Exit Conditions:**
- Caller has no location → Errand excluded
- Distance > 500 meters → Errand excluded

---

---

## Phase B (Errands) — Queueing & assignment (this is where queueing starts)

### B0(E) — Ranking/Dispatch Entry Function: `shouldShowErrand`

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowErrand()`  
**Lines:** 1312-1790  

**Description:** This function is where the **errand queueing/dispatch** happens. It is called for each candidate errand during `refetch()`.  
It decides visibility *and* can **write assignment state** (via RPC) when `notified_runner_id` is empty or timed out.

//Diri na part mag decide kinsa na runner makakita sa errands, ma-assigned sa errand if wala pay runner na assigned sa kana na errrand or if naay runner na nag ignore

**Entry Condition Check:**

```typescript
const shouldShowErrand = async (errand: ErrandRowDB): Promise<boolean> => {
    if (!uid) return false; // EXIT: No authenticated user
    
    const errandCategory = errand.category ? errand.category.trim() : null;
    
    // If no category, show to all eligible runners (no ranking)
    if (!errandCategory) {
        console.log(`📊 [ERRAND RANKING] Errand ${errand.id} has no category, showing to all eligible runners`);
        return true; // EXIT: No category, bypass ranking
    }
```

---

### B1(E) — **ACTUAL FIRST QUEUEING STEP**: “unassigned task detected” gate (`if (!errand.notified_runner_id)`)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowErrand()`  
**Lines:** 1325-1330  

**Description:** This is the first “real queueing” branch. Queueing begins the moment the code sees an eligible, pending errand **without** a `notified_runner_id`.  
If this branch is taken, the runner client will compute the top runner and then **write** `notified_runner_id` + `notified_at` to the database.

**Code:**

```typescript
// Check if 60 seconds have passed since notification
const now = new Date();
const notifiedAt = errand.notified_at ? new Date(errand.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

// If no runner has been notified yet, find and assign top-ranked runner
if (!errand.notified_runner_id) {
    // INITIAL ASSIGNMENT PATH (Phase B continues)
} else if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // TIMEOUT REASSIGNMENT PATH (Phase B continues)
} else if (errand.notified_runner_id === uid) {
    // Already assigned to current runner
    return true;
} else {
    // Assigned to different runner
    return false;
}
```

**How this step works (Errands):**
- **Input condition**: `errand.status = 'pending'` and `errand.runner_id IS NULL` (from Phase A fetch), and now **`errand.notified_runner_id IS NULL`**.
- **Effect**: enters initial assignment path → logs the “Task detected” block → validates caller location → fetches eligible runners → ranks them → updates DB via `update_errand_notification` RPC (see later “Ranking and Assignment” section).
- **Applies to**: **Errands only** (this is the `ErrandRowDB` branch).

---

### B2(E) — Task Detection Logging + Caller Location Gate (still part of queueing)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowErrand()`  
**Lines:** 1331-1346  

**Description:** This is where the system logs the task details (errand ID, caller name, status) and gets the caller's location. The caller's location is needed to calculate the distance between the caller and each runner. If the caller doesn't have a location, the system stops here and doesn't proceed with ranking runners (because distance calculation is impossible without a location).

**Code:**

```typescript
// STEP 1: Task detected
// This part gets the caller's name and ID for logging purposes
const callerName = namesById[errand.buddycaller_id || ""] || "BuddyCaller";
const callerShortId = (errand.buddycaller_id || "").substring(0, 8);

// Log task information (for debugging and monitoring)
console.log(`[QUEUE] STEP 1 — Task detected`);
console.log(`Type: Errand`);
console.log(`Task ID: ${errand.id}`);
console.log(`Caller: ${callerName} (id: ${callerShortId})`);
console.log(`Status: pending`);

// Get caller location for distance calculation
// This is where the system retrieves the caller's location (latitude, longitude)
// The location was fetched earlier in Phase A and stored in callerLocations object
const callerLocation = callerLocations[errand.buddycaller_id || ""];

// If caller has no location, stop here (can't calculate distance without location)
if (!callerLocation) {
    if (__DEV__) console.log(`❌ [ERRAND RANKING] Errand ${errand.id}: Caller has no location, cannot rank runners`);
    return false; // EXIT: No caller location
}
```

**What happens here:**
1. **Gets caller information**: Retrieves the caller's name and ID from the data fetched in Phase A
2. **Logs task details**: Prints task information to console for debugging (task ID, caller name, status)
3. **Gets caller location**: Retrieves the caller's location (latitude, longitude) from the `callerLocations` object
4. **Validates location**: Checks if caller has a valid location - if not, stops the queueing process because distance calculation requires a location

---

### B3(E) — Fetch Eligible Runners (availability + presence) (still part of queueing)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowErrand()`  
**Lines:** 1348-1413  

**Description:** Fetches available runners with presence checks (recent activity + location updates).

**Code:**

```typescript
// STEP 5: Fetch available runners with presence and availability filters
// Runner heartbeat updates: last_seen_at every ~60s
// Thresholds: 75s (buffered to prevent flapping between heartbeats)
const seventyFiveSecondsAgo = new Date(now.getTime() - 75 * 1000);

// First, get count of runners before presence filter (for logging)
let countQuery = supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "BuddyRunner")
    .eq("is_available", true);

// Exclude all timeout runners if exists
if (errand.timeout_runner_ids && errand.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of errand.timeout_runner_ids) {
        countQuery = countQuery.neq("id", timeoutRunnerId);
    }
}

const { count: runnersBeforePresence } = await countQuery;

// Now fetch runners with presence filters applied
// Eligibility: is_available = true AND last_seen_at >= 75s ago AND (location_updated_at >= 75s ago OR location_updated_at IS NULL)
let query = supabase
    .from("users")
    .select("id, first_name, last_name, latitude, longitude, average_rating, location_updated_at")
    .eq("role", "BuddyRunner")
    .eq("is_available", true)
    .gte("last_seen_at", seventyFiveSecondsAgo.toISOString())
    .or(`location_updated_at.gte.${seventyFiveSecondsAgo.toISOString()},location_updated_at.is.null`);

// Exclude all timeout runners if exists
if (errand.timeout_runner_ids && errand.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of errand.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}

const { data: availableRunners, error: runnersError } = await query;

// STEP 2: Availability check
console.log(`[QUEUE] STEP 2 — Availability check`);
console.log(`Total runners fetched: ${totalRunners}`);

// STEP 2A: Presence filtering
console.log(`[QUEUE] STEP 2A — Presence filtering`);
console.log(`Presence threshold: ${seventyFiveSecondsAgo.toISOString()}`);
console.log(`Runners before presence filter: ${runnersBeforePresence || 0}`);
console.log(`Runners after presence filter: ${availableRunners?.length || 0}`);

if (!availableRunners || availableRunners.length === 0) {
    console.log(`📊 [ERRAND RANKING] No available runners found after excluding timeout runners`);
    return false; // EXIT: No eligible runners
}
```

**Filters Applied:**
- `role = "BuddyRunner"`
- `is_available = true`
- `last_seen_at >= 75 seconds ago` (presence check)
- `location_updated_at >= 75 seconds ago OR location_updated_at IS NULL` (location freshness)
- Exclude runners in `timeout_runner_ids` array

**Exit Conditions:**
- No available runners found → Returns false
- Query error → Returns false

---

### B4(E) — Distance Filtering and Scoring (corresponds to runtime logs: `[QUEUE] STEP 3/4`)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowErrand()`  
**Lines:** 1415-1492  

**Description:** Filters runners within 500m and calculates scores (distance, rating, TF-IDF).

**Code:**

```typescript
// STEP 6: Distance filtering and scoring for each runner
console.log(`[QUEUE] STEP 3 — Distance filtering (≤ 500m)`);
const eligibleRunners: Array<{ id: string; firstName: string | null; lastName: string | null; distance: number; rating: number; finalScore: number; distanceScore: number; ratingScore: number; tfidfScore: number }> = [];

for (const runner of availableRunners) {
    if (!runner.latitude || !runner.longitude) continue;
    
    const lat = typeof runner.latitude === 'number' ? runner.latitude : parseFloat(String(runner.latitude || ''));
    const lon = typeof runner.longitude === 'number' ? runner.longitude : parseFloat(String(runner.longitude || ''));
    
    if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;
    
    // STEP 6A: Calculate distance between runner and caller
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
        continue; // EXIT: Beyond 500m
    }
    
    console.log(`Runner: ${runnerName} — ${distanceMeters.toFixed(2)}m ✅`);
    
    // STEP 6B: Calculate distance score (normalized 0-1, higher for closer runners)
    const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
    
    // STEP 6C: Fetch runner category history for TF-IDF calculation
    const runnerHistoryData = await getRunnerErrandCategoryHistory(runner.id);
    const runnerHistory = runnerHistoryData.taskCategories.flat();
    
    // STEP 6D: Calculate TF-IDF + Cosine Similarity score
    const errandCategories = [errandCategory.toLowerCase()];
    const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks);
    
    // STEP 6E: Normalize rating score
    const ratingScore = (runner.average_rating || 0) / 5;
    
    // STEP 6F: Calculate final weighted score
    // Formula: FinalScore = (DistanceScore * 0.40) + (RatingScore * 0.35) + (TF-IDF Score * 0.25)
    const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
    
    eligibleRunners.push({
        id: runner.id,
        firstName: runner.first_name,
        lastName: runner.last_name,
        distance: distanceMeters,
        rating: runner.average_rating || 0,
        finalScore: finalScore,
        distanceScore: distanceScore,
        ratingScore: ratingScore,
        tfidfScore: tfidfScore
    });
}

if (eligibleRunners.length === 0) {
    console.log(`❌ [ERRAND RANKING] No eligible runners within 500m found`);
    return false; // EXIT: No runners within 500m
}
```

**Score Calculations:**

1. **Distance Score:** `Math.max(0, 1 - (distanceMeters / 500))`
   - Range: 0-1
   - Closer = higher score
   - Example: 100m → 0.8, 250m → 0.5, 500m → 0

2. **Rating Score:** `(runner.average_rating || 0) / 5`
   - Range: 0-1
   - Example: 4.5 rating → 0.9

3. **TF-IDF Score:** Calculated using TF-IDF & Cosine Similarity steps (see section below)

4. **Final Score:** `(distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)`
   - Weighted combination
   - Higher = better match

**Note:** The TF-IDF calculation happens inside `calculateTFIDFCosineSimilarity()` which is called at line 439. See the **TF-IDF & Cosine Similarity Steps** section below for the exact internal steps.

---

## TF-IDF & Cosine Similarity Steps (Internal Calculation Process)

**Location in Queueing Process:** These steps are executed during **QUEUE STEP 6D** when `calculateTFIDFCosineSimilarity()` is called.

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity()`  
**Lines:** 829-1006  

**Complete Documentation:** See `TF_IDF_COSINE_SIMILARITY_EXPLANATION.md` for detailed explanations of each step.

### TF-IDF STEP 1: Calculate Term Frequency (Token-Based) — for Posted Task

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 711-717  
**Function:** `calculateTF()`

**What it does:** Calculates how often a category appears in the task document, divided by total terms.

**Code:**
```typescript
function calculateTF(term: string, document: string[]): number {
    if (document.length === 0) return 0;
    const termCount = document.filter(word => word === term).length;
    return termCount / document.length; // TF = term occurrences / document length
}
```

**Used for:** Task/query document (always uses token-based TF)

---

### TF-IDF STEP 2: Calculate Term Frequency (Task-Based) — for Runner History

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 721-729  
**Function:** `calculateTFWithTaskCount()`

**What it does:** Calculates how many tasks contain a category, divided by total tasks. This is the preferred method for runners.

**Code:**
```typescript
function calculateTFWithTaskCount(term: string, taskCategories: string[][], totalTasks: number): number {
    if (totalTasks === 0) return 0;
    const tasksWithCategory = taskCategories.filter(taskCats => 
        taskCats.some(cat => cat === term.toLowerCase())
    ).length;
    return tasksWithCategory / totalTasks; // TF = tasks containing category / total tasks
}
```

**Used for:** Runner document (preferred method when task data is available)

---

### TF-IDF STEP 3: Calculate Document Frequency (DF)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 733-734 (inside `calculateIDFAdjusted`)  
**Function:** `calculateIDFAdjusted()`

**What it does:** Counts how many documents contain the term.

**Code:**
```typescript
const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
```

**Note:** This is part of the IDF calculation function.

---

### TF-IDF STEP 4: Calculate Inverse Document Frequency (IDF)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 735-748  
**Function:** `calculateIDFAdjusted()`

**What it does:** Calculates how rare/common a term is across documents. Rare terms get higher IDF scores.

**Code:**
```typescript
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
    // TF-IDF STEP 3: Count documents containing term (Document Frequency)
    const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
    if (documentsContainingTerm === 0) return 0;
    
    // TF-IDF STEP 7: Apply smoothing - return 0.1 if term appears in all documents
    if (documentsContainingTerm === allDocuments.length) {
        return 0.1;
    }
    
    // TF-IDF STEP 4: Calculate IDF using natural logarithm
    return Math.log(allDocuments.length / documentsContainingTerm);
}
```

**Formula:** `IDF = log(N / df)` where N = total documents (2: task + runner), df = documents containing term

---

### TF-IDF STEP 7: Apply IDF Smoothing

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 737-740 (inside `calculateIDFAdjusted`)  
**Function:** `calculateIDFAdjusted()`

**What it does:** Prevents zero IDF when a term appears in all documents by returning 0.1 instead.

**Code:**
```typescript
if (documentsContainingTerm === allDocuments.length) {
    return 0.1; // Smoothing: prevents zero IDF
}
```

**Why:** Without smoothing, common terms would get IDF = 0, making them meaningless in the calculation.

---

### TF-IDF STEP 8: Construct TF-IDF Vector for Query Document (Posted Task)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 754-766  
**Function:** `calculateTFIDFVectorAdjusted()`

**What it does:** Creates a vector (map) of TF-IDF scores for all terms in the task document.

**Code:**
```typescript
function calculateTFIDFVectorAdjusted(document: string[], allDocuments: string[][]): Map<string, number> {
    const uniqueTerms = Array.from(new Set(document));
    const tfidfMap = new Map<string, number>();
    
    uniqueTerms.forEach(term => {
        const tf = calculateTF(term, document);                    // TF-IDF STEP 1: Get TF (token-based)
        const idf = calculateIDFAdjusted(term, allDocuments);     // TF-IDF STEP 3 & 4: Get IDF
        // TF-IDF STEP 8: Multiply TF × IDF to compute TF-IDF weight
        const tfidf = tf * idf;
        tfidfMap.set(term, tfidf);
    });
    
    return tfidfMap;
}
```

**Result:** Map of category → TF-IDF score for the posted task

---

### TF-IDF STEP 9: Construct TF-IDF Vector for Runner Document (Preferred Method)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 772-789  
**Function:** `calculateTFIDFVectorWithTaskCount()`

**What it does:** Creates a TF-IDF vector for runner history using task-based TF (preferred method).

**Code:**
```typescript
function calculateTFIDFVectorWithTaskCount(taskCategories: string[][], totalTasks: number, allDocuments: string[][]): Map<string, number> {
    const allTerms = new Set<string>();
    taskCategories.forEach(taskCats => {
        taskCats.forEach(cat => allTerms.add(cat.toLowerCase()));
    });
    
    const tfidfMap = new Map<string, number>();
    
    allTerms.forEach(term => {
        const tf = calculateTFWithTaskCount(term, taskCategories, totalTasks); // TF-IDF STEP 2: Task-based TF
        const idf = calculateIDFAdjusted(term, allDocuments);                  // TF-IDF STEP 3 & 4: IDF
        // TF-IDF STEP 9: Multiply TF × IDF to compute TF-IDF weight
        const tfidf = tf * idf;
        tfidfMap.set(term, tfidf);
    });
    
    return tfidfMap;
}
```

**Result:** Map of category → TF-IDF score for the runner's history

---

### TF-IDF STEP 10: Construct TF-IDF Vector for Runner Document (Fallback Method)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 754-766 (same function as STEP 8)  
**Function:** `calculateTFIDFVectorAdjusted()`

**What it does:** Creates a TF-IDF vector for runner history using token-based TF (fallback when task data unavailable).

**When used:** Only when `runnerTaskCategories.length === 0` or `runnerTotalTasks === 0`

---

### TF-IDF STEP 12: Calculate Dot Product for Cosine Similarity

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 797-824  
**Function:** `cosineSimilarity()`

**What it does:** Calculates the dot product of two TF-IDF vectors.

**Code:**
```typescript
allTerms.forEach(term => {
    const val1 = vector1.get(term) || 0;
    const val2 = vector2.get(term) || 0;
    dotProduct += val1 * val2;  // TF-IDF STEP 12: Dot product
});
```

**Formula:** `dotProduct = Σ(v1[term] × v2[term])` for all terms

---

### TF-IDF STEP 13: Calculate Vector Magnitudes for Cosine Similarity

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 797-824  
**Function:** `cosineSimilarity()`

**What it does:** Calculates the Euclidean magnitude (length) of each vector.

**Code:**
```typescript
allTerms.forEach(term => {
    const val1 = vector1.get(term) || 0;
    const val2 = vector2.get(term) || 0;
    magnitude1 += val1 * val1;  // TF-IDF STEP 13: Sum of squares for vector 1
    magnitude2 += val2 * val2;  // TF-IDF STEP 13: Sum of squares for vector 2
});

const denominator = Math.sqrt(magnitude1) * Math.sqrt(magnitude2);  // TF-IDF STEP 13: Calculate magnitudes
```

**Formula:** `||v|| = √(Σ(v[term]²))` for each vector

---

### TF-IDF STEP 14: Calculate Final Cosine Similarity Score

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 797-824  
**Function:** `cosineSimilarity()`

**What it does:** Computes the final similarity score between task and runner vectors.

**Code:**
```typescript
if (denominator === 0) return 0;
// TF-IDF STEP 14: Final cosine similarity score
return dotProduct / denominator;
```

**Formula:** `Cosine Similarity = (v1 · v2) / (||v1|| × ||v2||)`

**Result:** Score between 0 (no match) and 1 (perfect match)

**This score becomes the `tfidfScore` used in the final ranking formula.**

---

### Complete TF-IDF & Cosine Similarity Flow Summary

**Execution Order:**
1. **TF-IDF STEP 1**: Calculate TF for task (token-based)
2. **TF-IDF STEP 2**: Calculate TF for runner (task-based, preferred) OR fallback to STEP 1 (token-based)
3. **TF-IDF STEP 3**: Count documents containing each term (DF)
4. **TF-IDF STEP 4**: Calculate IDF for each term
5. **TF-IDF STEP 7**: Apply smoothing if term appears in all documents
6. **TF-IDF STEP 8**: Build TF-IDF vector for task (combines STEP 1 + STEP 3 & 4)
7. **TF-IDF STEP 9**: Build TF-IDF vector for runner (combines STEP 2 + STEP 3 & 4) OR STEP 10 (fallback)
8. **TF-IDF STEP 12**: Calculate dot product of both vectors
9. **TF-IDF STEP 13**: Calculate magnitudes of both vectors
10. **TF-IDF STEP 14**: Calculate final cosine similarity score

**For detailed explanations and examples, see:** `TF_IDF_COSINE_SIMILARITY_EXPLANATION.md`

---

### B6(E) — Ranking and Assignment (corresponds to runtime logs: `[QUEUE] STEP 5/6`)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowErrand()`  
**Lines:** 1494-1550  

**Description:** Sorts runners by score and assigns to top-ranked runner.

**Code:**

```typescript
// STEP 4: Score calculation (logging)
console.log(`[QUEUE] STEP 4 — Score calculation`);
for (const runner of eligibleRunners) {
    const runnerName = formatRunnerName(runner.firstName, runner.lastName, runner.id);
    console.log(`Runner: ${runnerName}`);
    console.log(`  distance = ${runner.distance.toFixed(2)}m → distanceScore = ${runner.distanceScore.toFixed(4)}`);
    console.log(`  rating = ${runner.rating.toFixed(2)} → ratingScore = ${runner.ratingScore.toFixed(4)}`);
    console.log(`  tfidfScore = ${runner.tfidfScore.toFixed(4)}`);
    console.log(`  FinalScore = ${runner.finalScore.toFixed(4)}`);
}

// STEP 7: Sort and rank runners
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore; // Primary: final score (desc)
    return a.distance - b.distance; // Tiebreaker: distance (asc)
});

// STEP 5: Ranking result
console.log(`[QUEUE] STEP 5 — Runner ranking`);
eligibleRunners.forEach((runner, index) => {
    const runnerName = formatRunnerName(runner.firstName, runner.lastName, runner.id);
    const rank = index + 1;
    console.log(`Runner ${rank}: ${runnerName}`);
    console.log(`distanceScore = ${runner.distanceScore.toFixed(2)}`);
    console.log(`ratingScore   = ${runner.ratingScore.toFixed(2)}`);
    console.log(`tfidfScore    = ${runner.tfidfScore.toFixed(2)}`);
    console.log(`FinalScore    = ${runner.finalScore.toFixed(2)}`);
});

const topRunner = eligibleRunners[0];
const topRunnerName = formatRunnerName(topRunner.firstName, topRunner.lastName, topRunner.id);

// STEP 6: Assignment
console.log(`[QUEUE] STEP 6 — Assignment`);
console.log(`Assigned runner: ${topRunnerName}`);
console.log(`Timeout window: 60 seconds`);

// STEP 8: Assign errand to top-ranked runner
await updateErrandNotification(
    errand.id,
    topRunner.id,
    new Date().toISOString()
);

// Only show if current runner is the top-ranked runner
if (topRunner.id === uid) {
    console.log(`✅ [ERRAND RANKING] Errand ${errand.id}: Assigned to current runner ${uid} (top-ranked)`);
    return true;
} else {
    console.log(`❌ [ERRAND RANKING] Errand ${errand.id}: Assigned to runner ${topRunner.id}, not current runner ${uid}`);
    return false; // EXIT: Assigned to different runner
}
```

**Sorting Logic:**
1. Primary: `finalScore` (descending)
2. Tiebreaker: `distance` (ascending)

**Assignment Update:**

**File:** `app/buddyrunner/home.tsx`  
**Function:** `updateErrandNotification()`  
**Lines:** 1265-1291  

**Code:**

```typescript
const updateErrandNotification = async (
    errandId: number,
    notifiedRunnerId: string,
    notifiedAt: string,
    previousNotifiedRunnerId?: string | null
): Promise<void> => {
    const { error: updateError } = await supabase.rpc('update_errand_notification', {
        p_errand_id: errandId,
        p_notified_runner_id: notifiedRunnerId,
        p_notified_at: notifiedAt,
        p_previous_notified_runner_id: previousNotifiedRunnerId || null
    });
};
```

**Database RPC Function:**

**File:** `add_errand_notification_functions.sql`  
**Function:** `update_errand_notification()`  
**Lines:** 5-39  

**Code:**

```sql
CREATE OR REPLACE FUNCTION public.update_errand_notification(
    p_errand_id bigint,
    p_notified_runner_id uuid,
    p_notified_at timestamptz,
    p_previous_notified_runner_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_timeout_ids uuid[] := ARRAY[]::uuid[];
BEGIN
    -- Get current timeout_runner_ids
    SELECT COALESCE(timeout_runner_ids, ARRAY[]::uuid[])
    INTO v_current_timeout_ids
    FROM public.errand
    WHERE id = p_errand_id;
    
    -- Add previous runner to timeout list if provided and not already in list
    IF p_previous_notified_runner_id IS NOT NULL THEN
        IF NOT (p_previous_notified_runner_id = ANY(v_current_timeout_ids)) THEN
            v_current_timeout_ids := array_append(v_current_timeout_ids, p_previous_notified_runner_id);
        END IF;
    END IF;
    
    -- Update errand with new notification info
    UPDATE public.errand
    SET 
        notified_runner_id = p_notified_runner_id,
        notified_at = p_notified_at,
        timeout_runner_ids = v_current_timeout_ids
    WHERE id = p_errand_id;
END;
$$;
```

---

### B7(E) — Timeout Detection and Reassignment (corresponds to runtime logs: `[QUEUE] STEP 7+`)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowErrand()`  
**Lines:** 1553-1779  

**Description:** Detects 60-second timeout and reassigns to next runner.

**Code:**

```typescript
// STEP 9: Timeout detection and reassignment
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    const previousRunnerId = errand.notified_runner_id || "";
    console.log(`[QUEUE] STEP 7 — Timeout detected`);
    console.log(`Runner (id: ${previousRunnerShortId}) did not accept within 60s`);
    console.log(`Re-running queueing for remaining runners`);
    
    // Get caller location for distance calculation
    const callerLocation = callerLocations[errand.buddycaller_id || ""];
    if (!callerLocation) {
        if (__DEV__) console.log(`❌ [ERRAND RANKING] Errand ${errand.id}: Caller has no location, cannot find next runner`);
        return false; // EXIT: No caller location
    }
    
    // STEP 9A: Fetch available runners excluding previous and timeout runners
    const seventyFiveSecondsAgoReassign = new Date(now.getTime() - 75 * 1000);
    
    let query = supabase
        .from("users")
        .select("id, first_name, last_name, latitude, longitude, average_rating, location_updated_at")
        .eq("role", "BuddyRunner")
        .eq("is_available", true)
        .neq("id", errand.notified_runner_id || "") // EXCLUDE previous runner
        .gte("last_seen_at", seventyFiveSecondsAgoReassign.toISOString())
        .or(`location_updated_at.gte.${seventyFiveSecondsAgoReassign.toISOString()},location_updated_at.is.null`);
    
    // Exclude all timeout runners if exists
    if (errand.timeout_runner_ids && errand.timeout_runner_ids.length > 0) {
        for (const timeoutRunnerId of errand.timeout_runner_ids) {
            query = query.neq("id", timeoutRunnerId);
        }
    }
    
    const { data: availableRunners, error: runnersError } = await query;
    
    if (!availableRunners || availableRunners.length === 0) {
        console.log(`📊 [ERRAND RANKING] No other available runners found after excluding timeout runners`);
        // No eligible runners left, clear notified_runner_id and notified_at
        await clearErrandNotification(errand.id);
        return false; // EXIT: No eligible runners left
    }
    
    // STEP 3: Distance filtering (same as initial assignment)
    // ... (distance filtering and scoring logic repeated) ...
    
    if (eligibleRunners.length === 0) {
        console.log(`❌ [ERRAND RANKING] No eligible runners within 500m found`);
        await clearErrandNotification(errand.id);
        return false; // EXIT: No runners within 500m
    }
    
    // STEP 4: Score calculation (same as initial assignment)
    // ... (score calculation and ranking logic repeated) ...
    
    const nextRunner = eligibleRunners[0];
    
    // STEP 9B: Reassign to next runner with timeout tracking
    const previousNotifiedRunnerId = errand.notified_runner_id;
    
    await updateErrandNotification(
        errand.id,
        nextRunner.id,
        new Date().toISOString(),
        previousNotifiedRunnerId // Adds previous runner to timeout_runner_ids
    );
    
    // Only show if current runner is the next-ranked runner
    if (nextRunner.id === uid) {
        console.log(`✅ [ERRAND RANKING] Errand ${errand.id}: Reassigned to current runner ${uid} (next-ranked)`);
        return true;
    } else {
        console.log(`❌ [ERRAND RANKING] Errand ${errand.id}: Reassigned to runner ${nextRunner.id}, not current runner ${uid}`);
        return false; // EXIT: Reassigned to different runner
    }
}
```

**Timeout Logic:**
- Timeout window: 60 seconds from `notified_at`
- Previous runner added to `timeout_runner_ids` array
- Process repeats with excluded runners

**Clear Notification Function:**

**File:** `app/buddyrunner/home.tsx`  
**Function:** `clearErrandNotification()`  
**Lines:** 1294-1309  

**Database RPC:**

**File:** `add_errand_notification_functions.sql`  
**Function:** `clear_errand_notification()`  
**Lines:** 42-74  

**Code:**

```sql
CREATE OR REPLACE FUNCTION public.clear_errand_notification(
    p_errand_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_notified_runner_id uuid;
    v_current_timeout_ids uuid[] := ARRAY[]::uuid[];
BEGIN
    -- Get current notified_runner_id and timeout_runner_ids
    SELECT notified_runner_id, COALESCE(timeout_runner_ids, ARRAY[]::uuid[])
    INTO v_current_notified_runner_id, v_current_timeout_ids
    FROM public.errand
    WHERE id = p_errand_id;
    
    -- Add current notified runner to timeout list before clearing (if exists and not already in list)
    IF v_current_notified_runner_id IS NOT NULL THEN
        IF NOT (v_current_notified_runner_id = ANY(v_current_timeout_ids)) THEN
            v_current_timeout_ids := array_append(v_current_timeout_ids, v_current_notified_runner_id);
        END IF;
    END IF;
    
    -- Clear notification
    UPDATE public.errand
    SET 
        notified_runner_id = NULL,
        notified_at = NULL,
        timeout_runner_ids = v_current_timeout_ids
    WHERE id = p_errand_id;
END;
$$;
```

---

### A4(E) — Apply Ranking/Dispatch Function to Each Candidate Errand (bridge into Phase B)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableErrands()` → `refetch()`  
**Lines:** 1792-1804  

**Description:** This is the bridge from **Phase A → Phase B**.  
For each errand that survived Phase A filtering, the code calls `shouldShowErrand()`. That call is where **queueing/assignment** can occur (Phase B), because it may write `notified_runner_id` when it’s currently null.

**Code:**

```typescript
// Apply ranking filter to determine visibility (and possibly trigger assignment)
const rankingFilteredErrands: ErrandRowDB[] = [];
for (const errand of filteredErrands) {
    const shouldShow = await shouldShowErrand(errand);
    if (shouldShow) {
        rankingFilteredErrands.push(errand);
    }
}

console.log('✅ [ERRAND RANKING] Errands after ranking filter:', rankingFilteredErrands.length);
console.log('✅ [ERRAND RANKING] Errands IDs:', rankingFilteredErrands.map(e => e.id));

const mapped: ErrandUI[] = rankingFilteredErrands.map((r) => ({
    id: r.id,
    requester: namesById[r.buddycaller_id || ""] || "BuddyCaller",
    title: (r.title || "").trim() || "(No title)",
    category: (r.category || "").trim() || undefined,
    status: toUiStatus(r.status),
    created_at: r.created_at,
}));

setRows(mapped);
```

---
---

## Phase A (Commissions) — Initial data fetch (still NOT queueing)

### Overview of Differences

**Shared Logic:**
- Steps 0-3 (availability, distance filtering) are identical
- TF-IDF calculation is shared (handles multiple categories)
- Scoring and ranking logic is identical

**Commission-Specific Differences:**
1. **Multiple Categories:** Commissions store `commission_type` as comma-separated string (e.g., "logos,posters")
2. **Declined Runner Handling:** Commissions have `declined_runner_id` field (excluded from assignment)
3. **RPC Function:** Uses `update_commission_notification` instead of `update_errand_notification`

---

### A1(C) — Fetch Pending Commissions (data fetch only)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableCommissions()` → `refetch()`  
**Lines:** 2063-2076  

**Code:**

```typescript
const { data, error } = await supabase
    .from("commission")
    .select("id, title, commission_type, created_at, buddycaller_id, status, runner_id, declined_runner_id, notified_runner_id, notified_at, timeout_runner_ids")
    .eq("status", "pending")
    .is("runner_id", null)
    .order("created_at", { ascending: false })
    .neq(uid ? "buddycaller_id" : "id", uid ?? -1);
```

**Filters Applied:**
- `status = "pending"`
- `runner_id IS NULL`
- `buddycaller_id != current_user`

---

### A2(C) — Distance Filtering (Commissions) (data filter only)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableCommissions()` → `refetch()`  
**Lines:** 2112-2139  

**Code:**

```typescript
// Filter out commissions based on distance (500 meters = 0.5 km) and declined status
const filteredRaw = raw.filter(commission => {
    // Check if current user was declined for this commission
    if (commission.declined_runner_id === uid) {
        return false; // EXIT: Runner was declined
    }
    
    // Check distance if caller has location
    const callerLocation = callerLocations[commission.buddycaller_id || ""];
    if (callerLocation) {
        const distanceKm = LocationService.calculateDistance(
            runnerLat,
            runnerLon,
            callerLocation.latitude,
            callerLocation.longitude
        );
        const distanceMeters = distanceKm * 1000;
        
        if (distanceMeters > 500) {
            return false; // EXIT: Beyond 500m
        }
    } else {
        // If caller doesn't have location, exclude the commission
        return false; // EXIT: No caller location
    }
    
    return true;
});
```

**Additional Filter:**
- `declined_runner_id != current_user` (excludes commissions where runner was declined)

---

---

## Phase B (Commissions) — Queueing & assignment (this is where queueing starts)

### B0(C) — Ranking/Dispatch Entry Function: `shouldShowCommission`

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowCommission()`  
**Lines:** 2182-2711  

**Description:** This function is where the **commission queueing/dispatch** happens. It is called for each candidate commission during `refetch()`.  
It decides visibility *and* can **write assignment state** (via RPC) when `notified_runner_id` is empty or timed out.

**Category Parsing:**

```typescript
const shouldShowCommission = async (commission: CommissionRowDB): Promise<boolean> => {
    if (!uid) return false;
    
    // Parse commission types from commission_type string (comma-separated)
    const commissionTypes = commission.commission_type 
        ? commission.commission_type.split(',').map(t => t.trim()).filter(t => t.length > 0)
        : [];
    
    if (commissionTypes.length === 0) {
        // If no commission type, show to all eligible runners (no ranking)
        console.log(`📊 [RANKING] Commission ${commission.id} has no category/type, showing to all eligible runners`);
        return true; // EXIT: No category, bypass ranking
    }
```

### B1(C) — **ACTUAL FIRST QUEUEING STEP**: “unassigned task detected” gate (`if (!commission.notified_runner_id)`)

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowCommission()`  
**Applies to:** **Commissions only**

**What makes this the “first queueing step”:** This is the first point where the runner client decides “this pending commission has no `notified_runner_id` yet” and proceeds to compute a top runner and then **write** `notified_runner_id` + `notified_at` via RPC.

**Exact code (Commissions):**

```typescript
// If no runner has been notified yet, find and assign top-ranked runner
if (!commission.notified_runner_id) {
    // STEP 1: Task detected
    const callerName = commissionCallerNamesById[commission.buddycaller_id || ""] || "BuddyCaller";
    const callerShortId = (commission.buddycaller_id || "").substring(0, 8);
    console.log(`[QUEUE] STEP 1 — Task detected`);
    console.log(`Type: Commission`);
    console.log(`Task ID: ${commission.id}`);
    console.log(`Caller: ${callerName} (id: ${callerShortId})`);
    console.log(`Status: pending`);

    // Get caller location for distance calculation
    const callerLocation = callerLocations[commission.buddycaller_id || ""];
    if (!callerLocation) {
        console.log(`❌ [RANKING] Commission ${commission.id}: Caller has no location, cannot rank runners`);
        return false;
    }

    // ... continues into eligibility filtering, ranking, and RPC assignment ...
}
```

**How this step works (Commissions):**
- **Input condition**: `commission.status = 'pending'` and `commission.runner_id IS NULL` (from Phase A fetch), and now **`commission.notified_runner_id IS NULL`**.
- **Effect**: enters initial assignment path → validates caller location → fetches eligible runners → ranks them → updates DB via `update_commission_notification` RPC.

**Runner History Fetch (Commissions):**

```typescript
// File: app/buddyrunner/home.tsx, Lines: 2144-2179
const getRunnerCategoryHistory = async (runnerId: string): Promise<{ taskCategories: string[][]; totalTasks: number }> => {
    const { data, error } = await supabase
        .from("commission")
        .select("commission_type")
        .eq("runner_id", runnerId)
        .eq("status", "completed");
    
    if (!data || data.length === 0) return { taskCategories: [], totalTasks: 0 };
    
    const totalTasks = data.length;
    const taskCategories: string[][] = [];
    data.forEach((completedCommission: any) => {
        if (!completedCommission.commission_type) return;
        // commission_type is stored as comma-separated string (e.g., "logos,posters")
        const categories = completedCommission.commission_type.split(',').map((t: string) => t.trim().toLowerCase()).filter((t: string) => t.length > 0);
        if (categories.length > 0) {
            taskCategories.push(categories);
        }
    });
    
    return { taskCategories, totalTasks };
};
```

**TF-IDF Calculation (Multiple Categories):**

```typescript
// STEP 6D: Calculate TF-IDF + Cosine Similarity score
// commissionTypes is an array (e.g., ["logos", "posters"])
const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks);
```

**Availability Filtering (Commissions) - Includes Declined Runner Exclusion:**

```typescript
// File: app/buddyrunner/home.tsx, Lines: 2255-2303
let countQueryCommission = supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "BuddyRunner")
    .eq("is_available", true);

// Exclude declined runner if exists (when caller declines)
if (commission.declined_runner_id) {
    countQueryCommission = countQueryCommission.neq("id", commission.declined_runner_id);
}

// Also exclude all timeout runners if exists (to prevent re-notifying)
if (commission.timeout_runner_ids && commission.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of commission.timeout_runner_ids) {
        countQueryCommission = countQueryCommission.neq("id", timeoutRunnerId);
    }
}

let query = supabase
    .from("users")
    .select("id, first_name, last_name, latitude, longitude, average_rating, location_updated_at")
    .eq("role", "BuddyRunner")
    .eq("is_available", true)
    .gte("last_seen_at", seventyFiveSecondsAgoCommission.toISOString())
    .or(`location_updated_at.gte.${seventyFiveSecondsAgoCommission.toISOString()},location_updated_at.is.null`);

// Exclude declined runner if exists
if (commission.declined_runner_id) {
    query = query.neq("id", commission.declined_runner_id);
}

// Also exclude all timeout runners if exists
if (commission.timeout_runner_ids && commission.timeout_runner_ids.length > 0) {
    for (const timeoutRunnerId of commission.timeout_runner_ids) {
        query = query.neq("id", timeoutRunnerId);
    }
}
```

**Assignment Update (Commissions):**

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowCommission()`  
**Lines:** 2417-2427  

**Code:**

```typescript
// Assign to top-ranked runner
const { error: updateError } = await supabase.rpc('update_commission_notification', {
    p_commission_id: commission.id,
    p_notified_runner_id: topRunner.id,
    p_notified_at: new Date().toISOString()
});
```

**Note:** Commission notification RPC functions mirror errand functions but operate on `commission` table.

---

## Errands vs Commissions: Side-by-Side Code References (with purpose & step)

Use these as quick pointers to the exact code that runs per step.

### Initial Assignment (when no runner has been notified)
- **Errands – Distance filter, scoring, ranking, assignment (STEP 3, 4, 5, 6)**
```typescript
// STEP 3: Distance filtering (≤ 500m)
// STEP 4: Score calculation (distance/rating/TF-IDF)
// STEP 5: Runner ranking (sort)
// STEP 6: Assignment to top-ranked runner
// File: app/buddyrunner/home.tsx
// Lines: ~1415-1524
const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
const ratingScore = (runner.average_rating || 0) / 5;
const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks);
const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance;
});
await updateErrandNotification(errand.id, topRunner.id, new Date().toISOString());
```

- **Commissions – Distance filter, scoring, ranking, assignment (STEP 3, 4, 5, 6)**
```typescript
// STEP 3: Distance filtering (≤ 500m) with declined runner exclusion
// STEP 4: Score calculation (distance/rating/TF-IDF over commissionTypes[])
// STEP 5: Runner ranking (sort)
// STEP 6: Assignment to top-ranked runner
// File: app/buddyrunner/home.tsx
// Lines: ~2307-2406
const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
const ratingScore = (runner.average_rating || 0) / 5;
const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks);
const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance;
});
await supabase.rpc('update_commission_notification', {
    p_commission_id: commission.id,
    p_notified_runner_id: topRunner.id,
    p_notified_at: new Date().toISOString(),
});
```

### Timeout Reassignment (60s elapsed)
- **Errands – Reassignment after timeout (STEP 7/9, then 3-6 repeated)**
```typescript
// STEP 7: Timeout detected → re-run filtering/ranking excluding previous + timeout runners
// Steps 3-6 repeat with same scoring and sorting
// File: app/buddyrunner/home.tsx
// Lines: ~1553-1779
const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
const ratingScore = (runner.average_rating || 0) / 5;
const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks);
const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance;
});
await updateErrandNotification(
    errand.id,
    nextRunner.id,
    new Date().toISOString(),
    previousNotifiedRunnerId
);
```

- **Commissions – Reassignment after timeout (STEP 7, then 3-6 repeated)**
```typescript
// STEP 7: Timeout detected → re-run filtering/ranking excluding previous + timeout + declined runner
// Steps 3-6 repeat with same scoring and sorting
// File: app/buddyrunner/home.tsx
// Lines: ~2440-2700
const distanceScore = Math.max(0, 1 - (distanceMeters / 500));
const ratingScore = (runner.average_rating || 0) / 5;
const tfidfScore = calculateTFIDFCosineSimilarity(commissionTypes, runnerHistory, runnerHistoryData.taskCategories, runnerHistoryData.totalTasks);
const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.distance - b.distance;
});
await supabase.rpc('update_commission_notification', {
    p_commission_id: commission.id,
    p_notified_runner_id: nextRunner.id,
    p_notified_at: new Date().toISOString(),
    p_previous_notified_runner_id: previousNotifiedRunnerId,
});
```

### Rule-Based Filtering Differences
- **Errands:** Excludes `timeout_runner_ids` and previously notified runner; requires caller location; no `declined_runner_id`.
- **Commissions:** Excludes `timeout_runner_ids`, `declined_runner_id`, and previously notified runner; requires caller location; commissionTypes can be multiple.

### Purpose Recap
- **QUEUE STEP 3 (Distance filter):** Keep only runners within 500m of caller.
- **QUEUE STEP 4 (Score calc):** Combine distance (40%), rating (35%), TF-IDF (25%).
  - **Note:** TF-IDF score is calculated using TF-IDF STEPS 1-14 (see TF-IDF & Cosine Similarity Steps section above)
- **QUEUE STEP 5 (Ranking):** Sort by finalScore desc, distance asc (tiebreaker).
- **QUEUE STEP 6 (Assignment):** Notify top-ranked runner (RPC update of notified_runner_id/notified_at).
- **QUEUE STEP 7/9 (Timeout):** After 60s, exclude previous runner (and declined for commissions), re-run QUEUE STEPS 3-6; clear notification if none remain.

---


---

## REALTIME TRIGGERS

### Supabase Realtime Subscriptions

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableErrands()` / `useAvailableCommissions()`  
**Lines (Errands):** 1845-1899  
**Lines (Commissions):** 2783-2845  

**Description:** Subscribes to table changes and triggers refetch when assignments occur.

**Code (Errands):**

```typescript
// Realtime subscription for errand changes
const channel = supabase
    .channel("rt-available-errands")
    .on("postgres_changes", { event: "*", schema: "public", table: "errand" }, () => {
        if (!mounted) return;
        
        const isAvailable = availableModeRef.current;
        if (isAvailable === false) {
            console.log('[REALTIME ERRAND] ❌ Runner is explicitly OFF, skipping refetch');
            return;
        }
        
        console.log('[REALTIME ERRAND] ✅ Availability guard passed, calling refetch()');
        refetch();
    })
    .subscribe();
```

**Trigger Events:**
- INSERT: New errand/commission created
- UPDATE: Assignment status changes (notified_runner_id, notified_at, timeout_runner_ids)
- DELETE: (rare, but handled)

---

## SUMMARY: EXIT POINTS AND CONDITIONS

### Initial Assignment Exit Points

1. **No authenticated user** → Returns false (Step 0)
2. **Runner not available** → Returns false (Step 0)
3. **No runner location** → Returns false (Step 0)
4. **No caller location** → Returns false (Step 6)
5. **No available runners** → Returns false (Step 7)
6. **No runners within 500m** → Returns false (Step 8)
7. **Assigned to different runner** → Returns false (Step 9)
8. **Assigned to current runner** → Returns true (Step 9)

### Timeout Reassignment Exit Points

1. **No caller location** → Returns false (Step 10)
2. **No eligible runners remaining** → Clears notification, returns false (Step 10)
3. **No runners within 500m** → Clears notification, returns false (Step 10)
4. **Reassigned to different runner** → Returns false (Step 10)
5. **Reassigned to current runner** → Returns true (Step 10)

### Commission-Specific Exit Points

- **Runner was declined** → Commission excluded in distance filter (Step 2)

---

## KEY CONSTANTS AND THRESHOLDS

- **Distance Limit:** 500 meters
- **Timeout Window:** 60 seconds
- **Presence Threshold:** 75 seconds (last_seen_at, location_updated_at)
- **Score Weights:**
  - Distance: 40% (0.40)
  - Rating: 35% (0.35)
  - TF-IDF: 25% (0.25)
- **GPS Retry:** 3 attempts with exponential backoff
- **GPS Accuracy Threshold:** 500 meters (warns but doesn't reject)

---

## FILES REFERENCED

1. `app/buddyrunner/home.tsx` - Main queueing logic (Errands & Commissions)
2. `components/LocationService.ts` - Distance calculation
3. `add_errand_notification_functions.sql` - Database RPC functions for errands
4. `supabase/functions/` - (Commission notification RPC functions - referenced but file location may vary)

---

**END OF DOCUMENTATION**
