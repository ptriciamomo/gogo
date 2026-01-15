# TF Calculation Refactor Summary

## ✅ What Changed

### Core Change
**Term Frequency (TF) calculation now uses task count instead of category token count as the denominator.**

**Before:**
```
TF(term) = count(term in category_array) / category_array.length
```
Example: If runner has `["groceries", "groceries", "delivery"]`, TF("groceries") = 2/3 = 0.667

**After:**
```
TF(term) = (number of completed tasks in this category) / (total number of completed tasks)
```
Example: If runner has 3 tasks (2 with "groceries", 1 with "delivery"), TF("groceries") = 2/3 = 0.667

**Key Difference:** Each completed task counts as 1, even if it has multiple categories.

### Files Modified

1. **`app/buddyrunner/home.tsx`**
   - **New function:** `calculateTFWithTaskCount()` (Lines 669-681)
   - **New function:** `calculateTFIDFVectorWithTaskCount()` (Lines 720-735)
   - **Modified:** `getRunnerErrandCategoryHistory()` - now returns `{ taskCategories: string[][], totalTasks: number }` (Lines 1062-1090)
   - **Modified:** `getRunnerCategoryHistory()` - now returns `{ taskCategories: string[][], totalTasks: number }` (Lines 1830-1860)
   - **Modified:** `calculateTFIDFCosineSimilarity()` - accepts task data and uses task-based TF (Lines 769-797)
   - **Updated:** All 4 call sites to pass task categories and total tasks (Lines 1331-1332, 1516-1520, 2077-2080, 2279-2282)
   - **Updated:** Console logging to show task counts instead of token counts (Lines 819-860)

### Changes by Function

#### `getRunnerErrandCategoryHistory()`
- **Before:** Returned `string[]` (flat array of category strings)
- **After:** Returns `{ taskCategories: string[][], totalTasks: number }`
  - `taskCategories`: Array of arrays, each inner array represents one task's categories
  - `totalTasks`: Total number of completed errands

#### `getRunnerCategoryHistory()`
- **Before:** Returned `string[]` (flat array of category strings)
- **After:** Returns `{ taskCategories: string[][], totalTasks: number }`
  - `taskCategories`: Array of arrays, each inner array represents one task's categories (split by comma for commissions)
  - `totalTasks`: Total number of completed commissions

#### `calculateTFIDFCosineSimilarity()`
- **Before:** `(commissionCategories: string[], runnerHistory: string[]): number`
- **After:** `(commissionCategories: string[], runnerHistory: string[], runnerTaskCategories: string[][] = [], runnerTotalTasks: number = 0): number`
  - Added optional parameters for task-based TF calculation
  - Falls back to token-based TF if task data not provided (backward compatibility)
  - Uses `calculateTFWithTaskCount()` when task data is available

#### Console Logging
- **Updated:** Shows task counts instead of token counts
- **Format:** `TF(category): X / Y = Z` where X = tasks with category, Y = total tasks
- **Added:** Logs total completed tasks for runner

---

## ✅ Why It Is Safe

### 1. Backward Compatibility
- **Function signature:** Added optional parameters with defaults
- **Fallback logic:** If task data not provided, uses old token-based calculation
- **No breaking changes:** Existing code would still work (though all call sites were updated)

### 2. No Logic Changes Outside TF
- **IDF calculation:** Unchanged (still uses pairwise document frequency)
- **Cosine similarity:** Unchanged (standard formula)
- **Distance logic:** Unchanged (still 500m limit)
- **Rating logic:** Unchanged (still normalized 0-1)
- **Queueing flow:** Unchanged (fetch → rank → assign → timeout → reassign)
- **Assignment logic:** Unchanged (still uses FinalScore with same weights)
- **Timeout logic:** Unchanged (still 60 seconds)

### 3. Data Integrity
- **Task counting:** Each completed task counted exactly once
- **Category extraction:** Categories still derived exactly as before (lowercase, trim)
- **Multi-category tasks:** Handled correctly (one task can contribute multiple categories to TF calculation)

### 4. Mathematical Correctness
- **TF formula:** Mathematically valid (tasks with category / total tasks)
- **TF-IDF:** Still TF × IDF (only TF calculation changed)
- **Cosine similarity:** Unchanged (standard formula)

### 5. Scope Limitations
- **Only TF changed:** All other calculations remain identical
- **Only runner-side:** No caller-side changes
- **Only queueing logic:** No UI, database, or other system changes

---

## ✅ Confirmation: Behavior Outside TF Is Untouched

### Unchanged Components

1. **Distance Logic**
   - ✅ Still uses 500m strict limit
   - ✅ Still uses Haversine formula
   - ✅ Still filters before ranking

2. **Rating Logic**
   - ✅ Still normalized: `rating / 5`
   - ✅ Still weight: 0.35 in FinalScore

3. **IDF Calculation**
   - ✅ Still uses `calculateIDFAdjusted()`
   - ✅ Still pairwise (2 documents: query + runner history)
   - ✅ Still uses adjusted IDF (0.1 for terms in all documents)

4. **Cosine Similarity**
   - ✅ Still uses standard formula: `dotProduct / (magnitude1 × magnitude2)`
   - ✅ Still operates on TF-IDF vectors
   - ✅ Still returns [0, 1] range

5. **FinalScore Calculation**
   - ✅ Still: `(distanceScore * 0.40) + (ratingScore * 0.35) + (tfidfScore * 0.25)`
   - ✅ Weights unchanged
   - ✅ Formula unchanged

6. **Queueing Flow**
   - ✅ Still: fetch → filter → rank → assign → timeout → reassign
   - ✅ Still uses same RPC functions
   - ✅ Still uses same database queries (only return structure changed)

7. **Assignment Logic**
   - ✅ Still assigns to top-ranked runner
   - ✅ Still uses `notified_runner_id`
   - ✅ Still uses timeout mechanism

8. **Availability Logic**
   - ✅ Still filters by `is_available = true`
   - ✅ Still excludes timeout runners
   - ✅ Still excludes declined runners (commissions)

---

## 📊 Impact Analysis

### What This Change Affects

**TF Calculation Only:**
- Runner TF values will change (now based on task count, not token count)
- TF-IDF scores will change (because TF changed)
- FinalScore will change (because tfidfScore changed)
- Runner ranking may change (because FinalScore changed)

**What This Does NOT Affect:**
- Distance filtering (still 500m)
- Rating calculation (still normalized 0-1)
- IDF calculation (still pairwise)
- Cosine similarity (still standard formula)
- Queueing flow (still same steps)
- Assignment logic (still top-ranked runner)

### Example Impact

**Scenario:** Runner has 3 completed tasks:
- Task 1: "groceries"
- Task 2: "groceries"  
- Task 3: "delivery"

**Before (token-based):**
- Category array: `["groceries", "groceries", "delivery"]`
- TF("groceries") = 2/3 = 0.667
- TF("delivery") = 1/3 = 0.333

**After (task-based):**
- Task categories: `[["groceries"], ["groceries"], ["delivery"]]`
- Total tasks: 3
- TF("groceries") = 2/3 = 0.667 (same in this case)
- TF("delivery") = 1/3 = 0.333 (same in this case)

**Scenario with multi-category task:**
- Task 1: "groceries"
- Task 2: "logos,posters" (commission with 2 categories)
- Task 3: "logos"

**Before (token-based):**
- Category array: `["groceries", "logos", "posters", "logos"]`
- TF("logos") = 2/4 = 0.5
- TF("posters") = 1/4 = 0.25
- TF("groceries") = 1/4 = 0.25

**After (task-based):**
- Task categories: `[["groceries"], ["logos", "posters"], ["logos"]]`
- Total tasks: 3
- TF("logos") = 2/3 = 0.667 (different - higher)
- TF("posters") = 1/3 = 0.333 (different - higher)
- TF("groceries") = 1/3 = 0.333 (different - higher)

**Key Difference:** Multi-category tasks no longer inflate the denominator, making TF values more accurate.

---

## ✅ Validation

### Code Quality
- ✅ No TypeScript errors
- ✅ No linter errors
- ✅ All call sites updated
- ✅ Backward compatibility maintained

### Functional Correctness
- ✅ TF calculation uses task count
- ✅ Each task counts as 1
- ✅ Multi-category tasks handled correctly
- ✅ IDF calculation unchanged
- ✅ Cosine similarity unchanged
- ✅ Logging updated to reflect new TF meaning

### Scope Adherence
- ✅ Only TF calculation changed
- ✅ No distance logic changes
- ✅ No rating logic changes
- ✅ No queueing flow changes
- ✅ No assignment logic changes
- ✅ No UI changes
- ✅ No database schema changes

---

## 📝 Summary

**What Changed:**
- TF calculation now uses task count (not category token count) as denominator
- History functions now return task structure instead of flat array
- Console logs updated to show task counts

**Why It's Safe:**
- Backward compatible (optional parameters with defaults)
- Only TF calculation changed (IDF, cosine similarity, distance, rating all unchanged)
- No breaking changes to queueing flow or assignment logic

**Confirmation:**
- All behavior outside TF calculation is untouched
- Distance, rating, IDF, cosine similarity, queueing flow, and assignment logic all remain identical
