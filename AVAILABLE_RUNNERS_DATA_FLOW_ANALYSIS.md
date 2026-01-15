# Available Runners Feature: Complete Data Flow Analysis

## Executive Summary

The Available Runners feature on the caller side has **architectural limitations** that cause inconsistent visibility. Runners can disappear from the list even when they're marked as Active/Online because:

1. **Location updates are conditional** - Only happen when runner is on home screen AND `is_available = true`
2. **Caller uses 2-minute threshold** - Filters runners by `location_updated_at >= 2 minutes ago`
3. **No background heartbeat** - Location tracking stops when app is backgrounded or user navigates away
4. **No app state monitoring** - System doesn't track foreground/background state

**Root Cause:** The system conflates "location freshness" with "runner availability". A runner can be `is_available = true` but still disappear if `location_updated_at` is stale (> 2 minutes old).

---

## 1. How a Runner is Marked Active/Online

### 1.1 Database Field

**Field:** `is_available` (boolean)  
**Table:** `users`  
**Default:** `false` (inactive/offline)

### 1.2 Toggle Function

**File:** `app/buddyrunner/home.tsx`  
**Function:** `toggleAvailability()`  
**Locations:**
- Web: Line 2961
- Mobile: Line 4359

**Code:**
```typescript
const toggleAvailability = async (newStatus: boolean) => {
    // Update local state
    setAvailableMode(newStatus);
    
    // Prepare update data
    const updateData: any = { is_available: newStatus };
    
    // If turning OFF, clear location data
    if (!newStatus) {
        updateData.latitude = null;
        updateData.longitude = null;
        updateData.location_updated_at = null;
    }
    
    // Save to database
    const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);
}
```

**What Happens:**
- **Turning ON:** Sets `is_available = true`, keeps existing location data
- **Turning OFF:** Sets `is_available = false`, clears `latitude`, `longitude`, `location_updated_at = null`

### 1.3 Initial Load

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 3036-3073 (web), similar for mobile

**Code:**
```typescript
React.useEffect(() => {
    const loadAvailabilityStatus = async () => {
        const { data } = await supabase
            .from('users')
            .select('is_available')
            .eq('id', user.id)
            .single();
        
        const dbAvailability = data?.is_available ?? false;
        setAvailableMode(dbAvailability);
    };
    loadAvailabilityStatus();
}, []);
```

**Behavior:** Loads `is_available` from database on app start, persists across navigations.

---

## 2. Where and How Status is Stored/Updated

### 2.1 Database Storage

**Table:** `users`  
**Field:** `is_available` (boolean)  
**Updated:** Directly via Supabase client (no RPC function)

### 2.2 Update Triggers

**Manual Toggle:**
- User clicks "Active/Inactive" button
- Calls `toggleAvailability(true/false)`
- Updates database immediately

**Automatic Updates:**
- **Logout:** Sets `is_available = false` (lines 3229, 3465, 4995)
- **Permission Denied:** Sets `is_available = false` (lines 3163, 3217, 3450, 3458)

### 2.3 No Heartbeat or Polling

**Finding:** There is **NO** continuous heartbeat mechanism. The `is_available` field is only updated when:
1. User manually toggles it
2. User logs out
3. Location permission is denied

**No Background Updates:**
- ❌ No periodic "I'm still online" pings
- ❌ No server-side presence monitoring
- ❌ No app state listeners (foreground/background)
- ❌ No automatic timeout if no activity

---

## 3. How Caller Screen Fetches/Subscribes to Available Runners

### 3.1 Fetch Function

**File:** `app/buddycaller/home.tsx`  
**Function:** `useAvailableRunners()`  
**Lines:** 586-799

### 3.2 Query Logic

**Primary Query (Lines 643-652, 700-709):**
```typescript
// Calculate timestamp for 2 minutes ago
const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

let { data, error } = await supabase
    .from("users")
    .select("id, first_name, last_name, role, profile_picture_url, created_at, is_available")
    .eq("role", "BuddyRunner")
    .eq("is_available", true)                    // ✅ Must be available
    .not("latitude", "is", null)                 // ✅ Must have location
    .not("longitude", "is", null)                // ✅ Must have location
    .gte("location_updated_at", twoMinutesAgo)  // ⚠️ CRITICAL: Must have updated location within 2 minutes
    .neq("id", currentUid)                       // ✅ Exclude caller
    .order("first_name", { ascending: true });
```

**Key Filters:**
1. `role = 'BuddyRunner'`
2. `is_available = true`
3. `latitude IS NOT NULL`
4. `longitude IS NOT NULL`
5. **`location_updated_at >= 2 minutes ago`** ← **This is the problem**

### 3.3 Realtime Subscription

**File:** `app/buddycaller/home.tsx`  
**Lines:** 765-788

**Code:**
```typescript
const ch = supabase
    .channel(`runners_changes_${uid}`)
    .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "users", filter: `role=eq.BuddyRunner` },
        (payload) => {
            if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
            realtimeTimer.current = setTimeout(() => {
                fetchRows({ silent: true });  // Debounced refetch
            }, 250);
        }
    )
    .subscribe();
```

**Behavior:**
- Listens for ANY change on `users` table where `role = 'BuddyRunner'`
- Debounced: Waits 250ms before refetching (batches multiple updates)
- Triggers full query refresh (not incremental update)

### 3.4 Web Caching

**File:** `app/buddycaller/home.tsx`  
**Lines:** 623-688

**Cache TTL:** 5 minutes (from `utils/webCache.ts:8`)

**Behavior:**
- On initial load (web only): Shows cached data immediately
- Fetches fresh data in background
- Cache expires after 5 minutes

**Impact:** If cache is fresh (< 5 minutes old), caller may see stale runner list until background fetch completes.

---

## 4. How `location_updated_at` is Updated

### 4.1 Update Function

**File:** `components/LocationService.ts`  
**Function:** `updateLocationInDatabase()`  
**Lines:** 417-439

**Code:**
```typescript
public async updateLocationInDatabase(userId: string, locationData: LocationData): Promise<boolean> {
    const { error } = await supabase
        .from('users')
        .update({
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            location_updated_at: new Date().toISOString(),  // ✅ Updates timestamp
        })
        .eq('id', userId);
}
```

**What It Does:**
- Updates `latitude`, `longitude`, and `location_updated_at` to current timestamp
- Called whenever location changes

### 4.2 When Location Updates Occur

**Location 1: Home Screen (When Available Mode is ON)**

**File:** `app/buddyrunner/home.tsx`  
**Web:** Lines 3125-3224  
**Mobile:** Lines 4547-4637

**Code:**
```typescript
React.useEffect(() => {
    const startLocationTracking = async () => {
        // Only track if available mode is ON
        if (!availableMode || availabilityLoading) {
            return;  // ⚠️ Tracking stops if availableMode = false
        }
        
        // Start watching location changes
        locationSubscription = await LocationService.watchLocation(
            async (location) => {
                await LocationService.updateLocationInDatabase(user.id, location);
            },
            {
                timeInterval: 30000,    // Update every 30 seconds
                distanceInterval: 50,   // Or when moved 50 meters
            }
        );
    };
    
    startLocationTracking();
    
    // Cleanup - stops tracking when component unmounts or availableMode changes
    return () => {
        if (locationSubscription) {
            locationSubscription.remove();
        }
    };
}, [availableMode, availabilityLoading, refetchCommissions]);
```

**Conditions:**
- ✅ Only runs when `availableMode = true`
- ✅ Only runs when component is mounted (home screen visible)
- ❌ **Stops when:** Component unmounts, `availableMode` changes, app goes to background

**Location 2: Map View (When Map is Open)**

**File:** `app/buddyrunner/view_map.tsx` (mobile)  
**File:** `app/buddyrunner/view_map_web.tsx` (web)  
**Lines:** 367-416 (mobile), 460-535 (web)

**Code:**
```typescript
useEffect(() => {
    const startTracking = async () => {
        locationSubscriptionRef.current = await LocationService.watchLocation(
            async (location) => {
                await LocationService.updateLocationInDatabase(user.id, location);
            },
            {
                timeInterval: 5000,     // Update every 5 seconds
                distanceInterval: 10,   // Or when moved 10 meters
            }
        );
    };
    
    startTracking();
    
    // Cleanup - stops when map view unmounts
    return () => {
        if (locationSubscriptionRef.current) {
            locationSubscriptionRef.current.remove();
        }
    };
}, []);
```

**Conditions:**
- ✅ Only runs when map view is mounted (map screen visible)
- ❌ **Stops when:** User navigates away from map, component unmounts

### 4.3 Critical Finding: No Background Updates

**No App State Monitoring:**
- ❌ No `AppState.addEventListener()` for foreground/background
- ❌ No background location tracking
- ❌ No periodic heartbeat when app is backgrounded

**Result:** If runner:
- Navigates away from home screen → location tracking stops
- Goes to map view → location updates (every 5 seconds)
- Leaves map view → location tracking stops
- Backgrounds app → location tracking stops
- Doesn't touch app for 2+ minutes → `location_updated_at` becomes stale

---

## 5. Issues Observed - Root Cause Analysis

### Issue 1: Runners Take Long Time to Appear

**Symptom:** Runner toggles availability ON, but doesn't appear in caller's Available Runners list immediately.

**Root Cause:**

**Scenario A: Runner Has Stale Location**
1. Runner toggles `is_available = true`
2. But `location_updated_at` is > 2 minutes old (from previous session)
3. Caller's query filters: `.gte("location_updated_at", twoMinutesAgo)`
4. Runner is excluded from results
5. Runner only appears after location is updated (when they open map or wait for home screen tracking)

**Code Evidence:**
- Caller query: `app/buddycaller/home.tsx:650, 707` - `.gte("location_updated_at", twoMinutesAgo)`
- Location update only happens when tracking is active: `app/buddyrunner/home.tsx:3171-3199`

**Scenario B: Web Cache Delay**
1. Caller has cached data (< 5 minutes old)
2. Shows cached list immediately (may not include new runner)
3. Background fetch runs, but takes time
4. Runner appears after background fetch completes

**Code Evidence:**
- Cache TTL: `utils/webCache.ts:8` - `CACHE_TTL_MS = 5 * 60 * 1000`
- Cache logic: `app/buddycaller/home.tsx:624-688`

### Issue 2: Runners Disappear When Not Touching App

**Symptom:** Runner is Active/Online, but disappears from Available Runners when they're not actively using the app.

**Root Cause:**

**The 2-Minute Threshold:**
1. Runner is `is_available = true`
2. Runner navigates away from home screen (or backgrounds app)
3. Location tracking stops (component unmounts or app backgrounded)
4. `location_updated_at` stops updating
5. After 2 minutes, `location_updated_at` becomes stale
6. Caller's query filters: `.gte("location_updated_at", twoMinutesAgo)`
7. Runner is excluded from results → **disappears from list**

**Code Evidence:**
- Caller filter: `app/buddycaller/home.tsx:650, 707` - `.gte("location_updated_at", twoMinutesAgo)`
- Location tracking stops on unmount: `app/buddyrunner/home.tsx:3229-3235, 4629-4636`
- No background tracking: No `AppState` listeners found

**Timeline Example:**
- T+0s: Runner on home screen, `location_updated_at` updated
- T+30s: Runner navigates to profile screen
- T+30s: Location tracking stops (home screen unmounted)
- T+150s: `location_updated_at` is now 2+ minutes old
- T+150s: Caller refetches → runner excluded → **disappears**

---

## 6. Investigation Results

### 6.1 Is Runner Availability Driven By Polling?

**Answer: NO**

**Evidence:**
- No `setInterval` or polling mechanism found
- Only realtime subscription + manual refetch
- No periodic "heartbeat" queries

### 6.2 Is Runner Availability Driven By Realtime Subscriptions?

**Answer: PARTIALLY**

**Evidence:**
- Caller has realtime subscription: `app/buddycaller/home.tsx:770-782`
- Listens for changes on `users` table
- But subscription only triggers refetch, doesn't guarantee runner appears (still subject to 2-minute filter)

**Limitation:** Realtime fires when database changes, but caller's query still filters by `location_updated_at >= 2 minutes ago`. If runner's location is stale, they won't appear even after realtime fires.

### 6.3 Is Runner Availability Driven By `location_updated_at` Timestamp?

**Answer: YES - This is the PRIMARY driver**

**Evidence:**
- Caller query requires: `.gte("location_updated_at", twoMinutesAgo)` (lines 650, 707)
- Runner's visibility depends on this timestamp being fresh (< 2 minutes old)
- `is_available = true` alone is NOT sufficient

**Problem:** System conflates "location freshness" with "runner availability". A runner can be available but invisible if their location timestamp is stale.

### 6.4 Is Runner Availability Driven By App Foreground/Background State?

**Answer: NO**

**Evidence:**
- No `AppState.addEventListener()` found in codebase
- No foreground/background detection
- Location tracking stops on component unmount, not app state change

**Impact:** If app is backgrounded but component is still mounted, tracking continues. If component unmounts (navigation), tracking stops regardless of app state.

### 6.5 Is There Timeout Logic That Removes Runners?

**Answer: YES - The 2-Minute Threshold**

**Code:** `app/buddycaller/home.tsx:641, 698`

```typescript
const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
.gte("location_updated_at", twoMinutesAgo)
```

**Behavior:**
- Runners with `location_updated_at < 2 minutes ago` are excluded
- This acts as a de facto timeout
- No explicit "mark as offline" logic - just filtering

**Not a True Timeout:**
- `is_available` field is NOT automatically set to `false`
- Runner remains `is_available = true` in database
- They're just filtered out of the query results

### 6.6 Does Caller Rely on Cached Data?

**Answer: YES (Web Only)**

**Evidence:**
- Web caching: `app/buddycaller/home.tsx:623-688`
- Cache TTL: 5 minutes (`utils/webCache.ts:8`)
- Initial load shows cached data immediately
- Background fetch updates cache

**Impact:**
- If cache is fresh, caller may see stale runner list
- New runners may not appear until cache expires or background fetch completes
- Cache doesn't respect the 2-minute `location_updated_at` filter (shows all cached runners)

### 6.7 Does Runner App Need to Continuously Send Updates?

**Answer: YES - To Remain Visible**

**Evidence:**
- Caller filters by `location_updated_at >= 2 minutes ago`
- Location only updates when:
  - Home screen is active AND `availableMode = true` (every 30 seconds)
  - Map view is open (every 5 seconds)
- If neither condition is met, `location_updated_at` stops updating
- After 2 minutes, runner disappears from caller's list

**Continuous Updates Required:**
- Runner must keep home screen open OR map view open
- OR navigate back to home screen within 2 minutes
- OR manually refresh location

### 6.8 What Exact Condition Causes Runner Removal?

**Exact Condition:**

A runner is removed from Available Runners when **ANY** of these conditions are true:

1. `is_available = false` (explicitly filtered: `.eq("is_available", true)`)
2. `latitude IS NULL` (explicitly filtered: `.not("latitude", "is", null)`)
3. `longitude IS NULL` (explicitly filtered: `.not("longitude", "is", null)`)
4. **`location_updated_at < NOW() - 2 minutes`** (explicitly filtered: `.gte("location_updated_at", twoMinutesAgo)`)

**Code:** `app/buddycaller/home.tsx:643-652, 700-709`

**Most Common Cause:** Condition #4 - `location_updated_at` becomes stale (> 2 minutes old) because:
- Runner navigated away from home screen
- Runner backgrounded app
- Location tracking stopped (component unmounted)

---

## 7. Why Behavior is Inconsistent

### 7.1 Inconsistency Explained

**Scenario 1: Runner Appears Immediately**
- Runner toggles availability ON
- Runner is on home screen (or map view)
- Location tracking is active
- `location_updated_at` is fresh (< 2 minutes old)
- Caller refetches → runner appears ✅

**Scenario 2: Runner Takes Long Time to Appear**
- Runner toggles availability ON
- But `location_updated_at` is stale (> 2 minutes old from previous session)
- Location tracking hasn't updated yet
- Caller refetches → runner excluded (stale location)
- Runner opens map view OR waits for home screen tracking
- `location_updated_at` updates
- Caller refetches (via realtime or manual) → runner appears ✅

**Scenario 3: Runner Disappears When Not Touching App**
- Runner is `is_available = true`
- Runner navigates away from home screen
- Location tracking stops (component unmounts)
- `location_updated_at` stops updating
- After 2 minutes, timestamp becomes stale
- Caller refetches → runner excluded → **disappears** ❌

**Scenario 4: Runner Stays Visible**
- Runner is `is_available = true`
- Runner keeps home screen open
- Location tracking continues (every 30 seconds)
- `location_updated_at` stays fresh
- Caller refetches → runner appears ✅

### 7.2 Root Cause of Inconsistency

**The System Has Two Independent States:**

1. **Availability State:** `is_available` (boolean) - Manual toggle
2. **Presence State:** `location_updated_at` (timestamp) - Automatic updates (when tracking active)

**Problem:** These states are not synchronized:
- Runner can be `is_available = true` but `location_updated_at` stale
- Caller filters by BOTH, so runner disappears even though they're "available"

**Inconsistency Source:**
- Location updates are **conditional** (only when tracking active)
- But availability is **persistent** (stays `true` until manually toggled)
- This mismatch causes runners to disappear even when they're "available"

---

## 8. Is This Behavior Expected?

### 8.1 Current Implementation Analysis

**Expected Behavior (Based on Code):**
- ✅ Runners with fresh location (< 2 minutes) appear
- ✅ Runners with stale location (> 2 minutes) are filtered out
- ✅ Location only updates when tracking is active
- ✅ Tracking stops when component unmounts

**This IS expected with the current implementation** - the code is working as designed.

### 8.2 Is It Flawed?

**Answer: YES - Architecturally Flawed**

**Problems:**

1. **Conflates Location Freshness with Availability**
   - `is_available = true` should mean "runner is available"
   - But system also requires fresh location timestamp
   - Runner can be available but invisible

2. **No Background Presence**
   - Location tracking stops when app is backgrounded
   - No heartbeat to maintain presence
   - Runner disappears even if they're actively available

3. **Conditional Location Updates**
   - Updates only when specific screens are open
   - No global location tracking when `is_available = true`
   - Creates gaps in visibility

4. **2-Minute Threshold is Too Short**
   - Runner disappears after 2 minutes of inactivity
   - But they may still be available (just not actively using app)
   - Should be longer (5-10 minutes) or based on `is_available` only

---

## 9. Architectural Changes Needed

### 9.1 Option 1: Separate Availability from Location Freshness (Recommended)

**Change:**
- Remove `location_updated_at` filter from caller query
- Only filter by `is_available = true`
- Use `location_updated_at` for distance calculation only (not visibility)

**Code Change:**
```typescript
// BEFORE (current)
.gte("location_updated_at", twoMinutesAgo)

// AFTER (recommended)
// Remove this filter - only use is_available
```

**Pros:**
- Runners stay visible as long as `is_available = true`
- No dependency on continuous location updates
- Simpler logic

**Cons:**
- May show runners with stale locations (but distance calculation will handle this)

### 9.2 Option 2: Background Heartbeat When Available

**Change:**
- Add background location tracking when `is_available = true`
- Use `AppState` listener to continue tracking in background
- Update `location_updated_at` every 30-60 seconds regardless of screen

**Implementation:**
```typescript
// Add AppState listener
AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active' && availableMode) {
        // Continue location tracking
    }
});

// Background location tracking
if (availableMode) {
    // Track location even when app is backgrounded
    LocationService.watchLocationInBackground(...);
}
```

**Pros:**
- Maintains fresh location timestamp
- Runners stay visible
- Better presence tracking

**Cons:**
- Higher battery usage
- More complex implementation
- May require background location permissions

### 9.3 Option 3: Server-Side Presence with Cron Cleanup

**Change:**
- Add `last_seen_at` timestamp (separate from `location_updated_at`)
- Update `last_seen_at` whenever runner performs any action (not just location)
- Server-side cron job marks runners as offline if `last_seen_at > 5 minutes`
- Caller filters by `is_available = true` only

**Implementation:**
- Edge Function or cron job updates `last_seen_at` on any user activity
- Separate `last_seen_at` from `location_updated_at`
- Caller query: Only filter by `is_available = true`

**Pros:**
- True presence tracking
- Works even if location tracking fails
- Server-side ensures consistency

**Cons:**
- Requires server-side infrastructure
- More complex

### 9.4 Option 4: Increase Threshold and Add Heartbeat

**Change:**
- Increase `location_updated_at` threshold from 2 minutes to 5-10 minutes
- Add simple heartbeat: Update `location_updated_at` every 60 seconds when `is_available = true` (even if location hasn't changed)

**Implementation:**
```typescript
// Heartbeat when available
useEffect(() => {
    if (!availableMode) return;
    
    const heartbeat = setInterval(async () => {
        // Update location_updated_at even if location hasn't changed
        await supabase
            .from('users')
            .update({ location_updated_at: new Date().toISOString() })
            .eq('id', user.id);
    }, 60000); // Every 60 seconds
    
    return () => clearInterval(heartbeat);
}, [availableMode]);
```

**Pros:**
- Minimal code changes
- Maintains current architecture
- Runners stay visible longer

**Cons:**
- Still depends on location timestamp
- Doesn't solve root cause

---

## 10. Recommended Solution

### 10.1 Immediate Fix (Option 1)

**Remove `location_updated_at` filter from caller query**

**File:** `app/buddycaller/home.tsx`  
**Lines to Change:** 641-650, 698-707

**Before:**
```typescript
const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
.gte("location_updated_at", twoMinutesAgo)
```

**After:**
```typescript
// Remove location_updated_at filter - only use is_available
// Location freshness is handled in distance calculation, not visibility
```

**Rationale:**
- `is_available = true` should be sufficient for visibility
- Distance calculation already handles stale locations (filters by distance)
- Simpler, more reliable

### 10.2 Long-Term Fix (Option 3)

**Implement server-side presence tracking:**
1. Add `last_seen_at` timestamp
2. Update on any user activity (not just location)
3. Server-side cron marks offline if `last_seen_at > 5 minutes`
4. Caller filters by `is_available = true` only

---

## 11. Summary

### Current Architecture

**Availability:** Manual toggle (`is_available` field)  
**Presence:** Location timestamp (`location_updated_at`)  
**Visibility:** Requires BOTH `is_available = true` AND `location_updated_at >= 2 minutes ago`

### Problems

1. **Location updates are conditional** - Only when tracking is active
2. **No background tracking** - Stops when app is backgrounded or user navigates
3. **2-minute threshold is too short** - Runners disappear quickly
4. **Conflates availability with location freshness** - Should be separate concerns

### Exact Code Locations

**Caller Query:** `app/buddycaller/home.tsx:643-652, 700-709`  
**Location Update:** `components/LocationService.ts:417-439`  
**Location Tracking (Home):** `app/buddyrunner/home.tsx:3125-3224 (web), 4547-4637 (mobile)`  
**Location Tracking (Map):** `app/buddyrunner/view_map.tsx:367-416, view_map_web.tsx:460-535`  
**Availability Toggle:** `app/buddyrunner/home.tsx:2961 (web), 4359 (mobile)`

### Behavior Assessment

**Expected with Current Code:** YES - Code works as designed  
**Architecturally Sound:** NO - Flawed design conflates availability with location freshness  
**Needs Fix:** YES - Should separate availability from location freshness
