# Real-Time Presence Filter Analysis (Phase 1)

## 📋 Questions & Answers

### 1. What existing signals can be safely used to infer "online/active" status?

#### ✅ **`location_updated_at` (RECOMMENDED - Most Reliable)**

**Location:** `components/LocationService.ts` (Lines 417-439)

**How it works:**
- Updated every time `LocationService.updateLocationInDatabase()` is called
- Called from:
  - `app/buddyrunner/view_map.tsx` (Line 395) - Mobile map view
  - `app/buddyrunner/view_map_web.tsx` (Line 485) - Web map view
- **Update frequency:** Every 5 seconds OR when runner moves 10 meters
- **When cleared:** Set to `null` when runner turns OFF availability (Lines 2836, 4234)

**Why it's reliable:**
- ✅ Actively updated when runner is using the app (on map view)
- ✅ Automatically cleared when runner goes offline
- ✅ Already exists in database schema
- ✅ No schema changes needed

**Limitation:**
- Only updates when runner is on map view
- Runners on home screen (not viewing map) won't update this field
- However, runners typically need to be on map view to accept tasks anyway

#### ⚠️ **`updated_at` (Less Reliable)**

**Location:** Used in various queries (e.g., Line 2549 for commission queries)

**Why it's less reliable:**
- ❌ Updated for ANY change to user record (not just activity)
- ❌ Could be updated by admin actions, profile changes, etc.
- ❌ Not specifically tied to "presence" or "activity"
- ❌ May not reflect actual runner online status

#### ❌ **No dedicated heartbeat/presence system**

**Finding:**
- No explicit heartbeat mechanism found
- No periodic "I'm alive" updates
- No dedicated presence tracking table

---

### 2. Where is the most reliable place in the current codebase to detect runner activity without schema changes?

#### ✅ **Location Updates via `LocationService.updateLocationInDatabase()`**

**Files:**
- `components/LocationService.ts` (Lines 417-439)
- `app/buddyrunner/view_map.tsx` (Line 395)
- `app/buddyrunner/view_map_web.tsx` (Line 485)

**Update mechanism:**
```typescript
// LocationService.updateLocationInDatabase()
.update({
  latitude: locationData.latitude,
  longitude: locationData.longitude,
  location_updated_at: new Date().toISOString(), // ← This is the signal
})
```

**Update triggers:**
- **Time-based:** Every 5 seconds (`timeInterval: 5000`)
- **Distance-based:** When moved 10 meters (`distanceInterval: 10`)
- **Context:** Only when runner is actively viewing a map

**Why this is the best signal:**
1. ✅ Already implemented and working
2. ✅ Updates frequently (every 5 seconds)
3. ✅ Automatically cleared when offline
4. ✅ No schema changes needed
5. ✅ Directly tied to runner activity (using app on map)

#### ⚠️ **Realtime Subscriptions (Not Suitable for Filtering)**

**Location:** `app/buddycaller/view_map.tsx` (Lines 340-392), `app/buddycaller/view_map_web.tsx` (Lines 418-460)

**How it works:**
- Callers subscribe to runner location updates via Supabase Realtime
- Receives updates when runner location changes
- Used for real-time map display

**Why not suitable for filtering:**
- ❌ Only available to callers (not queueing logic)
- ❌ Requires active subscription (not a database query)
- ❌ Not suitable for batch filtering in queueing algorithm
- ❌ Would require architectural changes

#### ❌ **No Periodic Refetch Mechanism**

**Finding:**
- No periodic background refetch of runner status
- No heartbeat/ping system
- Runners are only checked when queueing runs

---

### 3. Which file(s) currently fetch runner data for queueing?

#### ✅ **`app/buddyrunner/home.tsx` - Four Locations**

**Location 1: Errands Initial Assignment** (Lines 1258-1272)
```typescript
let query = supabase
  .from("users")
  .select("id, first_name, last_name, latitude, longitude, average_rating")
  .eq("role", "BuddyRunner")
  .eq("is_available", true);
```

**Location 2: Errands Timeout Reassignment** (Lines 1442-1456)
```typescript
let query = supabase
  .from("users")
  .select("id, first_name, last_name, latitude, longitude, average_rating")
  .eq("role", "BuddyRunner")
  .eq("is_available", true)
  .neq("id", errand.notified_runner_id || "");
```

**Location 3: Commissions Initial Assignment** (Lines 2000-2014)
```typescript
let query = supabase
  .from("users")
  .select("id, first_name, last_name, latitude, longitude, average_rating")
  .eq("role", "BuddyRunner")
  .eq("is_available", true);
```

**Location 4: Commissions Timeout Reassignment** (Lines 2193-2207)
```typescript
let query = supabase
  .from("users")
  .select("id, first_name, last_name, latitude, longitude, average_rating")
  .eq("role", "BuddyRunner")
  .eq("is_available", true)
  .neq("id", commission.notified_runner_id);
```

**Current fields selected:**
- `id`
- `first_name`
- `last_name`
- `latitude`
- `longitude`
- `average_rating`

**Missing field:**
- ❌ `location_updated_at` (NOT currently selected)

---

### 4. What is a safe inactivity threshold?

#### ✅ **Recommended: 60-90 seconds (1-1.5 minutes)**

**Reasoning:**
- **Location updates:** Every 5 seconds when active
- **Missed updates tolerance:** 12-18 missed updates (60-90 seconds)
- **Accounts for:**
  - Slow network connections (delayed updates)
  - Temporary GPS issues (brief signal loss)
  - App backgrounding (brief pauses)
  - Processing delays (database write latency)

#### ⚠️ **Conservative: 120 seconds (2 minutes)**

**When to use:**
- If network conditions are frequently poor
- If GPS accuracy is a concern
- If you want maximum safety margin

**Trade-off:**
- May include some offline runners (false positives)
- But safer for slow connections

#### ❌ **Too aggressive: < 30 seconds**

**Why not:**
- ❌ Too many false negatives (excludes active runners)
- ❌ Doesn't account for network delays
- ❌ Doesn't account for GPS processing time

#### ✅ **Recommended Implementation**

```typescript
// Safe threshold: 90 seconds (1.5 minutes)
const INACTIVITY_THRESHOLD_MS = 90 * 1000; // 90 seconds
const now = new Date();
const thresholdTime = new Date(now.getTime() - INACTIVITY_THRESHOLD_MS);

// Filter: location_updated_at must be within threshold
.gte("location_updated_at", thresholdTime.toISOString())
```

**Alternative (more conservative):**
```typescript
// Conservative threshold: 120 seconds (2 minutes)
const INACTIVITY_THRESHOLD_MS = 120 * 1000; // 120 seconds
```

---

## 📊 Summary & Recommendations

### ✅ **Best Approach: Use `location_updated_at` with 90-second threshold**

**Why:**
1. ✅ Already exists in database
2. ✅ Actively updated when runner is using app (every 5 seconds)
3. ✅ Automatically cleared when offline
4. ✅ No schema changes needed
5. ✅ Directly tied to runner activity

**Implementation:**
1. Add `location_updated_at` to SELECT queries (4 locations)
2. Add filter: `.gte("location_updated_at", thresholdTime.toISOString())`
3. Use 90-second threshold (1.5 minutes)

**Limitation to document:**
- Only updates when runner is on map view
- Runners on home screen won't update this field
- However, runners typically need map view to accept tasks anyway

### ⚠️ **Alternative: Use `updated_at` (Less Reliable)**

**Why not recommended:**
- ❌ Updated for ANY user record change (not just activity)
- ❌ May include inactive runners
- ❌ Less accurate signal

**If used:**
- Would need stricter threshold (e.g., 2 minutes)
- Less reliable than `location_updated_at`

### ❌ **Not Recommended: Realtime Subscriptions**

**Why:**
- ❌ Requires architectural changes
- ❌ Not suitable for batch filtering
- ❌ Only available to callers, not queueing logic

---

## 🔍 Code Locations Summary

### Files to Modify

1. **`app/buddyrunner/home.tsx`** (4 locations)
   - Line 1260: Errands initial assignment query
   - Line 1444: Errands timeout reassignment query
   - Line 2002: Commissions initial assignment query
   - Line 2195: Commissions timeout reassignment query

### Changes Required

1. **Add `location_updated_at` to SELECT:**
   ```typescript
   .select("id, first_name, last_name, latitude, longitude, average_rating, location_updated_at")
   ```

2. **Add inactivity filter:**
   ```typescript
   const INACTIVITY_THRESHOLD_MS = 90 * 1000; // 90 seconds
   const thresholdTime = new Date(Date.now() - INACTIVITY_THRESHOLD_MS);
   .gte("location_updated_at", thresholdTime.toISOString())
   ```

3. **Handle null values:**
   - Runners with `location_updated_at = null` should be excluded
   - This happens when runner turns OFF availability

---

## ✅ Final Recommendation

**Use `location_updated_at` with 90-second threshold (1.5 minutes)**

**Rationale:**
- ✅ Most reliable existing signal
- ✅ Already implemented and working
- ✅ No schema changes needed
- ✅ Safe threshold (accounts for network delays)
- ✅ Directly tied to runner activity

**Implementation:**
- Add `location_updated_at` to all 4 runner queries
- Filter: `.gte("location_updated_at", thresholdTime.toISOString())`
- Exclude null values (runners who turned OFF availability)

**Expected impact:**
- Removes offline runners from queueing
- Keeps active runners (even with slow connections)
- Minimal false negatives (very few active runners excluded)
