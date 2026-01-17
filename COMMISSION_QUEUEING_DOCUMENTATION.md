# Commission Runner Assignment & Queueing Flow Documentation

## Summary

**Commissions DO use a queueing system** that is **nearly identical** to the errand queueing system. They use the same TF-IDF + Cosine Similarity ranking algorithm, same scoring weights, same timeout mechanism, and same queue progression logic.

---

## Queueing System: ✅ YES

Commissions use the same queueing system as errands with identical logic flow.

---

## Runner Ranking: ✅ YES

Commissions use the same runner ranking algorithm as errands.

---

## TF-IDF or Category-Based Scoring: ✅ YES

Commissions use **TF-IDF + Cosine Similarity** scoring, identical to errands.

---

## File Locations

### Main Queueing Function

**File:** `app/buddyrunner/home.tsx`  
**Function:** `useAvailableCommissions()`  
**Lines:** 1860-2826

### Ranking Logic Function

**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowCommission()`  
**Lines:** 2124-2651

### Category History Helper

**File:** `app/buddyrunner/home.tsx`  
**Function:** `getRunnerCategoryHistory()` (inside `useAvailableCommissions`)  
**Lines:** 2086-2121

### TF-IDF Calculation

**File:** `app/buddyrunner/home.tsx`  
**Function:** `calculateTFIDFCosineSimilarity()` (shared with errands)  
**Lines:** 830-1005  
**Called at:** Line 2289 (initial assignment), Line 2534 (timeout reassignment)

### Database RPC Functions

**File:** Database (SQL functions, not in codebase)  
**Function:** `update_commission_notification()`  
**Called at:** Line 2358 (initial assignment), Line 2616 (timeout reassignment)

**File:** Database (SQL functions, not in codebase)  
**Function:** `clear_commission_notification()`  
**Called at:** Line 2479, Line 2561

---

## How Commissions Differ from Errands

### 1. Category Field Structure

**Errands:**
- **Field:** `errand.category` (single string, e.g., `"groceries"`)
- **Usage:** Line 1274: `const errandCategory = errand.category ? errand.category.trim() : null;`
- **TF-IDF Input:** Line 1351: `const errandCategories = [errandCategory.toLowerCase()];`

**Commissions:**
- **Field:** `commission.commission_type` (comma-separated string, e.g., `"logos,posters"`)
- **Usage:** Lines 2128-2130: 
  ```typescript
  const commissionTypes = commission.commission_type 
      ? commission.commission_type.split(',').map(t => t.trim()).filter(t => t.length > 0)
      : [];
  ```
- **TF-IDF Input:** Line 2289: `calculateTFIDFCosineSimilarity(commissionTypes, ...)`

**Difference:** Commissions can have multiple types per task, so the array can have multiple elements. Errands have exactly one category per task.

### 2. Category History Query

**Errands:**
- **File:** `app/buddyrunner/home.tsx`
- **Function:** `getRunnerErrandCategoryHistory()` (Lines 1190-1221)
- **Query:** `SELECT category FROM errand WHERE runner_id = ? AND status = 'completed'`
- **Processing:** Each errand has one category, so each task is `[category]`

**Commissions:**
- **File:** `app/buddyrunner/home.tsx`
- **Function:** `getRunnerCategoryHistory()` (Lines 2086-2121)
- **Query:** `SELECT commission_type FROM commission WHERE runner_id = ? AND status = 'completed'`
- **Processing:** Lines 2109-2113:
  ```typescript
  const categories = completedCommission.commission_type.split(',').map((t: string) => t.trim().toLowerCase()).filter((t: string) => t.length > 0);
  if (categories.length > 0) {
      taskCategories.push(categories);
  }
  ```

**Difference:** Commission history splits comma-separated types into arrays, so each task can be `["logos", "posters"]` instead of just `["logos"]`.

### 3. Declined Runner Exclusion

**Errands:**
- **No declined runner field** - errands don't track declined runners

**Commissions:**
- **Field:** `commission.declined_runner_id` (UUID, nullable)
- **Exclusion Logic:** Lines 2183-2185, 2207-2209, 2419-2421, 2443-2445
- **Purpose:** When caller declines an invoice, the runner is added to `declined_runner_id` and excluded from future assignments for that commission

**Difference:** Commissions have an additional exclusion mechanism for declined runners that errands don't have.

### 4. Database Table

**Errands:**
- **Table:** `errand`
- **Query:** Line 1137: `supabase.from("errand").select(...)`

**Commissions:**
- **Table:** `commission`
- **Query:** Line 2005: `supabase.from("commission").select(...)`

**Difference:** Different database tables, but same schema structure (both have `notified_runner_id`, `notified_at`, `timeout_runner_ids`).

### 5. RPC Function Names

**Errands:**
- **Update:** `update_errand_notification()` (Line 1232)
- **Clear:** `clear_errand_notification()` (Line 1256)

**Commissions:**
- **Update:** `update_commission_notification()` (Lines 2358, 2616)
- **Clear:** `clear_commission_notification()` (Lines 2479, 2561)

**Difference:** Different RPC function names, but same logic (mirror functions for different tables).

---

## Identical Logic (Same as Errands)

### 1. Queueing Flow

Both use the same 10-step process:
1. Resolve runner location (GPS → DB fallback)
2. Fetch pending tasks
3. Fetch caller locations
4. Pre-ranking distance filtering (500m)
5. Fetch available runners with presence filters
6. Distance filtering and scoring
7. Sort and rank runners
8. Assign to top-ranked runner
9. Timeout detection and reassignment
10. Apply ranking filter for visibility

### 2. Scoring Formula

**Identical Formula:**
```
FinalScore = (DistanceScore × 0.40) + (RatingScore × 0.35) + (TF-IDF Score × 0.25)
```

**Errands:** Line 1359  
**Commissions:** Line 2296 (initial), Line 2541 (timeout)

### 3. TF-IDF Calculation

**Identical Implementation:**
- Same `calculateTFIDFCosineSimilarity()` function (Line 830)
- Same TF-IDF vector construction
- Same cosine similarity calculation
- Same IDF adjustment (0.1 for common terms)

**Errands:** Line 1352  
**Commissions:** Line 2289 (initial), Line 2534 (timeout)

### 4. Distance Filtering

**Identical:**
- Same 500-meter limit
- Same Haversine formula via `LocationService.calculateDistance()`
- Same distance score normalization: `Math.max(0, 1 - (distanceMeters / 500))`

**Errands:** Lines 1334, 1409  
**Commissions:** Lines 2272, 2282 (initial), Lines 2517, 2527 (timeout)

### 5. Presence Filters

**Identical:**
- Same 2-minute app presence threshold (`last_seen_at >= 2 min ago`)
- Same 90-second GPS presence threshold (`location_updated_at >= 90s ago OR NULL`)

**Errands:** Lines 1270-1271  
**Commissions:** Lines 2203-2204 (initial), Lines 2440-2441 (timeout)

### 6. Timeout Mechanism

**Identical:**
- Same 60-second timeout window
- Same timeout detection: `notifiedAt < sixtySecondsAgo`
- Same timeout runner tracking via `timeout_runner_ids` array
- Same reassignment logic excluding previous and timeout runners

**Errands:** Lines 1284-1287, 1504  
**Commissions:** Lines 2140-2143, 2381

### 7. Sorting Logic

**Identical:**
- Same primary sort: Final score (descending)
- Same tiebreaker: Distance (ascending)

**Errands:** Lines 1458-1461  
**Commissions:** Lines 2330-2333 (initial), Lines 2585-2588 (timeout)

---

## Commission Acceptance Flow

**File:** `app/buddyrunner/view_commission.tsx` (Mobile) or `app/buddyrunner/view_commission_web.tsx` (Web)  
**Function:** `accept()` or `handleAccept()`  
**Lines:** 294-432 (Mobile), 309-446 (Web)

**Process:**
1. Check if runner already has active commission with this caller (Lines 326-329, 341-344)
2. Race guard: Check if commission was already accepted (Lines 332-345, 347-360)
3. Update commission: Set `status = "in_progress"`, `runner_id = user.id`, `accepted_at = timestamp`, `invoice_status = "draft"` (Lines 348-359, 363-374)

**Difference from Errands:** Commissions also set `invoice_status = "draft"` when accepted, as commissions use an invoice system.

---

## Key Differences Summary

| Aspect | Errands | Commissions |
|--------|---------|-------------|
| **Category Field** | Single string (`category`) | Comma-separated string (`commission_type`) |
| **Category History** | One category per task | Multiple categories per task (split by comma) |
| **Declined Runner** | ❌ No field | ✅ `declined_runner_id` field |
| **Database Table** | `errand` | `commission` |
| **RPC Functions** | `update_errand_notification()` | `update_commission_notification()` |
| **Acceptance** | Sets `status = "in_progress"` | Sets `status = "in_progress"` + `invoice_status = "draft"` |
| **TF-IDF Input** | `[category]` (single element) | `["type1", "type2"]` (multiple elements possible) |

---

## Conclusion

Commissions use **the exact same queueing system** as errands, with only minor differences:
1. **Category structure:** Commissions support multiple types per task (comma-separated)
2. **Declined runner tracking:** Commissions exclude declined runners (invoice decline scenario)
3. **Invoice system:** Commissions set `invoice_status` on acceptance

The core queueing logic, ranking algorithm, TF-IDF calculation, scoring weights, timeout mechanism, and queue progression are **identical** between errands and commissions.
