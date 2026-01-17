# Deep Review: Runners' Queueing Process (TF-IDF + Cosine Similarity)

## Executive Summary

The runner queueing system is a **client-side, on-demand ranking system** that uses TF-IDF + Cosine Similarity to match errands/commissions with runners. The system operates **asynchronously** and is **triggered by runner-side actions** (fetching available tasks), not by task creation. It uses a **60-second timeout mechanism** with automatic fallback to the next runner in the queue.

---

## 1️⃣ Overall Queueing Flow (High-Level → Code-Level)

### When and Where the Process Starts

**Trigger:** Runner-side action (NOT caller-side or backend)

**Exact Trigger Points:**
1. **Initial Fetch:** When a runner calls `useAvailableErrands()` or `useAvailableCommissions()`
2. **Realtime Update:** When database changes trigger a refetch via Supabase realtime subscription
3. **Manual Refresh:** When runner manually refreshes the available tasks list

**File:** `app/buddyrunner/home.tsx`
- **Function:** `useAvailableErrands()` (Line 943)
- **Function:** `useAvailableCommissions()` (Line 1788)

**Is it Synchronous or Asynchronous?**

**Asynchronous** - The entire process is async:
- Database queries are async (`await supabase.from(...)`)
- GPS location fetching is async with retries
- TF-IDF calculations are async (sequential queries per runner)
- RPC calls to update notifications are async

**Triggered By:**
- **Runner Side:** ✅ YES (primary trigger)
- **Caller Side:** ❌ NO (caller only creates task, doesn't trigger ranking)
- **Backend:** ❌ NO (no server-side cron jobs or edge functions)
- **Cron/Edge Function:** ❌ NO (purely client-side)

### Complete Queueing Lifecycle

#### Phase 1: Errand/Commission Creation (Caller Side)

**File:** `app/buddycaller/errand_form.tsx` (Mobile) or `app/buddycaller/errand_form.web.tsx` (Web)

**Function:** `confirmErrand()` (Line ~1321 in web form)

**Code Location:**
```typescript
// app/buddycaller/errand_form.web.tsx, Line ~1474
const { error: insertError } = await supabase.from("errand").insert([payload]);
```

**Database State After Creation:**
- `status = 'pending'`
- `runner_id = NULL`
- `notified_runner_id = NULL`
- `notified_at = NULL`
- `timeout_runner_ids = NULL` (empty array)

**Important:** Task creation does NOT trigger ranking. The task sits in the database with `notified_runner_id = NULL` until a runner fetches available tasks.

---

#### Phase 2: Initial Runner Assignment (Runner Side - On-Demand)

**Trigger:** Runner calls `useAvailableErrands()` → `refetch()` → `shouldShowErrand()`

**File:** `app/buddyrunner/home.tsx`

**Function Flow:**
1. `useAvailableErrands()` (Line 943) → calls `refetch()` (Line 952)
2. `refetch()` → fetches pending errands (Line 1072-1080)
3. `refetch()` → calls `shouldShowErrand()` for each errand (Line 1680)
4. `shouldShowErrand()` (Line 1206) → performs ranking if `notified_runner_id` is NULL

**Step-by-Step Process:**

**Step 1: Fetch Pending Errands**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1072-1080
- **Code:**
```typescript
const { data: eData, error } = await supabase
    .from("errand")
    .select("id, title, category, status, created_at, buddycaller_id, runner_id, notified_runner_id, notified_at, timeout_runner_ids")
    .eq("status", "pending")
    .is("runner_id", null)
    .order("created_at", { ascending: false });
```

**Step 2: Get Runner Location**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1005-1067
- **Process:**
  1. Try GPS with retries (max 3 attempts, 500ms delay between retries)
  2. Fallback to database location if GPS fails
  3. Calculate GPS accuracy (used for distance limit adjustment, but currently fixed at 500m)

**Step 3: Filter by Distance (Pre-Ranking)**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1103-1121
- **Distance Limit:** 500 meters (strict, no GPS accuracy expansion)
- **Distance Calculation:** Haversine formula via `LocationService.calculateDistance()`

**Step 4: Check if Assignment Needed**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1224-1225
- **Code:**
```typescript
if (!errand.notified_runner_id) {
    // No runner assigned yet - perform ranking
}
```

**Step 5: Query Available Runners**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1265-1281
- **Query:**
```typescript
let query = supabase
    .from("users")
    .select("id, first_name, last_name, latitude, longitude, average_rating, location_updated_at")
    .eq("role", "BuddyRunner")
    .eq("is_available", true)
    .gte("last_seen_at", twoMinutesAgo.toISOString())  // Presence: 2 minutes
    .or(`location_updated_at.gte.${presenceThreshold.toISOString()},location_updated_at.is.null`);  // GPS: 90 seconds
```

**Presence Filters:**
- `last_seen_at >= 2 minutes ago` (app presence)
- `location_updated_at >= 90 seconds ago OR NULL` (GPS presence)

**Step 6: Rank Runners (Distance + TF-IDF + Rating)**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1308-1372
- **For each eligible runner:**
  1. Calculate distance score (0-1, normalized)
  2. Fetch runner's category history (for TF-IDF)
  3. Calculate TF-IDF + Cosine Similarity score
  4. Normalize rating (0-5 → 0-1)
  5. Calculate final score: `(distanceScore × 0.40) + (ratingScore × 0.35) + (tfidfScore × 0.25)`

**Step 7: Sort and Select Top Runner**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1392-1396
- **Sort Logic:**
```typescript
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;  // Primary: Final score (descending)
    return a.distance - b.distance;  // Tiebreaker: Distance (ascending)
});
```

**Step 8: Assign to Top Runner**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1422-1426
- **Code:**
```typescript
await updateErrandNotification(
    errand.id,
    topRunner.id,
    new Date().toISOString()
);
```

**Database RPC Function:** `update_errand_notification()`
- **File:** `add_errand_notification_functions.sql`
- **Lines:** 5-38
- **Purpose:** Atomically updates `notified_runner_id`, `notified_at`, and `timeout_runner_ids`

**Database State After Assignment:**
- `notified_runner_id = topRunner.id`
- `notified_at = current_timestamp`
- `timeout_runner_ids = []` (empty array)

**Step 9: Visibility Check**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1428-1435
- **Logic:** Only show errand to the assigned runner (`topRunner.id === uid`)

---

#### Phase 3: Acceptance (Runner Side)

**Trigger:** Runner clicks "Accept" button

**File:** `app/buddyrunner/view_errand.tsx` (Mobile) or `app/buddyrunner/view_errand_web.tsx` (Web)

**Function:** `accept()` (Line ~378 in web version)

**Code:**
```typescript
// app/buddyrunner/view_errand_web.tsx, Lines 396-403
const { error } = await supabase
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

---

#### Phase 4: Timeout Detection and Reassignment (Runner Side - On-Demand)

**Trigger:** Any runner fetches available tasks AND timeout has occurred

**File:** `app/buddyrunner/home.tsx`

**Function:** `shouldShowErrand()` (Line 1206)

**Timeout Detection:**
- **Lines:** 1219-1222
- **Code:**
```typescript
const now = new Date();
const notifiedAt = errand.notified_at ? new Date(errand.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Timeout detected - find next runner
}
```

**Important:** Timeout is **NOT** detected by a background job. It's only checked when:
1. A runner calls `useAvailableErrands()` or `useAvailableCommissions()`
2. The `shouldShowErrand()` or `shouldShowCommission()` function executes

**Reassignment Process (Lines 1438-1664):**

**Step 1: Detect Timeout**
- **Lines:** 1439-1445
- Logs timeout detection

**Step 2: Query Next Available Runners**
- **Lines:** 1487-1503
- **Exclusions:**
  - Current `notified_runner_id` (excluded via `.neq()`)
  - All runners in `timeout_runner_ids` array (excluded via loop)

**Step 3: Re-rank Remaining Runners**
- **Lines:** 1531-1595
- Same ranking algorithm as Phase 2:
  - Distance filtering (≤ 500m)
  - TF-IDF calculation
  - Rating normalization
  - Final score: `(distanceScore × 0.40) + (ratingScore × 0.35) + (tfidfScore × 0.25)`

**Step 4: Assign to Next Runner**
- **Lines:** 1645-1654
- **Code:**
```typescript
const previousNotifiedRunnerId = errand.notified_runner_id;

await updateErrandNotification(
    errand.id,
    nextRunner.id,
    new Date().toISOString(),
    previousNotifiedRunnerId  // Adds previous runner to timeout_runner_ids
);
```

**Database RPC Logic (add_errand_notification_functions.sql, Lines 24-29):**
```sql
IF p_previous_notified_runner_id IS NOT NULL THEN
    IF NOT (p_previous_notified_runner_id = ANY(v_current_timeout_ids)) THEN
        v_current_timeout_ids := array_append(v_current_timeout_ids, p_previous_notified_runner_id);
    END IF;
END IF;
```

**Database State After Reassignment:**
- `notified_runner_id = nextRunner.id`
- `notified_at = current_timestamp`
- `timeout_runner_ids = [previousRunnerId, ...existingTimeouts]`

**Step 5: Repeat Phase 3 or Phase 4**
- If next runner accepts → Phase 3
- If next runner times out → Phase 4 (repeat)

---

## 2️⃣ File & Code Location Mapping

### Core Queueing Files

#### 1. `app/buddyrunner/home.tsx` (5,620 lines total)

**Primary Functions:**

| Function | Lines | Purpose |
|----------|-------|---------|
| `useAvailableErrands()` | 943-1786 | Main hook for fetching and ranking errands |
| `useAvailableCommissions()` | 1788-2620 | Main hook for fetching and ranking commissions |
| `shouldShowErrand()` | 1206-1675 | Determines if current runner should see errand (ranking logic) |
| `shouldShowCommission()` | 1870-2230 | Determines if current runner should see commission (ranking logic) |
| `calculateTFIDFCosineSimilarity()` | 772-940 | TF-IDF + Cosine Similarity calculation |
| `calculateTF()` | 644-648 | Term Frequency calculation |
| `calculateTFWithTaskCount()` | 655-662 | Task-based TF calculation (new method) |
| `calculateIDFAdjusted()` | 677-689 | Adjusted Inverse Document Frequency |
| `calculateTFIDFVectorAdjusted()` | 694-705 | TF-IDF vector construction |
| `calculateTFIDFVectorWithTaskCount()` | 711-727 | Task-based TF-IDF vector construction |
| `cosineSimilarity()` | 748-767 | Cosine similarity between vectors |
| `getRunnerErrandCategoryHistory()` | 1125-1156 | Fetches runner's completed errand categories |
| `updateErrandNotification()` | 1159-1185 | Updates errand notification via RPC |
| `clearErrandNotification()` | 1187-1203 | Clears errand notification via RPC |

**Key Ranking Logic Locations:**

| Step | Lines | Description |
|------|-------|-------------|
| Fetch pending errands | 1072-1080 | Query errands with `status = 'pending'` and `runner_id IS NULL` |
| Get runner location | 1005-1067 | GPS with retries → database fallback |
| Distance filtering | 1103-1121 | Filter errands within 500m |
| Query available runners | 1265-1281 | Fetch runners with presence filters |
| Distance score calculation | 1344 | `Math.max(0, 1 - (distanceMeters / 500))` |
| TF-IDF calculation | 1352 | `calculateTFIDFCosineSimilarity(...)` |
| Rating normalization | 1355 | `(runner.average_rating || 0) / 5` |
| Final score calculation | 1359 | `(distanceScore × 0.40) + (ratingScore × 0.35) + (tfidfScore × 0.25)` |
| Sorting | 1393-1396 | Sort by final score (desc), then distance (asc) |
| Initial assignment | 1422-1426 | `updateErrandNotification(errand.id, topRunner.id, ...)` |
| Timeout detection | 1439 | `if (notifiedAt && notifiedAt < sixtySecondsAgo)` |
| Reassignment | 1649-1654 | `updateErrandNotification(..., previousNotifiedRunnerId)` |

#### 2. `components/LocationService.ts`

**Function:** `calculateDistance()`
- **Lines:** 282-297
- **Purpose:** Haversine formula for distance calculation
- **Formula:**
```typescript
const R = 6371; // Earth's radius in kilometers
const dLat = this.deg2rad(lat2 - lat1);
const dLon = this.deg2rad(lon2 - lon1);
const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
return R * c; // Returns distance in kilometers
```

#### 3. `add_errand_notification_functions.sql`

**Function:** `update_errand_notification()`
- **Lines:** 5-38
- **Purpose:** Atomically updates `notified_runner_id`, `notified_at`, and `timeout_runner_ids`
- **Security:** `SECURITY DEFINER` (bypasses RLS)

**Function:** `clear_errand_notification()`
- **Lines:** 42-74
- **Purpose:** Clears notification fields and adds current runner to timeout list

#### 4. `app/buddycaller/errand_form.tsx` & `app/buddycaller/errand_form.web.tsx`

**Function:** `confirmErrand()`
- **Purpose:** Creates errand in database
- **Code:** `await supabase.from("errand").insert([payload])`

#### 5. `app/buddyrunner/view_errand.tsx` & `app/buddyrunner/view_errand_web.tsx`

**Function:** `accept()`
- **Purpose:** Runner accepts errand
- **Code:** `await supabase.from("errand").update({ status: "in_progress", runner_id: user.id, ... })`

---

## 3️⃣ TF-IDF Calculation (Step-by-Step)

### Text Source

**TF-IDF uses ONLY category strings — no free-text fields are used.**

#### For Errands

**Task Input (Query Document):**
- **Field:** `errand.category` (type: `string | null`)
- **Location:** Line 1209 in `app/buddyrunner/home.tsx`
- **Code:**
```typescript
const errandCategory = errand.category ? errand.category.trim() : null;
```
- **Usage:** Line 1351
```typescript
const errandCategories = [errandCategory.toLowerCase()];
const tfidfScore = calculateTFIDFCosineSimilarity(errandCategories, runnerHistory, ...);
```

**Runner History Input:**
- **Field:** `errand.category` from completed errands
- **Location:** Lines 1125-1156 (`getRunnerErrandCategoryHistory`)
- **Database Query:** Lines 1127-1131
```typescript
const { data, error } = await supabase
    .from("errand")
    .select("category")
    .eq("runner_id", runnerId)
    .eq("status", "completed");
```
- **Processing:** Lines 1145-1149
```typescript
data.forEach((completedErrand: any) => {
    if (!completedErrand.category) return;
    taskCategories.push([completedErrand.category.trim().toLowerCase()]);
});
```
- **Result:** Array of arrays: `[["groceries"], ["delivery"], ["groceries"]]` (each inner array represents one task)

#### For Commissions

**Task Input (Query Document):**
- **Field:** `commission.commission_type` (type: `string | null`, comma-separated)
- **Location:** Lines 1766-1768 in `app/buddyrunner/home.tsx`
- **Code:**
```typescript
const commissionTypes = commission.commission_type 
    ? commission.commission_type.split(",").map(t => t.trim().toLowerCase())
    : [];
```

**Runner History Input:**
- **Field:** `commission.commission_type` from completed commissions
- **Location:** Similar to errands, but queries `commission` table
- **Processing:** Splits comma-separated types into array

**Fields NOT Used in TF-IDF:**
- ❌ `errand.title` (fetched but not used)
- ❌ `errand.description` (not fetched)
- ❌ `errand.notes` (not fetched)
- ❌ `commission.title` (fetched but not used)
- ❌ `commission.description` (not fetched)

### Term Frequency (TF)

**Two TF Calculation Methods:**

#### Method 1: Token-Based TF (Legacy)

**File:** `app/buddyrunner/home.tsx`
**Function:** `calculateTF()` (Lines 644-648)

**Formula:**
```typescript
function calculateTF(term: string, document: string[]): number {
    if (document.length === 0) return 0;
    const termCount = document.filter(word => word === term).length;
    return termCount / document.length;  // Frequency of term in document
}
```

**Example:**
- Document: `["groceries", "groceries", "delivery"]`
- Term: `"groceries"`
- TF = 2 / 3 = 0.667

**Used For:**
- Task query document (errand/commission categories)
- Runner history (fallback when task data unavailable)

#### Method 2: Task-Based TF (Current)

**File:** `app/buddyrunner/home.tsx`
**Function:** `calculateTFWithTaskCount()` (Lines 655-662)

**Formula:**
```typescript
function calculateTFWithTaskCount(term: string, taskCategories: string[][], totalTasks: number): number {
    if (totalTasks === 0) return 0;
    // Count how many tasks contain this category
    const tasksWithCategory = taskCategories.filter(taskCats => 
        taskCats.some(cat => cat === term.toLowerCase())
    ).length;
    return tasksWithCategory / totalTasks;
}
```

**Example:**
- Task categories: `[["groceries"], ["delivery"], ["groceries"]]`
- Total tasks: 3
- Term: `"groceries"`
- Tasks with category: 2
- TF = 2 / 3 = 0.667

**Used For:**
- Runner history (when `runnerTaskCategories` and `runnerTotalTasks` are provided)

**Why Task-Based TF?**
- More accurate: Each completed task counts as 1, regardless of how many categories it has
- Prevents double-counting when a task has multiple categories

**Normalization:**
- Both methods normalize by document length (token-based) or total tasks (task-based)
- Result is always between 0 and 1

### Inverse Document Frequency (IDF)

**File:** `app/buddyrunner/home.tsx`
**Function:** `calculateIDFAdjusted()` (Lines 677-689)

**Formula:**
```typescript
function calculateIDFAdjusted(term: string, allDocuments: string[][]): number {
    const documentsContainingTerm = allDocuments.filter(doc => doc.includes(term)).length;
    if (documentsContainingTerm === 0) return 0;
    
    // If term appears in all documents, use a small positive IDF value instead of 0
    if (documentsContainingTerm === allDocuments.length) {
        return 0.1;  // Small epsilon to avoid zero IDF
    }
    
    return Math.log(allDocuments.length / documentsContainingTerm);
}
```

**Document Corpus:**
- **Definition:** Array of two documents: `[queryDoc, runnerDoc]`
- **Query Document:** Task categories (e.g., `["groceries"]`)
- **Runner Document:** Runner's completed task categories (e.g., `["groceries", "delivery", "groceries"]`)

**IDF Calculation:**
- **Standard:** `IDF(term) = log(total_documents / documents_containing_term)`
- **Adjusted:** If term appears in all documents, use `0.1` instead of `0` (to avoid zero IDF)

**Example:**
- Documents: `[["groceries"], ["groceries", "delivery", "groceries"]]`
- Term: `"groceries"`
- Documents containing term: 2
- Total documents: 2
- Since term appears in all documents: IDF = 0.1 (adjusted)

**Example 2:**
- Documents: `[["groceries"], ["delivery", "delivery"]]`
- Term: `"groceries"`
- Documents containing term: 1
- Total documents: 2
- IDF = log(2 / 1) = log(2) ≈ 0.693

**Limitation:**
- **Small Corpus:** Only 2 documents (query + runner history)
- **Impact:** IDF values are limited (log(2) ≈ 0.693 max, or 0.1 for common terms)
- **Why:** IDF is most effective with large document corpora (hundreds/thousands of documents)

### Final TF-IDF Vector

**File:** `app/buddyrunner/home.tsx`

**For Task (Query Document):**
- **Function:** `calculateTFIDFVectorAdjusted()` (Lines 694-705)
- **Code:**
```typescript
const queryVector = calculateTFIDFVectorAdjusted(queryDoc, allDocuments);
```

**For Runner (History Document):**
- **Function:** `calculateTFIDFVectorWithTaskCount()` (Lines 711-727) OR `calculateTFIDFVectorAdjusted()` (fallback)
- **Code (Lines 895-903):**
```typescript
let runnerVector: Map<string, number>;
if (runnerTaskCategories.length > 0 && runnerTotalTasks > 0) {
    // NEW: Use task-based TF calculation
    runnerVector = calculateTFIDFVectorWithTaskCount(runnerTaskCategories, runnerTotalTasks, allDocuments);
} else {
    // OLD: Use token-based TF calculation (backward compatibility)
    runnerVector = calculateTFIDFVectorAdjusted(runnerDoc, allDocuments);
}
```

**Vector Structure:**
- **Type:** `Map<string, number>`
- **Keys:** Category terms (lowercase, trimmed)
- **Values:** TF-IDF weights (TF × IDF)

**Example Vector:**
```typescript
// Query vector for "groceries"
{
    "groceries": 1.0 × 0.1 = 0.1  // TF=1.0 (only term), IDF=0.1 (appears in both docs)
}

// Runner vector for history ["groceries", "delivery", "groceries"]
{
    "groceries": 0.667 × 0.1 = 0.0667  // TF=0.667 (2/3), IDF=0.1
    "delivery": 0.333 × 0.693 = 0.231  // TF=0.333 (1/3), IDF=log(2/1)=0.693
}
```

**Caching:**
- ❌ **NOT cached** - Vectors are recalculated on every ranking
- **Reason:** Runner history may change (new completed tasks), and task categories vary per errand

**Storage:**
- **In-memory only** - Vectors exist only during ranking calculation
- **Not persisted** - No database storage of TF-IDF vectors

---

## 4️⃣ Cosine Similarity Calculation

### Inputs to Cosine Similarity

**Function:** `cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number`

**File:** `app/buddyrunner/home.tsx`
**Lines:** 748-767

**Inputs:**
1. **`vector1`:** Task TF-IDF vector (query document)
2. **`vector2`:** Runner TF-IDF vector (runner history document)

**Which Vectors Are Compared?**
- **Errand vs Runner:** ✅ YES
- **Commission vs Runner:** ✅ YES
- **Errand vs Commission:** ❌ NO (not used)

### Formula Implementation

**Code:**
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
    
    return dotProduct / denominator;
}
```

**Mathematical Formula:**
```
cosine_similarity(v1, v2) = (v1 · v2) / (||v1|| × ||v2||)
```

**Where:**
- `v1 · v2` = dot product = Σ(v1[i] × v2[i])
- `||v1||` = magnitude = √(Σ(v1[i]²))
- `||v2||` = magnitude = √(Σ(v2[i]²))

**Step-by-Step Calculation:**

1. **Get All Terms:** Union of keys from both vectors
2. **Calculate Dot Product:** Sum of (val1 × val2) for all terms
3. **Calculate Magnitudes:** Square root of sum of squares for each vector
4. **Calculate Similarity:** Dot product / (magnitude1 × magnitude2)

**Example:**
```typescript
// Query vector: { "groceries": 0.1 }
// Runner vector: { "groceries": 0.0667, "delivery": 0.231 }

// All terms: ["groceries", "delivery"]

// Dot product:
//   "groceries": 0.1 × 0.0667 = 0.00667
//   "delivery": 0 × 0.231 = 0
//   Total: 0.00667

// Magnitude1 (query):
//   √(0.1²) = √0.01 = 0.1

// Magnitude2 (runner):
//   √(0.0667² + 0.231²) = √(0.00445 + 0.0534) = √0.05785 ≈ 0.2405

// Cosine similarity:
//   0.00667 / (0.1 × 0.2405) = 0.00667 / 0.02405 ≈ 0.277
```

### Safeguards

**Zero Vector Handling:**
- **Line 764:** `if (denominator === 0) return 0;`
- **Prevents:** Division by zero when one or both vectors are empty
- **Returns:** 0 (no similarity)

**NaN Handling:**
- **Line 932:** `const finalScore = isNaN(similarity) ? 0 : similarity;`
- **Prevents:** NaN values from propagating
- **Returns:** 0 if similarity is NaN

### Output Interpretation

**Range:** [0, 1]
- **0:** No similarity (orthogonal vectors, no common terms)
- **1:** Perfect similarity (vectors are proportional)

**What Does a Higher Score Mean?**
- **Higher score = More similar** category history to the task
- **Example:**
  - Score = 0.9: Runner has done many tasks in this category
  - Score = 0.1: Runner has done few/no tasks in this category

**Minimum Threshold:**
- ❌ **NO minimum threshold** - All scores (including 0) are used in final ranking
- **Reason:** Even low similarity contributes to the final score (25% weight)

**Usage in Final Score:**
- **Line 1359:** `const finalScore = (distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25);`
- **Weight:** 25% of final score
- **Range:** 0.0 to 0.25 (when multiplied by weight)

### Code Location

**Exact File and Function:**
- **File:** `app/buddyrunner/home.tsx`
- **Function:** `cosineSimilarity()` (Lines 748-767)
- **Called From:** `calculateTFIDFCosineSimilarity()` (Line 929)

**Integration:**
```typescript
// Line 929
const similarity = cosineSimilarity(queryVector, runnerVector);
```

---

## 5️⃣ Runner Ranking & Queue Construction

### How Similarity Scores Are Combined

**Final Score Formula:**
```
FinalScore = (DistanceScore × 0.40) + (RatingScore × 0.35) + (TF-IDF Score × 0.25)
```

**File:** `app/buddyrunner/home.tsx`
**Line:** 1359 (for errands), 1582 (for errands timeout), 2225 (for commissions), 2470 (for commissions timeout)

**Component Breakdown:**

#### 1. Distance Score (40% weight)

**Calculation:**
- **Line 1344:** `const distanceScore = Math.max(0, 1 - (distanceMeters / 500));`
- **Range:** [0, 1]
- **Higher = Closer** (0m = 1.0, 500m = 0.0, >500m = excluded)

**Filtering:**
- **Line 1334:** `if (distanceMeters > 500) continue;` (excluded before scoring)

**Weight:** 0.40 (40%)

#### 2. Rating Score (35% weight)

**Calculation:**
- **Line 1355:** `const ratingScore = (runner.average_rating || 0) / 5;`
- **Range:** [0, 1]
- **Higher = Better rating** (5.0 = 1.0, 0.0 = 0.0)

**Source:**
- **Database Field:** `users.average_rating` (0-5 scale)

**Weight:** 0.35 (35%)

#### 3. TF-IDF Score (25% weight)

**Calculation:**
- **Line 1352:** `const tfidfScore = calculateTFIDFCosineSimilarity(...);`
- **Range:** [0, 1]
- **Higher = More similar** category history

**Weight:** 0.25 (25%)

### Availability

**Filtered Before Ranking:**
- **Line 1269:** `.eq("is_available", true)`
- **Only available runners** are considered

### Distance

**Filtered Before Ranking:**
- **Line 1334:** `if (distanceMeters > 500) continue;`
- **Only runners within 500m** are ranked

**Used in Final Score:**
- **Distance Score:** 40% weight (normalized 0-1)

### Status (Active/Inactive)

**Not Used in Ranking:**
- **Availability:** Filtered before ranking (`.eq("is_available", true)`)
- **Status field:** Not used in scoring

### Last Seen / Presence Logic

**Presence Filters (Applied Before Ranking):**

**File:** `app/buddyrunner/home.tsx`
**Lines:** 1244-1271

**Filters:**
1. **App Presence:** `last_seen_at >= 2 minutes ago`
   - **Line 1270:** `.gte("last_seen_at", twoMinutesAgo.toISOString())`
2. **GPS Presence:** `location_updated_at >= 90 seconds ago OR NULL`
   - **Line 1271:** `.or(`location_updated_at.gte.${presenceThreshold.toISOString()},location_updated_at.is.null`)`

**Purpose:** Ensure runners are actively using the app and have recent location data

**Not Used in Scoring:**
- Presence is a **filter**, not a score component
- Runners who fail presence checks are excluded entirely

### How the Final Queue Order is Produced

**Sorting Logic:**

**File:** `app/buddyrunner/home.tsx`
**Lines:** 1393-1396

**Code:**
```typescript
eligibleRunners.sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;  // Primary: Final score (descending)
    return a.distance - b.distance;  // Tiebreaker: Distance (ascending)
});
```

**Sort Order:**
1. **Primary:** Final Score (descending) - Higher score wins
2. **Secondary:** Distance (ascending) - Closer runner wins if scores are equal

**Tie-Breaking Rules:**
- If `finalScore` differs: Higher score wins
- If `finalScore` is equal: Closer runner wins (lower distance)

**Example:**
```
Runner A: finalScore = 0.85, distance = 200m
Runner B: finalScore = 0.85, distance = 150m
Result: Runner B wins (same score, but closer)
```

### Where the Queue is Stored

**Storage Location:**
- **In-memory only** - Queue exists only during ranking calculation
- **Not persisted** - No database storage of queue order

**Recomputation:**
- **Per request** - Queue is recalculated every time `shouldShowErrand()` is called
- **Trigger:** When any runner fetches available tasks

**Queue Structure:**
- **Type:** `Array<{ id, firstName, lastName, distance, rating, finalScore, distanceScore, ratingScore, tfidfScore }>`
- **Location:** `eligibleRunners` variable (Line 1310)
- **Lifetime:** Exists only during `shouldShowErrand()` execution

**Top Runner Selection:**
- **Line 1412:** `const topRunner = eligibleRunners[0];`
- **After sorting:** First element is the top-ranked runner

**Database State:**
- **Only top runner is stored:** `notified_runner_id = topRunner.id`
- **Queue order is NOT stored** - Must be recalculated for timeout scenarios

---

## 6️⃣ Timeout, Ignore, and Fallback Logic

### What Happens When Top Runner Ignores/Closes App/Has Slow Internet

**All three scenarios result in the same outcome: Timeout**

**Timeout Detection:**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1439-1445
- **Code:**
```typescript
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Timeout detected - find next runner
}
```

**Timeout Window:** 60 seconds

**What Happens:**
1. **Timeout Detected:** When any runner fetches available tasks and `notified_at < 60 seconds ago`
2. **Previous Runner Added to Timeout List:** Previous `notified_runner_id` is added to `timeout_runner_ids` array
3. **Next Runner Selected:** Re-ranking excludes previous runner and all timeout runners
4. **Reassignment:** New runner is assigned via `updateErrandNotification()`

### Time-Based Rules

#### 60-Second Ignore Window

**File:** `app/buddyrunner/home.tsx`
**Lines:** 1219-1222

**Code:**
```typescript
const now = new Date();
const notifiedAt = errand.notified_at ? new Date(errand.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Timeout detected
}
```

**Purpose:** Give the assigned runner 60 seconds to accept before moving to the next runner

**Enforcement:**
- **On-demand check** - Only checked when a runner fetches available tasks
- **Not background job** - No cron or scheduled task

#### 2-3 Minute Presence Threshold

**File:** `app/buddyrunner/home.tsx`
**Lines:** 1244-1245

**Code:**
```typescript
const presenceThreshold = new Date(now.getTime() - 90000);  // 90 seconds for GPS
const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);  // 2 minutes for app presence
```

**Filters:**
1. **App Presence:** `last_seen_at >= 2 minutes ago` (Line 1270)
2. **GPS Presence:** `location_updated_at >= 90 seconds ago OR NULL` (Line 1271)

**Purpose:** Ensure runners are actively using the app and have recent location data

**Applied:** Before ranking (filters available runners)

### Cron or Background Checks

**❌ NO cron jobs or background checks**

**Timeout Detection:**
- **On-demand only** - Checked when `shouldShowErrand()` executes
- **Trigger:** Runner fetches available tasks

**Why No Background Jobs?**
- **Client-side system** - All logic runs in the React Native/Web app
- **No server-side cron** - No backend services for timeout monitoring
- **Realtime-driven** - Supabase realtime subscriptions trigger refetches when database changes

### Transition to Next Runner

**What Triggers It:**
1. **Timeout Detected:** `notified_at < 60 seconds ago`
2. **Any Runner Fetches Tasks:** `useAvailableErrands()` → `shouldShowErrand()` → timeout check

**Is It Immediate or Delayed?**
- **Immediate** - As soon as timeout is detected and a runner fetches tasks
- **No fixed delay** - Depends on when the next runner opens the app or refreshes

**Which Code Handles Transition:**

**File:** `app/buddyrunner/home.tsx`
**Lines:** 1438-1664

**Process:**
1. **Detect Timeout** (Line 1439)
2. **Query Next Runners** (Lines 1487-1503) - Excludes previous runner and timeout runners
3. **Re-rank Remaining Runners** (Lines 1531-1595) - Same ranking algorithm
4. **Assign to Next Runner** (Lines 1649-1654) - `updateErrandNotification(..., previousNotifiedRunnerId)`

**Database RPC:**
- **File:** `add_errand_notification_functions.sql`
- **Function:** `update_errand_notification()` (Lines 5-38)
- **Logic:** Adds previous runner to `timeout_runner_ids` array (Lines 24-29)

**Realtime Propagation:**
- **Supabase Realtime:** When `update_errand_notification()` updates the database, realtime fires
- **All Subscribed Runners:** Receive update and refetch available tasks
- **Next Runner:** Sees the errand if they're the new `notified_runner_id`

---

## 7️⃣ Why These Calculations Are Used (System Design Rationale)

### Why TF-IDF Instead of Keyword Matching

**Benefits:**
1. **Semantic Similarity:** TF-IDF captures how "important" a category is to a runner's history, not just presence/absence
2. **Frequency Awareness:** Runners who frequently do "groceries" get higher scores than those who did it once
3. **Rare Category Boost:** IDF gives higher weight to rare categories (though limited by small corpus)
4. **Scalability:** Can be extended to include more text fields (title, description) in the future

**Trade-offs:**
- **Complexity:** More complex than simple keyword matching
- **Small Corpus Limitation:** IDF is less effective with only 2 documents (query + runner history)
- **Performance:** Requires fetching runner history and calculating vectors for each runner

**Performance Considerations:**
- **Sequential Queries:** TF-IDF history queries run sequentially (one per runner)
- **Bottleneck:** Can add 1-4 seconds of delay when ranking many runners
- **Optimization Opportunity:** Could parallelize queries or cache runner vectors

**Scalability Implications:**
- **Current:** Works well for small-medium runner pools (< 100 runners)
- **Limitation:** Sequential queries become slow with large runner pools
- **Future:** Could move to server-side ranking or edge functions for better performance

### Why Cosine Similarity Instead of Simple Scoring

**Benefits:**
1. **Normalization:** Cosine similarity normalizes by vector magnitude, preventing bias toward runners with longer histories
2. **Angle-Based:** Measures similarity in "direction" of category preferences, not just overlap
3. **Range [0,1]:** Bounded output makes it easy to combine with other scores
4. **Standard Metric:** Well-established metric in information retrieval and recommendation systems

**Trade-offs:**
- **Complexity:** More complex than simple overlap counting
- **Computational Cost:** Requires dot product and magnitude calculations

**Performance Considerations:**
- **Efficient:** O(n) where n is the number of unique terms
- **In-Memory:** Fast calculation, no database queries

**Scalability Implications:**
- **Scales Well:** Performance doesn't degrade significantly with more categories
- **Limitation:** Small corpus (2 documents) limits IDF effectiveness

### Why Queueing Instead of Broadcasting to All Runners

**Benefits:**
1. **Reduced Notification Spam:** Runners only see tasks they're likely to accept
2. **Better Match Quality:** Top-ranked runner is most likely to accept (based on distance, rating, experience)
3. **Sequential Assignment:** One runner at a time prevents conflicts (multiple runners accepting same task)
4. **Timeout Mechanism:** Automatic fallback ensures tasks don't get stuck if top runner ignores

**Trade-offs:**
- **Delay:** Top runner has 60 seconds before next runner is considered
- **Single Point of Failure:** If top runner is offline/unavailable, must wait for timeout
- **No Simultaneous Offers:** Can't offer to multiple runners at once

**Performance Considerations:**
- **Efficient:** Only one runner is notified at a time
- **Reduced Database Load:** Fewer notification updates than broadcasting

**Scalability Implications:**
- **Current:** Works well for small-medium task volumes
- **Limitation:** Sequential assignment can create delays with high task volumes
- **Future:** Could implement "batch assignment" (offer to top 3 runners simultaneously)

---

## 8️⃣ Validation & Testing

### How Developers Can Verify Queueing Logic is Working

#### Console Logging

**Structured Logging:** The system includes extensive console logging for debugging

**Key Log Points:**

1. **Queue Steps:**
   - **File:** `app/buddyrunner/home.tsx`
   - **Lines:** 1229-1233, 1288-1301, 1309, 1374, 1382-1390, 1398-1410, 1416-1419
   - **Format:** `[QUEUE] STEP X — Description`
   - **Example:**
   ```
   [QUEUE] STEP 1 — Task detected
   [QUEUE] STEP 2 — Availability check
   [QUEUE] STEP 3 — Distance filtering (≤ 500m)
   [QUEUE] STEP 4 — Score calculation
   [QUEUE] STEP 5 — Runner ranking
   [QUEUE] STEP 6 — Assignment
   ```

2. **TF-IDF Calculation:**
   - **File:** `app/buddyrunner/home.tsx`
   - **Lines:** 774-937
   - **Format:** `[TFIDF] Description`
   - **Example:**
   ```
   [TFIDF] ===== TF-IDF CALCULATION START =====
   [TFIDF] Task categories: groceries
   [TFIDF] Runner history categories: groceries (2 tasks), delivery (1 task)
   [TFIDF] Term Frequency (Runner): groceries: 2 / 3 = 0.6667
   [TFIDF] Inverse Document Frequency: groceries: 0.1000
   [TFIDF] TF-IDF weights (Runner): groceries: 0.6667 × 0.1000 = 0.0667
   [TFIDF] Cosine similarity calculation: Dot product: 0.0067, Task magnitude: 0.1000, Runner magnitude: 0.2405
   [TFIDF] Final cosine similarity (tfidfScore): → 0.277
   [TFIDF] ===== TF-IDF CALCULATION END =====
   ```

3. **Runner Ranking:**
   - **File:** `app/buddyrunner/home.tsx`
   - **Lines:** 1383-1390, 1400-1410
   - **Format:** Per-runner breakdown
   - **Example:**
   ```
   Runner: John Doe
     distance = 150.00m → distanceScore = 0.7000
     rating = 4.50 → ratingScore = 0.9000
     tfidfScore = 0.2770
     FinalScore = 0.7000
   ```

4. **Timeout Detection:**
   - **File:** `app/buddyrunner/home.tsx`
   - **Lines:** 1440-1445
   - **Format:** `[QUEUE] STEP 7 — Timeout detected`
   - **Example:**
   ```
   [QUEUE] STEP 7 — Timeout detected
   Runner (id: abc12345) did not accept within 60s
   Re-running queueing for remaining runners
   ```

#### Database Inspection

**Key Fields to Monitor:**

1. **Errand Table:**
   - `notified_runner_id` - Currently assigned runner
   - `notified_at` - When runner was assigned
   - `timeout_runner_ids` - Array of runners who timed out
   - `runner_id` - Runner who accepted (NULL if pending)

2. **Users Table:**
   - `is_available` - Runner availability status
   - `last_seen_at` - Last app activity
   - `location_updated_at` - Last GPS update
   - `average_rating` - Runner rating (0-5)

**SQL Queries for Verification:**

```sql
-- Check errand assignment status
SELECT id, category, status, notified_runner_id, notified_at, timeout_runner_ids, runner_id
FROM errand
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Check runner availability and presence
SELECT id, first_name, last_name, is_available, last_seen_at, location_updated_at, average_rating
FROM users
WHERE role = 'BuddyRunner'
ORDER BY is_available DESC, average_rating DESC;
```

### Which Logs Confirm TF-IDF Vectors

**TF-IDF Logging:**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 774-937

**Logs Include:**
1. **Task Categories:** Input categories for the errand/commission
2. **Runner History:** Completed task categories with task counts
3. **Term Frequency:** TF calculation for each term
4. **Inverse Document Frequency:** IDF calculation for each term
5. **TF-IDF Weights:** Final TF-IDF values for each term
6. **Cosine Similarity:** Dot product, magnitudes, and final similarity score

**Example Log Output:**
```
[TFIDF] ===== TF-IDF CALCULATION START =====
[TFIDF] Task categories:
[TFIDF] - groceries
[TFIDF] Runner history categories:
[TFIDF] - groceries (2 tasks)
[TFIDF] - delivery (1 task)
[TFIDF] Total completed tasks: 3
[TFIDF] Term Frequency (Runner):
[TFIDF] - groceries: 2 / 3 = 0.6667
[TFIDF] - delivery: 1 / 3 = 0.3333
[TFIDF] Inverse Document Frequency:
[TFIDF] - groceries: 0.1000
[TFIDF] - delivery: 0.6931
[TFIDF] TF-IDF weights (Runner):
[TFIDF] - groceries: 0.6667 × 0.1000 = 0.0667
[TFIDF] - delivery: 0.3333 × 0.6931 = 0.2310
[TFIDF] TF-IDF weights (Task):
[TFIDF] - groceries: 1 / 1 × 0.1000 = 0.1000
[TFIDF] Cosine similarity calculation:
[TFIDF] - Dot product: 0.0067
[TFIDF] - Task magnitude: 0.1000
[TFIDF] - Runner magnitude: 0.2405
[TFIDF] Final cosine similarity (tfidfScore):
[TFIDF] → 0.277
[TFIDF] ===== TF-IDF CALCULATION END =====
```

### Which Logs Confirm Similarity Scores

**Similarity Score Logging:**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1383-1390, 1400-1410

**Logs Include:**
1. **Per-Runner Breakdown:**
   - Distance and distance score
   - Rating and rating score
   - TF-IDF score
   - Final score

**Example Log Output:**
```
[QUEUE] STEP 4 — Score calculation
Runner: John Doe
  distance = 150.00m → distanceScore = 0.7000
  rating = 4.50 → ratingScore = 0.9000
  tfidfScore = 0.2770
  FinalScore = 0.7000

[QUEUE] STEP 5 — Runner ranking

Runner 1: John Doe (abc12345)
distanceScore = 0.70
ratingScore   = 0.90
tfidfScore    = 0.28
FinalScore    = 0.70
```

### Which Logs Confirm Queue Order

**Queue Order Logging:**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1398-1410, 1623-1635

**Logs Include:**
1. **Ranked List:** All eligible runners sorted by final score
2. **Rank Number:** Position in queue (1 = top)
3. **All Score Components:** Distance, rating, TF-IDF, final score

**Example Log Output:**
```
[QUEUE] STEP 5 — Runner ranking

Runner 1: John Doe (abc12345)
distanceScore = 0.70
ratingScore   = 0.90
tfidfScore    = 0.28
FinalScore    = 0.70

Runner 2: Jane Smith (def67890)
distanceScore = 0.60
ratingScore   = 0.80
tfidfScore    = 0.15
FinalScore    = 0.60

[QUEUE] STEP 6 — Assignment
Assigned runner: John Doe
Timeout window: 60 seconds
```

### What Test Cases Should Be Run

#### Test Case 1: Same Category Errands

**Scenario:** Runner has completed many errands in "Groceries" category

**Setup:**
1. Create runner with 10 completed "Groceries" errands
2. Post new "Groceries" errand
3. Verify runner is ranked highly

**Expected:**
- Runner has high TF-IDF score (≈ 0.8-1.0)
- Runner appears in top 3 of queue
- Runner is assigned if within 500m

**Verification:**
- Check console logs for TF-IDF score
- Check `notified_runner_id` in database
- Verify runner sees errand in available list

#### Test Case 2: Different Category Errands

**Scenario:** Runner has completed many "Delivery" errands, but new errand is "Groceries"

**Setup:**
1. Create runner with 10 completed "Delivery" errands
2. Post new "Groceries" errand
3. Verify runner has low TF-IDF score

**Expected:**
- Runner has low TF-IDF score (≈ 0.0-0.2)
- Runner may still rank high if distance/rating are excellent
- Runner is assigned if final score is highest

**Verification:**
- Check console logs for TF-IDF score (should be low)
- Check final score calculation
- Verify ranking order

#### Test Case 3: No Matching Runners

**Scenario:** No runners within 500m or all runners have timed out

**Setup:**
1. Post errand in remote location (no runners within 500m)
2. OR: All eligible runners have timed out (all in `timeout_runner_ids`)

**Expected:**
- No runners assigned (`notified_runner_id = NULL`)
- Errand remains in pending status
- No runners see errand in available list

**Verification:**
- Check `notified_runner_id` is NULL
- Check console logs: "No eligible runners within 500m found"
- Verify no runners see errand

#### Test Case 4: Timeout and Reassignment

**Scenario:** Top runner ignores errand for 60+ seconds

**Setup:**
1. Assign errand to runner A
2. Wait 60+ seconds
3. Have runner B fetch available tasks

**Expected:**
- Runner A is added to `timeout_runner_ids`
- Runner B (next in queue) is assigned
- `notified_at` is updated to current time

**Verification:**
- Check `timeout_runner_ids` contains runner A's ID
- Check `notified_runner_id` is runner B's ID
- Check console logs: "[QUEUE] STEP 7 — Timeout detected"

#### Test Case 5: Multiple Timeouts

**Scenario:** Multiple runners time out sequentially

**Setup:**
1. Assign to runner A → timeout
2. Assign to runner B → timeout
3. Assign to runner C → timeout

**Expected:**
- `timeout_runner_ids` contains [A, B, C]
- Next runner (D) is assigned
- All timeout runners are excluded from future ranking

**Verification:**
- Check `timeout_runner_ids` array length
- Check all timeout runners are excluded in query
- Verify runner D is assigned

#### Test Case 6: Presence Filtering

**Scenario:** Runner hasn't been active recently

**Setup:**
1. Set runner's `last_seen_at` to 3 minutes ago
2. Set runner's `location_updated_at` to 2 minutes ago
3. Post errand

**Expected:**
- Runner is excluded from ranking (fails presence filter)
- Runner doesn't appear in available runners query

**Verification:**
- Check console logs: "Runners after presence filter: X"
- Verify runner is not in `eligibleRunners` array
- Check database: runner not assigned

---

## Summary

The runner queueing system is a **sophisticated client-side ranking system** that:

1. **Triggers on-demand** when runners fetch available tasks (not when tasks are created)
2. **Uses TF-IDF + Cosine Similarity** to match tasks with runners based on category history
3. **Combines multiple factors** (distance 40%, rating 35%, TF-IDF 25%) for final ranking
4. **Implements timeout mechanism** (60 seconds) with automatic fallback to next runner
5. **Filters by presence** (2 min app activity, 90 sec GPS) before ranking
6. **Stores only top runner** in database (`notified_runner_id`), recalculates queue on timeout

**Key Limitations:**
- Small TF-IDF corpus (only 2 documents) limits IDF effectiveness
- Sequential TF-IDF queries can be slow with many runners
- No background timeout monitoring (depends on runner activity)

**Key Strengths:**
- Mathematically sound TF-IDF and cosine similarity implementation
- Comprehensive logging for debugging
- Automatic timeout handling with fallback
- Presence filtering ensures active runners only
