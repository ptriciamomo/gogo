# Analysis: Timeout Handling and Re-queue Mechanism for Runner Assignment

## ⚠️ Analysis Only - No Code Changes

This document analyzes the current timeout handling and re-queue mechanism for both **Errands** and **Commissions**. It explains how the system works today, identifies why delays occur, and maps all relevant code locations.

---

## 1. How the 60-Second Timeout is Detected

### Detection Mechanism: **Reactive, On-Demand Check**

The timeout is **NOT** detected by:
- ❌ Background timer (`setTimeout` or `setInterval`)
- ❌ Cron job or scheduled task
- ❌ Database trigger or scheduled event
- ❌ Edge function or server-side scheduler

Instead, timeout detection happens **reactively** when a runner's app fetches available tasks.

### Exact Code That Checks `notified_at` Expiration

#### For Errands:
**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowErrand()` (line 1218)  
**Timeout Check:** Lines 1231-1234, 1448

```typescript
// Line 1231-1234: Calculate timeout threshold
const now = new Date();
const notifiedAt = errand.notified_at ? new Date(errand.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

// Line 1448: Check if timeout occurred
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // STEP 7: Timeout detected
}
```

#### For Commissions:
**File:** `app/buddyrunner/home.tsx`  
**Function:** `shouldShowCommission()` (line 2019)  
**Timeout Check:** Lines 2035-2040, 2273

```typescript
// Line 2035-2038: Calculate timeout threshold
const now = new Date();
const notifiedAt = commission.notified_at ? new Date(commission.notified_at) : null;
const sixtySecondsAgo = new Date(now.getTime() - 60000);

// Line 2040, 2273: Check if timeout occurred
if (notifiedAt && notifiedAt < sixtySecondsAgo) {
    // Timeout has passed, need to find next runner
}
```

### Is This Check Proactive or Reactive?

**Answer: REACTIVE** - The timeout check only occurs when:
1. A runner's app calls `useAvailableErrands()` or `useAvailableCommissions()`
2. This triggers `refetch()` → which calls `shouldShowErrand()` or `shouldShowCommission()`
3. Inside these functions, the timeout check happens for each errand/commission

**Key Point:** There is no active monitoring. The system does not "watch" for timeouts. It only checks if a timeout has occurred when a runner happens to fetch tasks.

---

## 2. What Triggers the Timeout Check

The timeout check is triggered indirectly through the refetch mechanism. Here are all the triggers:

### 2.1 Runner Screen Load

**When:** Initial mount of runner home screen  
**Code:** `app/buddyrunner/home.tsx:1720-1753` (errands), `2597-2657` (commissions)

**Flow:**
1. `useAvailableErrands()` or `useAvailableCommissions()` hook initializes
2. `useEffect` sets up realtime subscription
3. Initial `refetch()` is deferred (line 1722, 2599) - triggered by availability change effects
4. When availability is determined, `refetch()` runs → timeout check occurs

**Note:** Initial fetch is deferred to prevent GPS from running on mount (performance optimization).

### 2.2 Runner Refresh (Manual)

**When:** Runner manually refreshes the list (pull-to-refresh or button)  
**Code:** `app/buddyrunner/home.tsx:964` (errands), `1765` (commissions)

**Flow:**
1. User triggers manual refresh
2. `refetch()` is called directly
3. Timeout check runs during `shouldShowErrand()` or `shouldShowCommission()`

### 2.3 Realtime Subscription

**When:** Database changes occur on `errand` or `commission` tables  
**Code:** 
- Errands: `app/buddyrunner/home.tsx:1725-1747`
- Commissions: `app/buddyrunner/home.tsx:2602-2651`

**Flow:**
1. Supabase realtime subscription listens for `postgres_changes` on `errand`/`commission` tables
2. Any INSERT, UPDATE, or DELETE triggers subscription callback
3. Callback calls `refetch()` (line 1744, 2621)
4. Timeout check runs during refetch

**Important:** This means when `update_errand_notification()` or `update_commission_notification()` updates the database, realtime fires → all subscribed runners refetch → timeout check occurs.

**Additional Realtime Triggers:**
- User location updates (commissions only): `app/buddyrunner/home.tsx:2624-2650`
  - Listens for `users` table updates where `latitude IS NOT NULL`
  - Triggers refetch when any user's location changes

### 2.4 Caller-Side Action

**When:** Caller creates, updates, or deletes an errand/commission  
**Code:** Same realtime subscriptions as above

**Flow:**
1. Caller action updates database
2. Realtime subscription fires
3. All subscribed runners refetch
4. Timeout check runs

**Note:** Caller actions do not directly trigger timeout checks. They trigger refetches, which then check for timeouts.

### 2.5 Availability Toggle (OFF → ON)

**When:** Runner toggles `is_available` from `false` to `true`  
**Code:** `app/buddyrunner/home.tsx:3075-3087` (web), `4474-4486` (mobile)

**Flow:**
1. Runner toggles availability ON
2. `availableMode` state changes
3. `useEffect` detects change (line 3076, 4474)
4. Calls `refetchErrands()` and `refetchCommissions()`
5. Timeout check runs during refetch

**Code Reference:**
```typescript
// Lines 3075-3087 (Web)
React.useEffect(() => {
    if (!availabilityLoading && refetchErrands) {
        refetchErrands();
    }
}, [availableMode, availabilityLoading, refetchErrands]);

React.useEffect(() => {
    if (!availabilityLoading && refetchCommissions) {
        refetchCommissions();
    }
}, [availableMode, availabilityLoading, refetchCommissions]);
```

### 2.6 Location Updates

**When:** Runner's location is updated (GPS or manual)  
**Code:** `app/buddyrunner/home.tsx:3151-3154`, `3183-3187` (commissions only)

**Flow:**
1. Location is saved to database
2. Realtime subscription on `users` table fires (commissions only)
3. `refetch()` is called
4. Timeout check runs

**Note:** Errands do not have location-based realtime refetch (only commissions do).

---

## 3. Why the Next Runner is Sometimes Notified Late

### 3.1 Exact Sequence of Events Before Reassignment

**Step 1: Timeout Occurs (Passive)**
- 60 seconds pass since `notified_at` timestamp
- **No action occurs** - timeout is not detected yet

**Step 2: Trigger Event (Required)**
- A runner's app must call `refetch()` through one of the triggers above
- If no runner fetches tasks, timeout remains undetected indefinitely

**Step 3: Timeout Detection (During Refetch)**
- `shouldShowErrand()` or `shouldShowCommission()` runs
- Checks: `if (notifiedAt && notifiedAt < sixtySecondsAgo)` (line 1448, 2273)
- If true, enters timeout reassignment flow

**Step 4: Query Available Runners**
- **File:** `app/buddyrunner/home.tsx:1477-1509` (errands), `2302-2344` (commissions)
- Excludes current `notified_runner_id`
- Excludes all `timeout_runner_ids`
- Applies presence filter (90 seconds)
- **Delay:** ~100-500ms (async Supabase query)

**Step 5: Distance Filtering**
- **File:** `app/buddyrunner/home.tsx:1537-1601` (errands), `2380-2443` (commissions)
- Filters runners within 500m
- Calculates distance scores
- **Delay:** ~10-50ms (CPU-bound)

**Step 6: TF-IDF History Queries (Sequential)**
- **File:** `app/buddyrunner/home.tsx:1576` (errands), `2419` (commissions)
- For **each** eligible runner, queries completed tasks history
- Runs **sequentially** (not in parallel)
- **Delay:** ~200-800ms per runner
- If 5 eligible runners: **1-4 seconds total**

**Step 7: Ranking Calculation**
- **File:** `app/buddyrunner/home.tsx:1612-1641` (errands), `2462-2491` (commissions)
- Calculates final scores (distance + rating + TF-IDF)
- Sorts runners
- **Delay:** ~10-50ms (CPU-bound)

**Step 8: Database Update (RPC)**
- **File:** `app/buddyrunner/home.tsx:1655-1660` (errands), `2505-2510` (commissions)
- Calls `update_errand_notification()` or `update_commission_notification()` RPC
- Updates `notified_runner_id`, `notified_at`, `timeout_runner_ids`
- **Delay:** ~100-300ms (network + database write)

**Step 9: Realtime Propagation**
- Database update triggers realtime subscription
- All subscribed runners receive update
- Next runner's app calls `refetch()` (if app is open)
- **Delay:** ~50-200ms (realtime propagation)

**Step 10: Next Runner Sees Task**
- Next runner's `shouldShowErrand()` or `shouldShowCommission()` runs
- Checks if `notified_runner_id === uid`
- Returns `true` → task appears in list
- **Delay:** Depends on when next runner's app refetches

### 3.2 Why the System Can Wait Longer Than 60 Seconds

**Primary Reason: Reactive Detection**

The system waits longer than 60 seconds because:

1. **Timeout is not actively monitored**
   - No background job checks for expired `notified_at` timestamps
   - Timeout is only detected when a runner fetches tasks

2. **Delay accumulates until next fetch**
   - If timeout occurred 5 seconds ago but no runner has fetched since: delay = 5+ seconds
   - If timeout occurred 30 seconds ago: delay = 30+ seconds
   - If no runner fetches: delay = **unbounded**

3. **Processing time after detection**
   - Even after timeout is detected, steps 4-9 above take 1-5 seconds
   - Sequential TF-IDF queries are the main bottleneck

4. **Next runner must be active**
   - After reassignment, next runner only sees task when their app refetches
   - If next runner's app is closed or not fetching: additional delay

**Example Timeline:**
- T+0s: First runner notified
- T+60s: Timeout occurs (but not detected)
- T+75s: Another runner fetches errands → timeout detected
- T+76s: Reassignment processing starts
- T+79s: Reassignment completes (database updated)
- T+79.2s: Realtime propagates to next runner
- T+80s: Next runner's app refetches (if app is open)
- **Total delay: 20 seconds** (15s detection delay + 5s processing)

---

## 4. Where This Logic Lives

### 4.1 Timeout Detection

**Errands:**
- **File:** `app/buddyrunner/home.tsx`
- **Function:** `shouldShowErrand()` (line 1218)
- **Timeout calculation:** Lines 1231-1234
- **Timeout check:** Line 1448

**Commissions:**
- **File:** `app/buddyrunner/home.tsx`
- **Function:** `shouldShowCommission()` (line 2019)
- **Timeout calculation:** Lines 2035-2038
- **Timeout check:** Lines 2040, 2273

### 4.2 Re-ranking (After Timeout)

**Errands:**
- **File:** `app/buddyrunner/home.tsx`
- **Function:** `shouldShowErrand()` (timeout branch)
- **Lines:** 1448-1669
  - Query runners: 1477-1509
  - Distance filtering: 1537-1601
  - TF-IDF calculation: 1576
  - Ranking: 1612-1641

**Commissions:**
- **File:** `app/buddyrunner/home.tsx`
- **Function:** `shouldShowCommission()` (timeout branch)
- **Lines:** 2273-2527
  - Query runners: 2302-2344
  - Distance filtering: 2380-2443
  - TF-IDF calculation: 2419
  - Ranking: 2462-2491

### 4.3 Reassignment (Database Update)

**Errands:**
- **File:** `app/buddyrunner/home.tsx`
- **Function:** `updateErrandNotification()` (line 1171)
- **Call site:** Line 1655-1660
- **RPC Function:** `add_errand_notification_functions.sql:5-38`
  - Function: `update_errand_notification()`
  - Updates: `notified_runner_id`, `notified_at`, `timeout_runner_ids`

**Commissions:**
- **File:** `app/buddyrunner/home.tsx`
- **Direct RPC call:** Line 2505-2510
- **RPC Function:** (Assumed similar to errands, not in provided files)
  - Function: `update_commission_notification()`
  - Updates: `notified_runner_id`, `notified_at`, `timeout_runner_ids`

### 4.4 Realtime Subscriptions (What Triggers Refetch)

**Errands:**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 1725-1747
- **Channel:** `"rt-available-errands"`
- **Table:** `errand`
- **Event:** `postgres_changes` (all events)

**Commissions:**
- **File:** `app/buddyrunner/home.tsx`
- **Lines:** 2602-2651
- **Channel:** `"rt-available-commissions"`
- **Table:** `commission` (line 2604)
- **Table:** `users` (line 2624, location updates)
- **Event:** `postgres_changes` (all events)

### 4.5 Helper Functions

**Clear Notification (When No Runners Available):**
- **Errands:** `app/buddyrunner/home.tsx:1199-1213` → `clear_errand_notification()` RPC
- **Commissions:** `app/buddyrunner/home.tsx:2368-2376`, `2450-2458` → `clear_commission_notification()` RPC
- **SQL:** `add_errand_notification_functions.sql:42-73`

**Get Runner History (TF-IDF):**
- **Errands:** `getRunnerErrandCategoryHistory()` (called at line 1576)
- **Commissions:** `getRunnerCategoryHistory()` (called at line 2419, defined at line 1981)

---

## 5. Does the System Depend on Runner Activity?

**Answer: YES - The system is completely dependent on runner activity.**

### 5.1 Runner Must Be Online

**Requirement:** Runner must have `is_available = true` in database

**Code:** `app/buddyrunner/home.tsx:1010-1015` (errands), similar for commissions

```typescript
if (!runnerData?.is_available) {
    if (__DEV__) console.log("❌ Runner is inactive/offline, not fetching errands");
    setRows([]);
    setLoading(false);
    return;
}
```

**Impact:** If runner is offline, `refetch()` returns early → timeout check never runs.

### 5.2 Runner Must Open the App

**Requirement:** Runner's app must be running (not closed/backgrounded)

**Why:** 
- Realtime subscriptions only work when app is active
- If app is closed, no refetch occurs → timeout not detected

**Exception:** If another runner's app is open and fetches tasks, timeout can be detected and reassignment can occur. But the next runner won't see the task until their app is opened.

### 5.3 Runner Must Refresh (Or Trigger Refetch)

**Requirement:** `refetch()` must be called for timeout check to run

**Triggers (see section 2):**
- Initial screen load (deferred)
- Manual refresh
- Realtime subscription (requires app to be open)
- Availability toggle
- Location update (commissions only)

**Impact:** If no runner triggers refetch after timeout, reassignment never happens.

### 5.4 Next Runner Must Also Be Active

**Requirement:** After reassignment, next runner's app must refetch to see the task

**Flow:**
1. Reassignment updates database
2. Realtime fires → all subscribed runners receive update
3. Next runner's app calls `refetch()` (if app is open)
4. `shouldShowErrand()` or `shouldShowCommission()` checks `notified_runner_id === uid`
5. Returns `true` → task appears

**Impact:** If next runner's app is closed, they won't see the task until they open the app and refetch.

---

## 6. Edge Cases

### 6.1 No Runner Opens the App After Timeout

**Scenario:** First runner times out, but no other runner opens their app or refetches tasks.

**Behavior:**
- Timeout remains undetected indefinitely
- `notified_runner_id` stays set to first runner
- `notified_at` remains at original timestamp
- Task remains "stuck" waiting for a runner to fetch

**Code:** No background job exists to detect this. Timeout check only runs during refetch.

**Result:** Task may never be reassigned until a runner eventually opens the app.

### 6.2 Only One Runner Exists

**Scenario:** Only one eligible runner exists, and they timeout.

**Behavior:**
- Timeout is detected when any runner (or the same runner) refetches
- Re-ranking query excludes the timed-out runner (via `timeout_runner_ids`)
- Query finds 0 eligible runners
- System calls `clearErrandNotification()` or `clear_commission_notification()` RPC

**Code:**
- Errands: `app/buddyrunner/home.tsx:1530-1534`
- Commissions: `app/buddyrunner/home.tsx:2365-2377`, `2447-2459`

**Result:** 
- `notified_runner_id` is set to `NULL`
- `notified_at` is set to `NULL`
- Timed-out runner is added to `timeout_runner_ids`
- Task remains in `pending` status, waiting for a new runner to become available

**Caller Notification:** The caller-side timeout monitor (`app/buddycaller/home.tsx:983-1135`, `1144-1286`) checks if all runners have timed out and shows a "No runners available" modal.

### 6.3 Runner Toggles Availability OFF → ON

**Scenario:** Runner toggles `is_available` from `false` to `true`.

**Behavior:**
- `availableMode` state changes
- `useEffect` detects change (line 3076, 4474)
- Calls `refetchErrands()` and `refetchCommissions()`
- Timeout check runs during refetch
- If timeout occurred while runner was offline, it's detected immediately upon coming online

**Code:** `app/buddyrunner/home.tsx:3075-3087` (web), `4474-4486` (mobile)

**Result:** Runner immediately sees any tasks that timed out while they were offline (if they're the next-ranked runner).

**Note:** This is actually a **beneficial edge case** - it ensures runners see timed-out tasks as soon as they come online.

### 6.4 Multiple Runners Time Out Sequentially

**Scenario:** Runner 1 times out → Runner 2 is notified → Runner 2 times out → Runner 3 is notified, etc.

**Behavior:**
- Each timeout adds the previous runner to `timeout_runner_ids` array
- Re-ranking excludes all runners in `timeout_runner_ids`
- Eventually, if all runners timeout, `notified_runner_id` is cleared (see 6.2)

**Code:** 
- Timeout tracking: `add_errand_notification_functions.sql:24-28`
- Exclusion: `app/buddyrunner/home.tsx:1485-1489` (errands), `2315-2319` (commissions)

**Result:** System cycles through all eligible runners until one accepts or all timeout.

### 6.5 Realtime Subscription Fails or Delays

**Scenario:** Network issues cause realtime subscription to fail or delay.

**Behavior:**
- If subscription fails: no automatic refetch on database changes
- Timeout may not be detected until manual refresh or next app open
- If subscription delays: reassignment occurs, but next runner may not see task immediately

**Code:** Realtime subscriptions at `app/buddyrunner/home.tsx:1725-1747` (errands), `2602-2651` (commissions)

**Result:** Increased delay in timeout detection and next runner notification.

### 6.6 Next Runner's App is Closed

**Scenario:** Reassignment occurs, but next runner's app is closed/backgrounded.

**Behavior:**
- Database is updated with new `notified_runner_id`
- Realtime fires, but next runner's app is not listening
- Next runner does not see task until they open the app

**Code:** Realtime subscription requires active app connection

**Result:** Next runner may not see task for minutes or hours until they open the app.

---

## 7. Summary: How Timeout-Based Reassignment Actually Works Today

### Plain English Explanation

**Current Behavior:**

1. **Initial Assignment:** When an errand/commission is created, the first runner to fetch available tasks triggers the ranking algorithm. The top-ranked runner is assigned (`notified_runner_id` is set, `notified_at` is timestamped).

2. **Timeout Window:** The assigned runner has 60 seconds to accept. During this time, other runners cannot see the task (it's filtered out in `shouldShowErrand()` or `shouldShowCommission()`).

3. **Timeout Detection (Reactive):** The system does **not** actively monitor for timeouts. Instead, when any runner's app fetches available tasks (through screen load, refresh, realtime update, or availability toggle), the system checks if 60 seconds have passed since `notified_at`. This check happens inside `shouldShowErrand()` or `shouldShowCommission()`.

4. **Reassignment Process:** If a timeout is detected:
   - The system queries all available runners, excluding the current `notified_runner_id` and all runners in `timeout_runner_ids`
   - Applies presence filter (90 seconds), distance filter (500m), and availability filter
   - For each eligible runner, queries their completed task history (TF-IDF calculation) - **sequentially**
   - Ranks remaining runners using the same algorithm
   - Assigns to the next top-ranked runner via RPC call
   - Updates `notified_runner_id`, `notified_at`, and adds previous runner to `timeout_runner_ids`

5. **Next Runner Notification:** After reassignment, the database update triggers a realtime subscription. All subscribed runners receive the update and refetch. The next runner's app checks if `notified_runner_id === uid` and shows the task if true.

**Key Characteristics:**
- **Reactive, not proactive:** Timeout is only detected when a runner fetches tasks
- **Dependent on runner activity:** Requires at least one runner's app to be active and fetching
- **Sequential processing:** TF-IDF queries run one-by-one, adding 1-4 seconds of delay
- **No background monitoring:** No cron job, timer, or scheduled task checks for timeouts

### Is This Behavior By Design or Accidental?

**Answer: This appears to be BY DESIGN, but with unintended consequences.**

**Evidence it's by design:**
1. The timeout check is intentionally placed inside `shouldShowErrand()` and `shouldShowCommission()` - functions that run during every fetch
2. The reactive approach avoids the need for background jobs or timers
3. The system is designed to work with realtime subscriptions for responsiveness

**Unintended consequences:**
1. **Unbounded delay:** If no runner fetches tasks after timeout, reassignment never happens
2. **Sequential queries:** TF-IDF history queries run sequentially instead of in parallel, adding unnecessary delay
3. **Next runner dependency:** Next runner must have app open to see reassigned task immediately
4. **No proactive notification:** System doesn't push notifications to next runner - relies on them fetching

**Conclusion:** The reactive approach was likely chosen for simplicity and to avoid background infrastructure, but it creates reliability and latency issues that may not have been fully anticipated.

---

## Code Reference Summary

| Component | File | Lines | Function |
|-----------|------|-------|----------|
| **Errands - Timeout Check** | `app/buddyrunner/home.tsx` | 1231-1234, 1448 | `shouldShowErrand()` |
| **Errands - Re-ranking** | `app/buddyrunner/home.tsx` | 1448-1669 | `shouldShowErrand()` (timeout branch) |
| **Errands - Reassignment** | `app/buddyrunner/home.tsx` | 1655-1660 | `updateErrandNotification()` |
| **Errands - Realtime** | `app/buddyrunner/home.tsx` | 1725-1747 | `useAvailableErrands()` |
| **Commissions - Timeout Check** | `app/buddyrunner/home.tsx` | 2035-2040, 2273 | `shouldShowCommission()` |
| **Commissions - Re-ranking** | `app/buddyrunner/home.tsx` | 2273-2527 | `shouldShowCommission()` (timeout branch) |
| **Commissions - Reassignment** | `app/buddyrunner/home.tsx` | 2505-2510 | Direct RPC call |
| **Commissions - Realtime** | `app/buddyrunner/home.tsx` | 2602-2651 | `useAvailableCommissions()` |
| **RPC - Update Errand** | `add_errand_notification_functions.sql` | 5-38 | `update_errand_notification()` |
| **RPC - Clear Errand** | `add_errand_notification_functions.sql` | 42-73 | `clear_errand_notification()` |
| **Availability Toggle** | `app/buddyrunner/home.tsx` | 3075-3087, 4474-4486 | `useEffect` hooks |

---

## End of Analysis

This document provides a complete analysis of the timeout handling and re-queue mechanism. No code changes or recommendations are included, as requested.
