# Verification: 500-Meter Distance Limit Handling

## Executive Summary

**Critical Finding:** The system does NOT correctly handle a strict 500-meter limit. There is a **mismatch** between:
- **Ranking/Assignment logic:** Uses `effectiveDistanceLimit` (can expand to 3000m based on GPS accuracy)
- **Timeout detection logic:** Uses strict 500m hard-coded limit

**Caller Notification:** Works correctly for the timeout scenario but has a gap for initial posting scenario.

---

## 500-Meter Distance Filter Application

### ERRANDS

#### Location 1: Initial Distance Filtering (Pre-Ranking)
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 937-955

**Code:**
```typescript
const filteredErrands = errands.filter((errand) => {
    const callerLocation = callerLocations[errand.buddycaller_id || ""];
    if (!callerLocation) return false;

    const distanceKm = LocationService.calculateDistance(
        runnerLat as number,
        runnerLon as number,
        callerLocation.latitude,
        callerLocation.longitude
    );
    const distanceMeters = distanceKm * 1000;

    if (distanceMeters > effectiveDistanceLimit) {  // ⚠️ Uses effectiveDistanceLimit (can be > 500m)
        return false;
    }

    return true;
});
```

**Distance Limit Used:** `effectiveDistanceLimit` (can be 500m to 3000m)

#### Location 2: Ranking Distance Filter
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1140-1149

**Code:**
```typescript
const distanceKm = LocationService.calculateDistance(
    lat, lon,
    callerLocation.latitude,
    callerLocation.longitude
);
const distanceMeters = distanceKm * 1000;

// Only consider runners within effective distance limit
if (distanceMeters > effectiveDistanceLimit) continue;  // ⚠️ Uses effectiveDistanceLimit
```

**Distance Limit Used:** `effectiveDistanceLimit` (can be 500m to 3000m)

#### Location 3: Timeout Reassignment Distance Filter
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1266-1275

**Code:**
```typescript
const distanceKm = LocationService.calculateDistance(...);
const distanceMeters = distanceKm * 1000;

// Only consider runners within effective distance limit
if (distanceMeters > effectiveDistanceLimit) continue;  // ⚠️ Uses effectiveDistanceLimit
```

**Distance Limit Used:** `effectiveDistanceLimit` (can be 500m to 3000m)

#### Location 4: Timeout Detection (Caller Side)
**File:** `app/buddycaller/home.tsx`  
**Lines:** 1215-1224

**Code:**
```typescript
// Filter runners within 500m of caller
const eligibleRunners = allRunners.filter(runner => {
    // ... validation ...
    const distanceKm = LocationService.calculateDistance(lat, lon, callerLat, callerLon);
    const distanceMeters = distanceKm * 1000;
    return distanceMeters <= 500;  // ✅ Uses strict 500m
});
```

**Distance Limit Used:** **Strict 500m** (hard-coded)

### COMMISSIONS

#### Location 1: Initial Distance Filtering
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1620-1638

**Code:**
```typescript
if (distanceMeters > effectiveDistanceLimit) {  // ⚠️ Uses effectiveDistanceLimit
    return false;
}
```

**Distance Limit Used:** `effectiveDistanceLimit` (can be 500m to 3000m)

#### Location 2: Ranking Distance Filter
**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1808-1817

**Code:**
```typescript
const distanceMeters = distanceKm * 1000;

// Only consider runners within 500m
if (distanceMeters > effectiveDistanceLimit) continue;  // ⚠️ Uses effectiveDistanceLimit
```

**Distance Limit Used:** `effectiveDistanceLimit` (can be 500m to 3000m)

#### Location 3: Timeout Detection (Caller Side)
**File:** `app/buddycaller/home.tsx`  
**Lines:** 1059-1068

**Code:**
```typescript
// Filter runners within 500m of caller
const eligibleRunners = allRunners.filter(runner => {
    // ... validation ...
    const distanceKm = LocationService.calculateDistance(lat, lon, callerLat, callerLon);
    const distanceMeters = distanceKm * 1000;
    return distanceMeters <= 500;  // ✅ Uses strict 500m
});
```

**Distance Limit Used:** **Strict 500m** (hard-coded)

---

## Behavior When No Runners Found Within Distance

### ERRANDS - Initial Assignment (No Runner Assigned Yet)

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1179-1182

**Code:**
```typescript
if (eligibleRunners.length === 0) {
    console.log(`❌ [ERRAND RANKING] No eligible runners within ${effectiveDistanceLimit}m found`);
    return false;  // ⚠️ Does NOT clear notification, does NOT notify caller
}
```

**Behavior:**
- ✅ Stops ranking and assignment
- ❌ Does NOT clear `notified_runner_id` (stays NULL)
- ❌ Does NOT notify caller
- ❌ Does NOT expand distance range (but uses `effectiveDistanceLimit` which may already be expanded)

**Result:** Errand remains in "pending" state, invisible to all runners, but caller is NOT notified.

### ERRANDS - After Timeout Reassignment

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1304-1308

**Code:**
```typescript
if (eligibleRunners.length === 0) {
    console.log(`❌ [ERRAND RANKING] No eligible runners within ${effectiveDistanceLimit}m found`);
    // No eligible runners left, clear notified_runner_id and notified_at
    await clearErrandNotification(errand.id);  // ✅ Clears notification
    return false;
}
```

**Behavior:**
- ✅ Stops ranking and assignment
- ✅ Clears `notified_runner_id` and `notified_at`
- ⚠️ Does NOT directly notify caller (relies on timeout detection)

**Result:** Errand cleared, but caller notification depends on timeout detection logic.

### COMMISSIONS - Initial Assignment

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1846-1849

**Code:**
```typescript
if (eligibleRunners.length === 0) {
    console.log(`❌ [RANKING] No eligible runners within 500m found`);
    return false;  // ⚠️ Does NOT clear notification, does NOT notify caller
}
```

**Behavior:**
- ✅ Stops ranking and assignment
- ❌ Does NOT clear `notified_runner_id` (stays NULL)
- ❌ Does NOT notify caller
- ❌ Does NOT expand distance range (but uses `effectiveDistanceLimit` which may already be expanded)

**Result:** Commission remains in "pending" state, invisible to all runners, but caller is NOT notified.

### COMMISSIONS - After Timeout Reassignment

**File:** `app/buddyrunner/home.tsx`  
**Lines:** 1990-2002

**Code:**
```typescript
if (eligibleRunners.length === 0) {
    console.log(`❌ [RANKING] No eligible runners within 500m found`);
    // No eligible runners left, clear notified_runner_id and notified_at using RPC
    const { error: clearError } = await supabase.rpc('clear_commission_notification', {
        p_commission_id: commission.id
    });
    // ... error handling ...
    return false;
}
```

**Behavior:**
- ✅ Stops ranking and assignment
- ✅ Clears `notified_runner_id` and `notified_at`
- ⚠️ Does NOT directly notify caller (relies on timeout detection)

**Result:** Commission cleared, but caller notification depends on timeout detection logic.

---

## Caller Notification Logic

### Files Responsible

1. **Detection Function:** `app/buddycaller/home.tsx`
   - `checkIfAllRunnersTimedOutForErrand()` (Lines 1144-1286)
   - `checkIfAllRunnersTimedOut()` (Lines 983-1135)

2. **Monitoring Function:** `app/buddycaller/home.tsx`
   - `monitorErrandsForTimeout()` (Lines 1288-1359)
   - `monitorCommissionsForTimeout()` (Lines 1362-1432)

3. **Notification Service:** `services/NoRunnersAvailableService.ts`
   - `notify()` method (Lines 22-32)

4. **UI Components:**
   - `components/NoRunnersAvailableModal.tsx` (Mobile)
   - `components/NoRunnersAvailableModalWeb.tsx` (Web)

### Step-by-Step Flow

#### Step 1: Detection Function (Errands)

**File:** `app/buddycaller/home.tsx`  
**Lines:** 1215-1240

**Code:**
```typescript
// Filter runners within 500m of caller
const eligibleRunners = allRunners.filter(runner => {
    // ... validation ...
    const distanceKm = LocationService.calculateDistance(lat, lon, callerLat, callerLon);
    const distanceMeters = distanceKm * 1000;
    return distanceMeters <= 500;  // ✅ Strict 500m
});

console.log(`[Errand Timeout Check] Found ${eligibleRunners.length} eligible runners within 500m`);

if (eligibleRunners.length === 0) {
    console.log(`[Errand Timeout Check] No eligible runners within 500m - all have timed out`);
    // Ensure at least 60 seconds have passed since errand creation
    const createdAt = new Date(errand.created_at);
    const now = new Date();
    const secondsSinceCreation = (now.getTime() - createdAt.getTime()) / 1000;
    if (secondsSinceCreation >= 60) {
        console.log(`[Errand Timeout Check] Errand ${errandId} has been pending for ${secondsSinceCreation.toFixed(1)}s, no eligible runners - TRIGGERING MODAL`);
        return true;  // ✅ Triggers notification
    }
    return false;
}
```

**Conditions Required:**
1. ✅ `status = 'pending'`
2. ✅ `notified_runner_id = NULL` (Line 1167)
3. ✅ At least 60 seconds since creation
4. ✅ Zero runners within **strict 500m**

#### Step 2: Monitoring Function (Errands)

**File:** `app/buddycaller/home.tsx`  
**Lines:** 1327-1351

**Code:**
```typescript
// Skip if already has a notified runner (still waiting for response)
if (errand.notified_runner_id !== null) {
    continue;  // ⚠️ Skips if runner is assigned
}

// Check if all runners have timed out
const allTimedOut = await checkIfAllRunnersTimedOutForErrand(errand.id);

if (allTimedOut) {
    console.log(`[Errand Timeout Monitor] ✅ All runners have timed out for errand ${errand.id}, triggering notification`);
    // Mark as notified to prevent duplicate notifications
    notifiedErrands.add(errand.id);
    // Trigger the notification
    noRunnersAvailableService.notify({  // ✅ Notifies caller
        type: 'errand',
        errandId: errand.id,
        errandTitle: errand.title || 'Untitled Errand'
    });
}
```

**Trigger Conditions:**
- ✅ `notified_runner_id = NULL` (Line 1328)
- ✅ `checkIfAllRunnersTimedOutForErrand()` returns `true`
- ✅ Not already notified (prevents duplicates)

---

## Complete Flow Analysis

### Scenario 1: Errand Posted, No Runners Within 500m (Initial Posting)

**Step 1:** Caller posts errand
- `status = 'pending'`
- `notified_runner_id = NULL`
- `notified_at = NULL`

**Step 2:** Runner A fetches available errands
- Runner A's GPS accuracy = 100m → `effectiveDistanceLimit = 500m`
- No runners found within 500m
- **Code (Line 1179-1181):** Returns `false`, does NOT assign, does NOT clear notification
- `notified_runner_id` remains `NULL`

**Step 3:** Caller's timeout monitor runs
- **Code (Line 1328):** Checks if `notified_runner_id = NULL` → ✅ Yes
- **Code (Line 1340):** Calls `checkIfAllRunnersTimedOutForErrand()`
- **Code (Line 1229-1239):** Checks if zero runners within 500m → ✅ Yes
- **Code (Line 1235):** Checks if 60 seconds passed → ⚠️ **May be false if checked immediately**
- **Result:** If < 60 seconds, returns `false`, caller NOT notified yet

**Problem:** If checked immediately after posting (< 60 seconds), caller is NOT notified even though no runners are available.

**Step 4:** After 60 seconds
- **Code (Line 1235):** 60 seconds passed → ✅ Yes
- **Code (Line 1237):** Returns `true`
- **Code (Line 1347):** Notifies caller
- **Result:** ✅ Caller notified

### Scenario 2: Errand Posted, No Runners Within 500m (Runner Has Poor GPS)

**Step 1:** Caller posts errand
- `status = 'pending'`
- `notified_runner_id = NULL`

**Step 2:** Runner A fetches available errands
- Runner A's GPS accuracy = 2000m → `effectiveDistanceLimit = 2500m`
- Runner B is 1500m away (outside 500m but within 2500m)
- **Code (Line 1149):** Runner B passes distance filter (uses `effectiveDistanceLimit`)
- Runner B is assigned
- `notified_runner_id = Runner B`

**Step 3:** Runner B times out after 60 seconds
- **Code (Line 1304-1308):** Clears notification
- `notified_runner_id = NULL`

**Step 4:** Caller's timeout monitor runs
- **Code (Line 1224):** Uses **strict 500m** (not `effectiveDistanceLimit`)
- Runner B is 1500m away → Excluded (outside 500m)
- Zero runners within 500m
- **Code (Line 1235):** 60 seconds passed → ✅ Yes
- **Code (Line 1237):** Returns `true`
- **Code (Line 1347):** Notifies caller
- **Result:** ✅ Caller notified

**Inconsistency:** Runner B was assigned because of expanded distance (2500m), but timeout check uses strict 500m, so Runner B is excluded from timeout check.

### Scenario 3: All Runners Within 500m Time Out

**Step 1:** Errand assigned to Runner A (within 500m)
- `notified_runner_id = Runner A`

**Step 2:** Runner A times out
- **Code (Line 1320-1329):** Reassigns to Runner B
- Runner A added to `timeout_runner_ids`
- `notified_runner_id = Runner B`

**Step 3:** Runner B times out
- **Code (Line 1304-1308):** Clears notification
- `notified_runner_id = NULL`

**Step 4:** Caller's timeout monitor runs
- **Code (Line 1224):** Uses strict 500m
- All runners within 500m are in `timeout_runner_ids`
- **Code (Line 1255-1262):** Checks if all eligible runners timed out
- **Code (Line 1270):** 60 seconds passed → ✅ Yes
- **Code (Line 1272):** Returns `true`
- **Code (Line 1347):** Notifies caller
- **Result:** ✅ Caller notified

---

## Critical Issues Identified

### Issue 1: Distance Limit Inconsistency

**Problem:**
- **Ranking/Assignment:** Uses `effectiveDistanceLimit` (500m to 3000m based on GPS accuracy)
- **Timeout Detection:** Uses strict 500m (hard-coded)

**Impact:**
- Runners outside 500m can be assigned if GPS accuracy is poor
- But timeout detection excludes them (uses strict 500m)
- Creates inconsistent behavior

**Example:**
- Runner A's GPS accuracy = 2000m → `effectiveDistanceLimit = 2500m`
- Runner B is 1500m away
- Runner B gets assigned (within 2500m)
- But timeout check uses 500m → Runner B excluded from timeout check
- If Runner B times out, system thinks no runners available (because Runner B not in 500m check)

### Issue 2: Initial Posting Notification Gap

**Problem:**
- If no runners within `effectiveDistanceLimit` on initial posting:
  - `notified_runner_id` stays `NULL`
  - Caller notification requires 60-second wait
  - If checked immediately (< 60 seconds), caller NOT notified

**Impact:**
- Caller may wait up to 60 seconds before being notified
- No immediate feedback if no runners available

**Code Evidence:**
```typescript
// Line 1179-1181: Initial assignment - no notification
if (eligibleRunners.length === 0) {
    return false;  // Does NOT notify caller
}

// Line 1235: Timeout check requires 60 seconds
if (secondsSinceCreation >= 60) {
    return true;  // Only then triggers notification
}
```

### Issue 3: No Immediate Notification on Initial Post

**Problem:**
- When errand/commission is posted and no runners found:
  - System does NOT immediately notify caller
  - Requires 60-second wait period
  - Caller sees errand/commission in "pending" state with no feedback

**Impact:**
- Poor user experience
- Caller doesn't know if errand is being processed or if no runners available

---

## Answers to Specific Questions

### Q1: Does the system stop ranking when no runners found within 500m?

**Answer:** **PARTIALLY**

- ✅ **Stops ranking:** Yes, when `eligibleRunners.length === 0`
- ⚠️ **Distance used:** Uses `effectiveDistanceLimit` (can be > 500m), NOT strict 500m
- ❌ **Does NOT expand:** System does not expand beyond `effectiveDistanceLimit`, but `effectiveDistanceLimit` itself can be expanded based on GPS accuracy

**Code Evidence:**
- Line 1179-1181 (Errands initial): Returns `false` when no runners found
- Line 1846-1848 (Commissions initial): Returns `false` when no runners found
- Line 1149: Uses `effectiveDistanceLimit` (not hard-coded 500m)

### Q2: Does the system expand distance range when no runners found?

**Answer:** **NO** (but uses expanded limit if GPS accuracy is poor)

- ❌ **Does NOT expand:** System does not dynamically expand distance when no runners found
- ⚠️ **Uses expanded limit:** If GPS accuracy > 500m, `effectiveDistanceLimit` is already expanded (up to 3000m)
- ⚠️ **Inconsistency:** Timeout detection uses strict 500m, but ranking uses `effectiveDistanceLimit`

**Code Evidence:**
```typescript
// Line 899-904: Distance limit calculation (only based on GPS accuracy)
let effectiveDistanceLimit = 500;
if (gpsAccuracy > 500) {
    const accuracyBuffer = Math.min(gpsAccuracy / 2, 2000);
    effectiveDistanceLimit = Math.min(500 + accuracyBuffer, 3000);
}
// No expansion when no runners found
```

### Q3: Is caller notified when no runners available?

**Answer:** **YES, but with conditions**

**Conditions:**
1. ✅ `notified_runner_id = NULL` (no runner currently assigned)
2. ✅ At least 60 seconds since creation
3. ✅ Zero runners within **strict 500m** (timeout check uses 500m, not `effectiveDistanceLimit`)

**Code Evidence:**
- Line 1235-1237: Requires 60 seconds
- Line 1224: Uses strict 500m
- Line 1347: Notifies caller via `noRunnersAvailableService.notify()`

**Gap:**
- ❌ If checked immediately after posting (< 60 seconds), caller NOT notified
- ⚠️ Uses strict 500m in timeout check, but ranking may have used expanded limit

### Q4: Does this work immediately upon posting?

**Answer:** **NO**

- ❌ Requires 60-second wait period
- ❌ If no runners found on initial post, caller must wait 60 seconds before notification

**Code Evidence:**
```typescript
// Line 1235: Requires 60 seconds
if (secondsSinceCreation >= 60) {
    return true;  // Only then triggers
}
```

### Q5: Does this work after all runners time out?

**Answer:** **YES**

- ✅ Works correctly when all runners within 500m have timed out
- ✅ Uses strict 500m for timeout detection
- ✅ Notifies caller after 60 seconds

**Code Evidence:**
- Line 1255-1272: Checks if all eligible runners (within 500m) timed out
- Line 1270: Requires 60 seconds
- Line 1347: Notifies caller

---

## Code Changes Required for Strict 500m Limit

### Change 1: Use Strict 500m in Ranking Logic

**File:** `app/buddyrunner/home.tsx`

**Current Code (Line 1149):**
```typescript
if (distanceMeters > effectiveDistanceLimit) continue;
```

**Required Change:**
```typescript
if (distanceMeters > 500) continue;  // Use strict 500m
```

**Also Update:**
- Line 1275 (Errands timeout reassignment)
- Line 1817 (Commissions initial)
- Line 1961 (Commissions timeout reassignment)
- Line 950 (Initial distance filtering for errands)
- Line 1638 (Initial distance filtering for commissions)

### Change 2: Immediate Notification on Initial Post

**File:** `app/buddyrunner/home.tsx`

**Current Code (Line 1179-1181):**
```typescript
if (eligibleRunners.length === 0) {
    console.log(`❌ [ERRAND RANKING] No eligible runners within ${effectiveDistanceLimit}m found`);
    return false;  // Does NOT notify caller
}
```

**Required Change:**
```typescript
if (eligibleRunners.length === 0) {
    console.log(`❌ [ERRAND RANKING] No eligible runners within 500m found`);
    // Clear notification to trigger caller notification
    await clearErrandNotification(errand.id);
    // Trigger immediate notification (if 60s not required)
    // OR: Set a flag that timeout check can use
    return false;
}
```

**Alternative:** Modify timeout check to not require 60 seconds if `notified_runner_id = NULL` from the start.

### Change 3: Consistent Distance Limit

**File:** `app/buddyrunner/home.tsx`

**Remove GPS accuracy expansion:**
```typescript
// Current (Line 899-904):
let effectiveDistanceLimit = 500;
if (gpsAccuracy > 500) {
    const accuracyBuffer = Math.min(gpsAccuracy / 2, 2000);
    effectiveDistanceLimit = Math.min(500 + accuracyBuffer, 3000);
}

// Required:
const effectiveDistanceLimit = 500;  // Always 500m
```

### Change 4: Update Timeout Check to Handle Initial Post

**File:** `app/buddycaller/home.tsx`

**Current Code (Line 1235):**
```typescript
if (secondsSinceCreation >= 60) {
    return true;
}
```

**Required Change:**
```typescript
// If notified_runner_id was never set (initial post with no runners),
// notify immediately without 60-second wait
if (errand.notified_runner_id === null && errand.notified_at === null) {
    // This is initial post with no runners - notify immediately
    return true;
}

// Otherwise, require 60 seconds
if (secondsSinceCreation >= 60) {
    return true;
}
```

---

## Conclusion

### Is the existing "no runners available" feature sufficient for strict 500m?

**Answer:** **NO**

**Reasons:**
1. ❌ **Distance inconsistency:** Ranking uses `effectiveDistanceLimit` (can be > 500m), timeout check uses strict 500m
2. ❌ **Initial post gap:** No immediate notification if no runners found on initial post
3. ❌ **60-second delay:** Requires 60-second wait even when no runners available from the start
4. ⚠️ **GPS expansion:** System expands distance based on GPS accuracy, violating strict 500m rule

### Are code changes required?

**Answer:** **YES**

**Required Changes:**
1. ✅ Replace all `effectiveDistanceLimit` with hard-coded `500` in ranking logic
2. ✅ Remove GPS accuracy expansion logic (or make it optional/configurable)
3. ✅ Add immediate notification when no runners found on initial post
4. ✅ Update timeout check to handle initial post scenario (no 60-second wait if never assigned)
5. ✅ Ensure consistency between ranking and timeout detection (both use 500m)

**Priority:**
- **High:** Fix distance inconsistency (use strict 500m everywhere)
- **Medium:** Add immediate notification on initial post
- **Low:** Remove GPS accuracy expansion (if strict 500m is required)

---

## Verification Checklist

- [ ] **Distance filter uses 500m:** Currently uses `effectiveDistanceLimit` (can be > 500m)
- [ ] **Stops ranking when no runners:** ✅ Yes, but uses expanded limit
- [ ] **Does NOT expand distance:** ❌ No, expands based on GPS accuracy
- [ ] **Caller notified:** ✅ Yes, but requires 60 seconds and `notified_runner_id = NULL`
- [ ] **Works immediately on post:** ❌ No, requires 60-second wait
- [ ] **Works after timeouts:** ✅ Yes, works correctly
- [ ] **Consistent distance limit:** ❌ No, ranking uses expanded, timeout uses 500m
