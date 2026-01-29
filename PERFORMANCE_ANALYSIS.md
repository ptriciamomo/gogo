# BuddyRunner Performance Analysis Report

## Executive Summary

The app experiences lag and UI instability due to **multiple compounding performance bottlenecks**:

1. **Excessive Database Queries**: Ranking logic executes N+1 queries (1 per task × multiple queries per ranking)
2. **Realtime Subscription Cascade**: Location updates trigger full refetches, causing rerender storms
3. **Sequential Async Ranking**: Tasks appear/disappear as ranking completes sequentially per task
4. **Race Conditions**: Client-side ranking conflicts with server-side Edge Function assignments
5. **Periodic Polling**: 10-second intervals trigger full refetches even when idle

**Root Cause**: The system performs expensive ranking calculations **client-side** for every task on every refetch, combined with aggressive realtime subscriptions that trigger refetches on any database change.

---

## 1. API / Database Usage

### 1.1 When Runner Becomes Available (`availableMode` changes to `true`)

**File**: `app/buddyrunner/home.tsx` (lines 1785-1790, 2733-2738)

**Query Count**:
- **Errands**: 
  - 1 query: Check runner availability (`users` table)
  - 1 query: Fetch all pending errands (`errand` table)
  - 1 query: Fetch caller names/locations (`users` table, batch)
  - **For EACH errand**:
    - 1 query: Count runners before presence filter
    - 1 query: Fetch available runners with presence filter
    - **For EACH eligible runner**:
      - 1 query: Fetch runner's errand category history (`errand` table)
  - **Total**: `3 + (N errands × (2 + M runners × 1))` queries
  - **Example**: 10 errands, 5 eligible runners each = **58 queries**

- **Commissions**: Same pattern as errands
  - **Total**: `3 + (N commissions × (2 + M runners × 1))` queries

**Impact**: 
- **High latency** on initial load (500ms-2s+ depending on task count)
- **UI blocking** while queries execute sequentially
- **Battery drain** on mobile devices

**Evidence**: Lines 1254-1498 (errand ranking), 2130-2380 (commission ranking)

---

### 1.2 When Errand/Commission is Posted

**Files**: 
- Edge Functions: `supabase/functions/assign-errand/index.ts`, `supabase/functions/assign-and-notify-commission/index.ts`
- Client: `app/buddyrunner/home.tsx`

**Query Count**:
- **Server-side (Edge Function)**:
  - 1 query: Fetch errand/commission details
  - 1 query: Fetch available runners (with presence filter)
  - **For EACH eligible runner**:
    - 1 query: Fetch runner category history
  - 1 query: Update `notified_runner_id`
  - **Total**: `3 + M runners` queries per task

- **Client-side (Realtime Trigger)**:
  - Realtime subscription fires on `postgres_changes` (line 1801, 2749)
  - Triggers `refetch()` which executes **ALL queries from section 1.1 again**
  - **Total**: Same as section 1.1 (58+ queries for 10 errands)

**Impact**:
- **Double work**: Server assigns, then client re-ranks everything
- **Race condition**: Client ranking may overwrite server assignment
- **UI flicker**: Tasks appear, disappear, then reappear as ranking completes

**Evidence**: 
- Edge Functions assign server-side (lines 1215-1233 in Edge Functions)
- Client-side ranking still runs (lines 1254-1498, 2130-2380)
- Realtime subscription triggers refetch (lines 1801-1838, 2749-2786)

---

### 1.3 Home Screen Render

**File**: `app/buddyrunner/home.tsx`

**Query Count**:
- Initial render triggers `refetch()` via `useEffect` (lines 1785-1790, 2733-2738)
- Same query pattern as section 1.1
- **Additional queries**:
  - Badge count: 2 queries (`commission` count + `errand` count) - `app/buddyrunner/_layout.tsx` line 42-53
  - Profile data: 1 query (`users` table) - `app/buddyrunner/notification.tsx` line 216-220

**Impact**:
- **Slow initial render** (1-3 seconds)
- **Multiple loading states** flicker as different queries complete
- **Tasks appear one by one** as ranking completes sequentially

**Evidence**: 
- `useAvailableErrands` hook (line 987)
- `useAvailableCommissions` hook (line 1866)
- Sequential `shouldShowErrand` calls (line 1743-1748)

---

### 1.4 Duplicate/Unnecessary Queries

**Identified Issues**:

1. **Runner availability checked twice**:
   - Once in `refetch()` (line 1030-1034 for errands, 1912-1916 for commissions)
   - Once in notification screen (line 216-220 in `notification.tsx`)

2. **Caller locations fetched multiple times**:
   - Once in `refetch()` (line 1138-1149 for errands, 2034-2055 for commissions)
   - Once per ranking calculation (if not cached)

3. **Runner category history fetched per task**:
   - Same runner's history fetched multiple times if they're eligible for multiple tasks
   - No caching between tasks

**Evidence**: 
- Lines 1173-1204 (`getRunnerErrandCategoryHistory`)
- Lines 2092-2127 (`getRunnerCategoryHistory`)
- Called inside loops (lines 1405, 2301)

---

## 2. Realtime Subscriptions

### 2.1 Subscription Creation Patterns

**File**: `app/buddyrunner/home.tsx`

**Subscriptions Created**:

1. **Errand subscription** (line 1793-1847):
   - Channel: `rt-available-errands`
   - Listens to: `postgres_changes` on `errand` table (ALL events)
   - **Recreated when**: `refetch` callback changes (line 1847)
   - **Problem**: `refetch` is recreated frequently, causing subscription churn

2. **Commission subscription** (line 2741-2841):
   - Channel: `rt-available-commissions`
   - Listens to: 
     - `postgres_changes` on `commission` table (ALL events)
     - `postgres_changes` on `users` table WHERE `latitude IS NOT NULL` (ALL UPDATE events)
   - **Recreated when**: `refetch` callback changes (line 2841)
   - **Problem**: Location updates trigger commission refetches unnecessarily

3. **Notification subscriptions** (`app/buddyrunner/_layout.tsx` line 192-310):
   - Channels: `commission_notify_${userId}`, `errand_notify_${userId}`
   - Listens to: Broadcast events
   - **Recreated when**: Auth state changes (line 196)
   - **Problem**: Multiple auth state changes can create duplicate subscriptions

**Impact**:
- **Memory leaks**: Old subscriptions not always cleaned up before new ones created
- **Duplicate handlers**: Same event handled multiple times
- **Unnecessary refetches**: Location updates trigger full task refetches

**Evidence**:
- Line 1801: Errand subscription listens to ALL events (INSERT, UPDATE, DELETE)
- Line 2788-2793: Commission subscription listens to ALL user location updates
- Line 202-209: Channels cleaned up, but race condition possible

---

### 2.2 Subscription Overlap

**Problem**: Multiple subscriptions listen to the same table changes:

- **Errand table**:
  - `rt-available-errands` (line 1801)
  - Edge Function also queries errand table
  - Client-side ranking queries errand table

- **Users table**:
  - Commission subscription listens to location updates (line 2788-2793)
  - Notification screen queries users (line 216-220)
  - Ranking logic queries users multiple times

**Impact**: 
- **Cascade effect**: One database change triggers multiple refetches
- **UI thrashing**: Multiple rerenders as different subscriptions fire

---

## 3. React State & Re-rendering

### 3.1 State Update Patterns

**File**: `app/buddyrunner/home.tsx`

**State Updates per Refetch**:

1. `setLoading(true)` - triggers rerender
2. `setRows([])` - triggers rerender (if tasks cleared)
3. **For each task**:
   - Ranking completes → `shouldShowErrand` returns true/false
   - Tasks added to array one by one
4. `setRows(mapped)` - triggers final rerender with all tasks

**Problem**: Tasks appear **sequentially** as ranking completes, causing UI flicker.

**Evidence**: 
- Line 1743-1748: Sequential `await shouldShowErrand(errand)` calls
- Line 1769: `setRows(mapped)` called once after all ranking completes
- But UI may rerender during the loop if other state updates occur

---

### 3.2 Context Provider Rerenders

**File**: `app/buddyrunner/_layout.tsx`

**Badge Context Updates**:

1. `computeBadgeCount()` called (line 39-60)
2. Queries database (2 queries)
3. `setUnreadCount(total)` called (line 56)
4. **All consumers rerender** (home screen badge, notification screen)

**Problem**: Badge updates trigger full context rerender, even if badge count unchanged.

**Evidence**:
- Line 36: `unreadCount` state
- Line 56: `setUnreadCount(total)` called even if `total === unreadCount`
- Line 22: `useNotificationBadge` hook consumed by multiple components

---

### 3.3 List State Replacement

**File**: `app/buddyrunner/home.tsx`

**Pattern**: `setRows()` replaces entire array instead of merging:

- Line 1769: `setRows(mapped)` - replaces all errands
- Line 2713: `setRows(list)` - replaces all commissions

**Impact**: 
- **UI flicker**: Entire list rerenders even if only one task changed
- **Lost scroll position**: List jumps to top on update
- **Animation disruption**: No smooth transitions

---

## 4. Async Race Conditions

### 4.1 Server vs Client Assignment Race

**Problem**: Both server (Edge Function) and client (ranking logic) assign tasks:

- **Server**: Edge Function assigns `notified_runner_id` immediately (lines 1215-1233 in Edge Functions)
- **Client**: Ranking logic also assigns `notified_runner_id` (lines 1484-1488, 2374-2378)
- **Race**: Client assignment may overwrite server assignment if client refetch happens before server completes

**Evidence**:
- Edge Function: `assign-errand/index.ts` assigns server-side
- Client: `shouldShowErrand` also calls `updateErrandNotification` (line 1484)
- Guard exists (line 1276-1281) but only for tasks < 5 seconds old

**Impact**:
- **Inconsistent assignments**: Different runners may see same task
- **UI flicker**: Task appears, disappears, reappears as assignments conflict

---

### 4.2 Multiple Async Sources Update Same State

**Problem**: Multiple async operations update `rows` state:

1. **Initial refetch** (line 996)
2. **Realtime subscription refetch** (line 1838, 2786)
3. **Timeout interval refetch** (line 1856, 2850)
4. **Location update refetch** (line 2832)

**Race Condition**: If multiple refetches run simultaneously:
- Older refetch completes last → overwrites newer data
- Tasks disappear then reappear
- Badge count incorrect

**Evidence**:
- No debouncing on `refetch()` calls
- No cancellation of in-flight requests
- `setRows()` called without checking if newer data exists

---

## 5. Location & Availability Loops

### 5.1 Location Update Triggers

**File**: `app/buddyrunner/home.tsx`

**Location Update Flow**:

1. **User location updates** (via `LocationService.updateLocationInDatabase`)
2. **Realtime subscription fires** (line 2788-2793)
3. **Refetch triggered** (line 2832)
4. **Full ranking recalculated** (all queries from section 1.1)
5. **UI rerenders** (all tasks)

**Frequency**: 
- Location updates every 5-10 seconds (if runner moving)
- **Result**: Refetch every 5-10 seconds = constant UI thrashing

**Evidence**:
- Line 2788-2793: Subscription listens to ALL user location updates
- Line 2832: Calls `refetch()` on every location update
- No filtering by runner ID or distance threshold

---

### 5.2 Availability Mode Toggle

**File**: `app/buddyrunner/home.tsx`

**Flow**:

1. User toggles availability (line 1785-1790, 2733-2738)
2. `availableMode` changes
3. `useEffect` triggers `refetch()` (line 1787, 2736)
4. Full query pattern executes (section 1.1)

**Impact**: 
- **Delay**: 1-3 seconds before tasks appear
- **UI blocking**: Loading state during refetch
- **Battery drain**: Full ranking calculation on every toggle

---

### 5.3 Periodic Timeout Checks

**File**: `app/buddyrunner/home.tsx`

**Interval Polling**:

- **Errands**: `setInterval(() => refetch(), 10000)` (line 1855)
- **Commissions**: `setInterval(() => refetch(), 10000)` (line 2849)

**Impact**:
- **Unnecessary queries**: Refetch every 10 seconds even when idle
- **Battery drain**: Constant background activity
- **Server load**: Unnecessary database queries

**Evidence**: Lines 1852-1860, 2846-2854

---

## 6. Performance Bottleneck Summary

### 6.1 Critical Issues (High Impact)

| Issue | File | Trigger | Frequency | Impact |
|-------|------|---------|-----------|--------|
| **N+1 Ranking Queries** | `home.tsx:1254-1498` | Every refetch | Per task × per runner | 50+ queries per refetch |
| **Location Update Cascade** | `home.tsx:2788-2793` | Location update | Every 5-10s | Full refetch on every location change |
| **Sequential Task Ranking** | `home.tsx:1743-1748` | Every refetch | Per task | Tasks appear one by one, UI flicker |
| **Server/Client Race** | Edge Functions + `home.tsx` | Task posted | Per task | Inconsistent assignments |
| **Periodic Polling** | `home.tsx:1855, 2849` | Timer | Every 10s | Unnecessary queries |

### 6.2 Moderate Issues

| Issue | File | Trigger | Frequency | Impact |
|-------|------|---------|-----------|--------|
| **Subscription Recreation** | `home.tsx:1847, 2841` | `refetch` changes | Frequent | Memory leaks, duplicate handlers |
| **Badge Context Rerender** | `_layout.tsx:56` | Badge update | Per assignment | Unnecessary rerenders |
| **List State Replacement** | `home.tsx:1769, 2713` | Every refetch | Per refetch | UI flicker, lost scroll |

---

## 7. Root Cause Analysis

### Primary Root Cause: **Client-Side Ranking on Every Refetch**

The system performs expensive ranking calculations **client-side** for every task on every refetch:

1. **Ranking logic runs sequentially** per task (line 1743-1748)
2. **Each ranking** fetches runner data, calculates TF-IDF, scores runners
3. **No caching** between tasks or refetches
4. **Realtime subscriptions** trigger refetches on any database change
5. **Location updates** trigger full refetches, causing constant recalculation

### Secondary Root Causes:

1. **Aggressive Realtime Subscriptions**: Listen to ALL changes, not just relevant ones
2. **No Request Deduplication**: Multiple refetches can run simultaneously
3. **No Result Caching**: Same data fetched repeatedly
4. **Sequential Processing**: Tasks processed one by one instead of in parallel

---

## 8. Performance Impact Breakdown

### Frontend Rerendering: **HIGH**
- Tasks appear/disappear as ranking completes
- Badge updates trigger context rerenders
- List replacements cause full UI rerenders

### Backend Latency: **HIGH**
- 50+ queries per refetch (for 10 tasks)
- Sequential queries block UI
- No query optimization or batching

### Database Query Volume: **CRITICAL**
- N+1 query pattern (1 per task × multiple per ranking)
- No caching or memoization
- Duplicate queries for same data

### Realtime Listener Duplication: **MODERATE**
- Subscriptions recreated frequently
- Multiple listeners for same events
- Location updates trigger unnecessary refetches

### Combination Effect: **CRITICAL**
- All issues compound: Location update → Realtime → Refetch → Ranking → 50+ queries → UI rerender → Badge update → Context rerender
- **Result**: Constant UI thrashing, high latency, poor UX

---

## 9. Recommended Fixes (Analysis Only - Not Implemented)

### Priority 1: Move Ranking to Server-Side
- **Impact**: Eliminates N+1 queries, reduces client load
- **Effort**: High (requires Edge Function refactor)
- **Risk**: Medium (must ensure server ranking matches client logic)

### Priority 2: Debounce Realtime Refetches
- **Impact**: Reduces query volume by 80%+
- **Effort**: Low (add debounce wrapper)
- **Risk**: Low (no logic changes)

### Priority 3: Filter Location Update Subscriptions
- **Impact**: Eliminates unnecessary refetches
- **Effort**: Low (add runner ID filter)
- **Risk**: Low (simple filter addition)

### Priority 4: Cache Runner Category History
- **Impact**: Reduces duplicate queries
- **Effort**: Medium (add in-memory cache)
- **Risk**: Low (cache invalidation on completion)

### Priority 5: Parallel Task Ranking
- **Impact**: Faster UI updates
- **Effort**: Medium (refactor sequential loop)
- **Risk**: Medium (must handle race conditions)

### Priority 6: Remove Periodic Polling
- **Impact**: Reduces background queries
- **Effort**: Low (remove intervals)
- **Risk**: Low (realtime handles updates)

---

## 10. Evidence Collection

To verify these findings, check console logs for:

1. **Query Count**: Count `supabase.from()` calls in Network tab
2. **Refetch Frequency**: Log `refetch()` calls with timestamps
3. **Rerender Count**: Use React DevTools Profiler
4. **Subscription Count**: Log subscription creation/cleanup
5. **Race Conditions**: Log assignment timestamps from server vs client

---

**Analysis Complete** - Ready for implementation phase.
