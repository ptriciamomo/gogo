# Analysis: Delay in Notifying Next Runner After 60-Second Timeout

## Executive Summary

The delay in notifying the next top-ranked runner after the first runner ignores an errand/commission for 60 seconds is caused by a **reactive, on-demand timeout detection mechanism** rather than a proactive background job. The system waits for a runner's app to actively fetch errands before checking if a timeout has occurred, which can introduce delays ranging from seconds to potentially minutes.

---

## 1. Exact Mechanism That Triggers Re-queue After Timeout

### Mechanism: **On-Demand Check During Errand Fetch**

**Location:** `app/buddyrunner/home.tsx`, lines 1231-1448

The timeout is **NOT** detected by:
- ❌ `setTimeout` or `setInterval` polling
- ❌ Background job or cron task
- ❌ Edge function or server-side scheduler
- ❌ Database trigger or scheduled event

Instead, timeout detection happens **on-demand** when:

1. **A runner's app calls `useAvailableErrands()`** → triggers `refetch()` → executes `shouldShowErrand()` for each errand
2. **Inside `shouldShowErrand()`**, the timeout check occurs at line 1448:
   ```typescript
   if (notifiedAt && notifiedAt < sixtySecondsAgo) {
       // STEP 7: Timeout detected
   }
   ```

**Code Reference:**
- Timeout check: `app/buddyrunner/home.tsx:1448`
- Timeout calculation: `app/buddyrunner/home.tsx:1232-1234`
- Re-queue logic: `app/buddyrunner/home.tsx:1448-1669`

---

## 2. Does the System Wait for Full Timeout Duration?

**Answer: YES, but only passively.**

The system does wait for the full 60 seconds, but **only in the sense that it checks if 60 seconds have passed** when a runner fetches errands. There is no active countdown or timer.

**Key Code:**
```typescript
// Line 1232-1234
const now = new Date();
const notifiedAt = errand.notified_at ? new Date(errand.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

// Line 1448 - Only checked when shouldShowErrand() runs
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Timeout detected
}
```

**Important:** If the timeout occurred 5 seconds ago but no runner has fetched errands since then, the timeout remains undetected until the next fetch.

---

## 3. Additional Delays Introduced by System Components

After timeout is detected, the following operations introduce delays:

### 3.1 Presence Filtering

**Location:** `app/buddyrunner/home.tsx:1473-1500`

**Delay:** Async Supabase query to filter runners by `location_updated_at >= 90 seconds ago`

```typescript
// Line 1474
const presenceThresholdReassign = new Date(now.getTime() - 90000);

// Line 1494-1500
let query = supabase
    .from("users")
    .select("id, first_name, last_name, latitude, longitude, average_rating, location_updated_at")
    .eq("role", "BuddyRunner")
    .eq("is_available", true)
    .neq("id", errand.notified_runner_id || "")
    .gte("location_updated_at", presenceThresholdReassign.toISOString());
```

**Impact:** ~100-500ms (network latency + database query time)

### 3.2 Availability Checks

**Location:** `app/buddyrunner/home.tsx:1497-1498`

**Delay:** Already filtered in the query (`is_available = true`), but requires query execution

**Impact:** Included in presence filtering query delay

### 3.3 Distance Filtering

**Location:** `app/buddyrunner/home.tsx:1537-1601`

**Delay:** Synchronous calculation for each runner, but requires:
- Iterating through all fetched runners
- Calculating distance for each runner
- Filtering runners > 500m

**Impact:** ~10-50ms per runner (CPU-bound, typically < 100ms total)

### 3.4 Async Supabase Queries for TF-IDF Calculation

**Location:** `app/buddyrunner/home.tsx:1576`

**Delay:** **SIGNIFICANT** - For each eligible runner, the system makes async queries:

```typescript
// Line 1576 - Called for EACH runner in eligibleRunners array
const runnerHistoryData = await getRunnerErrandCategoryHistory(runner.id);
```

**What `getRunnerErrandCategoryHistory()` does:**
- Queries `errand` table for completed errands by this runner
- Fetches category history
- Processes task categories

**Impact:** 
- ~200-800ms per runner (sequential async queries)
- If 5 eligible runners: **1-4 seconds total delay**

**Code Reference:** The function is called inside a loop at line 1543-1601, meaning these queries run sequentially, not in parallel.

### 3.5 Ranking Algorithm

**Location:** `app/buddyrunner/home.tsx:1612-1641`

**Delay:** Synchronous calculation (TF-IDF scoring, distance scoring, rating normalization)

**Impact:** ~10-50ms (CPU-bound)

### 3.6 Database Update via RPC

**Location:** `app/buddyrunner/home.tsx:1655-1660`

**Delay:** Async RPC call to `update_errand_notification()`

```typescript
await updateErrandNotification(
    errand.id,
    nextRunner.id,
    new Date().toISOString(),
    previousNotifiedRunnerId
);
```

**Impact:** ~100-300ms (network latency + database write)

**RPC Function:** `add_errand_notification_functions.sql:5-38`

---

## 4. Is Delay Caused by System Design vs Network Latency?

**Answer: Primarily SYSTEM DESIGN, with network latency as a contributing factor.**

### System Design Issues:

1. **Reactive Timeout Detection (PRIMARY CAUSE)**
   - Timeout is only checked when a runner fetches errands
   - No background job or polling mechanism
   - If no runner fetches errands immediately after timeout, delay accumulates

2. **Sequential Async Queries (SECONDARY CAUSE)**
   - TF-IDF history queries run sequentially for each runner
   - If 5 eligible runners, 5 sequential database queries
   - Could be parallelized but currently runs one-by-one

3. **No Proactive Notification**
   - After reassignment, the next runner is only notified when they fetch errands
   - No push notification or realtime trigger to immediately notify the next runner
   - Relies on realtime subscription which only triggers when database changes

### Network Latency (Contributing Factor):

- Supabase query latency: ~100-500ms per query
- RPC call latency: ~100-300ms
- Realtime subscription propagation: ~50-200ms

**Total Network Latency:** ~500-2000ms (0.5-2 seconds)

**Total System Design Delay:** Potentially **unbounded** (depends on when next runner fetches errands)

---

## 5. Exact Code Locations Responsible for Timeout and Re-queue Trigger

### Timeout Detection:
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1231-1234 (timeout calculation)
- **Lines:** 1448 (timeout check condition)

### Re-queue Trigger Logic:
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1448-1669 (complete timeout reassignment flow)

### Re-queue Process Breakdown:

1. **Timeout Detection** (Line 1448)
   ```typescript
   if (notifiedAt && notifiedAt < sixtySecondsAgo)
   ```

2. **Query Available Runners** (Lines 1477-1509)
   - Excludes current `notified_runner_id`
   - Excludes all `timeout_runner_ids`
   - Applies presence filter (90 seconds)

3. **Distance Filtering** (Lines 1537-1601)
   - Filters runners within 500m
   - Calculates distance scores

4. **TF-IDF Calculation** (Line 1576)
   - **Sequential async queries** for each runner's history
   - This is a major delay source

5. **Ranking** (Lines 1612-1641)
   - Calculates final scores
   - Sorts runners

6. **Assignment** (Lines 1655-1660)
   - Calls `updateErrandNotification()` RPC
   - Updates `notified_runner_id`, `notified_at`, `timeout_runner_ids`

### Realtime Subscription (What Triggers Refetch):
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1725-1747
- **Mechanism:** Supabase realtime subscription on `errand` table changes
- **Trigger:** When `update_errand_notification()` updates the errand row, realtime fires → `refetch()` is called

### RPC Function (Database Update):
- **File:** `add_errand_notification_functions.sql`
- **Lines:** 5-38
- **Function:** `update_errand_notification()`
- **What it does:** Updates `notified_runner_id`, `notified_at`, `timeout_runner_ids`

---

## Summary of Delay Sources

| Source | Type | Delay | Location |
|--------|------|-------|----------|
| **Reactive timeout detection** | System Design | **Unbounded** (until next fetch) | Lines 1448, 1725-1747 |
| **Presence filtering query** | Network | ~100-500ms | Lines 1494-1500 |
| **Distance filtering** | CPU | ~10-50ms | Lines 1537-1601 |
| **TF-IDF history queries** | Network (Sequential) | **~200-800ms per runner** | Line 1576 |
| **Ranking calculation** | CPU | ~10-50ms | Lines 1612-1641 |
| **RPC update call** | Network | ~100-300ms | Lines 1655-1660 |
| **Realtime propagation** | Network | ~50-200ms | Lines 1725-1747 |

**Total Measurable Delay:** ~1-5 seconds (after timeout is detected)

**Total Potential Delay:** **Unbounded** (depends on when a runner fetches errands after timeout occurs)

---

## Key Finding

The **primary cause** of the noticeable delay is that timeout detection is **reactive and on-demand**, not proactive. The system does not actively monitor for timeouts. Instead, it only checks if a timeout has occurred when a runner's app happens to fetch errands. This means:

- If a runner fetches errands 1 second after timeout: delay is ~1-5 seconds (processing time)
- If a runner fetches errands 30 seconds after timeout: delay is ~30-35 seconds (30s wait + processing)
- If no runner fetches errands: timeout remains undetected indefinitely

The secondary cause is sequential async queries for TF-IDF calculation, which adds 1-4 seconds of processing time when multiple eligible runners exist.
